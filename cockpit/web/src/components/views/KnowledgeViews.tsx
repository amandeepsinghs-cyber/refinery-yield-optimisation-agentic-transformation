"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { HttpError, useKnowledgeDoc, useKnowledgeSearch, useRuns } from "@/lib/api";
import { clock } from "@/lib/format";
import { metaString } from "@/lib/knowledge";
import { useKnowledgeLibrary, useRunRecords, type KnowledgeRecordFull } from "@/lib/knowledgeApi";
import {
  KNOWLEDGE_TYPES,
  countByType,
  groupRecords,
  highlightedSegments,
  knowledgeHref,
  sectionAnchor,
  splitSections,
  targetSegment,
} from "@/lib/knowledgeDoc";
import { useCockpit } from "@/lib/store";
import Markdown from "@/components/copilot/Markdown";
import { Card, EmptyState, ErrorState, LoadingBlock, PageHeader } from "@/components/ui/primitives";
import { IconSearch } from "@/components/ui/icons";

function SimBadge({ status }: { status?: string | null }) {
  return <span className="badge neutral kn-sim">{(status || "SIMULATED").toUpperCase()}</span>;
}

function useDebounced<T>(v: T, ms = 300): T {
  const [d, setD] = useState(v);
  useEffect(() => {
    const t = setTimeout(() => setD(v), ms);
    return () => clearTimeout(t);
  }, [v, ms]);
  return d;
}

// ---------------------------------------------------------------- related records rail

function RecordItem({ r, showTime }: { r: KnowledgeRecordFull; showTime: boolean }) {
  const setTimeMin = useCockpit((s) => s.setTimeMin);
  return (
    <li className="kn-rec">
      <Link href={knowledgeHref(r.doc_id)} className="kn-rec-link">
        <span className="kn-id mono">
          {r.doc_id} <span className="badge neutral">{r.doc_type}</span>
        </span>
        <span className="kn-rec-title">{r.title || r.doc_id}</span>
      </Link>
      <span className="kn-rec-meta subtle">
        {showTime && r.time_min !== null ? (
          <button
            type="button"
            className="btn sm ghost mono"
            title="Move the shared time cursor to this record"
            onClick={() => setTimeMin(r.time_min)}
          >
            t {r.time_min} ({clock(r.time_min)})
          </button>
        ) : (
          <span>{r.date ?? "undated"}</span>
        )}
        {r.entries?.length ? <span>{r.entries.length} timed entries</span> : null}
      </span>
    </li>
  );
}

export function RelatedRecordsRail({ currentDoc }: { currentDoc?: string }) {
  const runId = useCockpit((s) => s.runId);
  const runs = useRuns();
  const run = runs.data?.find((r) => r.run_id === runId);
  const q = useRunRecords(runId);
  const g = useMemo(() => groupRecords(q.data ?? [], runId), [q.data, runId]);
  const mark = (list: KnowledgeRecordFull[]) => list.filter((r) => r.doc_id !== currentDoc);

  return (
    <aside className="card kn-rail" aria-label="Related records for this run">
      <div className="card-h">
        <h2>
          Related records for this run
          <span className="card-sub mono">{runId ? `${run?.batch ? `${run.batch} · ` : ""}${runId}` : "no run selected"}</span>
        </h2>
      </div>
      <div className="card-b">
        {q.isLoading ? (
          <LoadingBlock height={160} label="Loading records" />
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} title="Could not load job records" />
        ) : (
          <>
            <h3 className="kn-rail-h">Placed on this run (sim_run)</h3>
            {mark(g.thisRun).length ? (
              <ul className="kn-rec-list">
                {mark(g.thisRun).map((r) => (
                  <RecordItem key={r.doc_id} r={r} showTime />
                ))}
              </ul>
            ) : (
              <p className="muted kn-empty">
                {runId ? "No shift log or record is tied to this run." : "Pick a run in the top bar to see its records."}
              </p>
            )}
            {g.onClock.length ? (
              <>
                <h3 className="kn-rail-h">Dated inside this run</h3>
                <ul className="kn-rec-list">
                  {mark(g.onClock).map((r) => (
                    <RecordItem key={r.doc_id} r={r} showTime />
                  ))}
                </ul>
              </>
            ) : null}
            <h3 className="kn-rail-h">Records by date (not placed)</h3>
            {mark(g.byDate).length ? (
              <ul className="kn-rec-list">
                {mark(g.byDate).map((r) => (
                  <RecordItem key={r.doc_id} r={r} showTime={false} />
                ))}
              </ul>
            ) : (
              <p className="muted kn-empty">None.</p>
            )}
          </>
        )}
      </div>
      <div className="card-foot">Records without a simulator minute are listed by date, never placed at an invented minute.</div>
    </aside>
  );
}

// ---------------------------------------------------------------- library

export function KnowledgeLibraryView() {
  const [type, setType] = useState<string | null>(null);
  const [text, setText] = useState("");
  const q = useDebounced(text.trim());
  const lib = useKnowledgeLibrary();
  const search = useKnowledgeSearch(q, type ?? undefined);
  const counts = useMemo(() => countByType(lib.data ?? []), [lib.data]);
  const docs = useMemo(() => (lib.data ?? []).filter((d) => !type || d.doc_type === type), [lib.data, type]);
  const searching = q.length > 1;

  return (
    <div className="page">
      <PageHeader
        title="Knowledge"
        question="Which procedure, limit or past record applies here, and what exactly does it say?"
        actions={<span className="doc-banner">Simulated corpus · not approved procedures</span>}
      />
      <div className="kn-dash">
        <Card title="Document library" sub={lib.data ? `${lib.data.length} documents` : undefined}>
          <div className="stack" style={{ gap: 10 }}>
            <div className="search-box">
              <IconSearch />
              <label className="sr-only" htmlFor="kn-search">
                Search the knowledge corpus
              </label>
              <input
                id="kn-search"
                className="input"
                type="search"
                placeholder="Search SOPs, limits, work orders, shift logs…"
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
            </div>
            <div className="filter-chips" role="group" aria-label="Filter by document type">
              <button type="button" aria-pressed={type === null} onClick={() => setType(null)}>
                All {lib.data ? `(${lib.data.length})` : ""}
              </button>
              {KNOWLEDGE_TYPES.map((t) => (
                <button key={t} type="button" aria-pressed={type === t} onClick={() => setType(type === t ? null : t)}>
                  {t} {counts[t] ? `(${counts[t]})` : "(0)"}
                </button>
              ))}
            </div>

            {searching ? (
              search.isLoading ? (
                <LoadingBlock height={200} label="Searching" />
              ) : search.isError ? (
                <ErrorState error={search.error} onRetry={() => search.refetch()} title="Search failed" />
              ) : !search.data?.results.length ? (
                <EmptyState
                  title="No matching sections"
                  detail={search.data?.index.mode === "empty" ? "The knowledge corpus is not indexed yet." : "Try other words or clear the type filter."}
                />
              ) : (
                <>
                  <p className="subtle" style={{ margin: 0, fontSize: 12 }}>
                    {search.data.results.length} sections · index mode {search.data.index.mode}
                  </p>
                  <ul className="kn-results" aria-label="Search results">
                    {search.data.results.map((h, i) => (
                      <li key={`${h.doc_id}-${h.section}-${i}`}>
                        <Link className="kn-hit" href={knowledgeHref(h.doc_id, h.section)}>
                          <span className="kn-id">
                            {h.doc_id} r{h.revision}
                            {h.section ? ` · §${h.section}` : ""}
                            <span className="badge neutral">{h.doc_type}</span>
                            <SimBadge />
                          </span>
                          <span className="kn-title">
                            {h.title}
                            {h.section_title ? <span className="muted"> — {h.section_title}</span> : null}
                          </span>
                          <span className="kn-snip">{h.snippet}</span>
                          <span className="scorebar" aria-label={`score ${h.score.toFixed(2)}`}>
                            <span style={{ width: `${Math.max(4, Math.min(100, h.score * 100))}%` }} />
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </>
              )
            ) : lib.isLoading ? (
              <LoadingBlock height={300} label="Loading library" />
            ) : lib.isError ? (
              <ErrorState error={lib.error} onRetry={() => lib.refetch()} title="Could not load the library" />
            ) : !docs.length ? (
              <EmptyState title="No documents" detail={type ? `No ${type} documents in the corpus.` : "Knowledge corpus not generated yet."} />
            ) : (
              <div className="table-wrap">
                <table className="kn-table">
                  <thead>
                    <tr>
                      <th scope="col">Doc ID</th>
                      <th scope="col">Title</th>
                      <th scope="col">Rev</th>
                      <th scope="col">Type</th>
                      <th scope="col">Effective</th>
                      <th scope="col">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {docs.map((d) => (
                      <tr key={d.doc_id}>
                        <td className="mono">
                          <Link href={knowledgeHref(d.doc_id)}>{d.doc_id}</Link>
                        </td>
                        <td>
                          <Link href={knowledgeHref(d.doc_id)} className="kn-row-title" title={d.summary ?? undefined}>
                            {d.title}
                          </Link>
                        </td>
                        <td className="num">{d.revision ? `r${d.revision}` : "—"}</td>
                        <td>
                          <span className="badge neutral">{d.doc_type}</span>
                        </td>
                        <td className="num subtle">{d.effective_date ?? "—"}</td>
                        <td>
                          <SimBadge status={d.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </Card>
        <RelatedRecordsRail />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- document viewer

function MetaRow({ k, v }: { k: string; v: string | null }) {
  if (!v) return null;
  return (
    <>
      <dt>{k}</dt>
      <dd className="mono">{v}</dd>
    </>
  );
}

export function KnowledgeDocView({ docId, section }: { docId: string; section: string | null }) {
  const doc = useKnowledgeDoc(docId);
  const meta = doc.data?.meta;
  const segs = useMemo(() => (doc.data ? splitSections(doc.data.markdown) : []), [doc.data]);
  const hl = useMemo(() => highlightedSegments(segs, section), [segs, section]);
  const target = useMemo(() => targetSegment(segs, section), [segs, section]);
  const notFound = doc.error instanceof HttpError && doc.error.status === 404;
  const sectionMissing = !!section && !!doc.data && target === -1 && hl.size === 0;

  useEffect(() => {
    if (!doc.data || !section) return;
    const idx = target >= 0 ? target : [...hl][0];
    if (idx === undefined) return;
    const el = document.getElementById(segs[idx].id ? sectionAnchor(segs[idx].id!) : segs[idx].key);
    if (!el) return;
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    // Wait a frame so the markdown has laid out before scrolling.
    const raf = requestAnimationFrame(() => el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" }));
    return () => cancelAnimationFrame(raf);
  }, [doc.data, section, target, hl, segs]);

  const title = metaString(meta, "title") ?? docId;
  const rev = metaString(meta, "revision", "rev");
  const win = meta?.sim_window;
  const winStr = Array.isArray(win) && win.length ? `t ${win.join("–")} min` : metaString(meta, "sim_window");
  const relatedDocs = Array.isArray(meta?.related_docs) ? (meta!.related_docs as unknown[]).map(String) : [];
  const tocSections = doc.data?.sections ?? [];

  return (
    <div className="page">
      <PageHeader
        title={
          <span className="row" style={{ gap: 10, flexWrap: "wrap" }}>
            <span className="mono">{docId}</span>
            {rev ? <span className="muted mono">r{rev}</span> : null}
            <SimBadge status={metaString(meta, "status")} />
          </span>
        }
        question={doc.data ? title : "Knowledge document"}
        actions={
          <Link href="/knowledge" className="btn">
            ← Library
          </Link>
        }
      />
      <div className="kn-dash">
        <section className="card" aria-label={`Document ${docId}`}>
          <div className="card-b">
            {doc.isLoading ? (
              <LoadingBlock height={420} label="Loading document" />
            ) : notFound ? (
              <EmptyState title="Document not found" detail={`${docId} is not in the knowledge corpus.`} />
            ) : doc.isError ? (
              <ErrorState error={doc.error} onRetry={() => doc.refetch()} title="Could not load the document" />
            ) : doc.data ? (
              <>
                <dl className="kv kn-meta">
                  <MetaRow k="Doc ID" v={docId} />
                  <MetaRow k="Revision" v={rev ? `r${rev}` : null} />
                  <MetaRow k="Type" v={metaString(meta, "doc_type", "type")} />
                  <MetaRow k="Effective" v={metaString(meta, "effective_date", "effective", "date")} />
                  <MetaRow k="Owner" v={metaString(meta, "owner_role")} />
                  <MetaRow k="Unit" v={metaString(meta, "unit")} />
                  <MetaRow k="sim_batch" v={metaString(meta, "sim_batch")} />
                  <MetaRow k="sim_run" v={metaString(meta, "sim_run")} />
                  <MetaRow k="sim_window" v={winStr} />
                </dl>
                {section ? (
                  <p className={`kn-cite-note ${sectionMissing ? "warn" : ""}`} role="status">
                    {sectionMissing
                      ? `Section §${section} was not found in this revision; showing the whole document.`
                      : `Cited section §${section} is highlighted.`}
                  </p>
                ) : null}
                <div className="doc-view">
                  <nav className="doc-toc" aria-label="Sections">
                    {tocSections.map((s) => (
                      <Link
                        key={s.id}
                        href={knowledgeHref(docId, s.id)}
                        scroll={false}
                        aria-current={s.id === section ? "true" : undefined}
                        title={s.title}
                      >
                        §{s.id} {s.title.length > 18 ? `${s.title.slice(0, 16)}…` : s.title}
                      </Link>
                    ))}
                  </nav>
                  <article className="doc-md">
                    {segs.map((s, i) => (
                      <div
                        key={s.key}
                        id={s.id ? sectionAnchor(s.id) : s.key}
                        className={`kn-seg ${hl.has(i) ? "sec-block-hl" : ""} ${i === target ? "kn-seg-target" : ""}`}
                        data-section={s.id ?? undefined}
                      >
                        <Markdown>{s.markdown}</Markdown>
                      </div>
                    ))}
                  </article>
                </div>
              </>
            ) : null}
          </div>
          {relatedDocs.length ? (
            <div className="card-foot row" style={{ flexWrap: "wrap", gap: 6 }}>
              <span>Related documents:</span>
              {relatedDocs.map((d) => (
                <Link key={d} href={knowledgeHref(d)} className="cite">
                  {d}
                </Link>
              ))}
            </div>
          ) : null}
        </section>
        <RelatedRecordsRail currentDoc={docId} />
      </div>
    </div>
  );
}
