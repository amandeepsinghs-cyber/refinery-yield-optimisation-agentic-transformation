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
  kpi_vs_plan?: {
    label: string;
    value: number;
    plan: number;
    tol: number;
    unit: string;
    state: "OK" | "WATCH" | "ACT";
  };
  tag_table?: TwinUnitTag[];
}

export interface TwinPanelTrace {
  key: string;
  label?: string;
  role: string;
  color?: string;
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
}

export interface TwinAnalysis {
  primary_tag: string;
  expected_source: string;
  residual_now: number;
  sigma_now: number;
  cusum_now: number;
  breach_open: boolean;
  first_breach_min: number;
  minutes_before_next_lab: number;
  root_cause: {
    tag: string;
    label?: string;
    contrib: number;
    direction: "up" | "down" | "flat";
  }[];
  events: TwinEvent[];
  summary: {
    en: string;
    hinglish: string;
    hi: string;
  };
}

export interface TwinModels {
  committee: {
    members?: { name: string; weight: number; p_regimes?: Record<string, number> }[];
    physics_weight?: number;
    regime_id?: string;
    p_regimes?: Record<string, number>;
    novelty?: number;
  } | null;
  surrogate: {
    name: string;
    regime_id: string;
    inputs: string[];
    outputs: string[];
    r2: Record<string, number>;
    n_train_minutes: number;
  };
  pinn_checks: {
    name: string;
    value: number;
    limit: number;
    pass: boolean;
    unit: string;
  }[];
  gate: {
    status: "ISSUED" | "WITHHELD";
    reason: string | null;
    w90: number;
    w90_limit: number;
  };
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
  objective_before: number;
  objective_after: number;
  predicted: Record<string, number>;
  citations: {
    doc_id: string;
    revision: string;
    section: string;
    title: string;
  }[];
  explanation: string;
}

export interface TwinWorkbench {
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
    keys: Record<string, number[]>;
  };
  panels: TwinPanel[];
  analysis: TwinAnalysis;
  models: TwinModels;
  regime: any;
  recipe: TwinRecipe | null;
  decisions: any[];
  citations: any[];
}

export interface TwinOverview {
  crude_slate: {
    declared_api: number;
    declared_regime_id: string;
    regime_id: string;
    regime_label: string;
    p_max: number;
    novelty: number;
    transition_pct: number;
    declared_vs_detected: string;
    last_switch_min: number;
    settled_min: number;
  };
  needs_attention: {
    unit_id: string;
    severity: "info" | "warn" | "alarm";
    line: string;
    consequence: string;
    event_id: string;
  }[];
  timeline: {
    time_min: number;
    kind: string;
    unit_id: string | null;
    label: string;
  }[];
  units: TwinUnit[];
}
