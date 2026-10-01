"use client";

/** Rail card 4 — Decision (SDD-L1-03): action line, rationale, citations, Accept / Decline + note → POST /api/twin/decision. */

import { useState } from "react";
import { postTwinDecision } from "@/lib/api";
import { citationLabel } from "@/lib/format";
import { decisionLine } from "@/lib/l1";
import type { TwinCitation, TwinDecision, TwinRecipe } from "@/lib/twinTypes";

export default function DecisionCard({ decision, recipe, citations, runId, timeMin }: {
  decision: TwinDecision | null;
  recipe: TwinRecipe | null;
  citations: TwinCitation[];
  runId: string;
  timeMin: number;
}) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ decision: string; audit_id: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!decision) {
    return (
      <section className="l1-card" data-testid="rail-decision">
        <h3 className="l1-card-title">Decision</h3>
        <p className="muted">No open decision for this unit at this minute.</p>
      </section>
    );
  }

  const cites: TwinCitation[] = decision.citations?.length ? decision.citations : citations;
  const closed = result != null || decision.status !== "OPEN";

  const submit = async (d: "accepted" | "declined") => {
    setBusy(true);
    setError(null);
    try {
      const r = await postTwinDecision(decision.rec_id, d, "operator", note, runId, timeMin, decision.recipe_id ?? recipe?.recipe_id ?? undefined);
      setResult({ decision: r.decision, audit_id: r.audit_id });
    } catch (e) {
      setError(e instanceof Error ? e.message : "decision failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="l1-card" data-testid="rail-decision">
      <h3 className="l1-card-title">Decision {decision.trust && <span className={`l1-tag ${decision.trust === "GREEN" ? "ok" : decision.trust === "RED" ? "bad" : "warn"}`}>{decision.trust}</span>}</h3>
      <p className="l1-decision-line mono" data-testid="decision-line">{decisionLine(decision)}</p>
      {decision.rationale && <p className="l1-card-note">Rationale: {decision.rationale}</p>}
      {decision.systems_ripple && (
        <details className="l1-ripple">
          <summary>Systems ripple</summary>
          <ul>
            {Object.entries(decision.systems_ripple).map(([k, v]) => <li key={k}><strong>{k.replace(/_impact$/, "")}</strong> — {v}</li>)}
          </ul>
        </details>
      )}
      {cites.length > 0 && (
        <p className="l1-cites" data-testid="decision-citations">
          {cites.map((c, i) => <span key={`${c.doc_id}-${i}`} className="l1-cite mono" title={c.title ?? c.doc_id}>[{citationLabel(c)}]</span>)}
        </p>
      )}
      {closed ? (
        <p className={`l1-decision-result ${(result?.decision ?? decision.status).toLowerCase().startsWith("acc") ? "ok" : "warn"}`} data-testid="decision-result">
          {(result?.decision ?? decision.status).toUpperCase()}{result ? ` · audit #${result.audit_id}` : ""}
        </p>
      ) : (
        <div className="l1-decision-actions">
          <button type="button" className="btn primary" disabled={busy} onClick={() => submit("accepted")} data-testid="decision-accept">Accept</button>
          <button type="button" className="btn" disabled={busy} onClick={() => submit("declined")} data-testid="decision-decline">Decline</button>
          <input className="l1-note" placeholder="Note" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Decision note" />
        </div>
      )}
      {error && <p className="bad">{error}</p>}
    </section>
  );
}
