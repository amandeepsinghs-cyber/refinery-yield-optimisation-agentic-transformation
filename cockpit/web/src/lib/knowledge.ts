/** Knowledge helpers for the in-panel source preview. */

const HEADING = /^(#{1,6})\s+(?:§\s*)?(\d+(?:\.\d+)*)\.?\s+(.*)$/;

export interface ExtractedSection {
  id: string;
  title: string;
  markdown: string;
}

/**
 * Extracts section `sec` (e.g. "4.2") from a markdown document: from its heading
 * up to the next heading of the same or higher level. Returns null if absent.
 */
export function extractSection(markdown: string, sec: string): ExtractedSection | null {
  if (!sec) return null;
  const lines = markdown.split(/\r?\n/);
  let start = -1;
  let level = 0;
  let title = "";
  for (let i = 0; i < lines.length; i++) {
    const m = HEADING.exec(lines[i]);
    if (!m) continue;
    if (start === -1) {
      if (m[2] === sec) {
        start = i;
        level = m[1].length;
        title = m[3].trim();
      }
    } else if (m[1].length <= level) {
      return { id: sec, title, markdown: lines.slice(start + 1, i).join("\n").trim() };
    }
  }
  if (start === -1) return null;
  return { id: sec, title, markdown: lines.slice(start + 1).join("\n").trim() };
}

export function metaString(meta: Record<string, unknown> | undefined, ...keys: string[]): string | null {
  if (!meta) return null;
  for (const k of keys) {
    const v = meta[k];
    if (v !== undefined && v !== null && v !== "") return String(v);
  }
  return null;
}
