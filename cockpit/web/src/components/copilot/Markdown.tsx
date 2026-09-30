"use client";

import Link from "next/link";
import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ComponentProps } from "react";
import { CitationChip } from "@/components/ui/primitives";

const CITE_RE = /\[([A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+)(?:\s+r(\d+))?(?:\s+§\s?([\d.]+))?\]/g;
const CITE_SCHEME = "#cite:";

/** Turns plain-text citations "[SOP-FRAC-003 r4 §4.2]" into internal cite links. */
export function linkifyCitations(md: string): string {
  return md.replace(
    CITE_RE,
    (full: string, id: string, rev: string | undefined, sec: string | undefined, offset: number, src: string) => {
      if (src.slice(offset + full.length, offset + full.length + 1) === "(") return full;
      const q = new URLSearchParams({ doc: id });
      if (rev) q.set("rev", rev);
      if (sec) q.set("sec", sec);
      return `[${full.replace(/[[\]]/g, "")}](${CITE_SCHEME}${q.toString()})`;
    },
  );
}

export function parseCiteHref(href: string): { doc_id: string; revision: string; section: string } | null {
  if (!href.startsWith(CITE_SCHEME)) return null;
  const q = new URLSearchParams(href.slice(CITE_SCHEME.length));
  const doc = q.get("doc");
  if (!doc) return null;
  return { doc_id: doc, revision: q.get("rev") ?? "", section: q.get("sec") ?? "" };
}

function A({ href, children, ...rest }: ComponentProps<"a">) {
  const cite = href ? parseCiteHref(href) : null;
  if (cite) return <CitationChip c={cite} />;
  if (href?.startsWith("/")) return <Link href={href}>{children}</Link>;
  return (
    <a href={href} target="_blank" rel="noreferrer" {...rest}>
      {children}
    </a>
  );
}

// react-markdown sanitises unknown URL schemes; keep our internal "#cite:" hrefs intact.
const urlTransform = (url: string) => (url.startsWith(CITE_SCHEME) ? url : defaultUrlTransform(url));

export default function Markdown({ children }: { children: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: A }} urlTransform={urlTransform}>
      {linkifyCitations(children)}
    </ReactMarkdown>
  );
}
