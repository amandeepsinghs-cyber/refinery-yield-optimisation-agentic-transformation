---
doc_id: SOP-FRAC-004
title: "Heavy naphtha cut-point (T98) adjustment (event 6)"
doc_type: SOP
revision: 2
effective_date: 2025-11-20
owner_role: "Process engineer (fractionation)"
unit: FCC-21
status: SIMULATED
related_tags: ["HN_T98_F", "SP_HN_T98", "T_tray06_F", "MV_PA1", "prod_HN", "cutpoint_auto"]
related_events: [6]
related_docs: ["IOW-FRAC-01", "SOP-APC-007", "SOP-LAB-008"]
summary: "Operating procedure for adjusting Heavy Naphtha T98 distillation endpoint, defining step limits and cockpit advisory interaction."
---

> **SIMULATED DOCUMENT** — generated for a technical demo. Not an approved procedure or record.
## 1 Purpose

Specifies the procedure for making controlled adjustments to the Heavy Naphtha (HN) T98 distillation endpoint on the main fractionator.

## 2 Scope

Covers console operators adjusting HN cut-points to meet reformer feed specifications.

## 3 Safety and prerequisites

Confirm operating status complies with [IOW-FRAC-01 r2 §3.1]. Ensure soft-sensor trust is GREEN or AMBER prior to initiating moves.

## 4 Procedure

Follow this sequence when executing HN cut-point moves (Event Code 6).

### 4.1 Review current heavy naphtha endpoint and quality targets

4.1.1 Inspect current indicated HN_T98_F against the target specification (nominal 530.3 °F).
4.1.2 Verify downstream reformer feed requirements and intermediate tankage ullage.

### 4.2 Validate cockpit advisory confidence and spread gate

4.2.1 Check cockpit status to verify spread gate is open and trust score is acceptable.
4.2.2 If the spread gate displays WITHHELD status, suspend set-point adjustment until uncertainty narrows.

### 4.3 Implement step changes on SP_HN_T98

4.3.1 Apply set-point adjustment to SP_HN_T98 with a maximum step size of 3.0 °F.
4.3.2 Enforce a mandatory wait interval of at least 30 minutes between moves.
4.3.3 Ramp the set-point move over a standard 20-minute period.

### 4.4 Adjust tray 6 draw temperature and top reflux duty

4.4.1 Observe heavy naphtha draw tray temperature T_tray06_F; verify response within 15 min.
4.4.2 Trim top pumparound MV_PA1 and top reflux ratio MV_reflux_ratio to maintain separation sharpness.

### 4.5 Monitor gasoline yield and downstream reformer feed specs

4.5.1 Track prod_HN yield tag and inspect wet gas compressor suction pressure.
4.5.2 Verify that cutpoint_auto mode functions smoothly when active.

### 4.6 Record set-point modification and operator rationale

4.6.1 Document time, initial SP, final SP, and cockpit confidence index in the electronic logbook.

## 5 Verification and lab confirmation

Verify adjustment via scheduled lab distillation per [SOP-LAB-008 r3 §4.1]. Check soft-sensor model tracking per [SOP-APC-007 r1 §4.2]; discrepancy must remain within R = 7 °F.

## 6 Abnormal conditions and escalation

If HN T98 exceeds standard high limit 535 °F, trim set point down immediately. If temperature approaches critical high limit 540 °F, execute escalation steps in [IOW-FRAC-01 r2 §4].

## 7 References

Fractionator IOWs [IOW-FRAC-01 r2 §1] and Cockpit SOP [SOP-APC-007 r1 §1].

## 8 Revision history

Revision 2 approved 2025-11-20 by Dr. Leila Haddad; tightened single-step move size from 5 °F to 3 °F.
