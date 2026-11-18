/**
 * Minimal read-only .xlsx reader.
 *
 * Exists so the burden data build needs no new npm dependency: an xlsx file is
 * a ZIP of XML, and all this needs is "give me the cell values of a sheet".
 *
 * Two details that matter for the WHO Global Health Estimates workbooks:
 *   - Their ZIP entries use data descriptors, so the local file headers carry
 *     zeroed sizes. Entry offsets and sizes must come from the central
 *     directory at the end of the archive, not from the local headers.
 *   - Cell values are usually shared strings (t="s" means the value is an index
 *     into sharedStrings.xml), and inline strings (t="inlineStr") also appear.
 *
 * Not a general xlsx implementation: no formulas, styles, dates or number
 * formats. Values come back as raw strings exactly as stored, so nothing is
 * rounded or reinterpreted on the way in.
 */
import zlib from "zlib";

const SIG_EOCD = 0x06054b50;
const SIG_EOCD64_LOCATOR = 0x07064b50;
const SIG_EOCD64 = 0x06064b50;
const SIG_CEN = 0x02014b50;

/** Read the ZIP central directory into {name -> {offset, csize, usize, method}}. */
function readCentralDirectory(buf) {
  // The EOCD is within the last 64KB + 22 bytes.
  const minPos = Math.max(0, buf.length - 65557);
  let eocd = -1;
  for (let i = buf.length - 22; i >= minPos; i--) {
    if (buf.readUInt32LE(i) === SIG_EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("not a zip: no end-of-central-directory record");

  let entryCount = buf.readUInt16LE(eocd + 10);
  let cenOffset = buf.readUInt32LE(eocd + 16);
  let cenSize = buf.readUInt32LE(eocd + 12);

  // Zip64, which these workbooks can trip once they exceed 65535 entries or 4GB.
  if (cenOffset === 0xffffffff || entryCount === 0xffff) {
    let loc = -1;
    for (let i = eocd - 20; i >= minPos; i--) {
      if (buf.readUInt32LE(i) === SIG_EOCD64_LOCATOR) {
        loc = i;
        break;
      }
    }
    if (loc < 0) throw new Error("zip64 locator not found");
    const eocd64 = Number(buf.readBigUInt64LE(loc + 8));
    if (buf.readUInt32LE(eocd64) !== SIG_EOCD64) throw new Error("bad zip64 eocd");
    entryCount = Number(buf.readBigUInt64LE(eocd64 + 32));
    cenSize = Number(buf.readBigUInt64LE(eocd64 + 40));
    cenOffset = Number(buf.readBigUInt64LE(eocd64 + 48));
  }

  const entries = new Map();
  let p = cenOffset;
  for (let i = 0; i < entryCount; i++) {
    if (buf.readUInt32LE(p) !== SIG_CEN) break;
    const method = buf.readUInt16LE(p + 10);
    let csize = buf.readUInt32LE(p + 20);
    let usize = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    let localOffset = buf.readUInt32LE(p + 42);
    const name = buf.slice(p + 46, p + 46 + nameLen).toString("utf8");

    // Zip64 extended information extra field (0x0001) overrides the 32-bit values.
    if (csize === 0xffffffff || usize === 0xffffffff || localOffset === 0xffffffff) {
      let e = p + 46 + nameLen;
      const end = e + extraLen;
      while (e + 4 <= end) {
        const tag = buf.readUInt16LE(e);
        const size = buf.readUInt16LE(e + 2);
        if (tag === 0x0001) {
          let q = e + 4;
          if (usize === 0xffffffff) {
            usize = Number(buf.readBigUInt64LE(q));
            q += 8;
          }
          if (csize === 0xffffffff) {
            csize = Number(buf.readBigUInt64LE(q));
            q += 8;
          }
          if (localOffset === 0xffffffff) localOffset = Number(buf.readBigUInt64LE(q));
          break;
        }
        e += 4 + size;
      }
    }

    entries.set(name, { method, csize, usize, localOffset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

function inflateEntry(buf, entry) {
  // Skip the local header to reach the data; its name/extra lengths are
  // authoritative for where the payload starts.
  const lo = entry.localOffset;
  if (buf.readUInt32LE(lo) !== 0x04034b50) throw new Error("bad local file header");
  const nameLen = buf.readUInt16LE(lo + 26);
  const extraLen = buf.readUInt16LE(lo + 28);
  const start = lo + 30 + nameLen + extraLen;
  const raw = buf.slice(start, start + entry.csize);
  if (entry.method === 0) return raw;
  if (entry.method === 8) return zlib.inflateRawSync(raw);
  throw new Error(`unsupported zip compression method ${entry.method}`);
}

const XML_ENTITIES = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
};

function decodeXml(s) {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&(amp|lt|gt|quot|apos);/g, (m) => XML_ENTITIES[m]);
}

/** sharedStrings.xml -> array of plain strings. */
function parseSharedStrings(xml) {
  const out = [];
  // Each <si> may hold one <t> or several <r><t> runs; concatenate the runs.
  for (const si of xml.match(/<si\b[\s\S]*?<\/si>|<si\s*\/>/g) || []) {
    let text = "";
    for (const t of si.match(/<t\b[^>]*>([\s\S]*?)<\/t>/g) || []) {
      text += decodeXml(t.replace(/<t\b[^>]*>([\s\S]*?)<\/t>/, "$1"));
    }
    out.push(text);
  }
  return out;
}

/** "BC12" -> 0-based column index 54. */
export function colIndex(ref) {
  const letters = (ref.match(/^[A-Z]+/) || [""])[0];
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/**
 * Read one worksheet as an array of row arrays of strings.
 *
 * @param {Buffer} buf     the .xlsx file contents
 * @param {string|number} sheet  sheet name, or 0-based index
 */
export function readSheet(buf, sheet = 0) {
  const entries = readCentralDirectory(buf);
  const read = (name) => {
    const e = entries.get(name);
    if (!e) return null;
    return inflateEntry(buf, e).toString("utf8");
  };

  const sharedXml = read("xl/sharedStrings.xml");
  const shared = sharedXml ? parseSharedStrings(sharedXml) : [];

  // Resolve the sheet name to its part via workbook.xml + its rels.
  let target = null;
  if (typeof sheet === "number") {
    target = `xl/worksheets/sheet${sheet + 1}.xml`;
  } else {
    const wb = read("xl/workbook.xml") || "";
    const rels = read("xl/_rels/workbook.xml.rels") || "";
    const m = wb.match(
      new RegExp(`<sheet[^>]*name="${sheet.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[^>]*>`)
    );
    if (!m) throw new Error(`sheet "${sheet}" not found in workbook`);
    const rid = (m[0].match(/r:id="([^"]+)"/) || [])[1];
    const rel = rels.match(new RegExp(`<Relationship[^>]*Id="${rid}"[^>]*>`));
    let t = rel ? (rel[0].match(/Target="([^"]+)"/) || [])[1] : null;
    if (!t) throw new Error(`could not resolve target for sheet "${sheet}"`);
    t = t.replace(/^\//, "").replace(/^xl\//, "");
    target = `xl/${t}`;
  }

  const sheetXml = read(target);
  if (sheetXml === null) throw new Error(`worksheet part not found: ${target}`);

  const rows = [];
  for (const rowXml of sheetXml.match(/<row\b[\s\S]*?<\/row>|<row\b[^>]*\/>/g) || []) {
    const row = [];
    for (const cell of rowXml.match(/<c\b[\s\S]*?<\/c>|<c\b[^>]*\/>/g) || []) {
      const ref = (cell.match(/\sr="([A-Z]+\d+)"/) || [])[1];
      const type = (cell.match(/\st="([^"]+)"/) || [])[1] || "n";
      let value = "";
      if (type === "inlineStr") {
        const is = cell.match(/<is>([\s\S]*?)<\/is>/);
        if (is) {
          for (const t of is[1].match(/<t\b[^>]*>([\s\S]*?)<\/t>/g) || []) {
            value += decodeXml(t.replace(/<t\b[^>]*>([\s\S]*?)<\/t>/, "$1"));
          }
        }
      } else {
        const v = cell.match(/<v>([\s\S]*?)<\/v>/);
        if (v) {
          const raw = decodeXml(v[1]);
          value = type === "s" ? (shared[Number(raw)] ?? "") : raw;
        }
      }
      if (ref) row[colIndex(ref)] = value;
      else row.push(value);
    }
    rows.push(row);
  }
  return rows;
}

/** Names of every worksheet, in workbook order. */
export function sheetNames(buf) {
  const entries = readCentralDirectory(buf);
  const e = entries.get("xl/workbook.xml");
  if (!e) return [];
  const wb = inflateEntry(buf, e).toString("utf8");
  return (wb.match(/<sheet\b[^>]*>/g) || []).map((s) =>
    decodeXml((s.match(/name="([^"]*)"/) || [])[1] || "")
  );
}
