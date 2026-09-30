# Problem Statement: Delayed Product-Quality Feedback in FCC, RFCC, and INDMAX Units

> **Document scope:** This document defines the *problem* and its *technical impact*. The proposed solution (inferential models, closed-loop integration, agentic layer, GCP architecture) is in [fcc_ai_driven_soft_sensor_solutions.md](fcc_ai_driven_soft_sensor_solutions.md).

---

## 1. Executive Summary

**Refiners run FCC-family units and their downstream hydrotreaters "blind" for 4–12 hours between lab results. They pay for that blindness by over-treating most of the time and still getting caught by off-spec events some of the time.**

- **What is broken:** Key product-quality properties are measured mainly by off-line lab tests with multi-hour latency. These include sulfur and nitrogen in cracked products, and distillation cut points (T95, flash point). Feed quality changes faster than that.
- **The consequence:**
  - Downstream hydrotreaters run with wide, conservative severity margins (extra H₂, octane loss, shorter catalyst cycles).
  - Fractionator cut points carry quality giveaway.
  - Unannounced feed swings still cause occasional off-spec batches.
- **Why existing fixes fall short:**
  - Online analyzers cover only some streams and need constant upkeep.
  - Commercial inferential ("soft sensor") models exist, but their accuracy degrades without sustained expert maintenance. In practice many end up detuned or switched off.
- **The opportunity:** A continuously accurate, self-maintaining, cross-unit view of product quality. This means inferentials *plus* an agentic layer that keeps them healthy and turns FCC quality predictions into downstream hydrotreater and blending decisions.

---

## 2. Process Context

Fluid catalytic cracking is the main heavy-oil conversion unit in most fuels refineries. It upgrades vacuum gas oil (VGO) and residue into LPG, gasoline, and distillate blendstocks. There are three main variants:

| Variant | Typical feed | Typical severity | Distinguishing features |
|---|---|---|---|
| **FCC** | VGO, hydrotreated VGO | Riser outlet temperature (ROT) ≈ $495\text{–}545^\circ\text{C}$, catalyst-to-oil ratio (C/O) ≈ 4–8 | Y-zeolite catalyst; gasoline-oriented |
| **RFCC** | Atmospheric residue (ATB), VGO/resid blends (CCR often > 4 wt%, high Ni/V) | Similar ROT, C/O ≈ 6–10 | Two-stage regeneration and/or catalyst coolers; metals-tolerant catalyst |
| **INDMAX** (IndianOil / Lummus) | VGO and residue blends | ROT ≈ $560\text{–}600^\circ\text{C}$, C/O ≈ 12–20 | High-severity, light-olefin-maximizing; proprietary catalyst with shape-selective additives; high propylene yields (licensor-reported ≈ 20+ wt%, *verify against licensor data for the target unit*) |

### 2.1 Products and Where Quality Is Actually Decided

Riser effluent goes to the **main fractionator**, which separates it into:

- **Wet gas / LPG** (to the gas concentration unit). Contains most of the H₂S.
- **FCC naphtha (cracked gasoline):** olefin-rich and high-octane. Contains hundreds to a few thousand ppm sulfur.
- **Light Cycle Oil (LCO):** highly aromatic, low cetane. Typically ≈ 0.2–3 wt% sulfur, depending on feed pretreatment.
- **Heavy Cycle Oil (HCO):** often pumped around or recycled.
- **Clarified / Decant Oil (CLO / slurry):** contains catalyst fines. Goes to fuel oil, bunker blending, or carbon black feed.

```
                     FEED (VGO / ATB / CHGO recycle)
                                  |
                                  v
                    +---------------------------+
                    |   RISER / REACTOR (2-4 s)  |<---- Regenerator (heat, coke burn)
                    +---------------------------+
                                  |
                                  v
                    +---------------------------+
                    |     MAIN FRACTIONATOR      |  (10-30 min liquid dynamics)
                    +---------------------------+
        |             |              |               |
        v             v              v               v
    Wet gas/LPG   FCC Naphtha       LCO          CLO / Slurry
   (H2S -> amine  |                 |              |
    -> SRU)       v                 v              v
            Selective naphtha    Diesel HDT     Fuel oil / bunker /
            HDS (post-treat)     (DHDT/DHDS)    carbon black feed
                  |                 |
                  v                 v
           GASOLINE POOL       DIESEL POOL    <-- 10 wt ppm S specs apply HERE
```

**Key point:** The **10 wt ppm sulfur specifications** (Euro V: EN 228 / EN 590; India: BS-VI; US Tier 3 gasoline ≈ 10 ppm average / ULSD 15 ppm) apply to **finished, hydrotreated fuels**, not to raw FCC streams. So the impact of knowing FCC product quality early is mostly realized **downstream**, in the hydrotreaters and blending. The fractionator itself controls **cut points** (T95, flash point, end point), not sulfur content.

### 2.2 Sulfur Distribution Across the Unit (Indicative)

| Sulfur sink | Typical share of feed sulfur | Notes |
|---|---|---|
| H₂S (dry gas / LPG) | ≈ 40–60% | Removed by amine treating; sent to the sulfur recovery unit (SRU) |
| Coke (burned in regenerator → SOx) | ≈ 5–10% | Drives SOx emissions / SOx additive demand |
| LCO | Large share of the liquid-product sulfur | Refractory thiophenics / dibenzothiophenes |
| CLO / slurry | Significant for resid feeds | Condensed aromatic thiophenes |
| FCC naphtha | Smallest share of liquid products, but most quality-sensitive (octane, olefins) | Thiophenes, alkylthiophenes; must be desulfurized without saturating olefins |

*These are indicative ranges. They vary with feed type, catalyst, and severity, and should be calibrated against unit-specific sulfur balances.*

---

## 3. Why Quality Feedback Is Slow or Unreliable

### 3.1 Laboratory Latency
- **Sulfur:** ASTM D4294 (EDXRF), D5453 (UV fluorescence), D2622 (WDXRF).
- **Nitrogen:** ASTM D4629 / D5762.
- **Distillation:** ASTM D86, D2887 / D7169 (simulated distillation).
- **Total delay:** sampling, transport, queuing, testing, and LIMS entry together typically take **4–12 hours**. Lab sampling is usually once per shift or once per day. So the control system and operators react to conditions that ended hours ago.

### 3.2 Online Analyzer Limits
Online XRF/UVF sulfur analyzers and NIR/distillation analyzers work well on **clean light streams**, including hydrotreater products. Their limits:
- **Coverage gaps:** Heavy, fines-laden streams (HCO, CLO) cause sample-system plugging and fouling. Many units don't have analyzers on intermediate FCC streams at all.
- **Availability:** Analyzers need regular calibration and maintenance, and outages leave control loops without feedback.
- **Validation gap:** When an analyzer drifts, there is often no independent real-time reference to catch it.

### 3.3 Feed Volatility and Refractory Species
- Crude slate changes and changing recycle streams alter FCC feed quality within minutes to hours. Recycles include coker heavy gas oil (CHGO), ATB, and hydrocracker bottoms.
- **Refractory sulfur:** Alkylated dibenzothiophenes, notably **4,6-DMDBT**, concentrate in LCO. Their methyl groups sterically hinder direct desulfurization in downstream hydrotreaters, so small shifts in them have an outsized effect on required hydrotreater severity.
- **Nitrogen inhibition:** Basic nitrogen compounds (quinolines, acridines) and carbazoles in cracked stocks inhibit hydrodesulfurization (HDS) by competing for active sites.
- **Result:** Once-per-shift lab data cannot resolve these dynamics.

### 3.4 Existing Inferentials Degrade Without Sustained Care
Many refineries already run inferential models inside their APC suites. In practice:
- **Drift:** Models drift as catalyst activity, feed mix, fouling, and instruments change.
- **Bias-update errors:** Bias updates corrupted by **mis-timestamped lab samples** or outlier results are a common failure mode.
- **Maintenance gap:** Maintenance depends on scarce APC engineers. When confidence drops, operators detune or disable the inferential, and the unit falls back to lab-lag operation.
- **Siloed use:** Inferentials usually serve one unit's controller. FCC quality information is rarely passed forward, as a feed-forward signal, to hydrotreater severity or blending decisions.

---

## 4. Technical Consequences

```
                    4–12 h QUALITY BLIND SPOT
                              |
        +---------------------+----------------------+
        |                     |                      |
        v                     v                      v
   OVER-TREATING        CUT-POINT GIVEAWAY      UNDER-TREATING
  (hydrotreaters)       (fractionator)         (missed swings)
        |                     |                      |
  - Excess H2 use       - Distillate lost to   - Off-spec tanks
  - Octane loss in        CLO / naphtha        - Re-blending / reprocessing
    naphtha HDS         - Flash / T95 margin   - Shipping delays     
  - Higher WABT,          held wide            - Product downgrade
    shorter cycles
```

### 4.1 Over-Treating (Most Frequent, Largest Cumulative Impact)
Operators set hydrotreater severity for a *worst-case* feed they cannot see.
- **Excess hydrogen consumption:** Running above the needed severity saturates aromatics beyond what the sulfur spec requires. This uses H₂ without improving product quality, and H₂ is often the refinery's constrained utility.
- **Octane loss (FCC naphtha):** Selective naphtha HDS unavoidably saturates some olefins. Extra severity raises the octane loss, which then has to be made up through reformer severity, alkylate/isomerate, or purchased octane (e.g., MTBE/ETBE where permitted).
- **Catalyst life:** Higher weighted average bed temperature (WABT) speeds up coking and deactivation of the CoMo/NiMo catalyst. That shortens run length and brings turnarounds and catalyst change-outs forward.

### 4.2 Fractionator Cut-Point Giveaway
Without timely T95 / flash / end-point information, operators hold cut points conservatively. That leaves distillate in CLO, or pushes heavy naphtha into LCO. These are small percentages on large flows, so the yield loss adds up continuously.

### 4.3 Under-Treating (Infrequent, High Impact)
Undetected feed swings, such as a sulfur or nitrogen spike from a recycle change, can push finished product off-spec. The consequences:
- Tank downgrade, re-blending, or reprocessing (uses up tank capacity and hydrotreater capacity).
- Shipping delays and regulatory exposure.
- Nitrogen breakthrough that inhibits or deactivates downstream catalysts (hydrocracker pretreat, reformer feed pretreatment).

### 4.4 INDMAX-Specific: Constraint Operation
INDMAX units run near several limits at once: wet gas compressor capacity, main air blower capacity, regenerator temperature, and fractionator hydraulics. Delayed quality information forces operators to leave extra distance from these limits. That reduces light-olefin (propylene) throughput, which is the unit's main performance target.

---

## 5. Technical Impact Metrics (Template)

Improvement claims must be built bottom-up for each site, in physical units only (no prices or costs). Use the template below with unit-specific data. Indicative ranges come from typical APC/inferential studies and **must be validated**.

| Technical metric | Measure | Key inputs to collect | Indicative range* |
|---|---|---|---|
| H₂ saved in hydrotreaters | $\Delta H_2$ [scf/bbl] vs. baseline | DHDT/naphtha HDS feed rates, H₂ consumption vs. severity curves | A few % of hydrotreater H₂ use |
| Octane preserved | $\Delta$RON across naphtha HDS vs. baseline | Naphtha HDS olefin-saturation vs. severity, lab RON in/out | ≈ 0.3–1 RON on FCC naphtha |
| Cut-point giveaway | $\Delta$ distillate yield [%] and margin to spec [°F] vs. baseline | Current vs. achievable T95/flash margins | ≈ 0.2–1% yield shift |
| Off-spec avoidance | Off-spec event count per quarter vs. baseline | Historical off-spec events, re-blend volumes | Site-specific |
| Catalyst cycle extension | $\Delta$ cycle length [months], $\Delta$WABT [°C] | WABT history, deactivation rate | Site-specific |
| INDMAX constraint pushing | $\Delta$ propylene yield [wt%] | Distance to compressor/blower limits | Site-specific |

\* *Indicative only. Replace with site data before any external use.*

---

## 6. Decisions to Support and Nature of the Problem

### 6.1 The Decisions
| Decision | Who / how often | Information needed |
|---|---|---|
| **D1. How hard to hydrotreat the next few hours of FCC product** (WABT, H₂/oil) | DHDT / naphtha HDS operator or MPC, hourly | LCO / naphtha sulfur and nitrogen, now and 1–3 h ahead |
| **D2. Where to set fractionator cut points** | Fractionator MPC, every few minutes | LCO T95 / flash point, naphtha end point |
| **D3. Can I act on the estimate, or must I wait for the lab?** | Operator, continuously | A calibrated confidence level |

D1 has the largest process impact. D3 decides whether D1 and D2 are used at all.

> [!NOTE]
> The demo leads with D2 and D3 because the simulator has no sulfur; D1 value is proven on client data in the offline backtest (DECISIONS.md S1, S4).

### 6.2 Nature of the Analytical Problem
- **Input-output time-series problem.** In time-series terms this is a **multi-input, single-output transfer-function (distributed-lag) regression**. Product quality responds to process inputs after known physical delays (seconds in the riser, 10–30 min in the fractionator).
- **Severe label scarcity.** Two years of history give about 1,000,000 minutes of process data but only **about 1,000–2,000 lab results**. Only the labeled rows can train a prediction, which strictly limits model complexity.
- **Non-stationary relationships.** The input-output relationship shifts with crude family, operating mode, and catalyst campaign (**regimes**). A model can only learn patterns present in the data. It must therefore describe the feed by measurable properties (e.g., assay sulfur by boiling range), model regime differences explicitly, and **detect** situations its training data cannot explain.
- **Trust is a requirement, not a nice-to-have.** Operators act on an estimate only if its confidence is visible and proven accurate over time.

---

## 7. Problem Scope and Success Criteria

### 7.1 In Scope
- FCC / RFCC / INDMAX main-fractionator products: **naphtha, LCO, HCO/CLO**.
- Quality properties: **sulfur** (naphtha, LCO), **nitrogen** (LCO), **T95 / end point / flash** (naphtha, LCO), and optionally **naphtha olefins/RON**, **CLO ash/BS&W**, **LPG C5+**, and **propylene purity** (INDMAX).
- Downstream consumers of the information: **DHDT/DHDS**, **selective naphtha HDS**, **blending**.

### 7.2 Out of Scope (Initial Phase)
- Replacement of certified online analyzers used for product certification.
- Direct autonomous writes to the distributed control system (DCS) by any AI/agent component.

### 7.3 What "Solved" Looks Like
| Criterion | Target (to be confirmed with site) |
|---|---|
| Robustness to new crudes | Leave-one-crude-family-out accuracy within agreed tolerance; unfamiliar regimes flagged, not silently mispredicted |
| Prediction accuracy vs. lab | RMSE <= 1.5R (time-blocked) and <= 2.0R (leave-one-regime-out) on simulated data; 1-1.5x R on site |
| Availability of trustworthy estimate | ≥ 95% of operating time with a validated estimate |
| Inferential kept in closed loop | ≥ 90% uptime (vs. typical degraded baselines) |
| Quality variance | 30–50% reduction on controlled properties |
| Efficiency | Measured reduction in H₂ per bbl and improved margin to spec vs. the technical baseline in §5, through before/after KPI tracking |
