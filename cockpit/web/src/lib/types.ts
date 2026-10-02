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
  data: { runs: number; batches: string[]; trained: boolean; trained_at: string | null; split?: string;
    store?: { source: string; label: string; table?: string; lake_runs?: number; active_runs?: number; error?: string | null } };
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

// ---------- Connected Refinery Digital Twin & Use-Case Catalogue (SDD §13) ----------
export interface TwinUnitEnvelope {
  parameter: string;
  label: string;
  unit: string;
  current_value: number;
  p50: number;
  p95: number;
  sweet_spot_min: number;
  sweet_spot_max: number;
  spec_limit: number;
  scale_min: number;
  scale_max: number;
  zone: "OVER_TREATING" | "SWEET_SPOT" | "UNDER_TREATING" | "TRANSITION_LOCK";
  zone_label: string;
  advice: string;
}

export interface TwinUnitKpi {
  tag: string;
  label: string;
  value: number | string;
  unit: string;
  status: TrustLevel;
}

export interface TwinUnitRecommendation {
  action: "RAISE" | "LOWER" | "HOLD";
  parameter: string;
  sp_before: number;
  sp_after: number;
  delta: number;
  unit: string;
  gate_status: GateStatus;
  rationale: string;
  citations: Citation[];
}

export interface TwinTagRow {
  tag: string;
  label: string;
  role: string;
  unit: string;
  current: number;
  window_min: number;
  window_mean: number;
  window_max: number;
  limit_or_sp: string;
  status: TrustLevel;
}

export interface TwinChartTrace {
  tag: string;
  label: string;
  color?: string;
  dash?: string;
}

export interface TwinChartPanel {
  panel_id: string;
  title: string;
  subtitle: string;
  unit: string;
  traces: TwinChartTrace[];
  spec_limit?: number | null;
  sweet_spot?: [number, number] | null;
}

export interface TwinDecisionCard {
  rec_id: string;
  run_id: string;
  time_min: number;
  target_id: string;
  unit_id: string;
  use_case_id: string;
  status: RecStatus;
  action: "RAISE" | "LOWER" | "HOLD";
  parameter: string;
  sp_before: number;
  sp_after: number;
  delta: number;
  unit: string;
  gate_status: GateStatus;
  trust: TrustLevel;
  rationale: string;
  systems_ripple: Record<string, string>;
  citations: Citation[];
}

export interface TwinSentinelAgent {
  agent_id: string;
  name: string;
  role: string;
  unit_id: string;
  use_case_ids: string[];
  status: TrustLevel;
  priority_rank: number;
  proactive_alert: string;
  briefings: {
    en: string;
    hinglish: string;
    hi: string;
  };
}

export interface TwinUnit {
  unit_id: string;
  seq: number;
  name: string;
  short_name: string;
  subtitle: string;
  use_case_ids: string[];
  use_case_numbers: number[];
  status: TrustLevel;
  status_label: string;
  headline_kpi: {
    label: string;
    value: number | string;
    unit: string;
    target: string;
  };
  tags: Record<string, number>;
  kpis: TwinUnitKpi[];
  tag_table: TwinTagRow[];
  chart_panels: TwinChartPanel[];
  envelope: TwinUnitEnvelope;
  recommendation: TwinUnitRecommendation;
  decisions_needed: TwinDecisionCard[];
}

export interface TwinSystemLoop {
  loop_id: string;
  name: string;
  path: string[];
  flow_label: string;
  conservation_metric: string;
  status: TrustLevel;
}

export interface TwinRippleMetric {
  label: string;
  before: number;
  after: number;
  delta: number;
  unit: string;
  direction: "up" | "down";
}

export interface TwinRippleDomain {
  title: string;
  summary: string;
  metrics: TwinRippleMetric[];
}

export interface TwinSystemsRipple {
  rec_id: string;
  time_min: number;
  gate_status: GateStatus;
  primary_move: {
    unit_id: string;
    parameter: string;
    action: "RAISE" | "LOWER" | "HOLD";
    sp_before: number;
    sp_after: number;
    delta_F: number;
  };
  domains: {
    yield: TwinRippleDomain;
    energy: TwinRippleDomain;
    regeneration: TwinRippleDomain;
    reliability: TwinRippleDomain;
  };
}

export interface TwinSensorDriftRow {
  tag: string;
  dup_tag: string;
  label: string;
  unit_name: string;
  unit: string;
  primary_val: number;
  dup_val: number;
  abs_drift: number;
  threshold: number;
  status: TrustLevel;
}

export interface TwinValveHealthRow {
  tag: string;
  label: string;
  unit_name: string;
  position_pct: number;
  operating_band_pct: [number, number];
  status: TrustLevel;
}

export interface TwinPinnResiduals {
  mass_balance_err_pct: number;
  reactor_mb_lb_min: number;
  mass_closure_ok: boolean;
  tray_monotonicity_ok: boolean;
  tray_violations_count: number;
  tray_profile_F: Record<string, number>;
  cutpoint_gap_F: number;
  cutpoint_gap_ok: boolean;
  condenser_eff: number;
  condenser_ua_residual: number;
  condenser_fouling_status: TrustLevel;
  furnace_coking_residual_F: number;
  furnace_coking_status: TrustLevel;
  hydraulic_dp_frac: number;
  hydraulic_dp_norm: number;
  flooding_status: TrustLevel;
  sensor_drift_matrix: TwinSensorDriftRow[];
  valve_health_matrix: TwinValveHealthRow[];
}

export interface TwinUseCase {
  id: string;
  number: number;
  title: string;
  category: string;
  unit_id: string;
  unit_name: string;
  status: TrustLevel;
  badge_text: string;
  problem_statement: string;
  solution_summary: string;
  kpis: {
    label: string;
    tag: string;
    value: number | string;
    unit: string;
    target: string;
  }[];
  tag_table: TwinTagRow[];
  chart_panels: TwinChartPanel[];
  envelope: TwinUnitEnvelope;
  recommendation: TwinUnitRecommendation;
  decisions_needed: TwinDecisionCard[];
  systems_ripple: {
    yield_impact: string;
    energy_impact: string;
    regeneration_impact: string;
    reliability_impact: string;
  };
  citations: Citation[];
}

export interface DownstreamCaseItem {
  number: number;
  title: string;
  tier: "BOUNDARY_LINKED" | "ARCHITECTURE_READY" | "PLANT_WIDE_ROADMAP";
  boundary_tag: string;
  boundary_value: string;
  integration_note: string;
}

export interface TwinState {
  schema_version: string;
  provenance: {
    source: string;
    batch_id: string;
    run_id: string;
    time_min: number;
    advisory_only: boolean;
  };
  units: TwinUnit[];
  system_loops: TwinSystemLoop[];
  systems_ripple: TwinSystemsRipple;
  pinn_residuals: TwinPinnResiduals;
  use_cases: TwinUseCase[];
  agent_fleet: TwinSentinelAgent[];
  downstream_cases_summary: DownstreamCaseItem[];
}


