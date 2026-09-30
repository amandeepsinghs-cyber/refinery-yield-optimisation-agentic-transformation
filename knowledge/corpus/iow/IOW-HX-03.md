---
doc_id: IOW-HX-03
title: "Overhead condenser and pumparound heat-transfer windows"
doc_type: IOW
revision: 1
effective_date: 2025-01-22
owner_role: "Reliability engineer"
unit: FCC-21
status: SIMULATED
related_tags: ["dist_condenser_eff", "MV_cw_flow", "MV_PA1", "MV_PA2", "MV_PA3", "MV_PA4"]
related_events: []
related_docs: ["IOW-FRAC-01", "WO-24031", "REF-STD-01"]
summary: "Integrity operating windows for heat exchanger thermal efficiency, pumparound duty distribution, and condenser tube cooling water boundaries on FCC-21."
---

> **SIMULATED DOCUMENT** — generated for a technical demo. Not an approved procedure or record.
## 1 Scope

Defines heat transfer performance baselines and fouling monitoring thresholds for the overhead condensers and column pumparound circuits.

## 2 Definitions

Defines heat transfer coefficient degradation limits, minimum cooling water flow velocity, and thermal duty margins.

## 3 Operating windows

Operating limits for heat-transfer equipment. Values represent demo placeholders.

### 3.1 Overhead condenser thermal efficiency window

| Tag | Description | Crit Low | Std Low | Target | Std High | Crit High | Response Time | Operator Action |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| dist_condenser_eff | Condenser efficiency | 0.850 | 0.870 | 0.900 | 0.930 | 0.950 | 1 hour | Increase cooling water flow, check for tube fouling |

### 3.2 Condenser cooling water supply and return temperature window

| Tag | Description | Crit Low | Std Low | Target | Std High | Crit High | Response Time | Operator Action |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| MV_cw_flow | Cooling water flow rate | 240.0 | 270.0 | 298.9 | 330.0 | 360.0 | 15 min | Open cooling water trim valve |

### 3.3 Mid-column pumparound PA2 heat extraction window

| Tag | Description | Crit Low | Std Low | Target | Std High | Crit High | Response Time | Operator Action |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| MV_PA2 | PA2 pumparound duty | 180.0 | 200.0 | 216.5 | 235.0 | 250.0 | 20 min | Adjust PA2 circulation pump discharge |

### 3.4 Lower pumparound PA3 and slurry pumparound PA4 windows

Maintains lower column heat extraction on MV_PA3 and MV_PA4 to control bottoms reboiling and quench duties.

### 3.5 Exchanger tube velocity and fouling degradation margins

Monitors overall heat transfer coefficient UA decline across shell-and-tube bundles to plan maintenance cleaning.

## 4 Response to exceedance

When condenser efficiency drops below 0.870, initiate cooling water backflushing. If efficiency reaches critical low 0.850, schedule bundle cleaning per [WO-24031 r1 §1] and notify Owen Hartley.

## 5 References

Fractionator IOW [IOW-FRAC-01 r2 §1] and Heat Exchanger Maintenance Record [WO-24031 r1 §1].

## 6 Revision history

Revision 1 approved 2025-01-22 by Owen Hartley; initial baseline issue.
