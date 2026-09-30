---
doc_id: SOP-FRAC-003
title: "LCO cut-point (T98) adjustment (event 5)"
doc_type: SOP
revision: 4
effective_date: 2026-02-10
owner_role: "Process engineer (fractionation)"
unit: FCC-21
status: SIMULATED
related_tags: ["LCO_T98_F", "SP_LCO_T98", "T_tray13_F", "MV_PA2", "prod_LCO", "cutpoint_auto"]
related_events: [5]
related_docs: ["IOW-FRAC-01", "SOP-APC-007", "SOP-LAB-008", "MOC-0118", "MOC-0131"]
summary: "Operating procedure for adjusting the Light Cycle Oil T98 distillation cut-point set point, enforcing move step limits and advisory spread gates."
---

> **SIMULATED DOCUMENT** — generated for a technical demo. Not an approved procedure or record.
## 1 Purpose

Governs the procedure for making controlled adjustments to the Light Cycle Oil (LCO) T98 distillation cut-point, utilizing advisory soft-sensor recommendations.

## 2 Scope

Applies to board operators and process control engineers modifying LCO product specification targets on FCC-21.

## 3 Safety and prerequisites

Verify current LCO T98 is within [IOW-FRAC-01 r2 §3.2]. Soft-sensor advisory deployment must comply with governance mandates in [MOC-0118 r1 §1] and spread criteria in [MOC-0131 r1 §1].

## 4 Procedure

Execute the following steps when adjusting LCO cut-point set point SP_LCO_T98 (Event Code 5).

### 4.1 Evaluate current LCO cut-point and cockpit advisory recommendations

4.1.1 Review current LCO_T98_F against target specification.
4.1.2 Inspect the soft-sensor advisory recommendation displayed in the cockpit interface.
4.1.3 Acknowledge that cockpit recommendations are advisory only; 'Accept' records the human decision and does not write to DCS.

### 4.2 Confirm advisory spread-gate status and model agreement

4.2.1 Check the 90% confidence interval width W90; if W90 > 14 °F, the spread gate is active.
4.2.2 If the cockpit displays 'Distribution spread too wide — no recommendation issued', no cut-point move is permitted.
4.2.3 Ensure the multi-model mixture is unimodal with consistent model agreement.

### 4.3 Apply incremental set-point adjustment to SP_LCO_T98

4.3.1 Adjust SP_LCO_T98 by no more than 5.0 °F per single step move.
4.3.2 Wait a minimum spacing of 30 minutes between consecutive set-point steps to allow column settling.
4.3.3 Implement the move via the board operator station with a standard 20-minute ramp.

### 4.4 Trim tray 13 draw temperature and pumparound PA2 flow

4.4.1 Monitor LCO draw tray temperature T_tray13_F; expect a response of 3 °F to 6 °F within 20 min.
4.4.2 Modulate pumparound circuit MV_PA2 as required to support the new section heat balance.

### 4.5 Monitor column separation profile and downstream product yield

4.5.1 Track product yield tag prod_LCO and check for secondary shifts in heavy naphtha endpoint.
4.5.2 Confirm cutpoint_auto status transitions appropriately during automated trim cycles.

### 4.6 Document set-point move and lock advisory record in logbook

4.6.1 Record initial SP, step magnitude, and final SP in the console handover log.
4.6.2 Log operator acceptance timestamp and soft-sensor confidence metrics.

## 5 Verification and lab confirmation

Obtain confirmation lab distillation per [SOP-LAB-008 r3 §4.1]. Soft-sensor tracking is verified against laboratory measurements per [SOP-APC-007 r1 §4.2]. If laboratory D86 T98 disagrees by more than R = 7 °F, recalibration protocols are triggered.

## 6 Abnormal conditions and escalation

If LCO T98 exceeds 760 °F, initiate immediate downward trim. If T98 reaches critical high 765 °F, refer to [IOW-FRAC-01 r2 §4] for emergency cooling and rate reduction. Escalate persistent off-spec states to Dr. Leila Haddad.

## 7 References

Fractionator IOW [IOW-FRAC-01 r2 §1] and Soft-Sensor Operating Rules [SOP-APC-007 r1 §1].

## 8 Revision history

Revision 4 approved 2026-02-10 by Dr. Leila Haddad; added advisory spread-gate 14 °F gating logic.
