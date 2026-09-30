/**
 * Pure helpers for the Knowledge dashboard (F24): section ids/anchors that match the backend's
 * section ids (cockpit/api/app/knowledge/index.py HEAD_RE), document segmentation for the
 * full-document viewer, manifest normalisation and job-record grouping.
 */

/** Document types shown as library filters (knowledge/corpus/manifest.json `doc_type`). */
export const KNOWLEDGE_TYPES = ["SOP", "IOW", "LAB", "WO", "SHIFT", "INC", "MOC", "REF"] as const;
export type KnowledgeType = (typeof KNOWLEDGE_TYPES)[number];

/**
 * Mirrors the backend HEAD_RE `^(#{2,4})\s+(\d+(?:\.\d+)*)?\.?\s*(.*)$` so section ids are identical.
 * Superset: any heading level 1–6 and an optional leading "§" (the backend then yields no id,
 * so such headings are never cited — harmless).
 */
const HEADING_RE = /^(#{1,6})\s+(?:§\s*)?(\d+(?:\.\d+)*)?\.?\s*(.*)$/;
const FENCE_RE = /^\s*(```|~~~)/;

export interface ParsedHeading {
  level: number;
  /** Section id such as "4.2", or null for an un-numbered heading. */
  id: string | null;
  title: string;
}

export function parseHeading(line: string): ParsedHeading | null {
  const m = HEADING_RE.exec(line.replace(/\s+$/, ""));
  if (!m) return null;
  return { level: m[1].length, id: m[2] ?? null, title: (m[3] ?? "").trim() };
}

/** DOM id for a section: "4.2" → "sec-4-2" (no dots, so it is also a valid CSS selector). */
export function sectionAnchor(id: string): string {
  return `sec-${id.trim().replace(/[^0-9A-Za-z]+/g, "-").replace(/^-+|-+$/g, "")}`;
}

/** Viewer URL for a document, optionally at a section. */
export function knowledgeHref(docId: string, section?: string | null): string {
  const base = `/knowledge/${encodeURIComponent(docId)}`;
  return section ? `${base}?section=${encodeURIComponent(section)}` : base;
}

export interface DocSegment {
  key: string;
  /** 0 for the preamble before the first heading. */
  level: number;
  id: string | null;
  title: string;
  /** Markdown of the segment, including its heading line. */
  markdown: string;
}

/** Splits a document at every heading (outside code fences). */
export function splitSections(markdown: string): DocSegment[] {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const segs: DocSegment[] = [];
  let cur: { level: number; id: string | null; title: string; lines: string[] } = {
    level: 0,
    id: null,
    title: "",
    lines: [],
  };
  let inFence = false;
  const flush = () => {
    const md = cur.lines.join("\n");
    if (cur.level > 0 || md.trim()) {
      segs.push({ key: `s${segs.length}`, level: cur.level, id: cur.id, title: cur.title, markdown: md });
    }
  };
  for (const line of lines) {
    if (FENCE_RE.test(line)) inFence = !inFence;
    const h = inFence ? null : parseHeading(line);
    if (h) {
      flush();
      cur = { level: h.level, id: h.id, title: h.title, lines: [line] };
    } else {
      cur.lines.push(line);
    }
  }
  flush();
  return segs;
}

/**
 * Indices of the segments inside cited section `sec`: its heading's segment, its numbered children
 * ("4.2.1" for "4.2", as the backend's get_doc does) and any deeper un-numbered sub-headings.
 */
export function highlightedSegments(segs: DocSegment[], sec: string | null | undefined): Set<number> {
  const out = new Set<number>();
  if (!sec) return out;
  let active: number | null = null;
  segs.forEach((s, i) => {
    if (s.level === 0) return;
    if (active !== null && s.level > active) {
      out.add(i);
      return;
    }
    active = null;
    if (s.id && (s.id === sec || s.id.startsWith(`${sec}.`))) {
      active = s.level;
      out.add(i);
    }
  });
  return out;
}

/** Index of the segment whose heading is exactly section `sec`, or -1. */
export function targetSegment(segs: DocSegment[], sec: string | null | undefined): number {
  if (!sec) return -1;
  return segs.findIndex((s) => s.id === sec);
}

export interface LibraryDoc {
  doc_id: string;
  title: string;
  doc_type: string;
  revision: string | null;
  effective_date: string | null;
  status: string | null;
  summary: string | null;
  sections: string[];
}

export function docTypeOf(docType: unknown, docId: string): string {
  const t = typeof docType === "string" && docType.trim() ? docType : docId.split("-")[0] ?? "";
  return t.toUpperCase();
}

const str = (v: unknown): string | null => (v === undefined || v === null || v === "" ? null : String(v));

/** Normalises GET /api/knowledge/docs (a manifest array, or `{docs:[...]}`). */
export function normaliseManifest(raw: unknown): LibraryDoc[] {
  const arr: unknown[] = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object" && Array.isArray((raw as { docs?: unknown }).docs)
      ? (raw as { docs: unknown[] }).docs
      : [];
  return arr
    .filter((d): d is Record<string, unknown> => !!d && typeof d === "object" && "doc_id" in d)
    .map((d) => {
      const id = String(d.doc_id);
      return {
        doc_id: id,
        title: String(d.title ?? id),
        doc_type: docTypeOf(d.doc_type ?? d.type, id),
        revision: str(d.revision ?? d.rev),
        effective_date: str(d.effective_date ?? d.effective),
        status: str(d.status),
        summary: str(d.summary),
        sections: Array.isArray(d.sections) ? d.sections.map((s) => String(typeof s === "object" && s ? (s as { id?: unknown }).id : s)) : [],
      };
    })
    .sort((a, b) => a.doc_id.localeCompare(b.doc_id));
}

export function countByType(docs: LibraryDoc[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const d of docs) out[d.doc_type] = (out[d.doc_type] ?? 0) + 1;
  return out;
}

export interface RecordLike {
  doc_id: string;
  doc_type: string;
  title: string;
  date: string | null;
  time_min: number | null;
  run_id?: string | null;
}

export interface GroupedRecords<R extends RecordLike> {
  /** `sim_run == runId`: placed at `sim_window[0]` on this run. */
  thisRun: R[];
  /** No `sim_run`, but the effective date falls inside this run's clock. */
  onClock: R[];
  /** Not placed on this run: listed by date (newest first), never at an invented minute. */
  byDate: R[];
}

export function groupRecords<R extends RecordLike>(records: R[], runId: string | null): GroupedRecords<R> {
  const thisRun: R[] = [];
  const onClock: R[] = [];
  const byDate: R[] = [];
  for (const r of records) {
    if (runId && r.run_id === runId) thisRun.push(r);
    else if (runId && !r.run_id && r.time_min !== null && r.time_min !== undefined) onClock.push(r);
    else byDate.push(r);
  }
  const byTime = (a: R, b: R) => (a.time_min ?? 0) - (b.time_min ?? 0) || a.doc_id.localeCompare(b.doc_id);
  thisRun.sort(byTime);
  onClock.sort(byTime);
  byDate.sort((a, b) => String(b.date ?? "").localeCompare(String(a.date ?? "")) || a.doc_id.localeCompare(b.doc_id));
  return { thisRun, onClock, byDate };
}
