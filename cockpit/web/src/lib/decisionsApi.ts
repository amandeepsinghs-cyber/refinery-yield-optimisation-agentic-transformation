/**
 * Decision spine client (DECISION_FIRST_REDESIGN §2). One object per decision the plant has to take now; the screen
 * is built around it, evidence and data hang off it. Mirrors cockpit/api/app/engines/decisions.py.
 */
import { fetchJson } from "./api";

export type DecisionStatus = "open" | "watch" | "withheld" | "accepted" | "held" | "declined" | "expired";
export type DecisionType = "D1" | "D2" | "D3" | "D4" | "D5" | "D6" | "D7" | "D8" | "D9";

export interface UseCaseRef { platform_id: string; iocl_row: string; iocl_title: string }
export interface DecisionMove { tag: string; label: string; from: number; to: number; delta: number; unit: string }
export interface DecisionGate { id: string; name?: string; op?: string; pass: boolean; value: number | null; limit: number | null; unit?: string }
export interface RippleItem { what: string; delta: number | null; unit: string; source: string; note?: string }

export interface Decision {
  id: string;
  type: DecisionType;
  type_name: string;
  run_id: string;
  time_min: number;
  created_min: number;
  created_label: string;
  unit_id: string;
  unit_label: string;
  question: string;
  headline: string;
  status: DecisionStatus;
  urgency: { rank: number; time_to_consequence_min: number | null; consequence: string | null; decide_by_label?: string | null;
    downstream_unit_id?: string | null; loop?: string | null };
  observed: null | {
    tag?: string; label?: string; estimate?: number | null; sigma?: number | null; plan?: number | null; delta_vs_plan?: number | null;
    q95?: number | null; spec_max?: number | null; unit?: string; since_label?: string | null; line?: string | null;
    next_lab_label?: string | null; next_lab_in_min?: number | null;
    last_lab?: { sample_id: string; value: number | null; status: string; drawn_label: string; reported_label: string; status_reason?: string } | null;
    regime_id?: string; regime_label?: string; p_regime?: Record<string, number>; declared_regime_id?: string; transition_pct?: number; novelty?: number;
    severity?: string;
  };
  diagnosed: null | { text?: string | null; trust?: string | null; trust_reason?: string | null };
  related?: { property: string; w90: number | null; p_on_spec: number | null; estimate: number | null; sigma: number | null }[];
  proposed: { moves: DecisionMove[]; alternative: string | null; sample?: { properties?: string[]; property?: string; when: string } };
  predicted: null | {
    mu_before?: number | null; mu_after?: number | null; sigma?: number | null; p_on_spec_before?: number | null;
    p_on_spec_after?: number | null; w90?: number | null; spec_max?: number | null; margin_after?: number | null; ripple?: RippleItem[];
  };
  gates: DecisionGate[];
  evidence: { tags: string[]; labs: string[]; docs: string[]; lakehouse: string | null; event_id?: string };
  withheld_reason: string | null;
  withheld_text: string | null;
  levers?: { tag: string; label: string; unit: string; current: number | null; lo: number | null; hi: number | null; source?: string }[];
  outcome: null | Record<string, unknown>;
  action: null | { action: "accept" | "hold" | "decline"; time_min: number; time_label: string; user: string; note: string; reopened?: boolean };
  problem: string[];
  problem_text: string[];
  use_case: UseCaseRef;
  use_cases: UseCaseRef[];
  why_this_exists: string;
  advisory_only: true;
  enabled_by?: { kind: "agent" | "ml" | "check" | "optimiser" | "genai"; name: string; did: string }[];
}

export interface DecisionQueueResp {
  run_id: string;
  time_min: number;
  clock: string;
  counts: Record<DecisionStatus, number>;
  decisions: Decision[];
  problems: Record<string, string>;
}

export async function getDecisions(runId?: string | null, timeMin?: number | null): Promise<DecisionQueueResp> {
  const p = new URLSearchParams();
  if (runId) p.set("run_id", runId);
  if (timeMin != null) p.set("time_min", String(timeMin));
  return fetchJson(`/api/decisions?${p.toString()}`, { method: "GET" });
}

export async function actOnDecision(id: string, action: "accept" | "hold" | "decline", runId: string | null, timeMin: number | null,
  note = ""): Promise<{ ok: boolean; audit_id: number; note: string }> {
  return fetchJson(`/api/decisions/${encodeURIComponent(id)}/act`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, run_id: runId, time_min: timeMin, note }),
  });
}

export interface CoverageRow { platform_id: string | null; iocl_row: string; iocl_title: string; state: "active" | "watching" | "quiet" | "not claimed";
  decisions: { id: string; type: string; status: string }[] }

export async function getCoverage(runId?: string | null, timeMin?: number | null): Promise<{ run_id: string; rows: CoverageRow[] }> {
  const p = new URLSearchParams();
  if (runId) p.set("run_id", runId);
  if (timeMin != null) p.set("time_min", String(timeMin));
  return fetchJson(`/api/decisions-coverage?${p.toString()}`, { method: "GET" });
}
