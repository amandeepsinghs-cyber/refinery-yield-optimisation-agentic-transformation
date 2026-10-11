"use client";

/**
 * /explainer (owner, 11 Oct 2026): one self-contained document that explains the FCC process (follow the oil), how to read
 * the Whole-unit screen, the pins, the nine decisions, the soft sensor, a glossary and what the demo is, so the demo
 * stands on its own. Single source: GET /api/explainer serves cockpit/api/app/copilot/fcc_explainer.md, which is also
 * given to Gemini as context, so the page and Gemini explain things in the same words. Presentation: a hero band with
 * the one-line summary, a "follow the oil" strip, then one numbered card per "## " section of the markdown.
 */
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ComponentProps } from "react";

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

function A({ href, children, ...rest }: ComponentProps<"a">) {
  if (href?.startsWith("/")) return <Link href={href}>{children}</Link>;
  return <a href={href} target="_blank" rel="noreferrer" {...rest}>{children}</a>;
}

const MD = ({ children }: { children: string }) => (
  <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: A }}>{children}</ReactMarkdown>
);

/** The oil's path through the six sections, as on the Whole-unit drawing (left to right). */
const OIL = [
  { n: "1", name: "Feed furnace", what: "heats the feed" },
  { n: "2", name: "Riser reactor", what: "cracks it in seconds" },
  { n: "3", name: "Regenerator", what: "burns coke, reheats catalyst" },
  { n: "4", name: "Main fractionator", what: "splits by boiling range" },
  { n: "5", name: "Gas plant", what: "condenses, recovers gas" },
  { n: "6", name: "Stabiliser", what: "LPG and light naphtha" },
];

interface Section { title: string; num: string; body: string; id: string }

function parse(md: string): { title: string; lede: string; sections: Section[] } {
  const parts = md.split(/\n(?=## )/);
  const head = parts.shift() ?? "";
  const title = (head.match(/^# (.+)$/m)?.[1] ?? "FCC explainer").trim();
  const lede = head.replace(/^# .+$/m, "").replace(/^\s*>\s?/gm, "").replace(/^---\s*$/gm, "").trim();
  const sections = parts.map((p) => {
    const first = p.split("\n")[0].replace(/^##\s*/, "").trim();
    const m = first.match(/^(\d+)\.\s*(.+)$/);
    const body = p.split("\n").slice(1).join("\n").replace(/\n---\s*$/m, "").trim();
    const t = m ? m[2] : first;
    return { title: t, num: m ? m[1] : "", body, id: slug(t) };
  });
  return { title, lede, sections };
}

export default function ExplainerView() {
  const [md, setMd] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let on = true;
    fetch("/api/explainer")
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((t) => { if (on) setMd(t); })
      .catch((e: unknown) => { if (on) setErr(e instanceof Error ? e.message : "unavailable"); });
    return () => { on = false; };
  }, []);

  const doc = useMemo(() => (md ? parse(md) : null), [md]);

  if (!doc) {
    return (
      <main id="main" className="pf xp">
        <p className="subtle">{err ? `The explainer could not be loaded (${err}). Is the API running?` : "Loading the explainer…"}</p>
      </main>
    );
  }

  return (
    <main id="main" className="pf xp">
      <header className="xp-hero">
        <p className="pf-kicker">Explainer</p>
        <h1>{doc.title}</h1>
        <div className="xp-lede"><MD>{doc.lede}</MD></div>
        <ol className="xp-oil" aria-label="Follow the oil through the six sections">
          {OIL.map((u, i) => (
            <li key={u.n}>
              <span className="xp-oil-n">{u.n}</span>
              <b>{u.name}</b>
              <small>{u.what}</small>
              {i < OIL.length - 1 ? <i aria-hidden>→</i> : null}
            </li>
          ))}
        </ol>
        <p className="xp-oil-note">Catalyst loop: riser ⇄ regenerator, continuously. A move in one section reaches the next 1–3 hours later.</p>
      </header>

      <div className="xp-body">
        <aside className="xp-toc" aria-label="Contents">
          <span className="xp-toc-h">Contents</span>
          <ol>
            {doc.sections.map((s) => (
              <li key={s.id}><a href={`#${s.id}`}><span className="xp-toc-n">{s.num}</span>{s.title}</a></li>
            ))}
          </ol>
          <Link href="/twin" className="btn primary xp-toc-go">Open the FCC →</Link>
          <p className="xp-toc-note">Gemini reads this same page: ask it about anything here.</p>
        </aside>

        <div className="xp-cards">
          {doc.sections.map((s) => (
            <section key={s.id} id={s.id} className="xp-card" aria-labelledby={`${s.id}-h`}>
              <header className="xp-card-h">
                {s.num ? <span className="xp-num">{s.num}</span> : null}
                <h2 id={`${s.id}-h`}>{s.title}</h2>
              </header>
              <div className="xp-md"><MD>{s.body}</MD></div>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
