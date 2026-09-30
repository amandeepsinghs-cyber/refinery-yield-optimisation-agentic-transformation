/**
 * Types mirroring cockpit/API_CONTRACT.md (v1). Snake_case is kept on purpose so
 * the payloads can be consumed without mapping.
 */

export type PropertyId = "LCO_T98_F" | "HN_T98_F";
export type ModelId = "bayes_ridge_v1" | "gpr_v1" | "hybrid_delta_v1" | "pinn_ens_v1";
export type GateStatus = "PASS" | "WITHHELD";
export type GateReason = null | "wide" | "bimodal" | "hysteresis";
export type TrustLevel = "GREEN" | "AMBER" | "RED";

export interface ApiError {
  error: string;
  detail?: string;
}

// ---------- Meta ----------
export interface Health {
  status: string;
  data: { runs: number; batches: string[]; trained: boolean; trained_at: string | null };
  gemini: {
    project: string;
    location: string;
    text_model: string;
    live_model: string;
    ok: boolean;
    note: string | null;
  };
  knowledge: { docs: number; chunks: number; mode: "embedding" | "bm25" | "empty" };
}

export interface RunInfo {
  run_id: string;
  batch: string;
  scenario: string;
  n_minutes: number;
  split: "train" | "test";
  has_events: boolean;
}

export type TagGroup = "input" | "mv" | "tray" | "target" | "reactor" | "signal";

export interface TagInfo {
  tag: string;
  label: string;
  unit: string;
  group: TagGroup;
}

export interface ModelMeta {
  model_id: string;
  label: string;
  color: string;
}

export interface AppConfig {
  spec: Record<string, number>;
  R: number;
  w90_limit: number;
  hysteresis_ratio: number;
  hysteresis_min: number;
  properties: string[];
  models: ModelMeta[];
}

// ---------- Time series ----------
export interface EventMark {
  time_min: number;
  code: number;
  label: string;
  duration: number;
}

export interface LabPoint {
  time_min: number;
  property?: string;
  value: number;
  status: string;
}

export interface RunTimeseries {
  run_id: string;
  time_min: number[];
  series: Record<string, (number | null)[]>;
  events: EventMark[];
  labs: LabPoint[];
  downsampled: boolean;
  note: string | null;
}

export interface MemberSeries {
  mu: (number | null)[];
  sigma: (number | null)[];
  weight: (number | null)[];
}

export interface EstimatesTimeseries {
  run_id: string;
  property: string;
  time_min: number[];
  truth: (number | null)[];
  members: Record<string, MemberSeries>;
  mixture: {
    mean: (number | null)[];
    q05: (number | null)[];
    q25: (number | null)[];
    q50: (number | null)[];
    q75: (number | null)[];
    q95: (number | null)[];
  };
  w90: (number | null)[];
  bimodality_d: (number | null)[];
  gate: GateStatus[];
  gate_reason: GateReason[];
  trust: TrustLevel[];
  labs: LabPoint[];
  events: EventMark[];
  spec_max: number;
  w90_limit: number;
  note?: string | null;
}

// ---------- Minute detail ----------
export interface MemberPoint {
  mu: number;
  sigma: number;
  weight: number;
  admitted: boolean;
  shadow: boolean;
}

export interface EstimateMessage {
  schema_version: string;
  provenance: { source: string; batch_id: string; run_id: string; time_min: number };
  ts: string;
  property: string;
  members: Record<string, MemberPoint>;
  mixture: {
    mean: number;
    sd: number;
    q05: number;
    q10?: number;
    q50: number;
    q90?: number;
    q95: number;
    w90: number;
    bimodality_d: number;
    p_on_spec: number;
  };
  bias?: { b: number; var: number };
  gate: { status: GateStatus; message: string | null; reason?: GateReason };
  trust: {
    level: TrustLevel;
    reason: string;
    signals?: Record<string, { value: number; limit: number; pass: boolean; severe: boolean }>;
  };
  source: string;
  truth?: number | null;
}

export interface Distribution {
  grid: number[];
  members: Record<string, MemberPoint & { pdf: number[] }>;
  mixture: {
    pdf: number[];
    mean: number;
    q05: number;
    q50: number;
    q95: number;
    p_on_spec: number;
  };
  w90: number;
  bimodality_d: number;
  bimodal: boolean;
  gate: { status: GateStatus; reason: GateReason; message: string | null };
  trust: { level: TrustLevel; reason: string };
  spec_max: number;
  w90_limit: number;
  truth?: number | null;
  note?: string | null;
}

// ---------- Modelling ----------
export interface ModelRow {
  model_id: string;
  family: string;
  label: string;
  status: "admitted" | "shadow" | string;
  weight: number | null;
  rmse: number | null;
  mae: number | null;
  bias: number | null;
  coverage90: number | null;
  crps: number | null;
  mean_sigma: number | null;
  params: Record<string, unknown>;
  per_regime: { regime: string; rmse: number | null; n: number }[];
  features: string[];
}

export interface ModelsResponse {
  property: string;
  eval: { runs: string[]; n_minutes: number; note: string | null };
  models: ModelRow[];
  mixture: { rmse: number | null; coverage90: number | null; crps: number | null };
}

type NumArr = (number | null)[];

export interface CalibrationResponse {
  parity: Record<string, { pred: NumArr; truth: NumArr }>;
  residuals: { time_idx: number[] } & Record<string, NumArr>;
  pit: { bins: number[] } & Record<string, number[]>;
  reliability: { nominal: number[] } & Record<string, NumArr>;
  coverage_over_time: { time_idx: number[]; mixture: NumArr };
  gpr_relevance: { feature: string; relevance: number }[];
  hybrid_decomposition: { time_idx: number[]; physics: NumArr; delta: NumArr };
  pinn_members: { time_idx: number[]; members: NumArr[] };
  cusum: { time_idx: number[]; value: NumArr; h: number | null };
  note?: string | null;
}

// ---------- Decision ----------
export interface Citation {
  doc_id: string;
  revision: number | string;
  section: string;
  title?: string;
  snippet?: string;
}

export type RecStatus = "OPEN" | "ACCEPTED" | "DECLINED" | "WITHHELD" | "EXPIRED" | "HOLD";

export interface Recommendation {
  rec_id: string;
  run_id: string;
  time_min: number;
  property: string;
  status: RecStatus;
  action: "RAISE" | "LOWER" | "HOLD";
  delta_F: number | null;
  sp_before: number | null;
  sp_after: number | null;
  p_on_spec_after: number | null;
  margin_before_F: number | null;
  margin_after_F: number | null;
  yield_shift_pct: number | null;
  trust: TrustLevel;
  conservative: boolean;
  rationale: string;
  gate: { status: GateStatus; reason: GateReason; message: string | null; w90: number | null };
  citations: Citation[];
}

export interface Overview {
  kpis: {
    rmse_vs_lab: number | null;
    rmse_vs_truth?: number | null;
    rmse_target: number | null;
    coverage90: number | null;
    trust_mix: Partial<Record<TrustLevel, number>>;
    availability: number | null;
    recs_accepted: number;
    recs_total: number;
    withheld: number;
  };
  decisions_needed: Recommendation[];
  note: string | null;
}

export interface AuditRow {
  audit_id: string;
  ts: string;
  actor: string;
  action: string;
  target: string;
  detail: string | Record<string, unknown> | null;
}

// ---------- Knowledge ----------
export interface KnowledgeHit {
  doc_id: string;
  revision: number | string;
  section: string;
  title: string;
  section_title: string;
  doc_type: string;
  snippet: string;
  score: number;
}

export interface KnowledgeSearch {
  results: KnowledgeHit[];
  index: { docs: number; chunks: number; mode: "embedding" | "bm25" | "empty" };
}

export interface KnowledgeDoc {
  meta: Record<string, unknown>;
  markdown: string;
  sections: { id: string; title: string }[];
}

export interface KnowledgeRecord {
  doc_id: string;
  doc_type: string;
  title: string;
  date: string;
  time_min: number | null;
  run_id?: string | null;
  sim_batch?: string | null;
  sim_run?: string | null;
  sim_window?: [number, number] | number[] | null;
  window?: [number, number] | number[] | null;
  entries?: unknown[];
}

// ---------- Copilot ----------
export interface CopilotContext {
  page: string;
  run_id: string | null;
  property: string;
  time_min: number | null;
}
