"use client";

import Link from "next/link";
import { useKnowledgeDoc } from "@/lib/api";
import { HttpError } from "@/lib/api";
import { citationLabel } from "@/lib/format";
import { extractSection, metaString } from "@/lib/knowledge";
import { knowledgeHref } from "@/lib/knowledgeDoc";
import { useCockpit } from "@/lib/store";
import type { Citation } from "@/lib/types";
import { EmptyState, ErrorState, LoadingBlock } from "@/components/ui/primitives";
import Markdown from "./Markdown";

/** Compact source preview shown inside the Gemini panel when a citation chip is clicked. */
export default function SourcePreview({ c }: { c: Citation }) {
  const close = useCockpit((s) => s.closeSource);
  const setCopilotOpen = useCockpit((s) => s.setCopilotOpen);
  const doc = useKnowledgeDoc(c.doc_id);
  const meta = doc.data?.meta;
  const docTitle = metaString(meta, "title") ?? c.title ?? c.doc_id;
  const rev = metaString(meta, "revision", "rev") ?? (c.revision !== undefined ? String(c.revision) : null);
  const effective = metaString(meta, "effective", "effective_date", "date");
  const docType = metaString(meta, "doc_type", "type");
  const section = doc.data ? extractSection(doc.data.markdown, c.section) : null;
  const secTitle = section?.title ?? doc.data?.sections?.find((s) => s.id === c.section)?.title ?? c.title ?? "";
  const notFound = doc.error instanceof HttpError && doc.error.status === 404;

  return (
    <div className="source-preview" role="region" aria-label={`Source preview ${citationLabel(c)}`}>
      <div className="sp-head">
        <button type="button" className="btn sm ghost" onClick={close} aria-label="Back to conversation">
          ← Back
        </button>
        <span className="doc-banner">Simulated document</span>
        <Link
          href={knowledgeHref(c.doc_id, c.section)}
          className="btn sm sp-open"
          id="sp-open-knowledge"
          title="Open the full document at this section in the Knowledge dashboard"
          onClick={() => {
            // H4: jump to the full document and minimise the Gemini panel back to its launcher.
            close();
            setCopilotOpen(false);
          }}
        >
          Open in Knowledge →
        </Link>
      </div>
      <div className="sp-meta">
        <div className="mono sp-id">
          {c.doc_id}
          {rev ? ` · r${rev}` : ""}
          {c.section ? ` · §${c.section}` : ""}
          {docType ? ` · ${docType}` : ""}
        </div>
        <div className="sp-title">{docTitle}</div>
        {effective ? <div className="subtle" style={{ fontSize: 11.5 }}>Effective {effective}</div> : null}
      </div>
      <div className="sp-body">
        {doc.isLoading ? (
          <LoadingBlock height={160} label="Loading source" />
        ) : notFound ? (
          <EmptyState
            title="Source not found"
            detail="Knowledge corpus not generated yet, or this document is missing — see delegation.md."
          />
        ) : doc.isError ? (
          <ErrorState error={doc.error} onRetry={() => doc.refetch()} title="Could not load the source" />
        ) : doc.data ? (
          section ? (
            <>
              <h3 className="sp-sec">
                <span className="mono">§{section.id}</span> {secTitle}
              </h3>
              <div className="bubble doc-md sec-block-hl" style={{ padding: "8px 10px" }}>
                <Markdown>{section.markdown || "_(section heading only)_"}</Markdown>
              </div>
            </>
          ) : (
            <>
              <p className="muted" style={{ fontSize: 12, margin: "0 0 8px" }}>
                {c.section ? `Section §${c.section} was not found; showing the start of the document.` : "Document start:"}
              </p>
              <div className="bubble doc-md">
                <Markdown>{doc.data.markdown.slice(0, 2400)}</Markdown>
              </div>
            </>
          )
        ) : null}
        {c.snippet && !section ? (
          <blockquote className="sp-snippet">{c.snippet}</blockquote>
        ) : null}
      </div>
    </div>
  );
}
