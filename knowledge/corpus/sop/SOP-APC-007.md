---
doc_id: SOP-APC-007
title: "Using soft-sensor estimates and cockpit recommendations"
doc_type: SOP
revision: 1
effective_date: 2026-05-04
owner_role: "APC / soft-sensor engineer"
unit: FCC-21
status: SIMULATED
related_tags: ["LCO_T98_F", "HN_T98_F", "SP_LCO_T98", "SP_HN_T98", "T_tray13_F", "T_tray06_F"]
related_events: []
related_docs: ["MOC-0118", "MOC-0131", "LAB-QC-02", "IOW-FRAC-01"]
summary: "Standard procedure governing the operator interaction with the AI soft-sensor advisory cockpit, trust levels, and recommendation validation."
---

> **SIMULATED DOCUMENT** — generated for a technical demo. Not an approved procedure or record.
## 1 Purpose

Establishes operating rules and governance for using the real-time AI soft-sensor cockpit for fractionator cut-point optimization.

## 2 Scope

Applies to all FCC-21 console operators, APC engineers, and process supervisors interacting with the advisory cockpit.

## 3 Safety and prerequisites

Soft-sensor deployment operates strictly under advisory governance defined in [MOC-0118 r1 §1] and uncertainty boundaries in [MOC-0131 r1 §1]. No automated write commands are permitted to the DCS.

## 4 Procedure

Follow this sequence when reviewing and acting on cockpit recommendations.

### 4.1 Interpret soft-sensor inferential distributions and P5 to P95 confidence intervals

4.1.1 Inspect the estimated distillation curve for LCO_T98_F and HN_T98_F on the main cockpit dashboard.
4.1.2 Review the 90% confidence interval defined by the 5th percentile (P5) and 95th percentile (P95) boundaries.
4.1.3 Compute the interval width W90 = P95 - P5.

### 4.2 Evaluate trust classification levels

4.2.1 GREEN Trust: All input sensors healthy, models concordant, W90 ≤ 10 °F. Recommendations fully active.
4.2.2 AMBER Trust: Minor sensor drift or moderate disagreement, 10 °F < W90 ≤ 14 °F. Operator must exercise increased surveillance.
4.2.3 RED Trust: Sensor fault, severe collinearity breakdown, or W90 > 14 °F. Advisory output suspended.

### 4.3 Validate spread-gate criterion and ensemble distribution width

4.3.1 Enforce spread-gate limit W90 ≤ 14 °F (set at twice the lab reproducibility R = 7 °F).
4.3.2 Check for multimodal or bimodal distributions indicating disagreement between PINN and Gaussian Process sub-models.

### 4.4 Handle withheld recommendation status

4.4.1 If W90 > 14 °F or bimodality is detected, verify the cockpit banner states: 'Distribution spread too wide — no recommendation issued'.
4.4.2 In withheld state, operators are prohibited from making speculative cut-point adjustments.
4.4.3 Promptly request an off-schedule lab sample to anchor model reconciliation.

### 4.5 Execute operator recommendation review

4.5.1 When a valid recommendation is displayed, review proposed set-point adjustment magnitude.
4.5.2 Operator evaluates plant constraints and clicks 'Accept' or 'Decline'.
4.5.3 Clicking 'Accept' logs the administrative decision; the operator then manually inputs the set-point move into DCS per [IOW-FRAC-01 r2 §3.2].

### 4.6 Review citation links and contextual operational evidence

4.6.1 Inspect hyperlinked procedure steps and historical records provided with the card.
4.6.2 Verify that contextual references support the proposed move before execution.

## 5 Verification and lab confirmation

Cross-check cockpit predictions against incoming laboratory results reconciled via [LAB-QC-02 r1 §4.2]. Any persistent deviation exceeding R = 7 °F triggers an APC model investigation.

## 6 Abnormal conditions and escalation

If trust drops to RED during transient operations, revert to manual cut-point guidance and inform APC engineer Marco Silva. For column instability, adhere to [IOW-FRAC-01 r2 §4].

## 7 References

Advisory Governance [MOC-0118 r1 §1], Spread Gate Criteria [MOC-0131 r1 §1], and QA Protocol [LAB-QC-02 r1 §1].

## 8 Revision history

Revision 1 approved 2026-05-04 by Marco Silva; initial baseline issue for advisory cockpit deployment.
