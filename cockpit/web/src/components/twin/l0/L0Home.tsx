"use client";

/**
 * Refinery home (owner brief, 2 Oct 2026):
 *   a top view of the refinery → what went wrong → click a unit → its flow:
 *   data in/out → what we observe → the decision and the lever → how the move is found (optimiser + checks)
 *   → which IOCL use case it serves. Simple, full-bleed, no left bar.
 *
 * Data: GET /api/twin, /api/decisions, /api/decisions-coverage.
 */

import { useCallback, useEffect, useState } from "react";
import { useCockpit } from "@/lib/store";
import { useRuns, useHealth } from "@/lib/api";
import { getTwinOverview } from "@/lib/twinApi";
import { getCoverage, getDecisions, type CoverageRow, type Decision, type DecisionQueueResp } from "@/lib/decisionsApi";
import type { TwinOverview } from "@/lib/twinTypes";
import { useScreenPart } from "@/lib/screenPart";
import LangToggle from "@/components/twin/LangToggle";
import { SCOPE_NOTE } from "@/lib/units";
import PlantCanvas from "./PlantCanvas";
import ShiftTimeline from "./ShiftTimeline";
import UnitFlow from "./UnitFlow";
import { UseCaseBand } from "./HomeStory";
import { UnitUseCases } from "@/components/how/UseCaseExplainer";

const SHORT: Record<string, string> = {
  unit_1_furnace: "Furnace", unit_2_riser: "Riser", unit_3_regenerator: "Regenerator",
  unit_4_fractionator: "Fractionator", unit_5_condenser: "Gas plant", unit_6_stabiliser: "Stabiliser",
};
const RANK: Record<string, number> = { open: 0, held: 1, watch: 2, withheld: 3 };
const clock = (m: number) => { const h = Math.floor(((m % 1440) + 1440) % 1440 / 60); return `${String(h).padStart(2, "0")}:${String(Math.floor(m % 60)).padStart(2, "0")}`; };

/** One quiet line: what went wrong this shift. Each item jumps to its unit's flow. */
function WrongRibbon({ data, onUnit }: { data: TwinOverview; onUnit: (id: string) => void }) {
  const c = data.crude_slate;
  const t = data.plant.time_min;
  const ok = data.units.filter((u) => (u.kpi_vs_plan?.state ?? "OK") === "OK").length;
  const recent = c?.last_switch_min != null && t - c.last_switch_min >= 0 && t - c.last_switch_min <= 720;
  const items = data.needs_attention.slice(0, 2);
  return (
    <div className="wr" data-testid="what-went-wrong">
      <span className="wr-h">What went wrong</span>
      <span className="wr-lead"><b className="num">{ok}</b>/<span className="num">{data.units.length}</span> units on plan</span>
      {recent ? (
        <span className="wr-item ev-crude"><span className="num">{clock(c.last_switch_min as number)}</span> Crude switched to <b>{c.regime_id} {c.regime_label}</b></span>
      ) : null}
      {items.map((n) => (
        <button key={n.event_id} type="button" className={`wr-item ev-${n.severity}`} onClick={() => onUnit(n.unit_id)}>
          <span className="num">{n.time_label}</span> <b>{SHORT[n.unit_id] ?? n.unit_label}</b> · {n.line.replace(/ since \d{2}:\d{2}$/, "").replace(/ \(sustained shift\)| \(outside ±3σ\)/, "")}
        </button>
      ))}
      {!items.length && !recent ? <span className="wr-item subtle">Nothing unusual this shift.</span> : null}
    </div>
  );
}

export default function L0Home() {
  const runId = useCockpit((s) => s.runId);
  const timeMin = useCockpit((s) => s.timeMin);
  const runs = useRuns();
  const maxMin = runs.data?.find((r) => r.run_id === runId)?.n_minutes ?? null;

  const [data, setData] = useState<TwinOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [queue, setQueue] = useState<DecisionQueueResp | null>(null);
  const [coverage, setCoverage] = useState<CoverageRow[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [unitSel, setUnitSel] = useState<string | null>(null);
  const [rev, setRev] = useState(0);
  const refresh = useCallback(() => setRev((r) => r + 1), []);

  useEffect(() => {
    let on = true;
    getTwinOverview(runId, timeMin)
      .then((d) => { if (on) { setData(d); setError(null); } })
      .catch((e: unknown) => { if (on) setError(e instanceof Error ? e.message : "Twin API unavailable"); });
    return () => { on = false; };
  }, [runId, timeMin]);

  useEffect(() => {
    let on = true;
    getDecisions(runId, timeMin).then((q) => { if (on) setQueue(q); }).catch(() => { if (on) setQueue(null); });
    getCoverage(runId, timeMin).then((c) => { if (on) setCoverage(c.rows); }).catch(() => { if (on) setCoverage([]); });
    return () => { on = false; };
  }, [runId, timeMin, rev]);

  const ds = queue?.decisions ?? [];
  // Which unit's flow is shown: the user's click, else the unit of the most urgent decision, else the first unit off plan.
  const firstOff = data?.units.find((u) => (u.kpi_vs_plan?.state ?? "OK") !== "OK")?.unit_id;
  const unitId = unitSel ?? ds.find((d) => d.id === selected)?.unit_id ?? ds[0]?.unit_id ?? firstOff ?? data?.units[0]?.unit_id ?? null;
  const unit = data?.units.find((u) => u.unit_id === unitId) ?? null;
  const onUnit: Decision[] = ds.filter((d) => d.unit_id === unitId).sort((a, b) => (RANK[a.status] ?? 9) - (RANK[b.status] ?? 9));
  const dec = onUnit.find((d) => d.id === selected) ?? onUnit[0] ?? null;

  const pickUnit = useCallback((id: string) => { setUnitSel(id); setSelected(null); }, []);
  const pickDecision = useCallback((id: string) => {
    const d = queue?.decisions.find((x) => x.id === id);
    if (d) setUnitSel(d.unit_id);
    setSelected(id);
  }, [queue]);

  useScreenPart("home", queue ? { clock: queue.clock, decisions_open: queue.counts.open, not_yet: queue.counts.withheld, watching: queue.counts.watch,
    unit_in_focus: unitId,
    selected: dec ? { id: dec.id, headline: dec.headline, status: dec.status, enabled_by: dec.enabled_by?.map((s) => `${s.kind}: ${s.name} — ${s.did}`),
      iocl_use_case: dec.use_case.iocl_title, problem: dec.problem_text } : null } : null);

  if (!data) {
    return <div className="home" data-testid="l0-root"><div className="home-loading">{error ? `Twin engine unavailable — ${error}` : "Loading the FCC complex…"}</div></div>;
  }
  const t = data.plant?.time_min ?? timeMin ?? 0;
  const nOpen = queue?.counts.open ?? 0;

  return (
    <div className="home" data-testid="l0-root">
      <header className="home-head">
        <div className="home-title">
          <span className="home-plant">FCC complex</span>
          <span className="home-clock num">{data.plant.shift_label} · {data.plant.clock}</span>
        </div>
        <p className="home-sentence" data-testid="l0-headline">
          {nOpen ? <><b className="num">{nOpen}</b> decision{nOpen === 1 ? "" : "s"} to take</> : "No decision to take"}
          {queue?.counts.withheld ? <span className="subtle"> · {queue.counts.withheld} waiting for data</span> : null}
          {queue?.counts.watch ? <span className="subtle"> · {queue.counts.watch} watching</span> : null}
        </p>
        <LangToggle />
      </header>
      <p className="home-scope" data-testid="scope-note">{SCOPE_NOTE}</p>

      <WrongRibbon data={data} onUnit={pickUnit} />

      <PlantCanvas units={data.units} decisions={ds} selectedId={dec?.id ?? null} onSelect={pickDecision}
        selectedUnit={unitId} onSelectUnit={pickUnit} />

      {unit ? (
        <UnitFlow unit={unit} attention={data.needs_attention} decision={dec} decisions={onUnit} onPick={pickDecision}
          runId={runId} timeMin={t} onActed={refresh} />
      ) : null}

      <UnitUseCases unitId="refinery" />
      {coverage.length ? <UseCaseBand rows={coverage} selected={dec} /> : null}

      <section className="dpath" aria-label="Data path">
        <h2 className="hs-h">Data path</h2>
        <ol>
          <li><b>Simulation</b><span>FCC simulator, every tag each minute</span></li>
          <li><b>BigQuery</b><span>raw tags and lab results land here (fcc_bronze)</span></li>
          <li><b>Lakehouse</b><span>cleaned, lab-aligned tables (fcc_silver); the cockpit reads every run from here</span></li>
          <li><b>Models</b><span>crude classifier · soft sensor · response models</span></li>
          <li><b>Decision</b><span>the move, its checks and Accept / Hold / Decline</span></li>
        </ol>
        <DataStore />
      </section>

      <footer className="home-foot">
        <ShiftTimeline timeline={data.timeline} timeMin={t} maxMin={maxMin} />
        <p className="home-prov subtle">Simulated data · {data.provenance?.batch_id} · {data.provenance?.run_id} · advisory only — nothing here writes to a control system</p>
      </footer>
    </div>
  );
}

/** Where the rows on screen are actually read from (GET /api/health → data.store). */
function DataStore() {
  const st = useHealth().data?.data?.store;
  if (!st) return null;
  const ok = st.source === "bigquery" && !st.error;
  return (
    <p className={`dpath-src subtle${ok ? "" : " warn"}`}>
      Read from: <b>{st.label}</b>
      {st.table ? <> · <code>{st.table}</code></> : null}
      {st.lake_runs != null ? ` · ${st.lake_runs} of ${st.active_runs ?? st.lake_runs} runs` : ""}
      {st.error ? ` · ${st.error}` : ""}
    </p>
  );
}
