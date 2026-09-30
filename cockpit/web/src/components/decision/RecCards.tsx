"use client";

import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { postDecision } from "@/lib/api";
import { num, pct, propLabel, signed } from "@/lib/format";
import { useCockpit } from "@/lib/store";
import { toast } from "@/lib/toast";
import type { Recommendation, RecStatus } from "@/lib/types";
import { Citations, TrustBadge } from "@/components/ui/primitives";
import { IconAlert, IconCheck } from "@/components/ui/icons";
import {
  REC_STATUS_BADGE,
  REC_STATUS_LABEL,
  REC_STATUS_META,
  recStatusBadge,
} from "@/lib/recommendations";

export { REC_STATUS_BADGE, REC_STATUS_LABEL, REC_STATUS_META, recStatusBadge };

const ACTION_VERB: Record<string, string> = { RAISE: "Raise", LOWER: "Lower", HOLD: "Hold" };
export const DEMO_USER = "cockpit-operator";

/** Optimistic Accept/Decline: the POST is recorded only; nothing is written to a control system. */
export function useDecision() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ rec, decision }: { rec: Recommendation; decision: "accepted" | "declined" }) =>
      postDecision(rec.rec_id, decision, DEMO_USER),
    onMutate: async ({ rec, decision }) => {
      const status = decision === "accepted" ? "ACCEPTED" : "DECLINED";
      await qc.cancelQueries({ queryKey: ["recs"] });
      await qc.cancelQueries({ queryKey: ["overview"] });
      const prevRecs = qc.getQueriesData<Recommendation[]>({ queryKey: ["recs"] });
      const prevOverview = qc.getQueriesData({ queryKey: ["overview"] });
      qc.setQueriesData<Recommendation[]>({ queryKey: ["recs"] }, (old) =>
        old?.map((r) => (r.rec_id === rec.rec_id ? { ...r, status } : r)),
      );
      qc.setQueriesData<{ decisions_needed: Recommendation[] } & Record<string, unknown>>(
        { queryKey: ["overview"] },
        (old) =>
          old ? { ...old, decisions_needed: old.decisions_needed.filter((r) => r.rec_id !== rec.rec_id) } : old,
      );
      return { prevRecs, prevOverview };
    },
    onError: (_e, _v, ctx) => {
      ctx?.prevRecs.forEach(([k, v]) => qc.setQueryData(k, v));
      ctx?.prevOverview.forEach(([k, v]) => qc.setQueryData(k, v));
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["recs"] });
      void qc.invalidateQueries({ queryKey: ["overview"] });
      void qc.invalidateQueries({ queryKey: ["audit"] });
    },
  });
}

export function recTitle(r: Recommendation) {
  const verb = ACTION_VERB[r.action] ?? r.action;
  if (r.action === "HOLD") return `Hold ${propLabel(r.property)} set point`;
  return `${verb} ${propLabel(r.property)} set point`;
}

function DecisionButtons({ rec }: { rec: Recommendation }) {
  const m = useDecision();
  const [done, setDone] = useState<null | "accepted" | "declined">(null);
  const [err, setErr] = useState<string | null>(null);

  if (rec.status === "HOLD") {
    return (
      <div className="rec-note muted" role="status">
        HOLD — no safe move to accept.
      </div>
    );
  }

  if (rec.status !== "OPEN" || done) {
    const s = done ?? rec.status.toLowerCase();
    return (
      <div className="rec-note row" role="status">
        <IconCheck width={14} height={14} />
        <span>
          {s === "accepted" ? "Accepted" : s === "declined" ? "Declined" : s} — recorded only, no control-system write.
        </span>
      </div>
    );
  }
  const act = (decision: "accepted" | "declined") => {
    setErr(null);
    setDone(decision);
    m.mutate(
      { rec, decision },
      {
        onSuccess: () => {
          if (decision === "accepted") toast("Recorded. The cockpit never writes to the DCS.");
          else toast("Declined. Recorded in the audit log only.", "info");
        },
        onError: (e) => {
          setDone(null);
          setErr((e as Error).message);
        },
      },
    );
  };
  return (
    <>
      <div className="rec-actions">
        {rec.action === "HOLD" ? null : (
          <button type="button" className="btn primary" onClick={() => act("accepted")} disabled={m.isPending}>
            Accept
          </button>
        )}
        <button type="button" className="btn" onClick={() => act("declined")} disabled={m.isPending}>
          Decline
        </button>
      </div>
      {err ? (
        <div className="rec-note" role="alert" style={{ color: "var(--red)" }}>
          Could not record: {err}
        </div>
      ) : (
        <div className="rec-note">Recorded only — no control-system write.</div>
      )}
    </>
  );
}

/** Countdown in simulated minutes (validity 30 min, SDD-REC-05). */
export function Countdown({ rec }: { rec: Recommendation }) {
  const t = useCockpit((s) => s.timeMin);
  if (t === null) return null;
  const left = rec.time_min + 30 - t;
  if (left > 30) return <span className="countdown">issued at t {rec.time_min} (ahead of cursor)</span>;
  return (
    <span className="countdown num">
      {left > 0 ? `valid ${left} more sim-min` : "validity window passed at cursor"}
    </span>
  );
}

export function RecCard({ rec, compact = false }: { rec: Recommendation; compact?: boolean }) {
  return (
    <article className="rec" aria-label={recTitle(rec)}>
      <div className="rec-head">
        <div>
          <div className="rec-title">{recTitle(rec)}</div>
          <div className="num" style={{ fontSize: compact ? 13 : 15 }}>
            {signed(rec.delta_F)} °F <span className="muted">({num(rec.sp_before)} → {num(rec.sp_after)})</span>
          </div>
        </div>
        <div className="stack" style={{ alignItems: "flex-end", gap: 4 }}>
          <TrustBadge level={rec.trust} short={compact} />
          {rec.status === "HOLD" ? (
            <span className={`badge ${REC_STATUS_BADGE.HOLD}`}>{REC_STATUS_LABEL.HOLD}</span>
          ) : rec.status !== "OPEN" ? (
            <span className={`badge ${REC_STATUS_BADGE[rec.status] ?? "neutral"}`}>
              {REC_STATUS_LABEL[rec.status] ?? rec.status}
            </span>
          ) : null}
          {rec.conservative ? <span className="badge amber">conservative</span> : null}
        </div>
      </div>
      <dl className="rec-kv">
        <dt>P(on-spec) after</dt>
        <dd>{pct(rec.p_on_spec_after)}</dd>
        <dt>Margin to spec</dt>
        <dd>
          {num(rec.margin_before_F)} → {num(rec.margin_after_F)} °F
        </dd>
        <dt>Yield shift</dt>
        <dd>{signed(rec.yield_shift_pct)}%</dd>
        {!compact ? (
          <>
            <dt>W90 at issue</dt>
            <dd>{num(rec.gate?.w90)} °F</dd>
            <dt>Issued</dt>
            <dd>t {rec.time_min}</dd>
          </>
        ) : null}
      </dl>
      {!compact && rec.rationale ? <p className="rec-rationale">{rec.rationale}</p> : null}
      <Citations items={compact ? rec.citations?.slice(0, 2) : rec.citations} />
      {!compact ? <Countdown rec={rec} /> : null}
      <DecisionButtons rec={rec} />
    </article>
  );
}

export function WithheldCard({ rec, compact = false }: { rec: Recommendation; compact?: boolean }) {
  const setProperty = useCockpit((s) => s.setProperty);
  const setTimeMin = useCockpit((s) => s.setTimeMin);
  return (
    <article className="rec withheld" aria-label={`Withheld ${propLabel(rec.property)}`}>
      <div className="rec-head">
        <div className="row" style={{ gap: 6, color: "var(--amber)", fontWeight: 600, fontSize: 12.5 }}>
          <IconAlert width={15} height={15} /> Withheld · {propLabel(rec.property)} · t {rec.time_min}
        </div>
        <TrustBadge level={rec.trust} short />
      </div>
      <p style={{ margin: 0, fontSize: compact ? 13 : 13.5 }}>{rec.gate?.message ?? "Recommendation withheld by the spread gate."}</p>
      <Link
        href="/modelling/confidence"
        onClick={() => {
          setProperty(rec.property as "LCO_T98_F" | "HN_T98_F");
          setTimeMin(rec.time_min);
        }}
      >
        Why? → Modelling
      </Link>
    </article>
  );
}
