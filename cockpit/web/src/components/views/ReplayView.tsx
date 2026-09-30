"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Data, Shape } from "plotly.js";
import Chart from "@/components/charts/Chart";
import { W90Chart } from "@/components/charts/EstimateCharts";
import { useConfig, useRuns } from "@/lib/api";
import { clock, minToX, num, pct, propLabel } from "@/lib/format";
import { axisStyle, baseLayout, specShape, timeAxis } from "@/lib/plotTheme";
import { useCockpit } from "@/lib/store";
import { MODEL_ORDER, STATUS, TOKENS, modelColor, modelLabel } from "@/lib/theme";
import type { EstimateMessage, GateStatus, TrustLevel } from "@/lib/types";
import { Card, EmptyState, GateBadge, NoRun, PageHeader, StaleBadge, TrustBadge } from "@/components/ui/primitives";
import { IconPause, IconPlay, IconRefresh } from "@/components/ui/icons";

const WINDOW = 720; // SDD-UI-07 sliding window
const SPEEDS = [1, 10, 30, 60] as const; // 30× for the Scene 2 crude-switch replay

interface Buf {
  t: number[];
  mean: (number | null)[];
  q05: (number | null)[];
  q95: (number | null)[];
  truth: (number | null)[];
  w90: (number | null)[];
  gate: GateStatus[];
  trust: TrustLevel[];
  members: Record<string, (number | null)[]>;
  labs: { t: number; v: number; status: string }[];
}

const emptyBuf = (): Buf => ({
  t: [],
  mean: [],
  q05: [],
  q95: [],
  truth: [],
  w90: [],
  gate: [],
  trust: [],
  members: {},
  labs: [],
});

interface LogItem {
  id: number;
  kind: string;
  t: number | null;
  text: string;
}

function trim(b: Buf): Buf {
  const n = b.t.length;
  if (n <= WINDOW) return b;
  const k = n - WINDOW;
  const members: Buf["members"] = {};
  for (const [id, arr] of Object.entries(b.members)) members[id] = arr.slice(k);
  const t0 = b.t[k];
  return {
    t: b.t.slice(k),
    mean: b.mean.slice(k),
    q05: b.q05.slice(k),
    q95: b.q95.slice(k),
    truth: b.truth.slice(k),
    w90: b.w90.slice(k),
    gate: b.gate.slice(k),
    trust: b.trust.slice(k),
    members,
    labs: b.labs.filter((l) => l.t >= t0),
  };
}

function LiveFan({ buf, spec }: { buf: Buf; spec: number | null }) {
  const theme = useCockpit((s) => s.theme);
  const { data, layout } = useMemo(() => {
    const t = TOKENS[theme];
    const x = buf.t.map(minToX);
    const data: Data[] = [
      { type: "scattergl", x, y: buf.q05, mode: "lines", line: { width: 0, color: t.accent }, hoverinfo: "skip", name: "P5" },
      {
        type: "scattergl",
        x,
        y: buf.q95,
        mode: "lines",
        line: { width: 0, color: t.accent },
        fill: "tonexty",
        fillcolor: t.band95,
        name: "P5–P95",
        hovertemplate: "P95 %{y:.1f}<extra></extra>",
      },
    ];
    for (const id of MODEL_ORDER) {
      const arr = buf.members[id];
      if (!arr) continue;
      data.push({
        type: "scattergl",
        x,
        y: arr,
        mode: "lines",
        line: { width: 1.2, color: modelColor(id, theme) },
        name: modelLabel(id),
        hovertemplate: `${modelLabel(id)} %{y:.1f}<extra></extra>`,
      });
    }
    data.push(
      {
        type: "scattergl",
        x,
        y: buf.mean,
        mode: "lines",
        line: { width: 3, color: t.text },
        name: "Mixture",
        hovertemplate: "Mixture %{y:.1f}<extra></extra>",
      },
      {
        type: "scattergl",
        x,
        y: buf.truth,
        mode: "lines",
        line: { width: 1.4, color: t.muted, dash: "dot" },
        name: "simulator truth",
        hovertemplate: "simulator truth %{y:.1f}<extra></extra>",
      },
    );
    if (buf.labs.length)
      data.push({
        type: "scattergl",
        x: buf.labs.map((l) => minToX(l.t)),
        y: buf.labs.map((l) => l.v),
        mode: "markers",
        marker: { size: 7, color: t.text },
        name: "lab",
        hovertemplate: "lab %{y:.1f}<extra></extra>",
      });
    const shapes: Partial<Shape>[] = spec !== null ? [specShape(spec, "y")] : [];
    const layout = baseLayout(theme, {
      margin: { l: 52, r: 14, t: 30, b: 32 },
      xaxis: { ...baseLayout(theme).xaxis, ...timeAxis },
      yaxis: { ...axisStyle(theme), title: { text: "°F", font: { size: 11, color: t.muted } } },
      shapes,
      uirevision: "live",
    });
    return { data, layout };
  }, [buf, spec, theme]);
  return <Chart data={data} layout={layout} height={380} ariaLabel="Live replay chart of mixture, members and simulator truth" />;
}

export default function ReplayView() {
  const runs = useRuns();
  const runId = useCockpit((s) => s.runId);
  const setRun = useCockpit((s) => s.setRun);
  const property = useCockpit((s) => s.property);
  const setTimeMin = useCockpit((s) => s.setTimeMin);
  const run = runs.data?.find((r) => r.run_id === runId);

  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(10);
  const [buf, setBuf] = useState<Buf>(emptyBuf);
  const [last, setLast] = useState<EstimateMessage | null>(null);
  const [log, setLog] = useState<LogItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [lastMsgAt, setLastMsgAt] = useState<number | null>(null);
  const [now, setNow] = useState<number>(0);

  const bufRef = useRef<Buf>(emptyBuf());
  const dirty = useRef(false);
  const lastRef = useRef<EstimateMessage | null>(null);
  const esRef = useRef<EventSource | null>(null);
  const logId = useRef(0);
  const resumeFrom = useRef<number | null>(null);

  const pushLog = useCallback((kind: string, t: number | null, text: string) => {
    setLog((l) => [{ id: ++logId.current, kind, t, text }, ...l].slice(0, 200));
  }, []);

  const stop = useCallback(() => {
    esRef.current?.close();
    esRef.current = null;
  }, []);

  const start = useCallback(
    (spd: number) => {
      stop();
      if (!runId) return;
      setError(null);
      const q = new URLSearchParams({ run_id: runId, property, speed: String(spd) });
      if (resumeFrom.current !== null) q.set("from", String(resumeFrom.current + 1));
      const es = new EventSource(`/api/stream?${q.toString()}`);
      esRef.current = es;
      const touch = () => setLastMsgAt(Date.now());
      es.addEventListener("estimate", (ev) => {
        touch();
        try {
          const m = JSON.parse((ev as MessageEvent).data) as EstimateMessage;
          if (!m.trust?.level || !m.gate?.status) return; // SDD-API-01
          if (m.property && m.property !== property) return;
          const b = bufRef.current;
          const tm = m.provenance.time_min;
          b.t.push(tm);
          b.mean.push(m.mixture.mean);
          b.q05.push(m.mixture.q05);
          b.q95.push(m.mixture.q95);
          b.truth.push(m.truth ?? null);
          b.w90.push(m.mixture.w90);
          b.gate.push(m.gate.status);
          b.trust.push(m.trust.level);
          for (const [id, mem] of Object.entries(m.members ?? {})) {
            if (!b.members[id]) b.members[id] = new Array(b.t.length - 1).fill(null);
            b.members[id].push(mem.mu);
          }
          for (const arr of Object.values(b.members)) if (arr.length < b.t.length) arr.push(null);
          bufRef.current = trim(b);
          lastRef.current = m;
          resumeFrom.current = tm;
          dirty.current = true;
        } catch {
          /* ignore malformed */
        }
      });
      es.addEventListener("gate", (ev) => {
        touch();
        try {
          const g = JSON.parse((ev as MessageEvent).data) as { status?: string; message?: string; time_min?: number; property?: string };
          pushLog("gate", g.time_min ?? resumeFrom.current, `${g.property ? `${propLabel(g.property)} · ` : ""}Gate ${g.status ?? ""}${g.message ? ` — ${g.message}` : ""}`);
        } catch {
          /* ignore */
        }
      });
      es.addEventListener("recommendation", (ev) => {
        touch();
        try {
          const r = JSON.parse((ev as MessageEvent).data) as { action?: string; delta_F?: number; status?: string; time_min?: number; property?: string };
          pushLog("rec", r.time_min ?? null, `${r.property ? `${propLabel(r.property)} · ` : ""}${r.status ?? ""} ${r.action ?? ""} ${r.delta_F !== undefined ? `${num(r.delta_F)} °F` : ""}`);
        } catch {
          /* ignore */
        }
      });
      es.addEventListener("lab", (ev) => {
        touch();
        try {
          const l = JSON.parse((ev as MessageEvent).data) as { time_min: number; value: number; status: string; property?: string };
          if (!l.property || l.property === property) bufRef.current.labs.push({ t: l.time_min, v: l.value, status: l.status });
          dirty.current = true;
          pushLog("lab", l.time_min, `Lab ${l.property ? propLabel(l.property) : ""} ${num(l.value)} °F (${l.status})`);
        } catch {
          /* ignore */
        }
      });
      es.addEventListener("heartbeat", touch);
      es.addEventListener("end", () => {
        pushLog("end", resumeFrom.current, "Replay reached the end of the run");
        stop();
        setPlaying(false);
      });
      es.onerror = () => {
        if (es.readyState === EventSource.CLOSED) {
          setError("Stream closed. The cockpit API may be down, or the run finished.");
          setPlaying(false);
          stop();
        }
      };
    },
    [property, pushLog, runId, stop],
  );

  // Flush buffered SSE data to React at ~5 Hz.
  useEffect(() => {
    const id = setInterval(() => {
      setNow(Date.now());
      if (!dirty.current) return;
      dirty.current = false;
      setBuf({ ...bufRef.current, members: { ...bufRef.current.members }, labs: [...bufRef.current.labs] });
      if (lastRef.current) {
        setLast(lastRef.current);
        setTimeMin(lastRef.current.provenance.time_min);
      }
    }, 200);
    return () => clearInterval(id);
  }, [setTimeMin]);

  useEffect(() => () => stop(), [stop]);

  // Reset when run/property changes.
  const [prevKey, setPrevKey] = useState(`${runId}|${property}`);
  if (prevKey !== `${runId}|${property}`) {
    setPrevKey(`${runId}|${property}`);
    setPlaying(false);
    setBuf(emptyBuf());
    setLast(null);
    setLog([]);
  }
  useEffect(() => {
    stop();
    bufRef.current = emptyBuf();
    lastRef.current = null;
    resumeFrom.current = null;
  }, [runId, property, stop]);

  const toggle = () => {
    if (playing) {
      stop();
      setPlaying(false);
    } else {
      start(speed);
      setPlaying(true);
    }
  };
  const restart = () => {
    stop();
    bufRef.current = emptyBuf();
    lastRef.current = null;
    resumeFrom.current = null;
    setBuf(emptyBuf());
    setLast(null);
    setLog([]);
    start(speed);
    setPlaying(true);
  };
  const changeSpeed = (s: (typeof SPEEDS)[number]) => {
    setSpeed(s);
    if (playing) start(s);
  };

  const stale = playing && lastMsgAt !== null && now - lastMsgAt > 120_000;
  const cfg = useConfig();
  const spec = cfg.data?.spec?.[property] ?? null;
  const w90Limit = cfg.data?.w90_limit ?? 14; // contract §0 default

  return (
    <div className="page">
      <PageHeader
        title="Replay"
        question="What happened, and how did the system respond?"
        actions={<StaleBadge show={stale} />}
      />
      {!runId && !runs.isLoading ? (
        <Card>
          <NoRun />
        </Card>
      ) : (
        <>
          <Card>
            <div className="replay-controls">
              <label className="sr-only" htmlFor="replay-run">
                Run
              </label>
              <select
                id="replay-run"
                className="select"
                value={runId ?? ""}
                onChange={(e) => {
                  const r = runs.data?.find((x) => x.run_id === e.target.value);
                  if (r) setRun(r.run_id, 0);
                }}
              >
                {(runs.data ?? []).map((r) => (
                  <option key={r.run_id} value={r.run_id}>
                    {r.batch} · {r.run_id} · {r.scenario}
                  </option>
                ))}
              </select>
              <button type="button" className="btn primary" onClick={toggle} aria-pressed={playing} id="replay-play">
                {playing ? <IconPause /> : <IconPlay />} {playing ? "Pause" : buf.t.length ? "Resume" : "Play"}
              </button>
              <button type="button" className="btn" onClick={restart}>
                <IconRefresh /> Restart
              </button>
              <div className="seg" role="group" aria-label="Replay speed">
                {SPEEDS.map((s) => (
                  <button key={s} type="button" aria-pressed={speed === s} onClick={() => changeSpeed(s)}>
                    {s}×
                  </button>
                ))}
              </div>
              <span className="chip mono">
                {last ? `t ${last.provenance.time_min} (${clock(last.provenance.time_min)})` : "t —"}
                {run ? ` / ${run.n_minutes}` : ""}
              </span>
              {playing ? <span className="badge accent">● streaming {speed}×</span> : null}
            </div>
            {error ? (
              <div className="banner error" role="alert" style={{ marginTop: 10 }}>
                {error}
              </div>
            ) : null}
          </Card>
          <div className="grid">
            <Card className="s-9 s-md-12" title={`${propLabel(property)} — live`} sub={`sliding window ≤ ${WINDOW} min`}>
              {buf.t.length ? (
                <LiveFan buf={buf} spec={spec} />
              ) : (
                <EmptyState title="Press Play to stream the simulated run" detail="Estimates arrive over SSE from /api/stream and update the charts incrementally." />
              )}
            </Card>
            <Card className="s-3 s-md-12" title="Current estimate">
              {last ? (
                <div className="stack">
                  <div className="row">
                    <TrustBadge level={last.trust.level} />
                    <GateBadge status={last.gate.status} />
                  </div>
                  <dl className="kv">
                    <dt>Mixture mean</dt>
                    <dd>{num(last.mixture.mean)} °F</dd>
                    <dt>P5–P95</dt>
                    <dd>
                      {num(last.mixture.q05)}–{num(last.mixture.q95)}
                    </dd>
                    <dt>W90</dt>
                    <dd>{num(last.mixture.w90)} °F</dd>
                    <dt>P(on-spec)</dt>
                    <dd>{pct(last.mixture.p_on_spec, 1)}</dd>
                    <dt>Simulator truth</dt>
                    <dd>{num(last.truth)} °F</dd>
                    <dt>Source</dt>
                    <dd>{last.source}</dd>
                  </dl>
                  {last.gate.status === "WITHHELD" && last.gate.message ? (
                    <p style={{ margin: 0, fontSize: 12.5, color: STATUS.AMBER }}>{last.gate.message}</p>
                  ) : null}
                </div>
              ) : (
                <EmptyState title="No estimate yet" />
              )}
            </Card>
            <Card className="s-9 s-md-12" title="W90 vs limit">
              {buf.t.length ? (
                <W90Chart time={buf.t} w90={buf.w90} gate={buf.gate} limit={w90Limit} height={180} ariaLabel="Live W90 versus limit" />
              ) : (
                <EmptyState title="Waiting for stream" />
              )}
            </Card>
            <Card className="s-3 s-md-12" title="Event log" sub="gate · recommendations · labs">
              {log.length ? (
                <div className="event-log" aria-live="polite">
                  {log.map((l) => (
                    <div className="ev" key={l.id}>
                      <span className="t">{l.t !== null ? `t ${l.t}` : ""}</span>
                      <span>{l.text}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState title="No events yet" />
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
