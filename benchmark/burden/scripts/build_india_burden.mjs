#!/usr/bin/env node
/**
 * Builds the India disease-burden table and its cause -> EFO/MONDO mapping.
 *
 * SOURCE SUBSTITUTION, STATED UP FRONT
 * The brief asked for the India State-Level Disease Burden Initiative / GBD
 * India estimates (ICMR, PHFI, IHME). Those are not available in a
 * machine-readable form here: the IHME GBD Results Tool serves its data through
 * an interactive query UI rather than an open bulk endpoint, and the ICMR/PHFI
 * "India: Health of the Nation's States" output is published as a 22MB PDF of
 * typeset tables. Transcribing DALY figures out of a PDF by eye is exactly the
 * kind of step that puts unverifiable numbers into a repository whose whole
 * point is that every number is traceable, so it was not done.
 *
 * What is used instead: WHO Global Health Estimates 2023, country-level DALYs
 * by cause, India column. This is a different producer from the one the brief
 * named. It gives national cause-specific DALYs, which is what the screen
 * needs, but it is NOT state-level and it is NOT the ICMR/PHFI/IHME series.
 * Anything comparing these figures with published GBD India numbers will find
 * they differ. The substitution is recorded in the output file, surfaced in the
 * UI, and should be revisited if someone can supply the GBD India extract.
 *
 * MAPPING RULE
 * GHE cause labels are not ontology terms ("Cervix uteri cancer", "Trachea,
 * bronchus, lung cancers"). They are resolved against Open Targets disease
 * search, and a mapping is accepted ONLY when a candidate's label matches the
 * query exactly after normalisation, and the id is an EFO or MONDO disease.
 * Anything else is left unmapped and its candidates recorded for review, so a
 * wrong identifier never enters the table silently. Top-hit-wins was tried and
 * rejected: "Cervix uteri cancer" returns "uterine cervix neoplasm" first and
 * "cervical cancer" third, and "Iron-deficiency anaemia" returns an HP
 * phenotype term.
 *
 * Aliases below are curation, not inference: each one is a query string chosen
 * so that a correct ontology term matches it exactly. They are committed so the
 * curation can be audited and argued with.
 *
 * Outputs:
 *   benchmark/burden/india_disease_burden.json   DALYs per GHE cause
 *   benchmark/burden/ghe_to_efo_mapping.json     cause -> EFO/MONDO, with coverage
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { readSheet } from "./lib/xlsx-lite.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BURDEN_DIR = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(BURDEN_DIR, "..", "..");
const SRC_XLSX = path.join(BURDEN_DIR, "sources", "who_ghe_daly_bycountry_2023.xlsx");
const OUT_BURDEN = path.join(BURDEN_DIR, "india_disease_burden.json");
const OUT_MAPPING = path.join(BURDEN_DIR, "ghe_to_efo_mapping.json");

const SOURCE = {
  producer: "World Health Organization, Department of Data and Analytics",
  dataset: "Global Health Estimates 2023: DALYs by cause, age and sex, by country",
  sheet: "All ages",
  country: "India",
  iso3: "IND",
  reference_year: 2023,
  release: "September 2026",
  url: "https://cdn.who.int/media/docs/default-source/gho-documents/global-health-estimates/daly_bycountry_age_sex_2023_2026-10-01.xlsx",
  landing_page:
    "https://www.who.int/data/gho/data/themes/mortality-and-global-health-estimates/global-health-estimates-leading-causes-of-dalys",
  units: "DALYs in thousands, as published",
  not_the_requested_source: {
    requested: "India State-Level Disease Burden Initiative / GBD India (ICMR, PHFI, IHME)",
    why_not:
      "No machine-readable open extract: the IHME GBD Results Tool is an interactive query UI, and the ICMR/PHFI India State-Level report is a 22MB PDF of typeset tables. Transcribing DALYs from a PDF by eye would put unverifiable numbers in the repository.",
    consequence:
      "These are WHO national estimates, not ICMR/PHFI/IHME state-level estimates, and they will not match published GBD India figures.",
    /**
     * Second attempt, recorded so the next person does not repeat it. A
     * state-level extract of the Initiative does exist in CSV, but behind an
     * account this project cannot satisfy on the user's behalf.
     */
    second_attempt_2026_11_18: {
      candidate:
        "India State-Level Disease Burden Initiative, hosted on Redivis by the Stanford Center for Population Health Sciences (DOI 10.57761/hwzj-cv34)",
      api_probe:
        "https://redivis.com/api/v1/datasets/stanfordphs.india_state_level_disease_burden_initiative returns accessLevel \"data\" with tableCount 0, and its /tables listing is empty, unauthenticated",
      blocked_by:
        "registration: the tables are gated behind a Stanford Redivis account and data-use approval, which is the user's institutional access to grant, not something this build can obtain",
      vintage_note:
        "the extract covers GBD 2016 (1990-2016), older than the WHO GHE 2023 estimates already in use, so it would not be a straightforward upgrade even with access",
      outcome:
        "skipped. Adding it remains worthwhile for anyone with that access: it would give state-level granularity alongside, not instead of, WHO GHE.",
    },
  },
};

/**
 * Aggregate rows in the GHE hierarchy. They are kept in the burden table for
 * reference but never offered as a disease to map, because "Noncommunicable
 * diseases" is not a target-discovery question.
 */
const AGGREGATE_CODES = new Set([
  "0", "10", "20", "40", "120", "185", "210", "380", "420", "490", "540",
  "600", "610", "810", "820", "940", "1000", "1100", "1170", "1210", "1260",
  "1300", "1340", "1420", "1510", "1540", "1600", "1620", "1630",
]);

/**
 * Curated query strings. Key is the GHE label verbatim; value is the query
 * whose exact ontology match is the right disease. Where no alias is given the
 * GHE label is used as the query.
 */
const ALIASES = {
  "Trachea, bronchus, lung cancers": "lung cancer",
  "Cervix uteri cancer": "cervical cancer",
  "Oesophagus cancer": "esophageal cancer",
  "Stomach cancer": "stomach cancer",
  "Colon and rectum cancers": "colorectal cancer",
  "Liver cancer": "liver cancer",
  "Pancreas cancer": "pancreatic cancer",
  "Prostate cancer": "prostate cancer",
  "Bladder cancer": "bladder cancer",
  "Ovary cancer": "ovarian cancer",
  "Corpus uteri cancer": "endometrial cancer",
  "Kidney, renal pelvis and ureter cancers": "kidney cancer",
  "Lip and oral cavity": "oral cavity cancer",
  "Nasopharynx cancer": "nasopharyngeal carcinoma",
  "Larynx cancer": "laryngeal carcinoma",
  "Thyroid cancer": "thyroid carcinoma",
  "Gallbladder and biliary tract cancer": "gallbladder cancer",
  "Leukaemia": "leukemia",
  "Multiple myeloma": "multiple myeloma",
  "Non-Hodgkin lymphoma": "non-Hodgkin lymphoma",
  "Hodgkin lymphoma": "Hodgkin lymphoma",
  "Melanoma and other skin cancers": "melanoma",
  "Mesothelioma": "mesothelioma",
  "Brain and nervous system cancers": "brain glioma",
  "Breast cancer": "breast cancer",
  "Tuberculosis": "tuberculosis",
  "Dengue": "dengue disease",
  "Malaria": "malaria",
  // EFO_0000764 "HIV infectious disease" is the term the Task 3 disease panel
  // already uses, so this alias is checked against something the app queries.
  "HIV/AIDS": "HIV infectious disease",
  "Gonorrhoea": "gonorrhea",
  // "Gential Herpes" is misspelt in the source workbook; kept verbatim as the
  // key so the mapping still joins, with the correct spelling as the query.
  "Gential Herpes": "genital herpes",
  "Lower respiratory infections": "lower respiratory tract infection",
  "Upper respiratory infections": "upper respiratory tract infection",
  "COVID-19": "COVID-19",
  "Measles": "measles",
  "Whooping cough": "whooping cough",
  "Tetanus": "tetanus",
  "Diphtheria": "diphtheria",
  "Meningitis": "meningitis",
  "Encephalitis": "encephalitis",
  "Acute hepatitis B": "hepatitis B",
  "Acute hepatitis C": "hepatitis C",
  "Acute hepatitis A": "hepatitis A",
  "Acute hepatitis E": "hepatitis E",
  "Leishmaniasis": "leishmaniasis",
  "Lymphatic filariasis": "lymphatic filariasis",
  "Onchocerciasis": "onchocerciasis",
  "Schistosomiasis": "schistosomiasis",
  "Leprosy": "leprosy",
  "Rabies": "rabies",
  "Japanese encephalitis": "Japanese encephalitis",
  "Trachoma": "trachoma",
  "Intestinal nematode infections": "intestinal nematode infection",
  "Diabetes mellitus": "diabetes mellitus",
  "Ischaemic heart disease": "coronary artery disease",
  "Stroke": "stroke",
  "Hypertensive heart disease": "hypertensive heart disease",
  "Cardiomyopathy, myocarditis, endocarditis": "cardiomyopathy",
  "Rheumatic heart disease": "rheumatic heart disease",
  "Chronic obstructive pulmonary disease": "chronic obstructive pulmonary disease",
  "Asthma": "asthma",
  "Chronic kidney disease": "chronic kidney disease",
  "Cirrhosis of the liver": "liver cirrhosis",
  "Peptic ulcer disease": "peptic ulcer disease",
  "Inflammatory bowel disease": "inflammatory bowel disease",
  "Appendicitis": "appendicitis",
  "Gallbladder and biliary diseases": "gallbladder disease",
  "Pancreatitis": "pancreatitis",
  "Alzheimer disease and other dementias": "Alzheimer disease",
  "Parkinson disease": "Parkinson disease",
  "Epilepsy": "epilepsy",
  "Multiple sclerosis": "multiple sclerosis",
  "Motor neuron disease": "amyotrophic lateral sclerosis",
  "Migraine": "migraine disorder",
  "Major depressive disorder": "major depressive disorder",
  "Bipolar disorder": "bipolar disorder",
  "Schizophrenia": "schizophrenia",
  "Anxiety disorders": "anxiety disorder",
  "Alcohol use disorders": "alcohol use disorder",
  "Drug use disorders": "substance abuse",
  "Autism and Asperger syndrome": "autism spectrum disorder",
  "Rheumatoid arthritis": "rheumatoid arthritis",
  "Osteoarthritis": "osteoarthritis",
  "Gout": "gout",
  "Low back and neck pain": "low back pain",
  "Psoriasis": "psoriasis",
  "Cataracts": "cataract",
  "Glaucoma": "glaucoma",
  "Macular degeneration": "macular degeneration",
  "Hearing loss": "hearing loss",
  "Sickle cell disorders and trait": "sickle cell disease",
  "Thalassaemias": "beta-thalassemia",
  "Iron-deficiency anaemia": "iron deficiency anemia",
  "Congenital heart anomalies": "congenital heart disease",
  "Neural tube defects": "neural tube defect",
  "Down syndrome": "Down syndrome",
  "Cleft lip and cleft palate": "cleft lip",
  "Endocrine, metabolic, blood, immune disorders": null,
  "Protein-energy malnutrition": "protein-energy malnutrition",
  "Preterm birth complications": "premature birth",
};

const OT_GQL = "https://api.platform.opentargets.org/api/v4/graphql";
const SEARCH_QUERY = `query S($q:String!){
  search(queryString:$q, entityNames:["disease"], page:{index:0,size:8}){
    hits{ id name }
  }
}`;

const normalise = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/[‐-―]/g, "-")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function otSearch(q, attempts = 4) {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(OT_GQL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: SEARCH_QUERY, variables: { q } }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = await res.json();
      return (j.data?.search?.hits || []).map((h) => ({ id: h.id, name: h.name }));
    } catch (err) {
      if (i === attempts - 1) throw err;
      await sleep(600 * 2 ** i);
    }
  }
  return [];
}

/** Only EFO and MONDO disease identifiers are acceptable mapping targets. */
const isDiseaseId = (id) => /^(EFO|MONDO)_\d+$/.test(String(id || ""));

function extractIndiaCauses() {
  const buf = fs.readFileSync(SRC_XLSX);
  const rows = readSheet(buf, SOURCE.sheet);

  const header = rows[6] || [];
  const iso = rows[7] || [];
  const col = header.findIndex((v) => String(v || "").trim() === SOURCE.country);
  if (col < 0) throw new Error(`country column "${SOURCE.country}" not found`);
  if (String(iso[col] || "").trim() !== SOURCE.iso3) {
    throw new Error(`ISO-3 under ${SOURCE.country} is ${iso[col]}, expected ${SOURCE.iso3}`);
  }

  // Only the "Persons" block; the sheet repeats every cause for Males and
  // Females below it.
  let sex = "";
  let population = null;
  const causes = [];
  for (let i = 9; i < rows.length; i++) {
    const r = rows[i] || [];
    if (r[0] && String(r[0]).trim()) sex = String(r[0]).trim();
    if (sex !== "Persons") continue;

    const codeCell = String(r[1] ?? "").trim();
    if (/^Population/i.test(codeCell)) {
      population = Number(r[col]);
      continue;
    }
    if (!/^\d+$/.test(codeCell)) continue;

    // The cause label sits in one of columns C..G depending on its depth in the
    // hierarchy; take the deepest non-numeric cell.
    const label = [2, 3, 4, 5, 6]
      .map((c) => r[c])
      .filter(
        (v) =>
          v !== undefined &&
          v !== null &&
          String(v).trim() !== "" &&
          !/^[\d.]+$/.test(String(v).trim())
      )
      .pop();
    if (label === undefined) continue;

    const value = r[col];
    if (value === undefined || value === null || String(value).trim() === "") continue;

    const depth = [2, 3, 4, 5, 6].findIndex((c) => String(r[c] ?? "").trim() === String(label).trim());
    causes.push({
      ghe_code: codeCell,
      label: String(label).trim(),
      depth,
      is_aggregate: AGGREGATE_CODES.has(codeCell),
      daly_thousands: Number(value),
    });
  }

  if (population === null) throw new Error("population row not found");
  return { population_thousands: population, causes };
}

async function buildMapping(causes) {
  const mappable = causes.filter((c) => !c.is_aggregate && c.ghe_code !== "0");
  const entries = [];
  let done = 0;

  for (const c of mappable) {
    const aliased = Object.prototype.hasOwnProperty.call(ALIASES, c.label)
      ? ALIASES[c.label]
      : c.label;

    if (aliased === null) {
      entries.push({
        ghe_code: c.ghe_code,
        ghe_label: c.label,
        query: null,
        efo_id: null,
        efo_label: null,
        match_type: "declined",
        reason: "curated as not a single mappable disease",
        candidates: [],
      });
      continue;
    }

    let hits = [];
    try {
      hits = await otSearch(aliased);
    } catch (err) {
      entries.push({
        ghe_code: c.ghe_code,
        ghe_label: c.label,
        query: aliased,
        efo_id: null,
        efo_label: null,
        match_type: "unmapped",
        reason: `search failed: ${err.message}`,
        candidates: [],
      });
      continue;
    }

    const wanted = normalise(aliased);
    const exact = hits.find((h) => isDiseaseId(h.id) && normalise(h.name) === wanted);

    entries.push({
      ghe_code: c.ghe_code,
      ghe_label: c.label,
      query: aliased,
      efo_id: exact ? exact.id : null,
      efo_label: exact ? exact.name : null,
      match_type: exact ? (aliased === c.label ? "exact" : "curated-alias-exact") : "unmapped",
      reason: exact
        ? null
        : "no candidate's label matched the query exactly after normalisation; left unmapped rather than guessed",
      candidates: hits.slice(0, 5),
    });

    done++;
    if (done % 25 === 0) process.stderr.write(`[burden] resolved ${done}/${mappable.length}\n`);
    await sleep(120);
  }
  return entries;
}

async function main() {
  process.stderr.write("[burden] reading WHO GHE 2023 India column...\n");
  const { population_thousands, causes } = extractIndiaCauses();
  process.stderr.write(`[burden] ${causes.length} Persons cause rows\n`);

  process.stderr.write("[burden] resolving GHE causes to EFO/MONDO via Open Targets...\n");
  const mapping = await buildMapping(causes);

  const mapped = mapping.filter((m) => m.efo_id);
  const declined = mapping.filter((m) => m.match_type === "declined");
  const attempted = mapping.length - declined.length;
  const coverage = attempted ? mapped.length / attempted : 0;

  const burdenPayload = {
    schemaVersion: 1,
    generated_at: new Date().toISOString(),
    description:
      "India national DALYs by cause. Every figure is reproduced from the source workbook as published; nothing is rescaled, rounded or interpolated.",
    source: SOURCE,
    population_thousands,
    total_daly_thousands: causes.find((c) => c.ghe_code === "0")?.daly_thousands ?? null,
    n_causes: causes.length,
    causes,
  };

  const mappingPayload = {
    schemaVersion: 1,
    generated_at: new Date().toISOString(),
    description:
      "GHE cause -> EFO/MONDO mapping. A mapping is accepted only on an exact normalised label match to an EFO or MONDO disease id. Unmapped causes keep their candidates so the decision can be reviewed; an unmapped disease must render burden as unavailable, never as zero or a default.",
    resolver: {
      service: "Open Targets Platform GraphQL disease search",
      url: OT_GQL,
      rule: "exact normalised label match; EFO_ or MONDO_ ids only",
      rejected_alternative:
        "top-hit-wins, which maps 'Cervix uteri cancer' to 'uterine cervix neoplasm' and 'Iron-deficiency anaemia' to an HP phenotype term",
      resolved_at: new Date().toISOString(),
    },
    coverage: {
      n_causes_total: causes.length,
      n_aggregate_excluded: causes.filter((c) => c.is_aggregate || c.ghe_code === "0").length,
      n_attempted: attempted,
      n_declined_by_curation: declined.length,
      n_mapped: mapped.length,
      n_unmapped: attempted - mapped.length,
      mapping_rate: Number(coverage.toFixed(4)),
    },
    mappings: mapping,
  };

  fs.writeFileSync(OUT_BURDEN, JSON.stringify(burdenPayload, null, 2));
  fs.writeFileSync(OUT_MAPPING, JSON.stringify(mappingPayload, null, 2));

  process.stderr.write(
    `\n[burden] mapped ${mapped.length}/${attempted} attempted causes (${(100 * coverage).toFixed(1)}%)\n`
  );
  process.stderr.write(`[burden] wrote ${path.relative(REPO_ROOT, OUT_BURDEN)}\n`);
  process.stderr.write(`[burden] wrote ${path.relative(REPO_ROOT, OUT_MAPPING)}\n`);
  return mappingPayload;
}

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  main().catch((err) => {
    process.stderr.write(`[burden] ${err && err.stack ? err.stack : err}\n`);
    process.exitCode = 1;
  });
}

export { extractIndiaCauses, SOURCE };
