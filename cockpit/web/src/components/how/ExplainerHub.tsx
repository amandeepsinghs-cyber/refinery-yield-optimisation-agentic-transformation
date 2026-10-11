"use client";

/**
 * /explainer hub (owner, 11 Oct 2026): one card per beginner guide, grouped Start here · Pages · Unit pages · Reference.
 * Each guide is its own page (/explainer/<slug>), written for a reader with no prior knowledge.
 */
import Link from "next/link";
import { useEffect, useState } from "react";

interface GuideItem { slug: string; title: string; blurb: string; group: string; page: string | null }

const GROUPS: { id: string; lede: string }[] = [
  { id: "Start here", lede: "Read these first: the process, the maths and the whole demo, from zero." },
  { id: "Pages", lede: "One guide per screen, in the order you see it." },
  { id: "Unit pages", lede: "The six sections of the FCC, each on its own page." },
  { id: "Technical", lede: "For technical questions: exact inputs, outputs, libraries, data and formulas." },
  { id: "Reference", lede: "Look up any word." },
];

export default function ExplainerHub() {
  const [items, setItems] = useState<GuideItem[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let on = true;
    fetch("/api/explainer-index")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: { guides: GuideItem[] }) => { if (on) setItems(d.guides); })
      .catch((e: unknown) => { if (on) setErr(e instanceof Error ? e.message : "unavailable"); });
    return () => { on = false; };
  }, []);

  return (
    <main id="main" className="pf xp">
      <header className="xp-hero">
        <p className="pf-kicker">Explainer</p>
        <h1>Understand every screen, from zero</h1>
        <div className="xp-lede">
          <p>
            One guide per page, written for someone with no chemical-engineering, statistics or machine-learning background.
            Start with <b>the FCC from zero</b> and <b>the models from zero</b>, then open the guide for any screen. The
            <b> Explainer</b> link in the header always opens the guide for the page you are on, and Gemini reads the same guides.
          </p>
        </div>
      </header>

      {!items ? (
        <p className="subtle">{err ? `The guides could not be loaded (${err}). Is the API running?` : "Loading the guides…"}</p>
      ) : (
        GROUPS.map((g) => {
          const list = items.filter((i) => i.group === g.id);
          if (!list.length) return null;
          return (
            <section key={g.id} className="xh-group" aria-labelledby={`xh-${g.id}`}>
              <header className="xh-group-h">
                <h2 id={`xh-${g.id}`}>{g.id}</h2>
                <p>{g.lede}</p>
              </header>
              <ul className="xh-grid">
                {list.map((i) => (
                  <li key={i.slug}>
                    <Link href={`/explainer/${i.slug}`} className="xh-card">
                      <b>{i.title.replace(/^How to read: /, "")}</b>
                      <span>{i.blurb}</span>
                      <em>{i.title.startsWith("How to read") ? "How to read this page →" : "Read →"}</em>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })
      )}
    </main>
  );
}
