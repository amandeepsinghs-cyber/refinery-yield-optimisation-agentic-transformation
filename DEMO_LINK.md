# Demo link

**https://fcc-cockpit-1099437687941.us-central1.run.app**

| | |
|---|---|
| Version | v0.5.15 (model release v0.5.6) |
| Cloud Run | service `fcc-cockpit`, revision: see `gcloud run services describe fcc-cockpit`, project `fcc-soft-sensor`, region `us-central1` |
| Access | Behind Identity-Aware Proxy: sign in with an allowed Google account |
| Deployed | 11 Oct 2026 (decision record reset to its seed on deploy) |
| New in v0.5.15 | Gemini moves the screen: status / "needs attention" opens the Whole unit; "why this action" opens that unit; new get_refinery_status tool (whole FCC whatever page) |
| New in v0.5.14 | Architecture data view: L2 (live view) vs L3 (historian/LIMS, the read-only tap) |
| New in v0.5.13 | Gemini starters follow the page language (EN / Hinglish / हिंदी): greeting → refinery status → why, with the math; Gemini greets briefly and answers in the language the user writes or speaks |
| New in v0.5.12 | Gemini starter prompts: "What's the status in the refinery?" and "Why is this action needed? Show the math."; Architecture: update one agent without touching the rest |
| New in v0.5.11 | Measured vs Estimate everywhere: T98 shows the model estimate (± band), lab results are the only measured T98; per-minute T98 removed; T98 anomaly detection runs on the estimate |
| New in v0.5.10 | Voice: session end returns to idle (press mic to restart); LIVE badge green |
| New in v0.5.9 | Gemini voice fixed (compact voice instructions) |
| New in v0.5.8 | Explainer hub with one beginner guide per page + technical models reference (`/explainer`); header "Explainer" opens the guide for the current page |
| New in v0.5.7 | Architecture → "How your data comes in" (Cortex Framework), "act first" pin, D3 on the riser |

## Demo minutes
- **Follow the oil:** run `random_s107`, 10:00. On U4 the D1 card reads "Lower heavy-naphtha cut point −5.0 °F (530.3 → 525.3)", chance on spec 90 % → > 99 %.
- **Held-out run:** run `random_s144`, 10:00. On U4 the D1 card reads "Raise LCO cut point +2.0 °F (752.8 → 754.8)".
- **"Not yet":** run `random_s144`, 12:00. D2 holds the LCO advice (spread 24.5 °F). D9 asks for an LCO sample.

Full script: [use_cases/PRESENTER_PACK.md](use_cases/PRESENTER_PACK.md) · scene tests: [DEMO_SCRIPT.md](DEMO_SCRIPT.md)
