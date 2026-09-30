# Cockpit API Contract (v1): Single Source of Truth for `cockpit/api` ↔ `cockpit/web`

> Base: `http://localhost:8010` (port 8000 is taken by the IDE on this machine). The web app calls `/api/*` through a Next.js rewrite. It opens the Live WebSocket directly at `NEXT_PUBLIC_API_WS` (default `ws://localhost:8010`).
> Everything here extends [SDD.md](../SDD.md) §5–§7. The SDD rules (gate, recommendations, copilot guardrails, no financial content) apply unchanged.
> All numbers come from **simulated data** (`sim_octave/data/**.csv`); there is **no mock data**. If data is missing, return an empty payload with a `note`; never invent values.

## 0. Conventions

- JSON, snake_case. Time axis = `time_min` (int, the simulator minute within a run). Arrays are aligned to `time_min`.
- `property` ∈ `LCO_T98_F` | `HN_T98_F`. Model IDs: `bayes_ridge_v1`, `gpr_v1`, `hybrid_delta_v1`, `pinn_ens_v1`. The UI shows them as "Bayesian ridge", "GPR", "Hybrid delta", "PINN ensemble". Colours come from SDD-UI-02.
- Spec (placeholders, SDD OD-7): LCO T98 ≤ 765 °F, HN T98 ≤ 540 °F. `R` = 7 °F. `w90_limit` = 14 °F.
- Gate statuses: `PASS` | `WITHHELD`. `gate_reason`: `null` | `wide` | `bimodal` | `hysteresis`. Messages are exactly as in SDD-GATE-04.
- Trust levels: `GREEN` | `AMBER` | `RED`.
- Errors: HTTP 4xx/5xx with `{"error": "...", "detail": "..."}`.

## 1. Meta

| Endpoint | Response |
|---|---|
| `GET /api/health` | `{status:"ok", data:{runs:int, batches:[str], trained:bool, trained_at}, gemini:{project, location, text_model, live_model, ok:bool, note}, knowledge:{docs:int, chunks:int, mode:"embedding"\|"bm25"\|"empty"}}` |
| `GET /api/runs` | `[{run_id, batch, scenario, n_minutes, split:"train"\|"test", has_events:bool}]` |
| `GET /api/tags` | `[{tag, label, unit, group:"input"\|"mv"\|"tray"\|"target"\|"reactor"\|"signal"}]` |
| `GET /api/config` | `{spec:{LCO_T98_F:765, HN_T98_F:540}, R:7, w90_limit:14, hysteresis_ratio:0.9, hysteresis_min:10, properties:[...], models:[{model_id,label,color}]}` |

## 2. Time series (F12, F3, F8)

`GET /api/runs/{run_id}/timeseries?cols=a,b&from=&to=&max_points=2000`

```json
{"run_id":"steady","time_min":[1,2,...],"series":{"T_tray13_F":[...]},
 "events":[{"time_min":30,"code":1,"label":"Crude change","duration":60}],
 "labs":[{"time_min":360,"property":"LCO_T98_F","value":755.9,"status":"ACCEPT"}],
 "downsampled":true,"note":null}
```

Down-sampling uses LTTB when `n > max_points` (SDD-TS-04). Events come from `event_code` transitions; for fixed scenarios they come from the scenario definition. Labs are synthetic, per SDD §4.3.

`GET /api/estimates/timeseries?run_id=&property=&from=&to=&max_points=2000`

```json
{"run_id":"...","property":"LCO_T98_F","time_min":[...],"truth":[...],
 "members":{"hybrid_delta_v1":{"mu":[...],"sigma":[...],"weight":[...]}, "...":{}},
 "mixture":{"mean":[...],"q05":[...],"q25":[...],"q50":[...],"q75":[...],"q95":[...]},
 "w90":[...],"bimodality_d":[...],"gate":["PASS",...],"gate_reason":[null,...],"trust":["GREEN",...],
 "labs":[{"time_min":..,"value":..,"status":"ACCEPT"}],"events":[...],
 "spec_max":765,"w90_limit":14}
```

## 3. Minute detail (F4, F5)

- `GET /api/estimate?run_id=&property=&time_min=` returns the SDD §6.2 estimate message, with `provenance.source = "simulated"`.
- `GET /api/distribution?run_id=&property=&time_min=`:

```json
{"grid":[...200 x values °F...],
 "members":{"gpr_v1":{"pdf":[...],"mu":756.2,"sigma":2.9,"weight":0.22,"admitted":true,"shadow":false}},
 "mixture":{"pdf":[...],"mean":..,"q05":..,"q50":..,"q95":..,"p_on_spec":0.99},
 "w90":10.9,"bimodality_d":0.8,"bimodal":false,
 "gate":{"status":"PASS","reason":null,"message":null},"trust":{"level":"GREEN","reason":"..."},
 "spec_max":765,"w90_limit":14,"truth":757.9}
```

## 4. Modelling (F21, F9)

`GET /api/models?property=`

```json
{"property":"LCO_T98_F","eval":{"runs":["..."],"n_minutes":1234,"note":null},
 "models":[{"model_id":"hybrid_delta_v1","family":"hybrid_delta","label":"Hybrid delta","status":"admitted",
   "weight":0.41,"rmse":3.0,"mae":2.3,"bias":-0.1,"coverage90":0.91,"crps":1.7,"mean_sigma":2.8,
   "params":{"physics":"a + b·T_tray13 + c·(P5−P5₀)","a":..,"b":..,"c":..,"residual":"GPR Matérn 5/2, ℓ=..."},
   "per_regime":[{"regime":"heavy","rmse":..,"n":..}], "features":["T_tray13_F","..."]}],
 "mixture":{"rmse":..,"coverage90":..,"crps":..}}
```

`GET /api/calibration?property=`

```json
{"parity":{"<model_id>":{"pred":[...],"truth":[...]}},
 "residuals":{"time_idx":[...],"<model_id>":[...]},
 "pit":{"bins":[0,0.1,...,1],"<model_id>":[counts...]},
 "reliability":{"nominal":[0.1,...,0.9],"<model_id>":[observed...]},
 "coverage_over_time":{"time_idx":[...],"mixture":[...]},
 "gpr_relevance":[{"feature":"T_tray13_F","relevance":0.95}],
 "hybrid_decomposition":{"time_idx":[...],"physics":[...],"delta":[...]},
 "pinn_members":{"time_idx":[...],"members":[[...],[...]]},
 "cusum":{"time_idx":[...],"value":[...],"h":..}}
```

## 5. Decision (F1, F2, F5)

- `GET /api/overview?run_id=&property=` (`property` default `LCO_T98_F`; KPIs are computed for that property) returns:

```json
{"kpis":{"rmse_vs_lab":3.1,"rmse_target":7.0,"coverage90":0.91,
  "trust_mix":{"GREEN":0.88,"AMBER":0.09,"RED":0.03},"availability":0.97,
  "recs_accepted":14,"recs_total":17,"withheld":3},
 "decisions_needed":[<recommendation>...],"note":null}
```

- `GET /api/recommendations?run_id=&status=` returns `[<recommendation>]`, where:

```json
{"rec_id":"r-steady-LCO-0125","run_id":"steady","time_min":125,"property":"LCO_T98_F",
 "status":"OPEN|ACCEPTED|DECLINED|WITHHELD|EXPIRED|HOLD","action":"RAISE|LOWER|HOLD","delta_F":4.0,
 "sp_before":755.3,"sp_after":759.3,"p_on_spec_after":0.97,"margin_before_F":9.0,"margin_after_F":5.0,
 "yield_shift_pct":0.3,"trust":"GREEN","conservative":false,"rationale":"...",
 "gate":{"status":"PASS","reason":null,"message":null,"w90":8.2},
 "citations":[{"doc_id":"SOP-FRAC-003","revision":4,"section":"4.2","title":"...","snippet":"..."}]}
```

- `POST /api/recommendations/{rec_id}/decision` with `{"decision":"accepted"|"declined","user":"...","note":""}` returns `{ok:true, audit_id}`. This is recorded only; nothing is written to any control system.
- `GET /api/audit?q=` returns `[{audit_id, ts, actor, action, target, detail}]`.
- `GET /api/stream?run_id=&property=&speed=10&from=` is **SSE**. Events: `estimate` (SDD §6.2), `gate`, `recommendation`, `lab`, `heartbeat` (every 15 s).

## 6. Knowledge & Records (Epic H)

- `GET /api/knowledge/search?q=&type=&k=8`:

```json
{"results":[{"doc_id":"SOP-FRAC-003","revision":4,"section":"4.2","title":"LCO cut-point (T98) adjustment",
  "section_title":"Raise the set point","doc_type":"SOP","snippet":"...","score":0.82}],
 "index":{"docs":46,"chunks":512,"mode":"embedding"}}
```

  An empty corpus returns `results:[]` and `mode:"empty"`.
- `GET /api/knowledge/docs` returns the manifest (from `knowledge/corpus/manifest.json`), including `sim_batch` (default `full_v1`), `sim_run`, and `sim_window` when present in the index.
- `GET /api/knowledge/docs/{doc_id}` returns `{meta:{...}, markdown:"...", sections:[{id:"4.2", title:"..."}]}`.
- `GET /api/knowledge/records?run_id=` returns job-record markers `[{doc_id, doc_type, title, date, time_min|null, run_id|null, sim_batch|null, sim_run|null, sim_window|null}]`. SHIFT documents with `sim_run == run_id` are placed at `sim_window[0]` and also carry `sim_batch` (default `full_v1`), `sim_run`, `sim_window:[start,end]|null`, `window:[start,end]|null` and `entries:[{time_min, timestamp, section, event_code|null, text}]`; other runs' SHIFT documents are dropped when `run_id` is given. Records without `sim_run` get `time_min` from `effective_date` only if it falls inside the run; otherwise `null` (listed by date, never placed at an invented minute). Without `run_id`, every record is returned and nothing is placed on a run.
- **Knowledge dashboard (F24, web `/knowledge`, `/knowledge/{doc_id}?section=x.y`)** uses only the endpoints above: library = `docs` (+ `search` for the search box, `type` = SOP/IOW/LAB/WO/SHIFT/INC/MOC/REF); viewer = `docs/{doc_id}` (section anchors use the same ids as `sections[].id`, i.e. the numeric prefix of `##`–`####` headings); right rail = `records?run_id=` for the selected run. "Open in Knowledge" (H4) links a citation `[DOC-ID rN §x.y]` to `/knowledge/DOC-ID?section=x.y`.
- Citation display format: `[DOC-ID rN §x.y]`. Relevance threshold 0.35 for embeddings (BM25 is normalised). Below the threshold, the copilot says "No cited source".

## 7. Gemini

**Text copilot:** `POST /api/copilot/chat` with body

```json
{"messages":[{"role":"user","content":"..."}],"context":{"page":"/decision/overview","run_id":"..","property":"LCO_T98_F","time_min":125}}
```

The response is **SSE** with these events:

| Event | Payload |
|---|---|
| `thought` | `{text}` |
| `tool_call` | `{name, args}` |
| `final` | `{delta}` (markdown chunk) |
| `citation` | `{doc_id, revision, section, title}` |
| `chart` | `{figure}` (Plotly JSON) |
| `suggestion` | `{items:[str]}` |
| `error` | `{message}` |
| `done` | `{}` |

- Model `gemini-2.5-flash` on Vertex AI, project `fcc-soft-sensor`, location `us-central1`.
- Tools are read-only (SDD-COP-02), plus `search_documents`, `get_document` and `find_similar_events`.

**Live voice copilot:** `WS /api/live?run_id=&property=&time_min=&page=`

| Direction | Messages |
|---|---|
| Client → server | `{"type":"audio","data":"<base64 PCM16 mono 16 kHz>"}` · `{"type":"text","text":"..."}` · `{"type":"end"}` |
| Server → client | `{"type":"ready","model":"..."}` · `{"type":"audio","data":"<base64 PCM16 mono 24 kHz>"}` · `{"type":"transcript","role":"user"\|"model","text":"...","final":bool}` · `{"type":"tool_call","name":"...","args":{}}` · `{"type":"citation",...}` · `{"type":"interrupted"}` · `{"type":"turn_complete"}` · `{"type":"error","message":"..."}` |

- Model: `gemini-live-2.5-flash-native-audio` (config value; the fallback is probed at startup), on Vertex AI in `us-central1`. The Live API is **US-only**.
- The back end holds the credentials (ADC). The browser never sees them.
- The Live session uses the same tools and the same guardrails as text: the gate message is relayed verbatim, and no set point is proposed while the gate is WITHHELD.
