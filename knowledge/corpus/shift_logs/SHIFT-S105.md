---
doc_id: SHIFT-S105
title: "FCC-21 Shift Operating Log — Campaign Run random_s105"
doc_type: SHIFT
revision: 1
effective_date: 2026-06-26
owner_role: "Shift supervisor (Hannah Clarke)"
unit: FCC-21
status: SIMULATED
related_tags: ["LCO_T98_F", "HN_T98_F", "SP_LCO_T98", "SP_HN_T98", "T_tray13_F", "T_tray06_F", "dist_feed_API", "feed_flow_lb_s", "Tr_riser_F", "lab_sample", "crude_id", "event_code"]
related_events: [1, 2, 4, 6]
related_docs: ["SOP-FRAC-001", "SOP-FRAC-002", "SOP-FRAC-003", "SOP-APC-007", "SOP-LAB-008", "WO-25041"]
summary: "Operational shift handover log covering Crew D surveillance, event handling, and soft-sensor tracking on campaign run random_s105."
sim_run: random_s105
sim_window: [360, 840]
---

> **SIMULATED DOCUMENT** — generated for a technical demo. Not an approved procedure or record.

## 1 Shift summary
Shift operational summary for Day Shift (06:00 to 14:00) on 2026-06-26. Crew D on duty: Supervisor Hannah Clarke, Board Operator Arjun Rao. Unit FCC-21 operated stably with scheduled event execution and continuous AI soft-sensor advisory tracking.

## 2 Unit status at handover
- Fresh feed throughput: nominal 165.0 lb/s with stable charge booster pressure.
- Reactor riser outlet temperature: nominal 969.0 °F; regenerator bed at 1250 °F.
- Fractionator overhead pressure: P5_frac_psia held at 24.9 psia per [SOP-FRAC-001 r3 §4.1].
- Soft-sensor cockpit status: GREEN trust active; spread gate open with W90 within normal limits.

## 3 Events and actions
- **2026-06-26 07:11 (time_min 431)**: Event 2 Feed rate change. Fresh feed flow adjusted from 165.00 to 165.93 lb/s over 30 min per [SOP-FCC-005 r3 §4.2]. Rebalanced pumparound heat extraction per [SOP-FRAC-001 r3 §4.2].
- **2026-06-26 08:11 (time_min 491)**: Event 4 Feed temperature change. Feed preheat adjusted from 460.90 °F to 450.42 °F over 30 min per [SOP-FCC-006 r2 §4.1]. Compensated preheat furnace firing and catalyst slide valve position.
- **2026-06-26 09:20 (time_min 560)**: Event 6 HN T98 set-point change. SP_HN_T98 adjusted from 530.33 °F to 531.19 °F over 20 min per [SOP-FRAC-004 r2 §4.3]. Monitored top tray temperature and top reflux ratio.
- **2026-06-26 11:23 (time_min 683)**: Event 1 Crude change initiated. API gravity ramped from 25.00 to 28.06 over 60 min (crude_id -> 2). Board operator Arjun Rao implemented feed transition monitoring per [SOP-FRAC-002 r5 §4.2]. Cockpit advisory spread gate widened during initial transition; cut-point modifications held.

## 4 Lab results
- **2026-06-26 06:00 (time_min 360)**: Routine shift sample collected per [SOP-LAB-008 r3 §4.1]. Lab distillation report confirmed LCO_T98_F at 752.9 °F (spec limit 765.0 °F) and HN_T98_F at 529.5 °F (spec limit 540.0 °F).
  - Reconciliation per [SOP-APC-007 r1 §4.2]: Soft-sensor estimate matched lab D86 measurement within ±2.5 °F, well within lab reproducibility R = 7.0 °F. Status: ACCEPT.

## 5 Equipment and work orders
Ongoing surveillance associated with [WO-25041 r1 §1]. Equipment operational integrity verified; all pump mechanical seals, air blower guide vanes, and control valves throttled within normal operating envelopes with no open critical safety tags.

## 6 Handover notes
- Monitor post-crude transition stabilization per [SOP-FRAC-002 r5 §4.5]; verify dist_feed_API settles completely.
- Maintain soft-sensor surveillance on LCO cut recommendations; observe spread gate.
- Next routine laboratory distillation sample scheduled per [SOP-LAB-008 r3 §4.1].
- Keep intermediate pumparound PA2 balanced with product draw rate.