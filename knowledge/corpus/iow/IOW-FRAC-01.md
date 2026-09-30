---
doc_id: IOW-FRAC-01
title: "Fractionator integrity operating windows"
doc_type: IOW
revision: 2
effective_date: 2025-10-01
owner_role: "Process engineer (fractionation)"
unit: FCC-21
status: SIMULATED
related_tags: ["LCO_T98_F", "HN_T98_F", "T_tray13_F", "T_tray06_F", "P5_frac_psia"]
related_events: []
related_docs: ["IOW-HX-03", "SOP-FRAC-001", "REF-STD-01"]
summary: "Integrity operating windows and safe design envelopes for main fractionator column pressure, temperatures, and product distillation cut limits on FCC-21."
---

> **SIMULATED DOCUMENT** — generated for a technical demo. Not an approved procedure or record.
## 1 Scope

Defines standard and critical operating boundaries for the FCC-21 main fractionator to prevent column weeping, tray flooding, downcomer backup, and product off-specification events.

## 2 Definitions

Standard High/Low (Level 1): Operating range within which normal closed-loop and operator control is maintained.
Critical High/Low (Level 2): Safety or mechanical limit requiring immediate operator intervention to prevent asset damage or rapid off-spec product generation.

## 3 Operating windows

The following integrity operating windows apply under steady and transient operations. All numeric parameters are designated as demo placeholders.

### 3.1 Heavy naphtha distillation cut window

| Tag | Description | Crit Low | Std Low | Target | Std High | Crit High | Response Time | Operator Action |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| HN_T98_F | HN 98% cut point (°F) | 510.0 | 520.0 | 530.3 | 535.0 | 540.0 | 15 min | Trim top reflux ratio and adjust draw rate |
| T_tray06_F | HN draw tray temp (°F) | 345.0 | 355.0 | 363.4 | 372.0 | 380.0 | 15 min | Modulate MV_PA1 duty |

### 3.2 Light cycle oil distillation cut window

| Tag | Description | Crit Low | Std Low | Target | Std High | Crit High | Response Time | Operator Action |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| LCO_T98_F | LCO 98% cut point (°F) | 730.0 | 740.0 | 755.3 | 760.0 | 765.0 | 20 min | Increase MV_PA2 duty and lower draw rate |
| T_tray13_F | LCO draw tray temp (°F) | 455.0 | 465.0 | 476.4 | 485.0 | 495.0 | 20 min | Trim PA2 cooling water |

### 3.3 Fractionator intermediate tray temperature windows

Maintains tray internal thermal profile to preserve stage separation efficiency across trays 7 through 12.

### 3.4 Column overhead operating pressure window

| Tag | Description | Crit Low | Std Low | Target | Std High | Crit High | Response Time | Operator Action |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| P5_frac_psia | Overhead pressure (psia) | 22.0 | 23.5 | 24.9 | 26.0 | 27.5 | 5 min | Check wet gas compressor bypass valve |

### 3.5 Tower differential pressure and flooding margins

Monitors total column differential pressure across bottoms and overhead to detect incipient jet flooding or tray weeping.

## 4 Response to exceedance

Upon Level 1 exceedance, board operators must trim set points within 15 minutes. Upon Level 2 critical exceedance, operators must immediately reduce unit throughput, maximize quench duties, and notify Dr. Leila Haddad.

## 5 References

Standard Fractionator Operation [SOP-FRAC-001 r3 §1], Heat Transfer IOW [IOW-HX-03 r1 §1], and API RP 584 [REF-STD-01 r1 §2.4].

## 6 Revision history

Revision 2 approved 2025-10-01 by Dr. Leila Haddad; harmonized critical high thresholds with downstream reformer and hydrotreater limits.
