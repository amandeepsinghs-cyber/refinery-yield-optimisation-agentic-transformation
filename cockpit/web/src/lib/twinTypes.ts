export interface TwinUnitIO {
  tag: string;
  label: string;
  value: number;
  unit: string;
}

export interface TwinUnitTag {
  tag: string;
  role: string;
  current: number;
  min: number;
  mean: number;
  max: number;
  limit?: number;
  sp?: number;
}

export interface TwinUnit {
  unit_id: string;
  seq: number;
  name: string;
  short_name: string;
  status: "OK" | "WATCH" | "ACT";
  status_label: string;
  headline_kpi: {
    label: string;
    value: number;
    plan: number;
    tol: number;
    unit: string;
    state?: "OK" | "WATCH" | "ACT";
  };
  io: {
    inputs: TwinUnitIO[];
    outputs: TwinUnitIO[];
  };
  use_cases: {
    id: string;
    number: number;
    title: string;
    panel_id: string;
  }[];
  events_open?: number;
  flags?: number;
  decisions_open?: number;
  kpi_vs_plan?: TwinKpiVsPlan | null;
  tag_table?: TwinUnitTag[];
  /** L0 tile curve + N(μ,σ) belief (SDD-L0-02 amended). */
  spark?: TwinSpark | null;
  decisions_needed?: TwinDecision[];
}

/** Headline tag, last 240 min: measured, ŷ and ±2σ band, belief at the cursor, plan ± tol and spec. */
export interface TwinSpark {
  tag: string;
  label: string;
  unit: string;
  source: string;
  time_min: number[];
  measured: (number | null)[];
  expected: (number | null)[];
  band_lo: (number | null)[];
  band_hi: (number | null)[];
  mu: number | null;
  sigma: number | null;
  plan: number | null;
  tol: number | null;
  spec_hi?: number | null;
  spec_lo?: number | null;
  breach_open?: boolean;
}

export interface TwinSystemLoop {
  loop_id: string;
  name: string;
  path: string[];
  flow_label: string;
  conservation_metric: string;
  status: "GREEN" | "AMBER" | "RED" | string;
}

export interface TwinRippleMetric {
  label: string;
  before: number;
  after: number;
  delta: number;
  unit: string;
  direction: "up" | "down" | "flat" | string;
}

export interface TwinSystemsRipple {
  rec_id: string;
  time_min: number;
  gate_status: string;
  primary_move?: { unit_id: string; parameter: string; action: string; sp_before: number; sp_after: number; delta_F: number } | null;
  domains?: Record<string, { title: string; summary: string; metrics: TwinRippleMetric[] }>;
}

export interface TwinAgent {
  agent_id: string;
  name: string;
  role: string;
  unit_id?: string | null;
  use_case_ids?: string[];
  status: "GREEN" | "AMBER" | "RED" | string;
  priority_rank?: number;
  proactive_alert?: string | null;
}

export interface TwinPanelTrace {
  key: string;
  label?: string;
  role: string;
  color?: string;
  unit?: string;
}

export interface TwinPanelHLine {
  value: number;
  label: string;
  role: string;
  color?: string;
}

export interface TwinPanelMarker {
  time_min: number;
  kind: string;
  label: string;
}

export interface TwinPanel {
  panel_id: string;
  title: string;
  kind: "measured_vs_expected" | "residual" | "mv" | "disturbance" | "yield" | "combustion" | "tray_profile";
  unit?: string;
  traces?: TwinPanelTrace[];
  hlines?: TwinPanelHLine[];
  markers?: TwinPanelMarker[];
  use_case_ids?: string[];
}

export interface TwinEvent {
  tag: string;
  time_min: number;
  kind: string;
  severity: "info" | "warn" | "alarm";
  message?: string;
  event_id?: string;
  unit_id?: string;
  use_case_id?: string | null;
  status?: string;
  residual?: number | null;
  sigma?: number | null;
  cusum?: number | null;
  expected?: number | null;
  measured?: number | null;
  recipe_gate?: string | null;
  recipe_id?: string | null;
  briefing?: { en: string; hinglish: string; hi: string };
}

export interface TwinRootCause {
  tag: string;
  label?: string;
  contrib: number;
  direction: "up" | "down" | "flat";
  d_input?: number;
}

export interface TwinAnalysis {
  primary_tag: string;
  expected_source: string;
  residual_now: number;
  sigma_now: number;
  cusum_now: number;
  breach_open: boolean;
  first_breach_min: number | null;
  minutes_before_next_lab: number;
  next_lab_min?: number;
  root_cause: TwinRootCause[];
  events: TwinEvent[];
  summary: {
    en: string;
    hinglish: string;
    hi: string;
  };
}

export interface TwinCommitteeWeight {
  member: string;
  label: string;
  weight: number;
  by_regime?: Record<string, number>;
}

export interface TwinModels {
  committee: {
    property?: string;
    regime_id?: string;
    novelty?: number;
    physics_weight?: number;
    weights?: TwinCommitteeWeight[];
    bias_reset_at_min?: number | null;
    reason?: string;
    /** Legacy shape kept for older payloads. */
    members?: { name: string; weight: number; p_regimes?: Record<string, number> }[];
    p_regimes?: Record<string, number>;
  } | null;
  surrogate: {
    name: string;
    regime_id: string;
    kind?: string;
    inputs: string[];
    unsupported_inputs?: string[];
    outputs: string[];
    r2: Record<string, number | null>;
    r2_holdout?: number | null;
    resid_sd?: Record<string, number>;
    n_train_minutes: number;
    source?: Record<string, string>;
  };
  pinn_checks: {
    name: string;
    value: number;
    limit: number;
    pass: boolean;
    unit: string;
  }[];
  gate: {
    status: "ISSUED" | "WITHHELD" | "PASS";
    reason: string | null;
    w90: number;
    w90_limit: number;
    committee_gate?: Record<string, string>;
  };
}

export interface TwinRegime {
  run_id: string;
  time_min: number;
  regime_id: string;
  regime_label: string;
  p_regime: Record<string, number>;
  novelty: number;
  transition_pct: number;
  declared_api: number;
  declared_regime_id: string;
  declared_vs_detected: string;
  detected_at_min: number | null;
  detection_delay_min: number | null;
  fingerprint?: Record<string, number>;
  segments?: { crude_id: string; regime_id: string; t_start_min: number; t_end_min: number }[];
  holdout?: { correct: number; total: number; rate: number; what?: string };
}

export interface TwinCitation {
  doc_id: string;
  revision?: string | number | null;
  section?: string | null;
  title?: string;
  snippet?: string;
}

export interface TwinDecision {
  rec_id: string;
  run_id: string;
  time_min: number;
  target_id: string;
  unit_id: string;
  use_case_id?: string;
  status: "OPEN" | "ACCEPTED" | "DECLINED" | string;
  action: string;
  parameter: string;
  sp_before: number;
  sp_after: number;
  delta: number;
  unit: string;
  gate_status?: string;
  trust?: string;
  rationale?: string;
  systems_ripple?: Record<string, string>;
  citations?: TwinCitation[];
  recipe_id?: string | null;
}

export interface TwinRecipe {
  recipe_id: string;
  run_id: string;
  time_min: number;
  unit_id: string;
  regime_id: string;
  gate: "ISSUED" | "WITHHELD";
  gate_reason: string | null;
  moves: {
    sp_tag: string;
    label: string;
    current: number;
    recommended: number;
    delta: number;
    unit: string;
    limit_lo: number;
    limit_hi: number;
  }[];
  d_yield_pct_feed: Record<string, number>;
  d_fuel_lb_s: number;
  d_power_MW: number;
  d_coke_pct: number;
  p_on_spec: Record<string, number>;
  objective_before: number | null;
  objective_after: number | null;
  predicted: Record<string, number>;
  citations: TwinCitation[];
  explanation: string;
  data_support?: {
    searched: string[];
    unsupported: string[];
    model_source: Record<string, string>;
    note: string;
  };
}

export interface TwinWhatIf {
  predicted: Record<string, number>;
  d_yield_pct_feed: Record<string, number>;
  p_on_spec: Record<string, number>;
  within_limits: boolean;
  limits?: Record<string, { supported: boolean; box_lo: number; box_hi: number }>;
  d_fuel_lb_s?: number;
  d_power_MW?: number;
  d_coke_pct?: number;
  objective?: number | null;
}

export interface TwinWorkbench {
  run_id?: string;
  unit: TwinUnit;
  time: {
    time_min: number;
    window_start: number;
    window_end: number;
    ts: string;
    next_lab_min: number;
  };
  series: {
    time_min: number[];
    keys: Record<string, (number | null)[]>;
  };
  panels: TwinPanel[];
  analysis: TwinAnalysis;
  models: TwinModels;
  regime: TwinRegime | null;
  recipe: TwinRecipe | null;
  decisions: TwinDecision[];
  citations: TwinCitation[];
}

export type KpiState = "OK" | "WATCH" | "ACT";
export type Severity = "info" | "warn" | "alarm";

export interface TwinKpiVsPlan {
  tag: string;
  label: string;
  value: number;
  plan: number;
  plan_source: "set point" | "committee" | "regime surrogate";
  tol: number;
  deviation: number;
  unit: string;
  state: KpiState;
}

export interface TwinAttention {
  unit_id: string;
  unit_label: string;
  severity: Severity;
  kind: string;
  tag: string | null;
  time_min: number;
  time_label: string;
  line: string;
  consequence: string | null;
  loop: string | null;
  downstream_unit_id: string | null;
  horizon_min: number | null;
  event_id: string;
  recipe_id?: string | null;
}

export interface TwinTimelineItem {
  time_min: number;
  time_label: string;
  kind: string;
  severity: Severity;
  unit_id: string | null;
  label: string;
  event_id: string;
}

export interface TwinPlantStrip {
  shift_label: string;
  clock: string;
  time_min: number;
  mass_closure_pct: number | null;
  open_decisions: number;
  agent_flags: number;
  top_flag: string | null;
  units_act: number;
  units_watch: number;
}

export interface TwinOverview {
  crude_slate: {
    declared_api: number;
    declared_regime_id: string;
    regime_id: string;
    regime_label: string;
    p_max: number;
    p_regime?: Record<string, number>;
    novelty: number;
    transition_pct: number;
    declared_vs_detected: string;
    last_switch_min: number;
    settled_min: number;
  };
  plant: TwinPlantStrip;
  needs_attention: TwinAttention[];
  timeline: TwinTimelineItem[];
  units: TwinUnit[];
  system_loops?: TwinSystemLoop[];
  systems_ripple?: TwinSystemsRipple | null;
  agent_fleet?: TwinAgent[];
  provenance?: { source: string; batch_id: string; run_id: string; time_min: number; advisory_only?: boolean };
  downstream_cases_summary?: { number: number; title: string; tier: string; boundary_tag: string; boundary_value: string }[];
}
