---
doc_id: LAB-QC-02
title: "Lab result validation and reconciliation"
doc_type: LAB
revision: 1
effective_date: 2025-05-09
owner_role: "Lab supervisor"
unit: FCC-21
status: SIMULATED
related_tags: ["lab_sample", "LCO_T98_F", "HN_T98_F"]
related_events: []
related_docs: ["LAB-D86-01", "SOP-APC-007", "REF-STD-01"]
summary: "Quality assurance and statistical process control procedure for validating, reconciling, and screening laboratory distillation results on FCC-21."
---

> **SIMULATED DOCUMENT** — generated for a technical demo. Not an approved procedure or record.
## 1 Scope

Governs the statistical screening, validation, and authorization of laboratory distillation results before publishing to the refinery information system.

## 2 Method summary

Applies statistical control charts and comparison against process soft-sensor confidence intervals to classify results into ACCEPT, HOLD, or REJECT.

## 3 Sampling and handling

Requires continuous monitoring of standard control check samples run daily on each active distillation analyzer.

## 4 Procedure

Statistical validation sequence for laboratory distillation data.

### 4.1 Outlier screening and control chart checks

4.1.1 Compare daily control sample result against Shewhart control charts per ASTM D6299.
4.1.2 Apply Grubbs statistical test to identify experimental outliers.
4.1.3 Check for analyzer heating rate anomalies or thermocouple baseline drift.

### 4.2 Reconciliation with soft-sensor inferential predictions

4.2.1 Compare authorized lab D86 T98 value against soft-sensor P5–P95 interval from [SOP-APC-007 r1 §4.2].
4.2.2 Result classification:
- ACCEPT: Lab result falls within P5–P95 interval or within reproducibility R = 7.0 °F of median.
- HOLD: Deviation between 7.0 °F and 10.0 °F; requires secondary instrument verification.
- REJECT: Deviation > 10.0 °F or obvious analytical error; triggers immediate sample re-test.

## 5 Precision

Adheres to reproducibility R = 7.0 °F defined in [LAB-D86-01 r2 §5.1].

## 6 Result validation

Authorized results are posted to the console DCS and cockpit database. Discrepant values trigger joint review with APC engineer Marco Silva.

## 7 References

Distillation Method [LAB-D86-01 r2 §1], Cockpit SOP [SOP-APC-007 r1 §1], and ASTM D6299 [REF-STD-01 r1 §2.3].

## 8 Revision history

Revision 1 approved 2025-05-09 by Grace Mwangi; initial issue for closed-loop soft-sensor validation.
