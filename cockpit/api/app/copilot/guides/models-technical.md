# Technical reference: the estimation models

> **In one line:** Three admitted machine-learning models (a Gaussian process, a physics-plus-Gaussian-process hybrid and a physics-informed MLP ensemble) each give a mean and a σ for LCO and HN T98 every minute. A fourth, Bayesian ridge, is scored for reference only. The three are blended into a Gaussian mixture, shifted by a Kalman lab bias, checked by seven trust signals and a spread gate, and only then searched for a set-point move with at least 95 % chance on spec. Every number below was read from code, `config.yaml`, the served `artifacts/bundle.json` (trained 2026-10-06 18:19 UTC) or the live API.

## 1. The problem as a prediction task

| Item | Value | Source |
|---|---|---|
| Targets | `LCO_T98_F`, `HN_T98_F`: the temperature (°F) at which 98 % of the product has distilled, as computed by the simulator. Plant specs are usually ASTM D86 T90/T95; T98 stands in for the heavy-end cut point | `config.yaml targets`, DECISIONS T1 |
| What is predicted | A full predictive distribution per minute: member μ and σ, mixture mean, sd, quantiles q01–q99, W90, P(on spec) | `pipeline.assemble_run` |
| Cadence | One estimate per simulated minute (one row per minute). In this demo every run is assembled in time order at training time and served as a replay. Each step uses only rows at or before t | `train.main` → `assemble_run` |
| Training labels (served bundle) | **Reference values from the simulator, every 5th minute** (the simulator's per-minute T98, used only as training labels and for scoring; a real plant never has it) (`truth_stride_min: 5`). Counts: **5,775 LCO / 7,072 HN** | `bundle.json label_source: truth`, `n_labels` |
| Why reference values, not labs | `label_source: auto` picks labs only if the train runs carry ≥ 100 clean labs per property. They carry 72, so it falls back to the reference values (`truth`) | `train.choose_label_source`, `bundle.n_clean_train_labs = 72` |
| Specs (placeholders) | LCO T98 ≤ **765 °F**, HN T98 ≤ **540 °F**, margin 0 | `config specs` |
| Lab reproducibility | **R = 7 °F**. σ_lab = R / 2.77 = 2.527 °F | `config lab.reproducibility_F`, `config.py sigma_lab` |
| Operating target used by D1 | LCO 755.3 °F, HN 530.3 °F, dead band 1.0 °F | `config recommend.target_F` |

## 2. Data used

- **Simulator:** Santander et al. (2022) FCC-fractionator model, ported to Octave (`sim_octave/`). The validation record states 36/46 signals within 0.1 % of the published data (DECISIONS D1).
- **Batch `full_v1`:** 54 runs, `random_s100`–`random_s153`, 1,600 rows each (one per simulated minute), **112 columns** (header count of `random_s144.csv`).
- **Measurement noise** is added to model inputs (`catalog.add_measurement_noise`). It is deterministic per (run, seed 7, column):
  - temperatures (`*_F`): σ 0.5 °F, absolute
  - pressures (`*psia*`): σ 0.05 psi, absolute
  - flows (`feed_flow_lb_s`, `prod_*`, `F_*`, `MV_*`): σ 0.5 % of |value|
  - Targets and `SP_*` set points get no noise.
  - One injected sensor drift: `T_tray13_F` in `random_s152`, +4 °F/day from minute 300.
- **Validity cut** (`data/validity.valid_until`): each run is used only up to the first minute where either ≥ 5 consecutive rows repeat exactly on 8 core state tags (failed solver minutes), or LCO T98 leaves [650, 820] °F, or HN T98 leaves [450, 680] °F, or a target is not finite. In this training **24 runs are whole and 30 are cut** (`train.log`).
- **Pinned reference values** (`data/pinned.py`, enabled for LCO only): a reference LCO T98 equal to the simulator's ceiling of 770.364 ± 0.001 °F is treated as a missing label and as a missing scoring value. That excludes 8,350 train minutes and 3,517 held-out minutes. The HN ceiling (644.767 °F) is **not** masked.
- **Split by run:** train = `random_s100`–`s139` (40 runs); held-out test = `random_s140`–`s153` (14 runs). Inside train, a grouped 4-fold by run gives the out-of-fold predictions used for admission, committee weights and σ calibration.
- **Label rows (reference-value mode, `label_source: truth`):** valid, unpinned, non-transient minutes, then every 5th row. "Transient" means `event_code ≠ 0`, or a 30-min trailing std of any key tag > 3 × max(that tag's median rolling std, its noise σ).
- **Lab results** (simulated: reference value + lab error; `catalog.raw_labs`):
  - One lab per target at each `lab_sample == 1` minute: 360 / 840 / 1320 = 06:00 / 14:00 / 22:00.
  - Value = reference value + N(0, σ_lab), σ_lab = R / 2.77.
  - LIMS delay is uniform on 45–75 min (about 60).
  - Injected errors: 3 % gross (± 4 σ_lab) and 5 % timestamp (recorded draw time = LIMS time).
- **Labs at run time** (`assemble_run`), in order:
  - REJECT if the recorded draw time is ≥ LIMS time − 1.
  - HOLD if |lab − estimate at draw| > 2R = 14 °F.
  - Otherwise ACCEPT: the lab updates the Kalman bias (section 7) and enters the committee pool (section 6).
  - Labs are not used for training in this bundle.

## 3. Inputs (features)

**Candidate pool.** Every numeric column except the excluded ones: both targets, `dist_condenser_eff`, `lab_sample`, `crude_id`, `event_code`, `cutpoint_auto`, `time_min`, `reactor_MB`, `mass_balance_err_pct`, `*_dup` and `eff_*`. Two kinds of derived columns are added:

- **EWMA smoothing** (`features.add_ewma`), τ = 10 min, α = 1 − e^(−1/10) = 0.095. Every noisy column is replaced in place by its causal EWMA. The 7 key tags (`T_tray06_F, T_tray13_F, P5_frac_psia, Tr_riser_F, feed_flow_lb_s, MV_PA2, MV_PA3`) also get a `<tag>__ewma` copy, which is an EWMA of the already-smoothed column.
- **Lagged features** (`data/lags.py`). For each (target, key tag) with lag L > 0 there are two columns: `<tag>__lag<L>` (the value at t − L) and `<tag>__lagmean<L>` (the mean over [t − L, t]). A target only sees its own lag columns.

**Lag selection.** Prewhitened cross-correlation, run on train runs only. The target series is the minute-by-minute reference value from the simulator; the input series are the noisy measured values. Steps:

1. Take first differences of x and y in each run.
2. Fit AR(5) to the pooled input differences by least squares, and apply the same filter to both series.
3. Compute the pooled CCF(k) = Σ eₓ[t−k]·e_y[t] / √(Σeₓ² Σe_y²) for k = 0…60 min.
4. lag = argmax |CCF| if it exceeds 2/√N, otherwise 0. Here N = 43,272, so the limit is 0.0096.

| Key tag | LCO lag (min), CCF | HN lag (min), CCF |
|---|---|---|
| T_tray06_F | 4, −0.043 | 0, 0.068 |
| T_tray13_F | 0, 0.070 | 7, −0.065 |
| P5_frac_psia | 21, 0.013 | 11, −0.011 |
| Tr_riser_F | 20, −0.015 | 7, 0.022 |
| feed_flow_lb_s | 20, −0.026 | 2, 0.041 |
| MV_PA2 | 0 (n.s.) | 13, 0.011 |
| MV_PA3 | 0 (n.s.) | 54, 0.012 |

**Selection per model** (`features.select_features`):

1. The draw-tray temperature is always included (`T_tray13_F` for LCO, `T_tray06_F` for HN).
2. The other candidates are ranked by |corr(z, y)|.
3. A candidate is skipped if its |r| with an already chosen feature is ≥ 0.88.

The caps are 15 features for ridge, 12 for GPR and hybrid, 15 for PINN. The hybrid's GPR selects against the physics residual, not against y.

**Scaling:** z-score with the training mean and std (ddof 0), clipped to ±5, NaN → 0 (`features.Scaler`).

**Selected features (bundle.json):**

| Model | LCO T98 | HN T98 |
|---|---|---|
| Ridge (15) and PINN (15) | T_tray13_F, feed_flow_lb_s__lagmean20, V4, conversion_pct, T_tray10_F, V6, T_tray04_F, V2, dist_T_ambient_F, T_tray02_F, prod_slurry, F5_fuel, T_tray05_F, C_regen_cat, valve_V11 | T_tray06_F, T_tray08_F, T_tray10_F, prod_HN, prod_slurry, conversion_pct, T_tray12_F, T_tray14_F, T3_furnace_F, T_tray05_F, SP_LCO_T98, T_tray19_F, W_riser, prod_LCO, power_CAB |
| GPR (12) | first 12 of the ridge list | first 12 of the ridge list |
| Hybrid residual GPR (12) | T_tray13_F, T_tray10_F, conversion_pct, T_tray09_F, T_tray03_F, feed_flow_lb_s, T_tray04_F, V4, T_tray12_F, prod_slurry, V6, dist_T_ambient_F | T_tray06_F, T_tray08_F, T_tray10_F, prod_HN, prod_slurry, valve_V10, conversion_pct, T_tray14_F, T3_furnace_F, SP_LCO_T98, dist_T_ambient_F, power_CAB |
| Hybrid physics base | T_tray13_F, P5_frac_psia | T_tray06_F, P5_frac_psia |

Ridge also gets three one-hot feed-class columns (heavy < 22 API ≤ medium < 26 ≤ light, from `dist_feed_API`). `V2/V4/V6` are tag names as they appear in the simulator CSV. The code does not document what physical quantity they are.

## 4. The four models

### 4.1 Bayesian ridge (reference only, weight 0)

- **Library:** `sklearn.linear_model.BayesianRidge(compute_score=True, max_iter=500)`, with default Gamma hyper-priors (1e-6). Versions: scikit-learn 1.9.1, numpy 2.5.3, scipy 1.18.1, pandas 3.0.6, Python 3.12.14.
- **Formula:**
```
y = β₀ + Σ βⱼ zⱼ + Σ γ_r 1[class = r] + ε,   ε ~ N(0, 1/α),   β ~ N(0, 1/λ)
σ_pred(x) = √( 1/α + xᵀ Σ_post x )
```
  - zⱼ = standardised feature j; γ_r = coefficient of feed-class indicator r
  - α = noise precision, λ = weight precision (both estimated by evidence maximisation)
  - Σ_post = posterior covariance of the coefficients
- **Fitted values:** LCO α = 0.00967, so the noise sd is 1/√α = 10.2 °F; λ = 0.0168. HN α = 0.00979, λ = 0.00337. The ≈ 10 °F linear-misfit σ is why ridge is excluded from the mixture (`admission.mixture_exclude`).

### 4.2 Gaussian-process regression (GPR)

- **Library:** `sklearn.gaussian_process.GaussianProcessRegressor(kernel, normalize_y=True, n_restarts_optimizer=1, random_state=seed)`.
- **Kernel:** `ConstantKernel(1.0, (1e-2, 1e2)) × Matern(length_scale = 1 per feature (ARD), bounds (0.25, 100), ν = 2.5) + WhiteKernel(0.05, (5e-3, 1.0))`.
- **Training set:** a random subsample of **450** labelled rows (350 inside the CV folds).
- **Formula:**
```
k(x, x') = A · (1 + √5 r + 5r²/3) · exp(−√5 r) + s_n · 1[x = x'],   r² = Σⱼ ((xⱼ − x'ⱼ)/ℓⱼ)²
μ(x) = k*ᵀ (K + s_n I)⁻¹ y,      σ²(x) = k(x, x) − k*ᵀ (K + s_n I)⁻¹ k*
```
  - A = amplitude, ℓⱼ = length scale of feature j, s_n = white-noise level
  - k* = kernel vector between x and the training points; K = training kernel matrix
  - Computed in normalised-y units, then rescaled. σ includes the fitted white-noise term.
- **Fitted values:**
  - LCO: A = 1.90, s_n = 0.005 (at its lower bound), log marginal likelihood 321.7. Most relevant features (shortest ℓ): conversion_pct 1.31, V2 2.30, V4 2.68, feed_flow lagmean20 2.73.
  - HN: A = 1.99, s_n = 0.005, LML 434.4. Most relevant: T_tray08_F 1.62, T_tray12_F 1.68.

### 4.3 Hybrid delta (physics base + GPR on the residual)

- **Library:** numpy least squares for the base, then the same GPR as 4.2 fitted on r = y − y_phys.
- **Formula:**
```
y_phys = a + b · (T_draw + c · ln(P_ref / P5))
μ = y_phys + μ_GPR(r),     σ = σ_GPR(r)
```
  - T_draw = draw-tray temperature; P5 = `P5_frac_psia`; P_ref = 24.9 psia
  - a, b and b·c are fitted by least squares; c is set to 0 if P5 does not vary
  - The physics base adds no variance of its own
- **Fitted values:**
  - LCO: a = 2078.8, b = **−2.797**, c = −341.7. The physics base explains 16.6 % of label variance.
  - HN: a = 216.4, b = 0.883, c = 2034.5; it explains 4.7 %.
  - The sign clamp `hybrid.b_min` is commented out in config, so the LCO slope is negative. On closed-loop data the controller moves the draw temperature against disturbances.

### 4.4 PINN ensemble (physics-informed MLP ensemble, PyTorch 2.14.0+cpu)

- **Architecture:** 5 independent MLPs evaluated in one batched tensor. Each is input → 32 → 32 → 2, with tanh activations and weights initialised N(0, 1/fan_in). The two outputs are μ and v = softplus(h) + 1e-4 (a variance head). All 5 see the same data; they differ only in their random initial weights.
- **Training:**
  - Full batch, Adam, learning rate 0.01, weight decay 1e-4, **250 epochs**.
  - y is standardised with the label mean and std.
  - Labelled rows are capped at 3,000 (random subsample).
  - Physics and monotonic terms use 1,000 random unlabelled minutes from all training runs.
- **Loss** (summed over the 5 members):
```
L = Σₖ [ mean_i ½(ln vₖ,i + (yᵢ − μₖ,i)² / vₖ,i)              Gaussian NLL, labelled rows
       + λ_phys · mean_u (μₖ,u − y_phys,u)²                     physics penalty, unlabelled
       + λ_mono · mean_u ReLU(−∂μₖ,u / ∂T_draw) ]               monotonic soft rule, unlabelled
λ_phys = 0.1,   λ_mono = 1.0
```
  - y_phys = the hybrid physics base (4.3), refitted inside the PINN
- **Prediction:**
```
μ = (1/5) Σₖ μₖ
σ² = (1/5) Σₖ vₖ + Varₖ(μₖ)      (aleatoric + epistemic)
```
- **Fitted values:**
  - LCO: aleatoric sd 15.4 °F, epistemic sd 2.4 °F. Monotonic violations: 458 of 5 × 1,000 member-points.
  - HN: aleatoric sd 22.5 °F, epistemic sd 4.1 °F; 755 violations.
  - The λ values are fixed from config; no validation sweep was run.
  - For LCO the physics penalty pulls toward the base, whose slope is negative, while the monotonic rule pushes the slope positive. The violation count reflects that conflict.

## 5. Calibration and admission

**σ calibration** (`train.calibrate_sigma_scale`):

- **Data:** out-of-fold minutes from the grouped 4-fold by run, up to 6,000 sampled. The LCO reference values exclude pinned minutes.
- **Search:** a factor k on the grid 0.30, 0.35, …, 1.50.
- **Band:** each member's component sd is √((k·σᵢ)² + σ_lab²), and members are weighted by the out-of-fold weights of section 6.
- **Choice:** the k whose mixture 5–95 % band covers closest to 90 %. Mixture quantiles use bisection with a 0.05 °F tolerance.
- **Result** (`meta.sigma_scale`): **LCO 0.85, HN 0.35**. Every member σ is multiplied by k before anything else (`assemble_run`). The σ values shown by the API are already scaled.

**Admission** (`train.main`, on out-of-fold minutes). A member is admitted if:

```
RMSE_member ≤ 1.40 × RMSE_ridge     and     0.65 ≤ coverage90 ≤ 0.99
coverage90 = share of minutes with |μ − y| ≤ 1.6449 σ
```

| Out-of-fold | Ridge RMSE | GPR | Hybrid | PINN |
|---|---|---|---|---|
| LCO RMSE (ratio to ridge), cov90 | 15.24, 0.83 | 16.86 (1.11), 0.86 | 18.58 (1.22), 0.81 | 19.07 (1.25), 0.94 |
| HN RMSE (ratio to ridge), cov90 | 14.08, 0.86 | 15.45 (1.10), 0.88 | 14.63 (1.04), 0.90 | 19.68 (1.397), 0.96 |

All four pass. The HN PINN passes by a margin of 0.003. Ridge is "always admitted" as the reference but is listed in `mixture_exclude`, so `mix_admitted = [false, true, true, true]` and its weight in the estimate is 0.

## 6. The committee and the mixture

**Weights** (`pipeline._weights_from_mse`, `committee_weights`):

```
wᵢ = (1 / max(MSEᵢ, f)) / Σⱼ (1 / max(MSEⱼ, f))      over mixture-admitted members only
f = (0.25 σ_lab)² = 0.399 °F²
```

- **At training time and early in a run:** MSE = out-of-fold MSE (`meta.val_mse`). LCO: GPR 284.3, hybrid 345.4, PINN 363.7, giving **w = 0.384 / 0.316 / 0.300**. HN: GPR 238.7, hybrid 213.9, PINN 387.2, giving w = 0.366 / 0.408 / 0.226.
- **Online:** once **3 accepted labs** exist (`committee.recent_n = 3`), MSE is taken over the last 3 accepted labs: (member μ at draw − lab value)². The new weights apply from the next minute. `weight_source` records which mode is active.

**Mixture** (`dist.components`, `mix_moments`):

```
p(y) = Σᵢ wᵢ · N(y; mᵢ, sᵢ²),     mᵢ = μᵢ + b,     sᵢ = √(σᵢ² + P)
mean = Σ wᵢ μᵢ + b
var  = Σ wᵢ (σᵢ² + P)  +  Σ wᵢ (μᵢ − μ̄)²      (law of total variance: within + between)
```

- μᵢ, σᵢ = member mean and calibrated sd
- b, P = Kalman bias and its variance (section 7)
- μ̄ = Σ wᵢ μᵢ

**Quantiles and W90** (`dist.mix_quantiles`): bisection on the mixture CDF F(x) = Σ wᵢ Φ((x − mᵢ)/sᵢ). The bracket is [min(m − 8s), max(m + 8s)] and the tolerance is 0.01 °F. **W90 = q95 − q05.** The 200-point grid (`mixture.grid_points`) is used only to draw the pdf on screen.

**Bimodality** (`dist.bimodality`), Ashman's D on the two highest-weight admitted components:

```
D = √2 · |m₁ − m₂| / √(s₁² + s₂²)
bimodal = D > 2.0  and  w₁ ≥ 0.2  and  w₂ ≥ 0.2
```

## 7. Lab correction: the Kalman bias

This is a scalar random-walk state, one per run and property (`assemble_run`):

```
state:    b_t = b_{t−1} + η,   η ~ N(0, Q),   Q = (1.0 °F/day)² / 1440 = 6.94e-4 °F²/min
measure:  lab = ŷ_mix,nb(t_draw) + b + ε,     ε ~ N(0, R_lab),  R_lab = σ_lab² = 6.386 °F²
initial:  b = 0,  P = R_lab
each minute:  P ← P + Q
on ACCEPT:    innovation = lab − (ŷ_mix,nb(t_draw) + b)
              K = P / (P + R_lab)
              b ← b + K · innovation
              P ← (1 − K) · P
```

- ŷ_mix,nb = Σ wᵢ μᵢ (mixture mean without bias) at the recorded draw minute
- The applied bias moves linearly from its old value to the new b over **30 min** (`bias.ramp_min`)
- `bias.max_abs_sigma: 3` is in config but no code reads it
- There is no automatic bias reset at a feed change. The adaptation panel's `bias_reset_at_min` field is informational only.

## 8. Trust signals S1–S7, the spread gate and the fallback

Signals (`assemble_run`, config `trust`):

| Signal | Value | Pass if | Severe if |
|---|---|---|---|
| S1 committee spread | std (ddof 0) of the admitted members' μ ÷ R | ≤ 0.5 | > 1.0 |
| S2 input envelope | max(T²/T²_lim, SPE/SPE_lim). PCA on standardised candidate inputs, k = components for 95 % variance (≤ 10), limits = 1.05 × the 99th percentile on training. Also fails if σ_GPR ÷ median training σ_GPR > 2.0 | ≤ 1 | > 2 |
| S3 physics order | q50_LCO − q50_HN | ≥ 50 °F | < 0 °F |
| S4 lab track record | √(mean of the last ≤ 5 accepted errors²) ÷ R, error = lab − (ŷ_mix,nb + applied b) at draw | ≤ 1.5, or no labs | > 3.0 |
| S5 sensor health | key tag outside training [0.1, 99.9] percentile ± 10 % of span, or a one-minute jump > max(5·MAD(Δx), 0.5·std) | no flag | frozen-tag check only, which is disabled (`dq.frozen_enabled: false`) |
| S6 labels for this feed class | training labels in the current heavy/medium/light class | ≥ 5 | = 0 |
| S7 distribution spread | W90 ÷ 14 °F, and not bimodal | ≤ 1 and not bimodal | > 1.5 or bimodal |

**Trust level:** RED if ≥ 2 signals fail or any is severe; AMBER if exactly 1 fails; GREEN otherwise.

**Spread gate** (`gate.SpreadGate`). It depends only on spread and bimodality, not on trust.

```
WITHHELD  if bimodal  or  W90 > 14 °F
release   after W90 < 0.9 × 14 = 12.6 °F for 10 consecutive minutes (hysteresis)
```

The message names a likely cause, checked in this order: models disagree → inputs outside envelope → P > 2σ_lab² (no recent lab) → high predictive uncertainty. It always ends "hold current set point".

**Fallback** (`pipeline.fallback_source`), tried in order:

1. Consensus: the mixture, if ≥ 2 admitted members are finite and trust is not RED.
2. The single best admitted member (by out-of-fold MSE) + b.
3. Hold the last good value for ≤ 60 min.
4. BAD.

## 9. Probability on spec

```
P(on spec) = F(spec) = Σᵢ wᵢ · Φ( (spec − margin − mᵢ) / sᵢ ),    mᵢ = μᵢ + b,  sᵢ = √(σᵢ² + P)
```

spec = 765 °F (LCO) or 540 °F (HN); margin = 0; Φ = standard normal CDF (`scipy.special.ndtr`). This is `dist.mix_cdf`. The screen text uses `recommend.prob_text`: **"> 99 %"** if P ≥ 0.995, **"< 1 %"** if P < 0.005, otherwise a whole percentage. The JSON keeps 4 decimals.

## 10. The recommendation search (D1)

This runs every **5 min** (`recommend.every_min`, minutes where t mod 5 = 0); each card is valid for **30 min** (`valid_min`).

1. **Gate WITHHELD** → HOLD card with the gate message. **Trust RED** → no card.
2. **Candidate grid:** Δ ∈ {−5.0, −4.5, …, +5.0} °F (step 0.5, cap 5).
3. **Assumed gain:** g = **1.0 °F of T98 per °F of set point**. This is the default (`recommend.gain_default`): no step tests are used, and the ordinary-least-squares fit on event-5/6 windows was rejected by its own checks. The bundle says `gain_source: "default (no set-point-move windows)"`.
4. **Feasibility:** P_after(Δ) = F(spec − g·Δ) ≥ **0.95**.
5. **Target aim** (`search_move_target`):
   - If |mean − target| ≤ 1.0 °F and P(Δ = 0) ≥ 0.95, hold.
   - Otherwise pick the feasible Δ that minimises |mean + g·Δ − target| (+ 1e-6·|Δ| to break ties toward the smaller move).
   - If nothing is feasible, HOLD with "request a lab sample".
6. **Trust scaling:**
   - GREEN: the full move.
   - AMBER: half of a raising move, rounded toward 0 on the 0.5 grid. Lowering moves are not halved.
   - RED or WITHHELD: none.
7. **Yield note:** yield shift % of feed = 100·Δ·g·s_y / feed (lb/min). s_y is an OLS slope from event windows: LCO −0.0894, HN 0.4754.

Advisory only: Accept / Hold / Decline write the audit record; nothing is sent to a control system.

## 11. Anomaly detection (unit sentinels)

From `engines/detect.py`, per primary tag and per minute:

```
expected  = LCO/HN T98 (lab-only, `EST_TAGS`): set point + the model estimate's recent offset from it
            (one-step-lagged EWMA, half-life 45 min); the 'measured' series here is the MODEL ESTIMATE
            (committee mixture mean), never the per-minute reference value
          | otherwise the regime response model: ŷ = ȳ_r + (x − x̄_r)·B_r, plus a one-step-lagged EWMA
            of past innovations (half-life 45 min)
residual  r_t = measured_t − expected_t      (T98: estimate_t − expected_t)
σ_t       = max(1.4826 · MAD(r over the trailing 240 min, ≥ 30 points), floor)
            floor = max(0.25 · min(resid_sd, 8), 0.2)
CUSUM     S⁺_t = max(0, S⁺_{t−1} + r_t − kσ_t),   S⁻_t = max(0, S⁻_{t−1} − r_t − kσ_t),   k = 0.5
          "sustained shift" when S⁺ or S⁻ > hσ_t, h = 5 (both sums then reset to 0)
breach    |r_t| > 3σ_t ("outside ±3σ"); severity "alarm" if |r_t| > 4.5σ_t, else "warn"
```

- At most one event per (tag, kind) per 60 min, and none before minute 30.
- Root cause: B_r[input, tag] × (input change over the last 60 min). The top 3 are shown, dropping any below 0.05σ.
- B_r is the median step response from designed set-point moves per feed regime: ȳ over 30–60 min after the ramp minus ȳ over the 15 min before, divided by Δx. Minutes under the automatic cut-point trim are excluded.

## 12. Feed model (D4)

From `engines/feed.py`; the fit is cached in `artifacts/engines/feed_fit.json`.

- **Fingerprint** (`regime.extract_features`, EWMA com = 10), all from the noisy measured view:
  - coke per feed = F_coke / feed_flow
  - riser ΔT = Tr_riser − T2_preheat
  - fuel per feed = F5_fuel / feed_flow
  - Treg_F
  - conversion_pct
  - tray ΔT = mean(T_tray13…20) − mean(T_tray01…06)
- **Model:** quadratic ridge.
```
API_hat = w₀ + Σⱼ wⱼ zⱼ + Σⱼ wⱼ' zⱼ²,   z = (x − mean_train) / sd_train
w = (AᵀA + λI)⁻¹ Aᵀ y,   λ = 1.0,   A = [1, z, z²]   (no cross terms)
```
- **Data:** train on seed < 140 with t ≥ 60 min (41,199 rows; API range 20.1–28.9). Held out on seed ≥ 140 (15,158 rows).
- **Held-out accuracy:** **MAE 0.20 API**, 90th-percentile |error| 0.41, **R² 0.981**.
- **Change detector** (config `feed_model`):
  - Smooth the estimate with a 20-min rolling mean.
  - A slow baseline follows the smoothed estimate with τ = 480 min while the feed is settled.
  - Flag a change when |smooth − baseline| > 0.7 API.
  - The feed is settled again once |smooth(t) − smooth(t−20)| ≤ 0.3 API for 15 consecutive minutes.
  - The first 60 minutes are warm-up.
  - On held-out runs: **15 of 15 switches caught, 2 false alarms**. Median flag 33 min after the ramp starts; median settle 44 min after the ramp ends.
- **Novelty:**
```
outside = max(20.1 − API_hat, API_hat − 28.9)
novelty = clip((outside + 1.0) / 2.0, 0, 1)
hold if novelty ≥ 0.5 (estimate at the edge of the training range) or the feed is changing
```
- **Class probabilities:** N(API_hat, (0.41/1.645)²) integrated over the heavy / medium / light bands.
- The regime engine's operating-pattern novelty, 1 − exp(−d²_min / (2·6)) with d² = the Mahalanobis distance to each crude regime, is reported separately as `unit_pattern_novelty`. It does not trigger the feed hold.

## 13. Response models for the other levers (D3, D5, D6, D7)

These decisions use a fixed gain table (`SPEC` in the D3/D5/D6/D7 response-model module under `app/engines/`) applied to live tag values. The trigger is the deviation reported by anomaly detection.

| Decision | Lever → target | Gain used | Lever step / SOP cap | Gain basis |
|---|---|---|---|---|
| D6 preheat | SP_T_preheat_F → T2_preheat_F | **1.0 °F/°F** | 0.5 / 5 °F | Measured: 52 step tests (45 train, 7 held out) gave **1.007 °F/°F**, held-out R² 1.0 (DECISIONS P11); the code uses 1.0 |
| D5 regenerator air | Fair → dT_cyc_reg_F | 40 °F per unit Fair (0.4 °F per 0.01 step) | 0.01 / 0.08 | Fixed plant-plausible value; refit on lever runs did not settle (P11) |
| D7 condenser | SP_T_overhead → MV_cw_flow | −2.6 lb/s per °F | 0.5 / 3 °F | Fixed value; refit gave gain ≈ 0 (P11). Acts only when demand is above expected |
| D3 recipe | SP_T_riser_ROT_F → conversion_pct | 0.12 % per °F | 0.5 / 5 °F | Fixed value; the deviation is fixed at −0.4 % in code |

**Move rule:**

```
Δ  = round_step( clip(−dev / g, −cap, +cap) ),   then clipped to the lever's operating window (config iow)
μ_after = μ + g·Δ
```

**Fixed uncertainty band:**

```
σ = max(0.4·|dev|, σ_min)
limit = (μ − dev) ± 0.8·|dev|
P_before = Φ(distance of μ to the limit / σ),   P_after = Φ(distance of μ_after to the limit / σ)
```

With dev = −0.4 % this gives about 31 % → 98 % on every screen. The spread check W90 = 2·1.645·σ uses limit max(1.6·W90, 1), so it passes by construction. The screen labels this step "Move rule … chance from a fixed band. Not a model search."

The D6 gain itself was fit offline (`surrogates.gap_step_response`). Each move is fit as a first-order response, with τ chosen on a grid of 1–110 min. The fit uses the steady-state gain if it settled and the late-window Δ otherwise.

## 14. Held-out accuracy and honest limits

**Served bundle (2026-10-06 18:19)**, scored on 14 held-out runs at every valid minute against the simulator's reference values. LCO pinned minutes are excluded (n = 12,391 LCO and 15,908 HN minutes):

| | MAE °F | RMSE °F | Bias °F | 90 % band coverage | CRPS | Mean W90 °F | Minutes WITHHELD |
|---|---|---|---|---|---|---|---|
| **LCO mixture** | **4.90** | **8.56** | +1.05 | **95.5 %** | 3.55 | 32.7 | 64.9 % |
| LCO GPR / hybrid / PINN / ridge (RMSE) | 5.89 / 5.47 / 4.98 / 6.64 | 10.88 / 9.12 / 9.72 / 10.48 | | 85 / 79 / 89 / 85 % | | | |
| **HN mixture** | **3.88** | **7.32** | −0.97 | **85.6 %** | 2.53 | 16.2 | 27.1 % |
| HN GPR / hybrid / PINN / ridge (RMSE) | 2.78 / 2.89 / 7.19 / 7.82 | 5.16 / 5.44 / 16.74 / 12.62 | | 66 / 66 / 55 / 62 % | | | |

- **LCO including pinned minutes:** MAE 6.7, RMSE 10.2, coverage 96.2 % (computed from `eval_LCO_T98_F.npz`).
- **Earlier quoted figures** (DECISIONS P12, 3 Oct): LCO MAE 7.5 / RMSE 17.1 / coverage 79 %; HN 13.2 / 24.5 / 59 %. These belong to the **previous** model, trained on reference values every 30 min (728 LCO / 697 HN labels, S-6). The LCO set matches `softsensor_v8_lco_candidate/bundle.json` exactly. The HN set was not found in any bundle on disk. The served model replaced it on 6 Oct, so quote the table above.
- **Against the DECISIONS T3 targets:** RMSE ≤ 1.5R = 10.5 °F (both met); coverage 85–95 % (HN within; LCO 95.5 % is slightly above).

**What the numbers mean and do not mean:**

- **Labels are reference values from the simulator, not labs.** No lab noise or bias, and lab-error behaviour is not tested in training. On site the models train on the refinery's lab history.
- **The mixture benefits from the Kalman correction** using the run's own synthetic labs, which is legitimate online information. Its accuracy is reported on all minutes, including those the gate withheld.
- **Weak tracking on quiet runs:** LCO correlation between estimate and reference value within a run is 0.06 (s140), 0.11 (s145), 0.21 (s150) and 0.33 (s144), where the reference value moves by only 1–5 °F std. It reaches 0.96 on runs with large swings. HN within-run correlation is 0.79–1.00.
- **T98 ceiling:** the simulator saturates LCO at 770.364 °F (20 % of valid rows); those minutes are excluded. The HN ceiling (644.767 °F) is not masked.
- **Over-tight member σ for HN:** calibration factor 0.35, member coverage 55–66 %. The mixture reaches 86 % only through the bias variance and between-model spread. The LCO gate withholds 65 % of held-out minutes.
- **Some inputs would not exist on a plant as-is:** `conversion_pct` (simulator-computed) and a set point (`SP_LCO_T98`) are HN features.
- **D1 gain is assumed at 1.0;** D3/D5/D7 gains are fixed values (section 13).
- Simulated data shows behaviour and method, never site accuracy (DECISIONS S4).

## 15. Worked example: `random_s144`, 10:00 (t = 600), LCO T98

Live API values: `/api/estimate` and `/api/distribution` (`property=LCO_T98_F`, `time_min=600`), `/api/labs`, `/api/recommendations`.

**Step 1: members.** σ is already × 0.85. Components add the bias b = −1.746 and P = 3.395.

| Member | μ (°F) | σ (°F) | σ before calibration | m = μ + b | s = √(σ² + P) | weight |
|---|---|---|---|---|---|---|
| Ridge (reference) | 749.41 | 8.65 | 10.18 | 747.66 | 8.84 | 0 |
| GPR | 755.16 | 2.78 | 3.27 | 753.41 | 3.34 | 0.3839 |
| Hybrid | 755.67 | 1.88 | 2.21 | 753.92 | 2.63 | 0.3160 |
| PINN | 753.56 | 2.51 | 2.95 | 751.81 | 3.11 | 0.3001 |

**Step 2: weights.** Only one lab had been accepted by 10:00, so the out-of-fold weights apply:
- 1/284.28 = 0.003518, 1/345.37 = 0.002895, 1/363.67 = 0.002750; sum 0.009163
- w = 0.3839 / 0.3160 / 0.3001 ✔

**Step 3: Kalman bias.**
- The 06:00 lab = 749.46 °F, result at minute 410. The estimate at draw (no bias) was 752.88, so the innovation is −3.42.
- P(410) = 6.386 + 411 × 0.000694 = 6.672
- K = 6.672 / (6.672 + 6.386) = 0.511
- b = 0.511 × (−3.42) = **−1.747** (API: −1.7461; the difference comes from rounding of the 752.88 input)
- P after the update = 3.263; P(600) = 3.263 + 190 × 0.000694 = **3.395** ✔

**Step 4: mean and sd.**
- μ̄ = 0.3839·755.16 + 0.3160·755.67 + 0.3001·753.56 = 754.841
- mean = 754.841 − 1.746 = **753.10 °F** ✔
- within = Σ w(σ² + P) = 9.369; between = Σ w(μ − μ̄)² = 0.749
- sd = √10.118 = **3.18 °F** ✔ (the screen shows 753.1 ± 3.2)

**Step 5: quantiles and gate.**
- Bisection on F gives q05 = 747.78 and q95 = 758.25, so **W90 = 10.46 °F**, within 14 → gate **PASS**.
- D = √2·|753.41 − 753.92| / √(3.34² + 2.63²) = **0.17**, well under 2.0.
- Trust: S1 = 0.129, S2 = 0.182, S3 = 224.8 °F, S4 = 3.42/7 = 0.488, S5 = 0, S6 = 3,815 labels, S7 = 10.46/14 = 0.747. All pass → **GREEN**.

**Step 6: P(on spec).** F(765) = 0.99989; the API shows 0.9999 and the screen "> 99 %".

**Step 7: move.**
- The mean is 753.10, 2.2 °F below the 755.3 target, outside the 1 °F dead band.
- Candidates with g = 1: Δ = +2.0 lands on 755.10 (miss 0.20) with P = F(763) = 0.9991. Δ = +2.5 lands on 755.60 (miss 0.30). So **Δ = +2.0 °F**.
- Set point **752.75 → 754.75 °F** (shown 752.8 → 754.8). Chance on spec after 0.9991 ("> 99 %").
- Margin: before = 765 − q95 = 6.75; after = 6.75 − 2.0 = 4.75 °F. Yield shift −0.002 % of feed. GREEN, so the full move.

Everything reconciles to the displayed precision. Only the bias differs, in its third decimal, as explained in step 3.

## 16. Where in the code

Paths are relative to `cockpit/api/app/`.

| Item | File | Function / line |
|---|---|---|
| Specs, R, σ_lab = R/2.77, gate limit | `config.py`; `../config.yaml` | `R` l.47, `sigma_lab` l.51, `w90_max` l.65 |
| Measurement noise, synthetic labs | `data/catalog.py` | `add_measurement_noise` l.120, `raw_labs` l.429 |
| Validity cut / pinned reference values | `data/validity.py`; `data/pinned.py` | `valid_until` l.23; `mask_truth` l.76 |
| EWMA, selection, scaling, transient flag | `data/features.py` | `add_ewma` l.14, `select_features` l.39, `Scaler` l.64, `transient_mask` l.85 |
| Lag identification / lag features | `data/lags.py` | `identify_lag` l.98, `apply_lags` l.184 |
| Physics base | `models/base.py` | `PhysicsBase` l.14 |
| Ridge, GPR | `models/classic.py` | `BayesRidgeModel` l.19, `GPRModel` l.62 (kernel l.80) |
| Hybrid, PINN | `models/hybrid_pinn.py` | `HybridDeltaModel` l.18, `_EnsembleMLP` l.56, `PinnEnsembleModel.fit` l.90 (loss l.115–121) |
| Labels, σ calibration, admission, evaluation | `train.py` | `build_labels` l.92, `calibrate_sigma_scale` l.68, admission l.281–325, evaluation l.345–389 |
| Weights, Kalman, mixture, trust, gate, recs | `pipeline.py` | `_weights_from_mse` l.102, `committee_weights` l.108, `assemble_run` l.150 (Kalman l.218–223, trust l.253–285, gate l.289–301, recs l.303–317) |
| Mixture maths | `dist.py` | `components` l.16, `mix_cdf` l.22, `mix_quantiles` l.37, `mix_moments` l.55, `bimodality` l.61 |
| Spread gate | `gate.py` | `SpreadGate.step` l.46, `gate_cause` l.14 |
| DQ and novelty (S2, S5) | `data/health.py` | `DQModel` l.8, `NoveltyModel` l.60 |
| D1 search, probability text | `recommend.py` | `search_move_target` l.90, `build_recommendation` l.113, `prob_text` l.13 |
| Live committee weights panel | `engines/adapt.py` | `adaptation_at` l.101 |
| Anomaly detection | `engines/detect.py` | constants l.41–43, `_trailing_mad_sigma` l.95, `_cusum` l.104, `detection_series` l.122 |
| Regime response models, expected values | `engines/surrogates.py` | `gap_step_response` l.119, `predict_matrix` l.666, `expected_series` l.682 |
| Feed model | `engines/feed.py`; `engines/regime.py` | `_fit` l.121, `detect` l.57, `feed_at` l.237; `extract_features` l.48, novelty l.192 |
| D3/D5/D6/D7 gain table and move rule | response-model module in `engines/` | `SPEC` l.24, `_script` l.104 |
| Served artifacts | `../artifacts/bundle.json`, `../artifacts/models/lags.json`, `../artifacts/engines/feed_fit.json` | read-only |
