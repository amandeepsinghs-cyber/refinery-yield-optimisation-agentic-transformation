---
doc_id: SOP-FCC-005
title: "Riser outlet temperature and feed-rate changes (events 2, 3)"
doc_type: SOP
revision: 3
effective_date: 2025-03-18
owner_role: "Operations superintendent"
unit: FCC-21
status: SIMULATED
related_tags: ["Tr_riser_F", "SP_T_riser_ROT_F", "feed_flow_lb_s", "Treg_F", "fluegas_O2_pct", "conversion_pct"]
related_events: [2, 3]
related_docs: ["IOW-FCC-02", "SOP-FRAC-001"]
summary: "Standard operating procedure for executing controlled changes to reactor riser outlet temperature and fresh feed throughput on FCC-21."
---

> **SIMULATED DOCUMENT** — generated for a technical demo. Not an approved procedure or record.
## 1 Purpose

Defines the operating procedure for modifying reactor riser outlet temperature (ROT) and unit fresh feed rate while preserving heat balance and catalyst circulation stability.

## 2 Scope

Applies to operations supervisors and board operators manipulating reactor severity and throughput on FCC-21.

## 3 Safety and prerequisites

Verify reactor and regenerator parameters reside within windows specified in [IOW-FCC-02 r2 §3.1]. Ensure air blower capacity and wet gas compressor margins are verified.

## 4 Procedure

Follow these sequential steps when adjusting throughput (Event 2) or ROT (Event 3).

### 4.1 Verify reactor inventory and regenerator thermal balance

4.1.1 Verify regenerator dense bed temperature Treg_F is stable at nominal 1250 °F.
4.1.2 Confirm flue gas oxygen fluegas_O2_pct is between 1.0% and 2.5%.
4.1.3 Check catalyst standpipe differential pressure and slide valve positions.

### 4.2 Implement fresh feed flow rate ramp

4.2.1 Execute feed rate changes on tag feed_flow_lb_s within ±5% of nominal 165 lb/s.
4.2.2 Apply a linear 30-minute ramp rate to prevent hydraulic surges in the fractionator.
4.2.3 Coordinate with preheat furnace firing to preserve feed inlet temperature.

### 4.3 Adjust riser outlet temperature set point

4.3.1 Adjust SP_T_riser_ROT_F within nominal 969 °F ±5 °F.
4.3.2 Implement adjustments using a 10-minute linear ramp.
4.3.3 Observe riser top thermocouple Tr_riser_F tracking the set point smoothly.

### 4.4 Coordinate combustion air and catalyst slide valve positioning

4.4.1 Modulate catalyst slide valve to sustain target catalyst-to-oil ratio.
4.4.2 Trim main combustion air blower to balance carbon burn rate and prevent afterburning.

### 4.5 Compensate fractionator heat balance and pumparound extraction

4.5.1 Pre-adjust fractionator pumparounds per [SOP-FRAC-001 r3 §4.1] in anticipation of vapor rate shifts.
4.5.2 Counteract transient endpoint drift caused by altered crack conversion conversion_pct.

### 4.6 Document reactor severity shift and verify steady state conversion

4.6.1 Log final feed rate, ROT set point, regenerator bed temperature, and conversion index.

## 5 Verification and lab confirmation

Verify fractionator profile stability under [SOP-FRAC-001 r3 §4.1] following any ROT or throughput change.

## 6 Abnormal conditions and escalation

If regenerator temperature exceeds 1300 °F or air blower reaches surge limit, reverse moves per [IOW-FCC-02 r2 §4] and notify Nadia Khan.

## 7 References

Reactor/Regenerator IOW [IOW-FCC-02 r2 §1].

## 8 Revision history

Revision 3 approved 2025-03-18 by Nadia Khan; refined ramp rates and slide valve throttling constraints.
