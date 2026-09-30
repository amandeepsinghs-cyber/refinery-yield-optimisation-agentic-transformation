"use client";

import { useMemo, useState } from "react";
import { useRecommendations } from "@/lib/api";
import { num, pct, propLabel, signed } from "@/lib/format";
import { useCockpit } from "@/lib/store";
import type { Recommendation, RecStatus } from "@/lib/types";
import { Card, EmptyState, ErrorState, LoadingBlock, NoRun, PageHeader, TrustBadge } from "@/components/ui/primitives";
import { RecCard, WithheldCard } from "@/components/decision/RecCards";
import { REC_STATUS_BADGE, REC_STATUS_LABEL } from "@/lib/recommendations";

const STATUS_BADGE: Record<RecStatus, string> = REC_STATUS_BADGE;
const STATUS_LABEL: Record<RecStatus, string> = REC_STATUS_LABEL;

function History({ rows }: { rows: Recommendation[] }) {
  const [filter, setFilter] = useState<string>("ALL");
  const shown = filter === "ALL" ? rows : rows.filter((r) => r.status === filter);
  return (
    <>
      <div className="filter-chips" role="group" aria-label="Filter history by status" style={{ marginBottom: 10 }}>
        {["ALL", "ACCEPTED", "DECLINED", "WITHHELD", "EXPIRED", "HOLD"].map((s) => (
          <button key={s} type="button" aria-pressed={filter === s} onClick={() => setFilter(s)}>
            {s.toLowerCase()}
          </button>
        ))}
      </div>
      {shown.length ? (
        <div className="table-wrap">
          <table className="t">
            <thead>
              <tr>
                <th>t (min)</th>
                <th>Property</th>
                <th>Status</th>
                <th>Action</th>
                <th className="r">Δ °F</th>
                <th className="r">P(on-spec)</th>
                <th className="r">Margin before → after °F</th>
                <th className="r">Yield shift</th>
                <th>Trust</th>
                <th className="r">W90 °F</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.rec_id}>
                  <td className="num">{r.time_min}</td>
                  <td>{propLabel(r.property)}</td>
                  <td>
                    <span className={`badge ${STATUS_BADGE[r.status] ?? "neutral"}`}>
                      {STATUS_LABEL[r.status] ?? r.status}
                    </span>
                  </td>
                  <td>{r.status === "WITHHELD" ? "—" : r.action}</td>
                  <td className="r">{r.status === "WITHHELD" ? "—" : signed(r.delta_F)}</td>
                  <td className="r">{r.status === "WITHHELD" ? "—" : pct(r.p_on_spec_after)}</td>
                  <td className="r">
                    {r.status === "WITHHELD" ? "—" : `${num(r.margin_before_F)} → ${num(r.margin_after_F)}`}
                  </td>
                  <td className="r">{r.status === "WITHHELD" ? "—" : `${signed(r.yield_shift_pct)}%`}</td>
                  <td>
                    <TrustBadge level={r.trust} short />
                  </td>
                  <td className="r">{num(r.gate?.w90)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState title="No history for this filter" />
      )}
    </>
  );
}

export default function DecisionsView() {
  const runId = useCockpit((s) => s.runId);
  const property = useCockpit((s) => s.property);
  const [allProps, setAllProps] = useState(true);
  const q = useRecommendations(runId);
  const { open, withheld, history } = useMemo(() => {
    const rows = (q.data ?? []).filter((r) => allProps || r.property === property);
    const sorted = [...rows].sort((a, b) => b.time_min - a.time_min);
    return {
      open: sorted.filter((r) => r.status === "OPEN"),
      withheld: sorted.filter((r) => r.status === "WITHHELD").slice(0, 6),
      history: sorted.filter((r) => r.status !== "OPEN"),
    };
  }, [q.data, allProps, property]);

  return (
    <div className="page">
      <PageHeader
        title="Decisions"
        question="What should we change in the next 30 minutes, and how sure are we?"
        actions={
          <div className="seg" role="group" aria-label="Property filter">
            <button type="button" aria-pressed={allProps} onClick={() => setAllProps(true)}>
              Both properties
            </button>
            <button type="button" aria-pressed={!allProps} onClick={() => setAllProps(false)}>
              {propLabel(property)} only
            </button>
          </div>
        }
      />
      {!runId ? (
        <Card>
          <NoRun />
        </Card>
      ) : q.isLoading ? (
        <LoadingBlock height={260} />
      ) : q.isError ? (
        <Card>
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        </Card>
      ) : (
        <>
          <Card title="Actionable recommendations" sub={`${open.length} open · gate PASS`}>
            {open.length ? (
              <div className="rec-cards">
                {open.map((r) => (
                  <RecCard key={r.rec_id} rec={r} />
                ))}
              </div>
            ) : (
              <EmptyState title="No open recommendations" detail="Recommendations appear only when the gate is PASS and trust is GREEN or AMBER (SDD-REC-02)." />
            )}
          </Card>
          <Card title="Withheld by the spread gate" sub={`latest ${withheld.length}`}>
            {withheld.length ? (
              <div className="rec-cards">
                {withheld.map((r) => (
                  <WithheldCard key={r.rec_id} rec={r} />
                ))}
              </div>
            ) : (
              <EmptyState title="No withheld decisions" detail="The spread gate has not withheld any recommendation in this run." />
            )}
          </Card>
          <Card title="History" sub={`${history.length} records`}>
            <History rows={history} />
          </Card>
        </>
      )}
    </div>
  );
}
