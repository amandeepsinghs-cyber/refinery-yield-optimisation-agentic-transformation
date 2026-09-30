---
doc_id: IOW-FCC-02
title: "Reactor and regenerator operating windows"
doc_type: IOW
revision: 2
effective_date: 2025-07-14
owner_role: "Operations superintendent"
unit: FCC-21
status: SIMULATED
related_tags: ["Tr_riser_F", "SP_T_riser_ROT_F", "Treg_F", "fluegas_O2_pct", "feed_flow_lb_s"]
related_events: []
related_docs: ["IOW-FRAC-01", "SOP-FCC-005", "REF-STD-01"]
summary: "Integrity operating windows for FCC-21 reactor riser cracking severity, regenerator dense bed temperature, and catalyst circulation hydraulics."
---

> **SIMULATED DOCUMENT** — generated for a technical demo. Not an approved procedure or record.
## 1 Scope

Defines the operating envelope for the reactor and regenerator sections of FCC-21 to safeguard metallurgical limits and maintain stable combustion kinetics.

## 2 Definitions

Defines Level 1 target and standard boundaries, and Level 2 critical thresholds for catalyst thermal degradation and vessel refractory limits.

## 3 Operating windows

Operating limit tables for reactor severity and regenerator heat balance. All parameters are demo placeholders.

### 3.1 Riser outlet temperature and cracking severity window

| Tag | Description | Crit Low | Std Low | Target | Std High | Crit High | Response Time | Operator Action |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Tr_riser_F | Riser outlet temp (°F) | 945.0 | 960.0 | 969.0 | 975.0 | 985.0 | 5 min | Adjust catalyst slide valve position |
| feed_flow_lb_s | Fresh feed rate (lb/s) | 140.0 | 155.0 | 165.0 | 175.0 | 185.0 | 10 min | Modulate charge pump speed |

### 3.2 Feed preheat and reactor inlet enthalpy window

Monitors combined feed preheat temperature dist_T_feed_in_F at nominal 460.9 °F to balance riser vaporization duty.

### 3.3 Regenerator dense bed temperature and combustion window

| Tag | Description | Crit Low | Std Low | Target | Std High | Crit High | Response Time | Operator Action |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Treg_F | Regenerator bed temp (°F) | 1200.0 | 1230.0 | 1250.0 | 1280.0 | 1320.0 | 5 min | Trim torch oil and main air blower rate |

### 3.4 Flue gas oxygen and afterburn protection window

| Tag | Description | Crit Low | Std Low | Target | Std High | Crit High | Response Time | Operator Action |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| fluegas_O2_pct | Flue gas oxygen (%) | 0.5 | 1.0 | 1.8 | 2.5 | 3.5 | 2 min | Adjust air rate to prevent dilute-phase afterburn |

### 3.5 Catalyst circulation and slide valve differential pressure window

Maintains differential pressure across regenerated and spent catalyst slide valves above minimum fluidization margins.

## 4 Response to exceedance

Immediate actions include cutting feed rate, activating emergency quench steam, and adjusting combustion air blower vanes. Escalate to Operations superintendent Nadia Khan.

## 5 References

Throughput/ROT SOP [SOP-FCC-005 r3 §1] and API RP 584 [REF-STD-01 r1 §2.4].

## 6 Revision history

Revision 2 approved 2025-07-14 by Nadia Khan; tightened flue gas oxygen margins to prevent afterburn excursions.
