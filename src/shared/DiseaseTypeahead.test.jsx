import React from "react";
import { act } from "react-dom/test-utils";
import ReactDOM from "react-dom/client";
import fs from "fs";
import path from "path";
import DiseaseTypeahead from "./DiseaseTypeahead";

global.IS_REACT_ACT_ENVIRONMENT = true;

const repoRoot = path.join(__dirname, "..", "..");
const read = (p) => fs.readFileSync(path.join(repoRoot, p), "utf8");

/**
 * The typeahead was extracted from TargetDiscoveryPage so both pages share one
 * implementation. These tests pin the three behaviours a rewrite would lose:
 * the debounce, the stale-response guard, and keyboard navigation.
 */
describe("DiseaseTypeahead", () => {
  let container;
  let root;

  beforeEach(() => {
    jest.useFakeTimers();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = ReactDOM.createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    jest.useRealTimers();
  });

  /** Controlled wrapper, mirroring how both pages use it. */
  function Harness({ searchFn, onSelect, onSubmit, initial = "" }) {
    const [value, setValue] = React.useState(initial);
    return (
      <DiseaseTypeahead
        value={value}
        onChange={setValue}
        onSelect={onSelect}
        onSubmit={onSubmit}
        searchFn={searchFn}
      />
    );
  }

  function render(props) {
    act(() => {
      root.render(<Harness {...props} />);
    });
  }

  const input = () => container.querySelector("input");

  function type(text) {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value"
    ).set;
    act(() => {
      setter.call(input(), text);
      input().dispatchEvent(new Event("input", { bubbles: true }));
    });
  }

  const key = (k) => {
    act(() => {
      input().dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true }));
    });
  };

  test("does not search below two characters", () => {
    const searchFn = jest.fn().mockResolvedValue([]);
    render({ searchFn });
    type("t");
    act(() => {
      jest.advanceTimersByTime(600);
    });
    expect(searchFn).not.toHaveBeenCalled();
  });

  test("debounces: one call for a burst of keystrokes", async () => {
    const searchFn = jest.fn().mockResolvedValue([{ id: "EFO_1", name: "asthma" }]);
    render({ searchFn });
    type("as");
    type("ast");
    type("asth");
    // Nothing yet: the timer has not elapsed.
    expect(searchFn).not.toHaveBeenCalled();
    await act(async () => {
      jest.advanceTimersByTime(300);
    });
    expect(searchFn).toHaveBeenCalledTimes(1);
    expect(searchFn).toHaveBeenCalledWith("asth");
  });

  test("discards a stale response that resolves after a newer one", async () => {
    // "aaa" resolves slowly with the wrong answer; "bbb" resolves fast. The
    // slow one must not overwrite the fast one.
    let releaseSlow;
    const slow = new Promise((res) => {
      releaseSlow = () => res([{ id: "STALE", name: "stale result" }]);
    });
    const searchFn = jest
      .fn()
      .mockImplementationOnce(() => slow)
      .mockImplementationOnce(() => Promise.resolve([{ id: "FRESH", name: "fresh result" }]));

    render({ searchFn });
    type("aaa");
    await act(async () => {
      jest.advanceTimersByTime(300);
    });
    type("bbb");
    await act(async () => {
      jest.advanceTimersByTime(300);
    });
    expect(container.textContent).toContain("fresh result");

    // Now let the first request finish. Its result is older and must be dropped.
    await act(async () => {
      releaseSlow();
      await slow;
    });
    expect(container.textContent).toContain("fresh result");
    expect(container.textContent).not.toContain("stale result");
  });

  test("arrow keys move the active option and Enter selects it", async () => {
    const hits = [
      { id: "EFO_1", name: "one" },
      { id: "EFO_2", name: "two" },
      { id: "EFO_3", name: "three" },
    ];
    const onSelect = jest.fn();
    render({ searchFn: jest.fn().mockResolvedValue(hits), onSelect });
    type("abc");
    await act(async () => {
      jest.advanceTimersByTime(300);
    });
    expect(container.querySelectorAll('[role="option"]').length).toBe(3);

    key("ArrowDown");
    key("ArrowDown");
    const options = container.querySelectorAll('[role="option"]');
    expect(options[1].getAttribute("aria-selected")).toBe("true");

    key("ArrowUp");
    expect(container.querySelectorAll('[role="option"]')[0].getAttribute("aria-selected")).toBe(
      "true"
    );

    key("Enter");
    expect(onSelect).toHaveBeenCalledWith(hits[0]);
  });

  test("ArrowDown stops at the end of the list", async () => {
    const hits = [
      { id: "A", name: "a" },
      { id: "B", name: "b" },
    ];
    render({ searchFn: jest.fn().mockResolvedValue(hits) });
    type("abc");
    await act(async () => {
      jest.advanceTimersByTime(300);
    });
    for (let i = 0; i < 6; i++) key("ArrowDown");
    const options = container.querySelectorAll('[role="option"]');
    expect(options[1].getAttribute("aria-selected")).toBe("true");
  });

  test("Enter with nothing active submits the raw text", async () => {
    const onSubmit = jest.fn();
    const onSelect = jest.fn();
    render({ searchFn: jest.fn().mockResolvedValue([{ id: "X", name: "x" }]), onSubmit, onSelect });
    type("tuberculosis");
    await act(async () => {
      jest.advanceTimersByTime(300);
    });
    key("Enter");
    expect(onSubmit).toHaveBeenCalledWith("tuberculosis");
    expect(onSelect).not.toHaveBeenCalled();
  });

  test("Escape closes the list", async () => {
    render({ searchFn: jest.fn().mockResolvedValue([{ id: "X", name: "x" }]) });
    type("abc");
    await act(async () => {
      jest.advanceTimersByTime(300);
    });
    expect(container.querySelector('[role="listbox"]')).toBeTruthy();
    key("Escape");
    expect(container.querySelector('[role="listbox"]')).toBeNull();
  });

  test("a rejected search clears the list instead of throwing", async () => {
    const searchFn = jest.fn().mockRejectedValue(new Error("offline"));
    render({ searchFn });
    type("abc");
    await act(async () => {
      jest.advanceTimersByTime(300);
    });
    expect(container.querySelector('[role="listbox"]')).toBeNull();
  });

  test("carries the combobox roles the original had", async () => {
    render({ searchFn: jest.fn().mockResolvedValue([{ id: "X", name: "x" }]) });
    expect(container.querySelector('[role="combobox"]')).toBeTruthy();
    expect(input().getAttribute("aria-autocomplete")).toBe("list");
    type("abc");
    await act(async () => {
      jest.advanceTimersByTime(300);
    });
    expect(container.querySelector('[role="listbox"]')).toBeTruthy();
    expect(container.querySelector('[role="option"]')).toBeTruthy();
  });
});

describe("there is exactly one typeahead implementation", () => {
  test("both pages use the shared component", () => {
    for (const f of ["src/TargetDiscoveryPage.jsx", "src/NeglectScreenPage.jsx"]) {
      const src = read(f);
      expect(src).toMatch(/DiseaseTypeahead/);
    }
  });

  test("TargetDiscoveryPage no longer carries its own copy", () => {
    const src = read("src/TargetDiscoveryPage.jsx");
    // The extracted state, guard and markup must all be gone.
    expect(src).not.toMatch(/suggestReq/);
    expect(src).not.toMatch(/setSuggestOpen/);
    expect(src).not.toMatch(/suggest-list/);
    expect(src).not.toMatch(/searchDiseases/);
  });

  test("the shared component keeps the original debounce and guard", () => {
    const src = read("src/shared/DiseaseTypeahead.jsx");
    expect(src).toMatch(/debounceMs = 280/);
    expect(src).toMatch(/minChars = 2/);
    expect(src).toMatch(/reqSeq\.current !== myReq/);
  });
});
