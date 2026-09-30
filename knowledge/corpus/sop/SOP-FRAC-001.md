---
doc_id: SOP-FRAC-001
title: "Fractionator normal operation and monitoring"
doc_type: SOP
revision: 3
effective_date: 2025-09-15
owner_role: "Process engineer (fractionation)"
unit: FCC-21
status: SIMULATED
related_tags: ["P5_frac_psia", "T_tray01_F", "T_tray06_F", "T_tray13_F", "T_tray20_F", "MV_PA1", "MV_PA2", "MV_PA3", "MV_PA4", "MV_reflux_ratio", "MV_cw_flow", "LCO_T98_F", "HN_T98_F"]
related_events: []
related_docs: ["IOW-FRAC-01", "IOW-HX-03", "SOP-APC-007", "SOP-LAB-008", "LAB-QC-02"]
summary: "Standard operating procedure for routine main fractionator monitoring, hydraulic stability, pumparound heat extraction, and product cut-point surveillance on FCC-21."
---

> **SIMULATED DOCUMENT** — generated for a technical demo. Not an approved procedure or record.
## 1 Purpose

This procedure defines operational requirements for continuous monitoring of the FCC-21 main fractionator to ensure hydraulic stability, sharp product fractionation, and equipment integrity.

## 2 Scope

Applies to board operators and fractionation engineers supervising column pressure, tray temperatures, pumparound circuits, and distillation cuts.

## 3 Safety and prerequisites

Confirm all operating parameters are within integrity windows [IOW-FRAC-01 r2 §3.1] and [IOW-HX-03 r1 §3.2]. The soft-sensor cockpit must indicate GREEN or AMBER trust before adjusting baseline controller set points.

## 4 Procedure

Execute the following continuous monitoring and verification sequence on each 8-hour shift.

### 4.1 Monitor main fractionator pressure and overhead temperature

4.1.1 Verify fractionator overhead pressure P5_frac_psia remains stable at nominal 24.9 psia within ±0.5 psia.
4.1.2 Check overhead vapor temperature T_tray01_F at nominal 310.7 °F; ensure deviations do not exceed 3 °F over 15 min.
4.1.3 Inspect wet gas compressor suction pressure to verify stable column differential pressure.

### 4.2 Supervise pumparound duty distribution

4.2.1 Verify heat extraction across circuits MV_PA1, MV_PA2, MV_PA3, and MV_PA4 meets standard enthalpy balance profiles.
4.2.2 Ensure top pumparound MV_PA1 maintains column top internal reflux without inducing tray weeping.
4.2.3 Confirm mid-column pumparound MV_PA2 maintains LCO section thermal gradient within ±2 °F of target.

### 4.3 Track bottom slurry circulation and column differential pressure

4.3.1 Maintain bottoms quench circulation to prevent thermal coking in the bottom sump and grid trays.
4.3.2 Monitor column total differential pressure across bottom tray 20 T_tray20_F and tray 1 to detect incipient entrainment.

### 4.4 Oversee stripping steam injection rates

4.4.1 Ensure side-stripper superheated steam rates to the LCO and HN strippers meet minimum mass flow ratios.
4.4.2 Confirm stripper bottom liquid seals are intact to prevent vapor blow-through.

### 4.5 Log product draw temperatures and hydraulic loading

4.5.1 Log heavy naphtha draw tray temperature T_tray06_F at nominal 363.4 °F.
4.5.2 Log light cycle oil draw tray temperature T_tray13_F at nominal 476.4 °F.
4.5.3 Verify product draw control valves operate in their linear throttling band (30% to 75% opening).

### 4.6 Cross-check board indications against field transmitter pairs

4.6.1 Compare DCS indicated tray temperatures against redundant field thermocouples.
4.6.2 Investigate any sensor pair divergence exceeding 2.0 °F immediately to prevent unobserved cut-point drift.

## 5 Verification and lab confirmation

Routine lab samples must be drawn per [SOP-LAB-008 r3 §4.1] at scheduled shift intervals (06:00, 14:00, 22:00). Laboratory distillation results are reconciled via [LAB-QC-02 r1 §4.2]. If the difference between lab D86 T98 and the soft-sensor prediction exceeds reproducibility R = 7 °F, flag potential sensor drift.

## 6 Abnormal conditions and escalation

If soft-sensor trust degrades to RED, or if the spread gate displays 'Distribution spread too wide — no recommendation issued', hold all advisory moves. If lab discrepancy exceeds R = 7 °F, switch cut-point controllers to manual and notify the fractionation engineer Dr. Leila Haddad. During active crude changeovers, suspend non-essential set-point adjustments.

## 7 References

Fractionator Operating Windows [IOW-FRAC-01 r2 §1] and Soft-Sensor Guidance [SOP-APC-007 r1 §1].

## 8 Revision history

Revision 3 approved 2025-09-15 by Dr. Leila Haddad; incorporated refined pumparound balance criteria and advisory cockpit integration.
