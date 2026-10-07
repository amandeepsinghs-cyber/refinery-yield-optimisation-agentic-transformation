# Demo link

**https://fcc-cockpit-1099437687941.us-central1.run.app**

| | |
|---|---|
| Version | v0.5.4 (commit `e671c5b`) |
| Cloud Run | service `fcc-cockpit`, revision `fcc-cockpit-00010-96j`, project `fcc-soft-sensor`, region `us-central1` |
| Access | Behind Identity-Aware Proxy: sign in with an allowed Google account |
| Deployed | 7 Oct 2026 |

## Demo minutes
- **Follow the oil:** run `random_s107`, 10:00. On U4 the D1 card reads "Lower heavy-naphtha cut point −5.0 °F (530.3 → 525.3)", chance on spec 90 % → > 99 %.
- **Held-out run:** run `random_s144`, 10:00. On U4 the D1 card reads "Raise LCO cut point +2.0 °F (752.8 → 754.8)".
- **"Not yet":** run `random_s144`, 12:00. D2 holds the LCO advice (spread 24.5 °F). D9 asks for an LCO sample.

Full script: [use_cases/PRESENTER_PACK.md](use_cases/PRESENTER_PACK.md) · scene tests: [DEMO_SCRIPT.md](DEMO_SCRIPT.md)
