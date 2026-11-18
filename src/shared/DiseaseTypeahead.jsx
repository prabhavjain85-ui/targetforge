import React, { useEffect, useRef, useState } from "react";
import { searchDiseases as defaultSearchDiseases } from "../serverApi";

/**
 * Disease typeahead, extracted verbatim from TargetDiscoveryPage so both it and
 * the neglect screen share one implementation.
 *
 * The three behaviours worth naming, because they are the ones a rewrite would
 * get wrong:
 *
 *   Debounce — 280ms, and nothing is searched below two characters.
 *   Stale-response guard — `reqSeq` is a monotonic counter captured per
 *     request; a response whose sequence is no longer current is discarded.
 *     Without it a slow early request can overwrite the results of a faster
 *     later one, so the list shows suggestions for a prefix the user has
 *     already typed past.
 *   Keyboard navigation — ArrowDown/ArrowUp move the active option, Enter
 *     takes the active one or submits the raw text, Escape closes. The option
 *     buttons preventDefault on mousedown so the input's blur does not close
 *     the list before the click lands.
 *
 * `searchFn` is injectable so tests can drive the debounce and the stale guard
 * without a network.
 */
export default function DiseaseTypeahead({
  value,
  onChange,
  onSelect,
  onSubmit,
  placeholder = "Disease name",
  listId = "disease-suggest",
  inputId,
  disabled = false,
  searchFn = defaultSearchDiseases,
  minChars = 2,
  debounceMs = 280,
  className = "",
  inputProps = {},
}) {
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const reqSeq = useRef(0);

  useEffect(() => {
    const q = String(value || "").trim();
    if (q.length < minChars) {
      setSuggestions([]);
      setOpen(false);
      return undefined;
    }
    const handle = setTimeout(async () => {
      const myReq = ++reqSeq.current;
      try {
        const hits = await searchFn(q);
        // Discard a response that is no longer the newest in flight.
        if (reqSeq.current !== myReq) return;
        const list = Array.isArray(hits) ? hits : [];
        setSuggestions(list);
        setOpen(list.length > 0);
        setActiveIndex(-1);
      } catch {
        if (reqSeq.current === myReq) {
          setSuggestions([]);
          setOpen(false);
        }
      }
    }, debounceMs);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, minChars, debounceMs, searchFn]);

  const pick = (hit) => {
    setOpen(false);
    setActiveIndex(-1);
    if (onSelect) onSelect(hit);
  };

  const onKeyDown = (e) => {
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (e.key === "ArrowDown" && suggestions.length) {
      e.preventDefault();
      setOpen(true);
      setActiveIndex((i) => Math.min(i + 1, suggestions.length - 1));
      return;
    }
    if (e.key === "ArrowUp" && suggestions.length) {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const picked = activeIndex >= 0 ? suggestions[activeIndex] : null;
      if (picked) {
        pick(picked);
      } else if (onSubmit) {
        // Close the list on submit too. TargetDiscoveryPage used to do this
        // itself inside runSearch; the component owns the state now, so it
        // owns the closing.
        setOpen(false);
        setActiveIndex(-1);
        onSubmit(String(value || ""));
      }
    }
  };

  return (
    <div
      className={`search-autocomplete ${className}`.trim()}
      role="combobox"
      aria-expanded={open}
      aria-controls={listId}
      aria-haspopup="listbox"
    >
      <input
        id={inputId}
        placeholder={placeholder}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        onFocus={() => suggestions.length && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 180)}
        aria-autocomplete="list"
        aria-controls={listId}
        {...inputProps}
      />
      {open && suggestions.length > 0 && (
        <ul id={listId} className="suggest-list" role="listbox">
          {suggestions.map((hit, i) => (
            <li key={hit.id} role="option" aria-selected={i === activeIndex}>
              <button
                type="button"
                className={"suggest-item" + (i === activeIndex ? " active" : "")}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(hit)}
              >
                <span className="suggest-name">{hit.name}</span>
                <span className="suggest-id">{hit.id}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
