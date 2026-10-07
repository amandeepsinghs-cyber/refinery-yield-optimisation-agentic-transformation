"use client";

/** Rail card 1 — Feed arriving & bias reset (DECISIONS S-8, SDD-FEED-06; E2 bias reset, SDD-L1-03).
 *  The FCC is fed heavy gas oil: the card shows whether the feed is changing, its estimated API, novelty and class.
 *  The crude family is one context line. Weights are not regime-based (7 Oct). */

import { clock, num } from "@/lib/format";
import type { TwinModels, TwinRegime } from "@/lib/twinTypes";

export default function RegimeCard({ regime, committee }: { regime: TwinRegime | null; committee: TwinModels["committee"] }) {
  if (!regime) return null;
  const f = regime.feed;
  const changing = f?.state === "changing";
  return (
    <section className="l1-card" data-testid="rail-regime">
      <h3 className="l1-card-title">Feed arriving &amp; bias reset</h3>
      {f ? (
        <dl className="l1-kv">
          <dt>Feed</dt>
          <dd className={changing ? "warn" : "ok"}>
            {changing ? `changing since ${clock(f.flagged_at_min)}${f.pct_through != null ? ` · ${f.pct_through} % through` : ""}`
              : f.settled_at_min != null ? `settled since ${clock(f.settled_at_min)}` : "settled"}
          </dd>
          <dt>Estimated API</dt>
          <dd className="mono">{num(f.api_est, 1)} ± {num(f.api_band, 1)}{f.api_declared != null ? ` · schedule ${num(f.api_declared, 1)}` : ""}</dd>
          <dt>Feed class</dt>
          <dd>{f.feed_class_label ?? "—"}</dd>
          <dt>Novelty</dt>
          <dd className={f.novel ? "warn mono" : "mono"}>{num(f.novelty, 2)}{f.novel ? " · outside training, advice held" : ""}</dd>
          {f.model?.heldout ? (
            <>
              <dt>Held-out error</dt>
              <dd className="mono">{num(f.model.heldout.mae_api, 2)} API (R² {num(f.model.heldout.r2, 2)})</dd>
            </>
          ) : null}
          {committee && (
            <>
              <dt>Bias reset</dt>
              <dd className="mono">{committee.bias_reset_at_min != null ? clock(committee.bias_reset_at_min) : "—"}{committee.bias_F != null ? ` · offset ${num(committee.bias_F, 2)} °F` : ""}</dd>
              <dt>Model weights</dt>
              <dd>{committee.weight_source === "recent_labs" ? "from recent lab accuracy" : "from held-out accuracy"} · not set by the crude</dd>
            </>
          )}
        </dl>
      ) : null}
      {f?.crude_family_context ? <p className="l1-card-note">Context: crude slate {f.crude_family_context}. The FCC sees its heavy gas oil, not the crude.</p> : null}
      {committee?.reason && <p className="l1-card-note">{committee.reason}</p>}
    </section>
  );
}
