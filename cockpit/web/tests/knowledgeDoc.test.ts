import { describe, expect, it } from "vitest";
import {
  countByType,
  docTypeOf,
  groupRecords,
  highlightedSegments,
  knowledgeHref,
  normaliseManifest,
  parseHeading,
  sectionAnchor,
  splitSections,
  targetSegment,
  type RecordLike,
} from "@/lib/knowledgeDoc";

/** Python HEAD_RE from cockpit/api/app/knowledge/index.py, transcribed to JS. */
const BACKEND_HEAD_RE = /^(#{2,4})\s+(\d+(?:\.\d+)*)?\.?\s*(.*)$/;

describe("section ids match the backend", () => {
  const lines = [
    "## 1 Purpose",
    "## 4. Procedure",
    "### 4.2 Confirm advisory spread-gate status",
    "### 4.2. Trailing dot",
    "#### 4.5.2 Deep",
    "## Summary",
    "## 2026 review",
  ];
  it.each(lines)("%s", (line) => {
    const b = BACKEND_HEAD_RE.exec(line)!;
    const f = parseHeading(line)!;
    expect(f.id).toBe(b[2] ?? null);
    expect(f.title).toBe(b[3].trim());
    expect(f.level).toBe(b[1].length);
  });

  it("also tolerates § prefixes and ignores non-headings", () => {
    expect(parseHeading("### §4.2 Raise")).toEqual({ level: 3, id: "4.2", title: "Raise" });
    expect(parseHeading("4.5.2 Verify that cutpoint_auto mode functions")).toBeNull();
    expect(parseHeading("#hashtag")).toBeNull();
  });
});

describe("anchors and hrefs", () => {
  it("slugs section ids into CSS-safe DOM ids", () => {
    expect(sectionAnchor("4.2")).toBe("sec-4-2");
    expect(sectionAnchor("1")).toBe("sec-1");
    expect(sectionAnchor(" 4.5.2 ")).toBe("sec-4-5-2");
  });
  it("builds viewer links", () => {
    expect(knowledgeHref("SOP-FRAC-003", "4.2")).toBe("/knowledge/SOP-FRAC-003?section=4.2");
    expect(knowledgeHref("WO-24031")).toBe("/knowledge/WO-24031");
    expect(knowledgeHref("WO-24031", "")).toBe("/knowledge/WO-24031");
  });
});

const DOC = [
  "> **SIMULATED DOCUMENT**",
  "",
  "## 1 Purpose",
  "Why.",
  "## 4 Procedure",
  "### 4.1 Evaluate",
  "Step a.",
  "### 4.2 Confirm gate",
  "Check W90.",
  "#### Notes",
  "Un-numbered child.",
  "#### 4.2.1 Sub-step",
  "Deeper.",
  "```",
  "## 9 not a heading (in a code fence)",
  "```",
  "### 4.3 Apply",
  "Move SP.",
  "## 5 Records",
].join("\n");

describe("splitSections / highlight", () => {
  const segs = splitSections(DOC);
  it("splits at headings, keeps the preamble and ignores fenced headings", () => {
    expect(segs.map((s) => s.id)).toEqual([null, "1", "4", "4.1", "4.2", null, "4.2.1", "4.3", "5"]);
    expect(segs[0].level).toBe(0);
    expect(segs[6].markdown).toContain("## 9 not a heading");
  });
  it("highlights the cited section and everything nested under it", () => {
    const hl = highlightedSegments(segs, "4.2");
    expect([...hl].map((i) => segs[i].id ?? segs[i].title)).toEqual(["4.2", "Notes", "4.2.1"]);
    expect(segs[targetSegment(segs, "4.2")].id).toBe("4.2");
  });
  it("a top-level section covers its numbered subsections", () => {
    const hl = highlightedSegments(segs, "4");
    expect([...hl].map((i) => segs[i].id ?? segs[i].title)).toEqual(["4", "4.1", "4.2", "Notes", "4.2.1", "4.3"]);
  });
  it("does not treat 4.20 as a child of 4.2 and handles missing sections", () => {
    const s2 = splitSections("## 4.2 A\nx\n## 4.20 B\ny");
    expect([...highlightedSegments(s2, "4.2")]).toEqual([0]);
    expect(highlightedSegments(segs, "7.7").size).toBe(0);
    expect(targetSegment(segs, "7.7")).toBe(-1);
    expect(highlightedSegments(segs, null).size).toBe(0);
  });
});

describe("manifest", () => {
  it("normalises the manifest and derives the type", () => {
    const docs = normaliseManifest([
      { doc_id: "SOP-FRAC-003", title: "LCO", doc_type: "SOP", revision: "4", effective_date: "2025-01-01", status: "SIMULATED", sections: ["1", "4.2"] },
      { doc_id: "REF-01", title: "Ref" },
      { nope: true },
    ]);
    expect(docs.map((d) => [d.doc_id, d.doc_type, d.revision])).toEqual([
      ["REF-01", "REF", null],
      ["SOP-FRAC-003", "SOP", "4"],
    ]);
    expect(docs[1].sections).toEqual(["1", "4.2"]);
    expect(countByType(docs)).toEqual({ REF: 1, SOP: 1 });
    expect(normaliseManifest({ docs: [{ doc_id: "WO-1" }] })[0].doc_type).toBe("WO");
    expect(normaliseManifest(null)).toEqual([]);
    expect(docTypeOf("shift", "X-1")).toBe("SHIFT");
  });
});

describe("groupRecords", () => {
  const recs: RecordLike[] = [
    { doc_id: "SHIFT-S140", doc_type: "SHIFT", title: "", date: "2026-08-10", time_min: 360, run_id: "random_s140" },
    { doc_id: "SHIFT-S141", doc_type: "SHIFT", title: "", date: "2026-08-15", time_min: 10, run_id: "random_s141" },
    { doc_id: "WO-2", doc_type: "WO", title: "", date: "2026-08-10", time_min: 200, run_id: null },
    { doc_id: "WO-1", doc_type: "WO", title: "", date: "2025-03-01", time_min: null, run_id: null },
    { doc_id: "INC-1", doc_type: "INC", title: "", date: "2025-07-01", time_min: null },
  ];
  it("splits by this run, dated-inside-run and by date", () => {
    const g = groupRecords(recs, "random_s140");
    expect(g.thisRun.map((r) => r.doc_id)).toEqual(["SHIFT-S140"]);
    expect(g.onClock.map((r) => r.doc_id)).toEqual(["WO-2"]);
    expect(g.byDate.map((r) => r.doc_id)).toEqual(["SHIFT-S141", "INC-1", "WO-1"]);
  });
  it("without a run nothing is placed", () => {
    const g = groupRecords(recs, null);
    expect(g.thisRun).toEqual([]);
    expect(g.onClock).toEqual([]);
    expect(g.byDate).toHaveLength(5);
  });
});
