#!/usr/bin/env python3
"""Validate the simulated knowledge corpus produced by the Gemini work packages (delegation.md).

Usage: python3 knowledge/tools/check_corpus.py knowledge/corpus
Checks: front matter, banner, doc_id/filename/type, numbered sections, citations resolve,
related_docs exist, tags exist, dates in range, no financial content, no real-company names.
Writes knowledge/corpus/manifest.json when there are no failures.
"""
import json, pathlib, re, sys, datetime as dt

ROOT = pathlib.Path(sys.argv[1])
REQ = ["doc_id", "title", "doc_type", "revision", "effective_date", "owner_role", "unit", "status",
       "related_tags", "related_events", "related_docs", "summary"]
TYPES = {"SOP": "sop", "IOW": "iow", "LAB": "lab", "WO": "work_orders", "SHIFT": "shift_logs",
         "INC": "incidents", "MOC": "moc", "REF": "references"}
TAGS = {"LCO_T98_F", "HN_T98_F", "SP_LCO_T98", "SP_HN_T98", "T_tray13_F", "T_tray06_F", "P5_frac_psia",
        "Tr_riser_F", "SP_T_riser_ROT_F", "feed_flow_lb_s", "dist_feed_API", "dist_T_feed_in_F",
        "dist_condenser_eff", "MV_PA1", "MV_PA2", "MV_PA3", "MV_PA4", "MV_reflux_ratio", "MV_cw_flow",
        "conversion_pct", "prod_LCO", "prod_HN", "prod_slurry", "Treg_F", "fluegas_O2_pct", "lab_sample",
        "crude_id", "event_code", "cutpoint_auto", "valve_V8", "valve_V9", "valve_V10", "valve_V11",
        "T_tray01_F", "T_tray20_F", "P6_regen_psia", "F_air_x29", "power_CAB", "power_WGC"}
BANNER = "SIMULATED DOCUMENT"
FIN = re.compile(r"[$€£₹]\s?\d|\bUSD\b|\bEUR\b|\bNPV\b|\bROI\b|payback|\bcost of\b|\bbudget\b|\bprice\b|"
                 r"\brevenue\b|\bprofit\b|\bmargin \$", re.I)
REAL = re.compile(r"\b(Reliance|IndianOil|IOCL|Shell(?![- ](?:side|and|&))|ExxonMobil|Exxon|Chevron|BP|Aramco|TotalEnergies|"
                  r"Valero|Marathon|Phillips 66|Honeywell|UOP|Lummus|Emerson|Yokogawa|AspenTech|Aspen)\b")
CITE = re.compile(r"\[([A-Z]+-[A-Z0-9]+(?:-[A-Z0-9]+)*) r(\d+) §([\d.]+)\]")
D0, D1 = dt.date(2024, 1, 1), dt.date(2026, 9, 30)

def front(t):
    m = re.match(r"^---\n(.*?)\n---\n", t, re.S)
    if not m: return None, t
    meta = {}
    for line in m.group(1).splitlines():
        if re.match(r"^\s*#", line) or not line.strip(): continue
        k, _, v = line.partition(":")
        v = v.strip()
        if v.startswith("[") and v.endswith("]"):
            v = [x.strip().strip("'\"") for x in v[1:-1].split(",") if x.strip()]
        meta[k.strip()] = v.strip("'\"") if isinstance(v, str) else v
    return meta, t[m.end():]

docs, fails, warns = {}, [], []
for p in sorted(ROOT.rglob("*.md")):
    t = p.read_text(encoding="utf-8")
    meta, body = front(t)
    if meta is None: fails.append(f"{p.name}: no YAML front matter"); continue
    for k in REQ:
        if k not in meta: fails.append(f"{p.name}: missing front-matter key '{k}'")
    did = meta.get("doc_id", "")
    if p.stem != did: fails.append(f"{p.name}: filename != doc_id '{did}'")
    pref = did.split("-")[0]
    if pref not in TYPES or p.parent.name != TYPES[pref]:
        fails.append(f"{p.name}: prefix '{pref}' must live in folder '{TYPES.get(pref, '?')}'")
    if meta.get("status") != "SIMULATED": fails.append(f"{p.name}: status must be SIMULATED")
    if BANNER not in body[:400]: fails.append(f"{p.name}: banner missing at top of body")
    try:
        d = dt.date.fromisoformat(str(meta.get("effective_date")))
        if not D0 <= d <= D1: fails.append(f"{p.name}: effective_date {d} outside {D0}..{D1}")
    except ValueError:
        fails.append(f"{p.name}: bad effective_date")
    secs = set(re.findall(r"^#{2,4}\s+(\d+(?:\.\d+)*)\s", body, re.M))
    if len(secs) < 2: fails.append(f"{p.name}: needs numbered section headings (## 1 ..., ### 1.1 ...)")
    for tag in meta.get("related_tags", []) or []:
        if tag not in TAGS: warns.append(f"{p.name}: unknown tag '{tag}'")
    for ln, line in enumerate(body.splitlines(), 1):
        if FIN.search(line): fails.append(f"{p.name}:{ln}: financial term -> {line.strip()[:80]}")
        if REAL.search(line): fails.append(f"{p.name}:{ln}: real company/vendor name -> {line.strip()[:80]}")
    docs[did] = dict(meta=meta, secs=secs, body=body, path=str(p.relative_to(ROOT)))

for did, d in docs.items():
    for rd in d["meta"].get("related_docs", []) or []:
        if rd not in docs: fails.append(f"{did}: related_docs '{rd}' not in corpus")
    for m in CITE.finditer(d["body"]):
        tid, rev, sec = m.group(1), m.group(2), m.group(3)
        if tid not in docs: fails.append(f"{did}: citation to unknown doc {tid}"); continue
        if str(docs[tid]["meta"].get("revision")) != rev: fails.append(f"{did}: cites {tid} r{rev}, corpus has r{docs[tid]['meta'].get('revision')}")
        if sec not in docs[tid]["secs"]: fails.append(f"{did}: cites {tid} §{sec}, section not found")

counts = {}
for did in docs: counts[did.split("-")[0]] = counts.get(did.split("-")[0], 0) + 1
print(f"docs={len(docs)} by type={counts}")
print("WARNINGS:"); [print("  -", w) for w in warns]
print("FAILURES:"); [print("  -", f) for f in fails]
if not fails:
    man = [dict(doc_id=k, path=v["path"], sections=sorted(v["secs"], key=lambda s: [int(x) for x in s.split(".")]),
                **{x: v["meta"].get(x) for x in REQ if x != "doc_id"}) for k, v in sorted(docs.items())]
    (ROOT / "manifest.json").write_text(json.dumps(man, indent=2))
    print(f"manifest.json written ({len(man)} docs)")
print("RESULT:", "PASS" if not fails else f"FAIL ({len(fails)})")
sys.exit(1 if fails else 0)
