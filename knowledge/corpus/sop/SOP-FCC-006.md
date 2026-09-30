---
doc_id: SOP-FCC-006
title: "Feed preheat temperature upsets (event 4)"
doc_type: SOP
revision: 2
effective_date: 2024-12-05
owner_role: "Process engineer (fractionation)"
unit: FCC-21
status: SIMULATED
related_tags: ["dist_T_feed_in_F", "Tr_riser_F", "Treg_F", "feed_flow_lb_s", "valve_V8"]
related_events: [4]
related_docs: ["IOW-FCC-02", "IOW-HX-03"]
summary: "Mitigation procedure for managing upstream feed preheat temperature excursions and restoring reactor thermal equilibrium."
---

> **SIMULATED DOCUMENT** — generated for a technical demo. Not an approved procedure or record.
## 1 Purpose

Provides actionable steps for identifying, mitigating, and stabilizing feed preheat temperature excursions on the FCC fresh feed train.

## 2 Scope

Covers operating personnel responding to feed temperature upsets (Event 4) affecting reactor heat balance.

## 3 Safety and prerequisites

Operating boundaries must adhere to [IOW-FCC-02 r2 §3.2] and preheat exchanger limits in [IOW-HX-03 r1 §3.1].

## 4 Procedure

Execute the following mitigation protocol upon detecting feed preheat deviations.

### 4.1 Identify feed preheat temperature deviations

4.1.1 Detect deviations in tag dist_T_feed_in_F from nominal 460.9 °F (disturbances of -20 °F to +10 °F).
4.1.2 Verify whether upset originated from upstream heat exchanger fouling or preheat furnace fuel gas pressure swings.
4.1.3 Assess rate of temperature decline over a 30-minute ramp window.

### 4.2 Adjust preheat furnace firing and convection bank dampers

4.2.1 Trim fuel gas firing rate to restore convection pass inlet temperatures.
4.2.2 Check stack draft and damper alignment to ensure complete combustion.

### 4.3 Modulate regenerated catalyst slide valve to sustain riser outlet temperature

4.3.1 As feed temperature drops, observe slide valve valve_V8 opening to increase hot catalyst circulation.
4.3.2 Monitor Tr_riser_F to prevent sudden chilling of the reaction mix.

### 4.4 Compensate regenerator dense bed temperature dynamics

4.4.1 Monitor regenerator bed temperature Treg_F for secondary cooling due to increased catalyst withdrawal.
4.4.2 Adjust combustion air flow to preserve catalyst regeneration kinetics.

### 4.5 Rebalance fractionator bottom pumparound duty

4.5.1 Reduce bottom pumparound heat removal if reactor effluent enthalpy drops.
4.5.2 Maintain slurry circulating temperature above minimum dew point.

### 4.6 Stabilize feed preheat loop at nominal 460.9 °F

4.6.1 Confirm dist_T_feed_in_F stabilizes at 460.9 °F.
4.6.2 Verify catalyst-to-oil ratio and slide valve differential pressure return to baseline.

## 5 Verification and lab confirmation

Verify reactor operating parameters return to compliant ranges in [IOW-FCC-02 r2 §3.1].

## 6 Abnormal conditions and escalation

If feed temperature drops more than 30 °F or slide valve reaches 85% stroke, activate emergency feed heating protocols in [IOW-FCC-02 r2 §4].

## 7 References

Reactor Windows [IOW-FCC-02 r2 §1] and Heat Exchanger Windows [IOW-HX-03 r1 §1].

## 8 Revision history

Revision 2 approved 2024-12-05 by Dr. Leila Haddad; added detailed slide valve modulation guidelines.
