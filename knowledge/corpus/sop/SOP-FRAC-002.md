---
doc_id: SOP-FRAC-002
title: "Crude changeover on the FCC and fractionator (event 1)"
doc_type: SOP
revision: 5
effective_date: 2025-06-02
owner_role: "Operations superintendent"
unit: FCC-21
status: SIMULATED
related_tags: ["dist_feed_API", "crude_id", "LCO_T98_F", "HN_T98_F", "T_tray13_F", "T_tray06_F", "SP_LCO_T98", "SP_HN_T98", "MV_PA2"]
related_events: [1]
related_docs: ["IOW-FRAC-01", "SOP-FRAC-003", "SOP-LAB-008", "MOC-0124"]
summary: "Standard procedure governing operational adjustments and fractionator stabilization during FCC fresh feed crude switches and API gravity ramps."
---

> **SIMULATED DOCUMENT** — generated for a technical demo. Not an approved procedure or record.
## 1 Purpose

Specifies operational protocols for transitioning the FCC-21 unit between fresh feed crude slates, managing distillation cut impacts and preventing off-spec excursions.

## 2 Scope

Covers board operators and shift supervisors managing feed API gravity transitions and intermediate pumparound adjustments.

## 3 Safety and prerequisites

Ensure column operating parameters comply with [IOW-FRAC-01 r2 §3.2]. Verify crude tank alignment and analytical lab readiness in accordance with [MOC-0124 r1 §1].

## 4 Procedure

Follow this sequence when executing a planned crude changeover (Event Code 1).

### 4.1 Pre-changeover verification and feedstock alignment

4.1.1 Confirm target crude assay API gravity (between 20 and 29 API).
4.1.2 Verify tank farm suction alignment and upstream booster pump head.
4.1.3 Record baseline feed API on tag dist_feed_API and note current crude_id.

### 4.2 Initiate feed API ramp and crude identification index increment

4.2.1 Initiate the scheduled 60-minute feed API transition ramp.
4.2.2 Verify tag dist_feed_API moves toward the target slate at steady rate.
4.2.3 Observe increment in crude_id to index the new feed slate in unit automation.

### 4.3 Adjust column heat removal and intermediate pumparound duties

4.3.1 For heavy crude shifts (lower API), anticipate heavier gas oil loading; increase MV_PA2 duty proactively.
4.3.2 For light crude shifts (higher API), monitor top column vapor velocity and increase MV_PA1 duty.
4.3.3 Track tray 13 temperature T_tray13_F to counter transient thermal distortion within 20 min.

### 4.4 Stabilize heavy naphtha and light cycle oil draw rates

4.4.1 Maintain draw rates in proportion to altered cut yields.
4.4.2 Ensure stripper level controllers remain within 40% to 65% throttling range.

### 4.5 Enforce hold on product cut-point adjustments during crude transition

4.5.1 Freeze cut-point set points SP_LCO_T98 and SP_HN_T98 throughout the transition.
4.5.2 Do not attempt manual cut-point optimization until the 60-minute ramp is complete and column hydraulics restabilize.

### 4.6 Complete transition verification and log post-switch operating state

4.6.1 Confirm dist_feed_API has settled at the new steady target value.
4.6.2 Log completion time, final pumparound duties, and stable tray temperature profile.

## 5 Verification and lab confirmation

Request an expedited verification sample per [SOP-LAB-008 r3 §4.1] 60 minutes after ramp completion. Cut-point adjustments under [SOP-FRAC-003 r4 §4.1] must remain held until the first post-change lab distillation confirms product quality or the soft sensor establishes steady GREEN trust.

## 6 Abnormal conditions and escalation

If tray flooding or severe vapor carryover occurs, refer to [IOW-FRAC-01 r2 §4] and trim fresh feed rate. If product endpoints exceed standard operating windows, notify Operations superintendent Nadia Khan.

## 7 References

Fractionator Limits [IOW-FRAC-01 r2 §1] and Lab Frequency Protocol [MOC-0124 r1 §1].

## 8 Revision history

Revision 5 approved 2025-06-02 by Nadia Khan; updated mandatory 60-min hold rule following crude transition analysis.
