# API Contract v3 — Crude-Adaptive Unit Workbench, Engines E1–E4, Screen-Scoped Gemini

> Binding for Epic J (SDD §1A, §14; BDD-24..28). Extends [API_CONTRACT.md](API_CONTRACT.md) — nothing there is removed.
> All numbers are engineering units. No financial fields anywhere. Advisory only: no endpoint writes to control systems.

## 0. Unit vocabulary (unchanged ids)

| unit_id | Section | Primary tag (E3 residual) | Expected source | MVs shown | Disturbances | Yield / product tags |
|---|---|---|---|---|---|---|
| `unit_1_furnace` | Feed preheat & fired heater | `T2_preheat_F` (vs `SP_T_preheat_F`); combustion panel `fluegas_O2_pct`, `fluegas_CO_ppm` | regime surrogate | `F5_fuel`, `V1`, `SP_T_preheat_F` | `feed_flow_lb_s`, `dist_T_feed_in_F`, `dist_feed_API` | `F5_fuel` per feed |
| `unit_2_riser` | Riser reactor | `conversion_pct` | regime surrogate (`SP_T_riser_ROT_F`, `feed_flow_lb_s`, `dist_feed_API`, `T2_preheat_F`) | `SP_T_riser_ROT_F`, `F_regen_cat` | `dist_feed_API`, `feed_flow_lb_s` | `conversion_pct`, `dP_reactor_frac` |
| `unit_3_regenerator` | Regenerator & air blower | `dT_cyc_reg_F` (afterburn); secondary `Treg_F` | regime surrogate (`Fair`, `F_coke`, `feed_flow_lb_s`, `dist_feed_API`) | `Fair`, `V6`, `V7`, `SP_T_reg_F` | `dist_feed_API`, `feed_flow_lb_s` | `F_coke`, `C_regen_cat`, `power_CAB` |
| `unit_4_fractionator` | Main fractionator | `LCO_T98_F`, `HN_T98_F` | **committee** (`mean`, band `q05–q95`) | `MV_PA1..MV_PA4`, `SP_LCO_T98`, `SP_HN_T98` | `dist_feed_API`, `feed_flow_lb_s`, `dist_T_feed_in_F` | `prod_LCO`, `prod_HN`, `prod_LN`, `prod_LPG`, `prod_slurry` |
| `unit_5_condenser` | Overhead condenser & WGC | `MV_cw_flow` (fouling signature) | regime surrogate (`feed_flow_lb_s`, `T_tray01_F`, `dist_T_ambient_F`) | `MV_reflux_ratio`, `MV_cw_flow`, `SP_T_overhead` | `dist_T_ambient_F`, `feed_flow_lb_s` | `power_WGC` |
| `unit_6_stabiliser` | Stabiliser / gas plant | `eff_C5` | regime surrogate (`MV_reflux_ratio`, `SP_T_overhead`, `dist_feed_API`, `feed_flow_lb_s`) | `MV_reflux_ratio`, `SP_T_overhead` | `dist_feed_API`, `feed_flow_lb_s` | `prod_LPG`, `prod_LN`, `eff_C3`, `eff_C4`, `eff_C5` |

Regimes: `R1..R4` from `app/regimes.py` (API bands, labels). Train runs: seed < 140; held-out: seed ≥ 140 (existing split).

## 1. `GET /api/regime?run_id&time_min` — E1

```json
{"run_id":"random_s144","time_min":600,
 "regime_id":"R2","regime_label":"Medium-heavy (Urals-type)",
 "p_regime":{"R1":0.08,"R2":0.84,"R3":0.08,"R4":0.0},
 "novelty":0.21,"transition_pct":100,
 "declared_api":23.3,"declared_regime_id":"R2","declared_vs_detected":"match",
 "fingerprint":{"coke_per_feed":0.0521,"riser_dT_F":352.4,"fuel_per_feed":0.212,"Treg_F":1251.0,"conversion_pct":71.2,"tray_dT_F":188.5},
 "segments":[{"crude_id":1,"regime_id":"R3","t_start_min":1,"t_end_min":426,"transition_start_min":null,"transition_end_min":null},
             {"crude_id":2,"regime_id":"R2","t_start_min":427,"t_end_min":1140,"transition_start_min":427,"transition_end_min":487}],
 "detected_at_min":505,"detection_delay_min":18}
```
`declared_vs_detected ∈ {match, lagging, mismatch}`. `GET /api/regime/timeseries?run_id&step=5` → `{"time_min":[],"regime_id":[],"novelty":[],"declared_api":[],"p_regime":{"R1":[],...}}`.

## 2. `GET /api/adaptation?run_id&time_min&property=LCO_T98_F` — E2

```json
{"property":"LCO_T98_F","regime_id":"R2","novelty":0.21,"physics_weight":0.58,
 "weights":[{"member":"ridge","label":"Bayesian ridge","weight":0.18,"by_regime":{"R1":0.15,"R2":0.18,"R3":0.30,"R4":0.22}},
            {"member":"hybrid","label":"Hybrid delta","weight":0.31,"by_regime":{}},
            {"member":"pinn","label":"PINN ensemble","weight":0.27,"by_regime":{}},
            {"member":"gpr","label":"GPR","weight":0.24,"by_regime":{}}],
 "bias_reset_at_min":487,
 "reason":"Regime R2 (Medium-heavy) detected with novelty 0.21: physics-anchored members carry 58 % of the committee; GPR down-weighted (extrapolating beyond R3 training density)."}
```

## 3. `GET /api/agents/events?run_id&upto_time_min&unit_id?` — E3

```json
{"events":[{"event_id":"ev_random_s144_u4_000503","run_id":"random_s144","time_min":503,"unit_id":"unit_4_fractionator",
  "use_case_id":"UC-01","tag":"LCO_T98_F","kind":"cusum","severity":"warn",
  "residual":4.8,"sigma":1.6,"cusum":8.9,"expected":757.1,"measured":761.9,
  "root_cause":[{"tag":"dist_feed_API","contrib":2.1,"direction":"down"},{"tag":"MV_PA3","contrib":0.9,"direction":"flat"}],
  "briefing":{"en":"...","hinglish":"...","hi":"..."},
  "next_lab_min":840,"recipe_id":"rcp_random_s144_u4_000503","status":"open"}]}
```
`kind ∈ {breach, cusum, drift, combustion, flooding_pattern, regime_change, recipe_ready, accepted, declined}`; `severity ∈ {info, warn, alarm}`.
`GET /api/agents/stream?run_id` — SSE, `event: agent_event`, `data: <event json>`; replays events ≤ current store time then tails the SQLite table `agent_events`.

## 4. `GET /api/recipe?run_id&time_min&unit_id` — E4

```json
{"recipe_id":"rcp_random_s144_u4_000503","run_id":"random_s144","time_min":503,"unit_id":"unit_4_fractionator","regime_id":"R2",
 "gate":"ISSUED","gate_reason":null,
 "moves":[{"sp_tag":"SP_LCO_T98","label":"LCO T98 set point","current":755.3,"recommended":751.0,"delta":-4.3,"unit":"°F","limit_lo":735,"limit_hi":765},
          {"sp_tag":"MV_PA3","label":"Pumparound 3 duty","current":35.0,"recommended":36.4,"delta":1.4,"unit":"%","limit_lo":20,"limit_hi":60},
          {"sp_tag":"SP_T_riser_ROT_F","label":"Riser outlet temperature","current":969.0,"recommended":971.5,"delta":2.5,"unit":"°F","limit_lo":955,"limit_hi":985}],
 "d_yield_pct_feed":{"LCO":0.38,"HN":-0.05,"LN":0.02,"LPG":0.04},
 "d_fuel_lb_s":-0.21,"d_power_MW":0.03,"d_coke_pct":0.01,
 "p_on_spec":{"LCO":0.96,"HN":0.98},
 "objective_before":41.2,"objective_after":41.6,
 "predicted":{"LCO_T98_F":758.4,"HN_T98_F":531.0,"prod_LCO":52.1},
 "citations":[{"doc_id":"SOP-FRAC-003","revision":"r4","section":"4.2","title":"..."}],
 "explanation":"..." }
```
`gate ∈ {ISSUED, WITHHELD}`; when WITHHELD `moves=[]` and `gate_reason ∈ {spread_gate, novelty, infeasible, insufficient_data}`.
`POST /api/recipe/whatif` body `{"run_id","time_min","unit_id","moves":{"SP_LCO_T98":752.0}}` → `{"predicted":{...},"d_yield_pct_feed":{},"p_on_spec":{},"within_limits":true}`.
`POST /api/twin/decision` (existing) accepts optional `recipe_id`; status becomes `ACCEPTED|DECLINED` and an `accepted|declined` agent event is written.

## 5. `GET /api/unit/{unit_id}/workbench?run_id&time_min&window_min=720&step=2` — L1 aggregate

One call renders the whole workbench (Data · Analysis · Models · Decisions):

```json
{"unit":{"unit_id":"unit_4_fractionator","seq":4,"name":"...","short_name":"Fractionator","status":"WATCH","status_label":"...",
         "headline_kpi":{"label":"LCO T98 vs plan","value":761.9,"plan":755.0,"tol":3.0,"unit":"°F"},
         "io":{"inputs":[{"tag":"feed_flow_lb_s","label":"Riser effluent","value":165.2,"unit":"lb/s"}],"outputs":[{"tag":"prod_LCO","label":"LCO","value":52.1,"unit":"lb/s"}]},
         "use_cases":[{"id":"UC-01","number":1,"title":"...","panel_id":"quality"}]},
 "time":{"time_min":600,"window_start":1,"window_end":600,"ts":"2026-09-01T10:00:00Z","next_lab_min":840},
 "series":{"time_min":[...],"keys":{"LCO_T98_F":[...],"expected:LCO_T98_F":[...],"band_lo:LCO_T98_F":[...],"band_hi:LCO_T98_F":[...],
           "residual:LCO_T98_F":[...],"sigma3:LCO_T98_F":[...],"cusum:LCO_T98_F":[...],"MV_PA3":[...],"dist_feed_API":[...],"prod_LCO":[...]}},
 "panels":[{"panel_id":"quality","title":"LCO T98 — measured vs expected","kind":"measured_vs_expected","unit":"°F",
            "traces":[{"key":"LCO_T98_F","label":"Measured (simulator truth)","role":"measured","color":"#1d4ed8"},
                      {"key":"expected:LCO_T98_F","label":"Expected (committee)","role":"expected","color":"#047857"},
                      {"key":"band_lo:LCO_T98_F","label":"5–95 % band","role":"band_lo","color":"#047857"},{"key":"band_hi:LCO_T98_F","role":"band_hi","color":"#047857"}],
            "hlines":[{"value":755.0,"label":"Plan","role":"plan","color":"#6d28d9"},{"value":765.0,"label":"Spec max","role":"spec","color":"#b91c1c"}],
            "markers":[{"time_min":503,"kind":"cusum","label":"Change-point"},{"time_min":487,"kind":"regime_change","label":"R3→R2 settled"}],
            "use_case_ids":["UC-01","UC-11"]},
           {"panel_id":"residual","kind":"residual","title":"Residual (measured − expected) with ±3σ and CUSUM", "...":"..."},
           {"panel_id":"mv","kind":"mv","title":"Manipulated variables"},{"panel_id":"disturbance","kind":"disturbance"},{"panel_id":"yield","kind":"yield"}],
 "analysis":{"primary_tag":"LCO_T98_F","expected_source":"committee","residual_now":4.8,"sigma_now":1.6,"cusum_now":8.9,
             "breach_open":true,"first_breach_min":503,"minutes_before_next_lab":337,
             "root_cause":[{"tag":"dist_feed_API","label":"Feed API","contrib":2.1,"direction":"down"}],
             "events":[ ...events in window... ],
             "summary":{"en":"...","hinglish":"...","hi":"..."}},
 "models":{"committee":{ ...adaptation payload or null... },
           "surrogate":{"name":"regime_surrogate_v1","regime_id":"R2","inputs":[],"outputs":[],"r2":{"prod_LCO":0.91},"n_train_minutes":30540},
           "pinn_checks":[{"name":"Mass balance closure","value":0.4,"limit":1.0,"pass":true,"unit":"%"}],
           "gate":{"status":"ISSUED","reason":null,"w90":5.2,"w90_limit":14}},
 "regime":{ ...§1 payload... },
 "recipe":{ ...§4 payload... },
 "decisions":[ ...twin decisions_needed for this unit, each with recipe_id when E4 produced it... ],
 "citations":[...]}
```
`step` downsamples the window (LTTB or stride) so a 720-min window returns ≤ 400 points per key. Panel `kind` drives layout; trace `role` drives style (band = filled between `band_lo`/`band_hi`; `sigma3` drawn as ±; `cusum` on secondary axis). **No grey colours in `color`** — use the palette in §8.

## 6. `GET /api/twin` additions (L0)

```json
{"crude_slate":{"declared_api":23.3,"declared_regime_id":"R2","regime_id":"R2","regime_label":"...","p_max":0.84,"novelty":0.21,
                "transition_pct":100,"declared_vs_detected":"match","last_switch_min":427,"settled_min":487},
 "needs_attention":[{"unit_id":"unit_4_fractionator","severity":"warn","line":"LCO T98 +4.8 °F above expected since 08:23",
                     "consequence":"PA3 saturates in ~90 min; LCO yield −0.4 % feed if unadjusted","event_id":"..."}],
 "timeline":[{"time_min":427,"kind":"regime_change","unit_id":null,"label":"Crude switch started (R3→R2)"}],
 "units":[{"...existing...","events_open":1,"flags":1,"decisions_open":1,"kpi_vs_plan":{"label":"LCO T98","value":761.9,"plan":755,"tol":3,"unit":"°F","state":"WATCH"}}]}
```

## 7. Screen-scoped Gemini

`POST /api/copilot/chat` body `context` gains:
```json
{"page":"/twin/unit/unit_4_fractionator","screen":{"level":"L1","unit_id":"unit_4_fractionator","window_min":720},
 "run_id":"random_s144","time_min":600,"property":"LCO_T98_F","lang":"hi"}
```
Server behaviour (SDD-GEM-01..03): the system instruction states the open screen; for `L1` it embeds a **scope snapshot** (regime, residual/breach, recipe moves, open decisions, top tags) for that unit; for `L0`/other pages it embeds the plant snapshot (crude slate, needs_attention, unit statuses). Gemini may answer about anything in the refinery, but opens with the open screen's context. ADK: `get_scope_snapshot(run_id, time_min, unit_id|null)`, `get_regime`, `get_recipe` are added to `ALL_TOOLS` / `DECLS`; `root_agent.tools` stays at 8.
Suggestions (`suggestions(ctx)`) are screen-specific: L0 → plant questions; L1 → "Why is <primary tag> off?", "What does the recipe change?", "क्या यह पहले हुआ है?".

## 8. Trace palette (light / dark safe, no grey)

| role | colour |
|---|---|
| measured | `#1d4ed8` (blue) |
| expected / band | `#047857` (green) |
| plan | `#6d28d9` (violet) |
| spec | `#b91c1c` (red) |
| residual | `#0e7490` (teal) · sigma3 `#be185d` (rose) · cusum `#c2410c` (orange) |
| MVs | `#ea580c`, `#0f766e`, `#7c2d12`, `#4338ca` |
| disturbances | `#be185d`, `#9333ea`, `#0369a1` |
| yields | LCO `#1d4ed8`, HN `#047857`, LN `#ca8a04`, LPG `#9333ea`, slurry `#7c2d12` |

Grid, axes and borders may be grey; data traces may not.
