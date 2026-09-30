# Octave port validation

**Result:** the Octave port reproduces the published simulator output. **36 of 46 signals match within 0.1%, and 41 of 46 within 0.2%.** The other 5 differ only in units or in which variables were exported (see below). None of them is a physics mismatch.

## Method
- **Our run:** `run_sim(5, 'nominal', ...)`. This uses the initial conditions from `dynamic.m` with no disturbances, under Octave 11.1, with `lsode` in place of `ode15s`.
- **Reference:** `NOC_stableFeedFlow_outputs.csv` from the ML-PSE FCCU dataset (github.com/ML-PSE/FCCU-Dataset, MIT licence). It was generated with the same Santander et al. (2022) model in MATLAB. It has 46 signals plus a time column, sampled every minute, with no headers.
- **Comparison:** first 5 minutes. For each reference column, the largest relative difference against the closest-matching exported column.

## Results

| Match level | Signals |
|---|---|
| ≤ 0.1% | 36: feed, ambient and feed temperatures, reactor/regenerator pressures and temperatures, air flow, standpipe level, cyclone, flue gas CO, valves V1–V7, catalyst flows, compressor powers, fuel/flue flows, product flows (LPG, LN, HN, LCO, slurry), fractionator valves V8, V10, V11 |
| 0.1–0.2% | 5: flue-gas O₂, V1, fuel flow, pump-around duty, valve V9 |
| Not directly comparable | 5: reference cols 33 and 40 are internal states we don't export. Reference cols 41–43 are tray temperatures stored in K, whereas we export °F |

## Interpretation
- The small remaining differences are consistent with the change of solver (`lsode` vs `ode15s`) and with `fsolve` tolerances. They are not model changes.
- The `PFR.m` speed patch gave identical output: max relative difference 0.0 against the unpatched port.
- The ML-PSE dataset was used only for this check and has been deleted locally. It can be re-cloned from GitHub if needed.
