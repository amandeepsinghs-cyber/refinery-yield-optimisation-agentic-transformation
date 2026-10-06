# Not Claimed: Non-FCC Refinery Assets

> **Status:** ⚪ **Not claimed** — outside the FCC battery limits; not simulated in this build
> - **Units:** delayed coker, crude / vacuum distillation (CDU/VDU), alkylation, utilities & flare, pipelines & offsites
> - **What we say:** *"Same pattern, new agent, on the same lakehouse and the same decision desk. Not built."*
> - On screen: the grey **"Rest of the list · Not claimed"** card on **Overview** (`/platform`).

## 1. IOCL use cases outside the FCC build

Figures are **IOCL's** (from their list), not ours.

| Unit / area | IOCL use cases | IOCL-indicated value | Why it's outside this build | Nearest thing we do show | Future agent |
|---|---|---|---|---|---|
| **Delayed coker** | Outage / readiness modelling; heater de-coke prediction; heater spalling (TMT) projection; tube creep-life | de-coke ~$0.5M/yr; creep-life up to ~$20M/yr modelled; outage *(check IOCL original)* | Separate thermal-cracking unit with drums and furnace cycles | FCC furnace drift watch ([UC-10](./UC-10_furnace_coke_hydraulic_constraints.md)) | Coker agent |
| **CDU / VDU** | Overhead cooler shutdown avoidance; preheat-train U-value monitoring; salt deposition; crude-column flooding | overhead cooler ~$4.0M; flooding ~2,500 bbl/d | Crude distillation sits upstream of the FCC | Condenser fouling signal ([UC-07](./UC-07_exchanger_fouling_health_signal.md)); fractionator hydraulic watch ([UC-08](./UC-08_filtration_systems_breakthrough.md)) | CDU/VDU agent |
| **Alkylation** | Feed-water / coalescer monitoring; effluent filter breakthrough | ~$5.0M; ~$2.4M | Acid alkylation, coalescers not in the FCC | Hydraulic drift watch pattern | Alkylation integrity agent |
| **Utilities** | Gas-turbine compressor wash; GT inlet-filter failure; cooling-tower pumps; nitrogen & fuel-gas usage; hydrogen balance | ~$1.0M; ~£4.3M *(check)*; ~$1.0M; ~$0.86M/yr | Site utility island | Systems view and recipe penalties for fuel and power ([UC-06](./UC-06_multi_unit_energy_management.md)) | Utilities agent |
| **Flare & compliance** | Real-time flare emissions; compliance reporting; LP/HP flare tracking; flare-reduction RCA; NOₓ prediction; analyser-exceedance emissions | flare RCA ~$8.7M NPV *(check)* | Relief / flare network and regulatory reporting | — | Flare & compliance agent |
| **Treating** | Amine (DEA) monitoring; chemical-additive optimisation; fixed-bed catalyst life | — | Amine unit, hydrotreaters / hydrocracker | Soft-sensor pattern ([UC-11](./UC-11_product_soft_sensors_online_prediction.md)) | Treating agent |
| **Pipelines & offsites** | Leak detection; pigging schedule; DRA optimisation; pump / valve performance; custody metering; line pressure; inventory | — | Tank farm and offsite logistics | — | Offsites agent |

## 2. Why the same architecture carries over
1. **One lakehouse** (BigQuery bronze → silver → gold): new unit = new tags in the same tables.
2. **Same data processing**: valid-range cuts, lab alignment, suspect-lab screening.
3. **Same model pattern**: physics + ML estimates with a spread; response models from history then step tests.
4. **One agent per use case**, publishing drift events and decisions to the shared event log; the systems agent sees cross-unit consequences.
5. **Same decision desk**: advisory card, trust checks, "Not yet", Accept / Hold / Decline, decision record, no DCS write path.

## 3. What to say if asked
> *"We haven't built these and we won't pretend to. They're the same pattern on different units: a new agent on the same lakehouse, the same decision desk, the same person in the loop. The FCC pilot proves the pattern; these are the next agents."*

**Never say** "reformer", "LPG splitter" or "CDU" as something we built.
