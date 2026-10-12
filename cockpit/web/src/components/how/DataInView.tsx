/**
 * "How your data comes in" on /architecture — Google Cloud Cortex Framework, Manufacturing Connect & Data Engine,
 * "Overall Architecture Overview" (Cortex deck slide 26), kept to the slide's own layout and keywords (owner,
 * 11 Oct 2026): Factory shop floor (L4–L0) → VPN & Private service endpoints → Cortex Framework [ Manufacturing Data
 * Engine { Pipelines | Storage ; Services } · Manufacturing Connect | Reporting Accelerators · Vertex AI, App Layer ;
 * ERP · CRM · Public · Sustainability · Partners ]. The refinery reading is a quiet second line. Every part opens on
 * click (no hover: projector and touch screens) as a small card floating over the diagram, one at a time. Target
 * architecture only: no cloud region is named. Content: src/lib/architecture.ts. No value figures.
 */
import Link from "next/link";
import {
  APPS, ARCH_STATUS_WORD, DATA_RULES, FLOW_WORD, LEAVE_ROUTES, MC_CLOUD, MC_EDGE, PARTNER_SOURCES, PIPELINES, ROUTE_WORD, SERVICES_MDE,
  SHOP_FLOOR, SHOP_FLOOR_NOTE, STORAGE, VPN_LINK, type DataBox,
} from "@/lib/architecture";

/** A clickable part. `wide` = icon left of the name; default = icon above the name (slide tiles). */
function Part({ b, wide = false, align = "left" }: { b: DataBox; wide?: boolean; align?: "left" | "right" }) {
  return (
    <details className={`dx-part dx-${b.status}${b.flow ? ` dx-f-${b.flow}` : ""}${wide ? " dx-wide" : ""}`} name="dx-part">
      <summary>
        {b.logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={b.logo} alt="" />
        ) : null}
        <span className="dx-pname">
          <b>{b.name}</b>
          {b.sub ? <small>{b.sub}</small> : null}
        </span>
        <i aria-hidden className={`ar-dot ar-${b.status}`} />
        <span className="sr-only">{ARCH_STATUS_WORD[b.status]}{b.flow ? ` · ${FLOW_WORD[b.flow]}` : ""}</span>
      </summary>
      <dl className={`dx-pop dx-pop-${align}`}>
        <div><dt>What it does</dt><dd>{b.does}</dd></div>
        {b.flow ? <div><dt>Carries</dt><dd><span className={`dx-ftag dx-ftag-${b.flow}`}>{FLOW_WORD[b.flow]}</span></dd></div> : null}
        <div><dt>At your refinery</dt><dd>{b.refinery}</dd></div>
        <div>
          <dt>Today</dt>
          <dd><span className={`ar-chip ar-${b.status}`}><i aria-hidden className="ar-dot" />{ARCH_STATUS_WORD[b.status]}</span> {b.demo}</dd>
        </div>
      </dl>
    </details>
  );
}

function Panel({ title, className = "", children }: { title: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={`dx-panel ${className}`}>
      <span className="dx-panel-h">{title}</span>
      {children}
    </div>
  );
}

export default function DataInView() {
  const [batch, windowAgg, pubsubIn, context] = PIPELINES;
  const [gcs, bigtable, bigquery, pubsubOut] = STORAGE;
  return (
    <section className="dx" aria-label="How your data comes in: Cortex Framework, Manufacturing Connect and Data Engine">
      <p className="dx-intro">
        <b>Cortex Framework — Manufacturing Connect &amp; Data Engine,</b> the overall architecture, read for a refinery.
        Left to right: the shop floor, the private link out, then one data engine in Google Cloud.{" "}
        <em>Click any part for what it does, the refinery version and whether the demo shows it.</em>
      </p>

      <div className="dx-slide">
        {/* ------------------------------------------------------------ Factory shop floor */}
        <div className="dx-shop">
          <header className="dx-shop-h">
            <b>Factory shop floor</b>
            <small>your refinery</small>
          </header>
          <ul className="dx-key" aria-label="How each level connects">
            <li className="dx-k-edge">Real-time stream, through the edge</li>
            <li className="dx-k-batch">Batch, scheduled exports</li>
            <li className="dx-k-stays">Not connected directly</li>
          </ul>
          <ol className="dx-levels">
            {SHOP_FLOOR.map((l) => (
              <li key={l.label} className={`dx-lvl dx-r-${l.route}`} title={`${l.label.split(" ")[0]} — ${l.defn}`}>
                <div className="dx-chips">
                  {l.label.startsWith("L4") ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="dx-mqtt" src="/icons/cortex/mqtt.png" alt="" />
                  ) : null}
                  {l.chips.map((c, i) => <span key={`${c}-${i}`} className={`dx-chip${c === "alternative" ? " dx-alt" : ""}`}>{c}</span>)}
                  {l.label.startsWith("L3") ? <Part b={MC_EDGE} wide /> : null}
                </div>
                <span className="dx-lvl-label">{l.label}</span>
                <small className="dx-lvl-ref">{l.refinery}</small>
                <span className="sr-only">{ROUTE_WORD[l.route]}</span>
              </li>
            ))}
          </ol>
          <small className="dx-note">{SHOP_FLOOR_NOTE}</small>
        </div>

        {/* ------------------------------------------------------------ the only way out */}
        <div className="dx-vpn" aria-hidden>
          <span>{VPN_LINK}</span>
          <i className="dx-a-stream">→</i>
          <i className="dx-a-batch">→</i>
        </div>

        {/* ------------------------------------------------------------ Cortex Framework */}
        <div className="dx-cortex">
          <header className="dx-cortex-h">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/cortex/cortex-framework.png" alt="" />
            <b>Cortex Framework</b>
          </header>

          <div className="dx-cortex-body">
            <div className="dx-mde-col">
              <div className="dx-mde">
                <span className="dx-mde-h">Manufacturing Data Engine</span>
                <div className="dx-mde-top">
                  <Panel title="Data Engine Pipelines" className="dx-pipes">
                    <div className="dx-row2"><Part b={batch} /><Part b={windowAgg} /></div>
                    <i className="dx-down" aria-hidden>⇅</i>
                    <div className="dx-group"><Part b={pubsubIn} /><i className="dx-right" aria-hidden>→</i><Part b={context} /></div>
                  </Panel>
                  <span className="dx-flow2" aria-hidden><i className="dx-a-stream">→</i><i className="dx-a-batch">→</i></span>
                  <Panel title="Data Engine Storage" className="dx-store">
                    <div className="dx-row2"><Part b={gcs} /><Part b={bigtable} /></div>
                    <Part b={bigquery} wide />
                    <Part b={pubsubOut} wide />
                  </Panel>
                </div>
                <Panel title="Data Engine Services" className="dx-svcs">
                  <div className="dx-row4">{SERVICES_MDE.map((b) => <Part key={b.id} b={b} />)}</div>
                </Panel>
              </div>
              <div className="dx-mc">
                <i className="dx-cfg" aria-hidden>⇡ config flow</i>
                <Part b={MC_CLOUD} wide />
              </div>
            </div>

            <div className="dx-apps">
              <span className="dx-flow2 dx-flow2-l" aria-hidden><i className="dx-a-stream">→<small>live</small></i><i className="dx-a-batch">→<small>batch</small></i></span>
              <div className="dx-apps-col">
                {APPS.map((b) => <Part key={b.id} b={b} wide align="right" />)}
              </div>
            </div>
          </div>

          <div className="dx-cortex-foot">
            <ul className="dx-partners" aria-label="Enterprise and outside data">
              {PARTNER_SOURCES.map((p) => (
                <li key={p.name}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <span className="dx-logo"><img src={p.logo} alt="" /></span>
                  <small>{p.name}</small>
                </li>
              ))}
            </ul>
            <ul className="dx-legend" aria-label="Legend">
              <li><i className="dx-l-stream" aria-hidden />Real-time stream</li>
              <li><i className="dx-l-batch" aria-hidden />Batch</li>
              <li><i className="dx-l-cfg" aria-hidden />Config flow</li>
            </ul>
          </div>
        </div>
      </div>

      <ol className="dx-paths" aria-label="Real-time stream and batch, end to end">
        <li className="dx-path-stream">
          <b>Real-time stream</b>
          <span>historian &amp; DCS tags <i>→</i> Manufacturing Connect Edge <i>→</i> VPN <i>→</i> Cloud Pub/Sub <i>→</i> transformation &amp; 1-minute windows <i>→</i> <strong>BigTable + Cloud Pub/Sub (real-time output stream)</strong> <i>→</i> soft-sensor agent <i>→</i> operator screen</span>
          <em>every reading, seconds · advice every minute</em>
        </li>
        <li className="dx-path-batch">
          <b>Batch</b>
          <span>LIMS, assays, ERP, history back-fills <i>→</i> batch importer <i>→</i> transformation <i>→</i> <strong>Cloud Storage + BigQuery</strong> <i>→</i> model training, lab reconciliation, reports</span>
          <em>scheduled: minutes to daily</em>
        </li>
      </ol>

      <section className="dx-detail" aria-labelledby="dx-detail-h">
        <h3 id="dx-detail-h">Factory shop floor, in detail <small>what lives at each level, how often it changes, and how it leaves the plant</small></h3>
        <div className="dx-detail-grid">
          <ol className="dx-dlevels">
            {SHOP_FLOOR.map((l) => (
              <li key={l.label} className={`dx-dlvl dx-r-${l.route}`}>
                <span className="ar-n">{l.label.split(" ")[0]}</span>
                <span className="dx-dlvl-t">
                  <b>{l.label.replace(/^L\d\s/, "")}</b>
                  <small>{l.systems}</small>
                  <i className="dx-defn">{l.defn}</i>
                </span>
                <span className="dx-dlvl-m">
                  <em>{l.rate}</em>
                  <span className={`dx-route dx-route-${l.route}`}>{l.routeNote ?? ROUTE_WORD[l.route]}</span>
                </span>
              </li>
            ))}
          </ol>
          <i className="dx-detail-arrow" aria-hidden><span>read-only</span>→</i>
          <div className="dx-leave">
            <span className="ar-col-h">Leaves the plant</span>
            {LEAVE_ROUTES.map((b) => <Part key={b.id} b={b} wide align="right" />)}
            <small className="dx-note">{SHOP_FLOOR_NOTE}</small>
          </div>
        </div>
      </section>

      <div className="dx-foot">
        <ol className="dx-rules" aria-label="Four rules for plant data">
          {DATA_RULES.map((r) => <li key={r}>{r}</li>)}
        </ol>
        <p className="dx-next">
          <Link href="/architecture?view=platform#views" className="btn">Where it lands: the platform &amp; agents →</Link>
        </p>
      </div>
    </section>
  );
}
