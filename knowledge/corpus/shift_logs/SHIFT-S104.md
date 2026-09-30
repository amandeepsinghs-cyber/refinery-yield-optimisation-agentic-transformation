---
doc_id: SHIFT-S104
title: "FCC-21 Shift Operating Log — Campaign Run random_s104"
doc_type: SHIFT
revision: 1
effective_date: 2026-06-20
owner_role: "Shift supervisor (Hannah Clarke)"
unit: FCC-21
status: SIMULATED
related_tags: ["LCO_T98_F", "HN_T98_F", "SP_LCO_T98", "SP_HN_T98", "T_tray13_F", "T_tray06_F", "dist_feed_API", "feed_flow_lb_s", "Tr_riser_F", "lab_sample", "crude_id", "event_code"]
related_events: [1]
related_docs: ["SOP-FRAC-001", "SOP-FRAC-002", "SOP-FRAC-003", "SOP-APC-007", "SOP-LAB-008", "WO-25007"]
summary: "Operational shift handover log covering Crew D surveillance, event handling, and soft-sensor tracking on campaign run random_s104."
sim_run: random_s104
sim_window: [-120, 360]
---

> **SIMULATED DOCUMENT** — generated for a technical demo. Not an approved procedure or record.

## 1 Shift summary
Shift operational summary for Night Shift (22:00 to 06:00) on 2026-06-20. Crew D on duty: Supervisor Hannah Clarke, Board Operator Arjun Rao. Unit FCC-21 operated stably with scheduled event execution and continuous AI soft-sensor advisory tracking.

## 2 Unit status at handover
- Fresh feed throughput: nominal 165.0 lb/s with stable charge booster pressure.
- Reactor riser outlet temperature: nominal 969.0 °F; regenerator bed at 1250 °F.
- Fractionator overhead pressure: P5_frac_psia held at 24.9 psia per [SOP-FRAC-001 r3 §4.1].
- Soft-sensor cockpit status: GREEN trust active; spread gate open with W90 within normal limits.

## 3 Events and actions
- **2026-06-21 05:52 (time_min 352)**: Event 1 Crude change initiated. API gravity ramped from 25.00 to 28.50 over 60 min (crude_id -> 2). Board operator Arjun Rao implemented feed transition monitoring per [SOP-FRAC-002 r5 §4.2]. Cockpit advisory spread gate widened during initial transition; cut-point modifications held.

## 4 Lab results
- Scheduled sample draw occurred outside active shift window. Unit monitored via continuous soft-sensor inferentials per [SOP-APC-007 r1 §4.1].

## 5 Equipment and work orders
Ongoing surveillance associated with [WO-25007 r1 §1]. Equipment operational integrity verified; all pump mechanical seals, air blower guide vanes, and control valves throttled within normal operating envelopes with no open critical safety tags.

## 6 Handover notes
- Monitor post-crude transition stabilization per [SOP-FRAC-002 r5 §4.5]; verify dist_feed_API settles completely.
- Maintain soft-sensor surveillance on LCO cut recommendations; observe spread gate.
- Next routine laboratory distillation sample scheduled per [SOP-LAB-008 r3 §4.1].
- Keep intermediate pumparound PA2 balanced with product draw rate.