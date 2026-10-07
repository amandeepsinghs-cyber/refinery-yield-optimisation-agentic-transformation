/**
 * Target architecture page (owner, 6 Oct 2026; verbatim.md Part 11; use_cases/ARCHITECTURE_AND_PHILOSOPHY.md).
 * The pitch for a discovery call: one refinery lakehouse → specialist agents, one per use case → Gemini orchestrates →
 * one operator screen where a person decides. Identity & access runs alongside every layer (agents first, then people
 * by role) as part of the design. Layers and agents carry Shown today / Preview / Next so the target never reads as the
 * build. Official Google Cloud product icons are served from /public/icons/gcp. No value figures.
 */
import Link from "next/link";
import { Fragment } from "react";
import {
  ACCESS, AGENTS, ARCH_STATUS_ORDER, ARCH_STATUS_WORD, GLOSSARY, INGEST, LAYERS, LINKS, OPEN_PARTS, ROLES, SERVICES, ZONES,
  type ArchStatus, type Layer, type ServiceId,
} from "@/lib/architecture";

function Chip({ status, label, note }: { status: ArchStatus; label?: string; note?: string }) {
  return (
    <span className={`ar-chip ar-${status}`}>
      <i aria-hidden className="ar-dot" />
      {label ?? ARCH_STATUS_WORD[status]}
      {note ? <em> · {note}</em> : null}
    </span>
  );
}

function Service({ id, compact = false, size = 28 }: { id: ServiceId; compact?: boolean; size?: number }) {
  const s = SERVICES[id];
  const word = s.status ? ARCH_STATUS_WORD[s.status] : null;
  return (
    <div className={`ar-svc${s.status ? ` ar-svc-${s.status}` : ""}`} title={`${s.name} — ${s.role}${word ? ` (${word})` : ""}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={s.logo} alt="" width={size} height={size} style={{ width: size, height: size }} />
      <span>
        <b>{s.name}</b>
        {compact ? null : <small>{s.role}</small>}
      </span>
      {s.status ? <><i aria-hidden className={`ar-dot ar-${s.status}`} /><span className="sr-only">{word}</span></> : null}
    </div>
  );
}

function LayerBody({ layer }: { layer: Layer }) {
  if (layer.n === 4) {
    return (
      <ul className="ar-tiles">
        <li>Refinery &amp; FCC view</li>
        <li>One page per unit</li>
        <li><b>Accept · Hold · Decline</b></li>
        <li>Decision record</li>
      </ul>
    );
  }
  if (layer.n === 3) {
    return (
      <div className="ar-gem">
        <Service id="gemini" size={44} />
        <ul className="ar-tiles">
          <li>English · Hinglish · Hindi</li>
          <li>Text or voice</li>
          <li>Calls the right agents</li>
          <li>Cites the SOP</li>
          <li>Read-only</li>
        </ul>
      </div>
    );
  }
  if (layer.n === 2) {
    return (
      <>
        <ul className="ar-agents">
          {AGENTS.map((a) => (
            <li key={a.name} className={`ar-agent ar-agent-${a.status}`}>
              <b>{a.name}</b>
              <small>{a.useCases}</small>
              <Chip status={a.status} note={a.status === "today" ? a.note : undefined} />
            </li>
          ))}
        </ul>
        <div className="ar-svcs"><Service id="vertex" /><Service id="run" /></div>
      </>
    );
  }
  return (
    <>
      <div className="ar-l1">
        <div className="ar-lanes" role="table" aria-label="How each kind of data gets into the lakehouse">
          <div className="ar-lane ar-lane-h" role="row">
            <span role="columnheader">Source · what the data is</span>
            <span role="columnheader">How it gets in</span>
            <span role="columnheader">Lands in</span>
          </div>
          {INGEST.map((l) => (
            <div key={l.source} className="ar-lane" role="row">
              <div className="ar-lsrc" role="cell"><b>{l.source}</b><small>{l.kind}</small></div>
              <div className="ar-lroute" role="cell">
                <small>{l.route}</small>
                {l.services.length ? (
                  <div className="ar-lsvcs">{l.services.map((id) => <Service key={id} id={id} compact size={22} />)}</div>
                ) : null}
              </div>
              <span className="ar-lland" role="cell"><i aria-hidden>→</i>{l.lands}</span>
            </div>
          ))}
        </div>
        <div className="ar-col ar-lake">
          <span className="ar-col-h">Lakehouse</span>
          <ol className="ar-medal">
            {ZONES.map((z) => (
              <li key={z.name}><b>{z.name}</b><small>{z.what}</small><em>{z.format}</em></li>
            ))}
          </ol>
          <div className="ar-pair">
            <Service id="storage" compact />
            <Service id="bigquery" compact />
          </div>
          <div className="ar-live">
            <span className="ar-col-h">Live store, beside the lakehouse</span>
            <Service id="bigtable" compact />
            <small>Last 7–30 days of seconds and minutes. Agents read it every minute; BigQuery keeps the history for training.</small>
          </div>
        </div>
      </div>
      <div className="ar-gov"><Service id="dataplex" /><span>Checks silver against its rules after every load, and catalogues every table with its lineage.</span></div>
    </>
  );
}

function Glossary() {
  return (
    <section className="ar-gloss" aria-labelledby="ar-gloss-h">
      <h2 id="ar-gloss-h">What each service does <small>logo · name · purpose</small></h2>
      <ul>
        {GLOSSARY.map((id) => {
          const s = SERVICES[id];
          return (
            <Fragment key={id}>
              <li>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={s.logo} alt="" width={22} height={22} />
                <b>{s.name}</b>
                <span>{s.role}</span>
                {s.status ? <Chip status={s.status} /> : null}
              </li>
              {id === "bigquery" ? OPEN_PARTS.map((p) => (
                <li key={p.name}>
                  <i className="ar-mark" aria-hidden>{p.mark.slice(0, 2)}</i>
                  <b>{p.name}</b>
                  <span>{p.role}</span>
                  <Chip status="today" />
                </li>
              )) : null}
            </Fragment>
          );
        })}
      </ul>
    </section>
  );
}

function AccessColumn() {
  return (
    <aside className="ar-rail" aria-labelledby="ar-access-h">
      <h2 id="ar-access-h" className="ar-rail-h">Identity &amp; access <small>on every layer</small></h2>
      {ACCESS.map((a) => {
        const s = SERVICES[a.service];
        return (
          <section key={a.title} className="ar-acc">
            <header>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={s.logo} alt="" width={24} height={24} />
              <b>{a.title}</b>
            </header>
            <ul>{a.lines.map((l) => <li key={l}>{l}</li>)}</ul>
            <small>{s.name}</small>
          </section>
        );
      })}
      <section className="ar-acc ar-roles">
        <header><b>Role-based access for people</b></header>
        <dl>
          {ROLES.map(([r, d]) => (
            <div key={r}><dt>{r}</dt><dd>{d}</dd></div>
          ))}
        </dl>
      </section>
    </aside>
  );
}

export default function ArchitectureView() {
  return (
    <main id="main" className="pf ar">
      <header className="pf-head">
        <p className="pf-kicker">Target architecture</p>
        <h1>One refinery, one data foundation, many specialist agents</h1>
        <p className="pf-lede">
          IOCL&apos;s data goes into one lakehouse. On top of it runs one specialist agent per use case, and Gemini
          orchestrates them behind a single operator screen. Every agent is advisory: a person accepts, holds or declines,
          and nothing is written to the control system. Once your data is set up, each agent is built the same way.
        </p>
        <ul className="ar-legend" aria-label="How to read this page">
          {ARCH_STATUS_ORDER.map((s) => (
            <li key={s}>
              <Chip status={s} />
              <span>{s === "today" ? "runs in the demo, on simulated data" : s === "preview" ? "visible in the demo, outcome scripted and labelled" : "built once the data foundation is in place"}</span>
            </li>
          ))}
        </ul>
      </header>

      <section className="ar-diagram" aria-label="Target architecture, four layers">
        <div className="ar-stack">
          {LAYERS.map((l) => (
            <div key={l.n} className="ar-block">
              <article className={`ar-layer ar-layer-${l.n}`} aria-labelledby={`ar-l${l.n}`}>
                <header className="ar-lhead">
                  <span className="ar-n">L{l.n}</span>
                  <h2 id={`ar-l${l.n}`}>{l.name}</h2>
                  <Chip status={l.status} label={l.badge} />
                </header>
                <p className="ar-job">{l.job}</p>
                <LayerBody layer={l} />
                <small className="ar-now">{l.today}</small>
              </article>
              {LINKS[l.n] ? <div className="ar-link"><i aria-hidden>↓</i>{LINKS[l.n]}</div> : null}
            </div>
          ))}
          <p className="ar-meity" aria-label="MeitY data boundary">
            <b>MeitY-compliant boundary</b>
            <span>Your data stays in India, under keys you hold. Control and safety systems stay on site, and nothing is written to them.</span>
          </p>
        </div>

        <AccessColumn />
      </section>

      <Glossary />

      <details className="ar-detail">
        <summary>Agent ↔ use case detail <small>which IOCL use cases each agent answers, and the decision it brings</small></summary>
        <table className="ar-table">
          <thead><tr><th>Agent</th><th>IOCL use cases</th><th>Decision it brings to the operator</th><th>Status</th></tr></thead>
          <tbody>
            {AGENTS.map((a) => (
              <tr key={a.name} className={a.status === "today" ? "on" : undefined}>
                <td><b>{a.name}</b></td>
                <td>{a.useCases}</td>
                <td>{a.decisions}</td>
                <td><Chip status={a.status} note={a.note} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="pf-note">
          The <b>soft-sensor agent</b> is interactive in the demo: four models estimate product quality every minute and
          say “Not yet” when they disagree. When the feed changes after a crude switch, the soft sensor resets its lab bias and checks it has lab results for this feed, and the recipe and preheat target follow the new feed estimate.
        </p>
      </details>

      <p className="pf-cta"><Link href="/twin" className="btn primary">See it on the FCC →</Link></p>
    </main>
  );
}
