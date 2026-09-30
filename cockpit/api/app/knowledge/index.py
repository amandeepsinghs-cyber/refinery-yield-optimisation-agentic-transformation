"""Knowledge index over knowledge/corpus/**.md (Epic H).

Chunking: one chunk per `###` section; documents without `###` headings are chunked per `##` section.
Index: Vertex AI embeddings (config gemini.embed_model, then fallbacks) cached to artifacts/knowledge/; BM25
fallback (rank_bm25) whenever embeddings are unavailable. Empty corpus -> mode "empty", no errors."""
from __future__ import annotations

import datetime as _dt
import hashlib
import json
import re
import threading
from pathlib import Path

import numpy as np
from rank_bm25 import BM25Okapi

from ..config import get_settings

CITE_RE = re.compile(r"\[([A-Z]+-[A-Z0-9]+(?:-[A-Z0-9]+)*) r(\d+) §([\d.]+)\]")
HEAD_RE = re.compile(r"^(#{2,4})\s+(\d+(?:\.\d+)*)?\.?\s*(.*)$")
RECORD_TYPES = {"SHIFT", "WO", "INC", "MOC", "LAB"}


def parse_front(t: str):
    t = t.replace("\r\n", "\n")
    m = re.match(r"^---\n(.*?)\n---\n", t, re.S)
    if not m:
        return {}, t
    meta = {}
    for line in m.group(1).splitlines():
        if re.match(r"^\s*#", line) or not line.strip() or ":" not in line:
            continue
        k, _, v = line.partition(":")
        v = v.strip()
        if v.startswith("[") and v.endswith("]"):
            v = [x.strip().strip("'\"") for x in v[1:-1].split(",") if x.strip()]
        else:
            v = v.strip("'\"")
        meta[k.strip()] = v
    return meta, t[m.end():]


def chunk_doc(meta: dict, body: str) -> list[dict]:
    lines = body.splitlines()
    heads = [(i, HEAD_RE.match(l)) for i, l in enumerate(lines)]
    heads = [(i, m) for i, m in heads if m]
    level = 3 if any(len(m.group(1)) == 3 for _, m in heads) else 2
    cuts = [(i, m) for i, m in heads if len(m.group(1)) <= level]
    chunks = []
    base = {"doc_id": meta.get("doc_id", ""), "revision": _int(meta.get("revision")), "title": meta.get("title", ""),
            "doc_type": meta.get("doc_type") or meta.get("doc_id", "").split("-")[0]}
    for k, (i, m) in enumerate(cuts):
        end = cuts[k + 1][0] if k + 1 < len(cuts) else len(lines)
        text = "\n".join(lines[i + 1:end]).strip()
        if not text and len(m.group(1)) < level:
            continue
        chunks.append({**base, "section": m.group(2) or "", "section_title": m.group(3).strip(), "text": text,
                       "snippet": re.sub(r"\s+", " ", text)[:280]})
    if not chunks and body.strip():
        chunks.append({**base, "section": "", "section_title": "", "text": body.strip(),
                       "snippet": re.sub(r"\s+", " ", body.strip())[:280]})
    return chunks


def _int(v):
    try:
        return int(v)
    except (TypeError, ValueError):
        return v


def _tok(t: str) -> list[str]:
    return re.findall(r"[a-z0-9_]+", t.lower())


class KnowledgeIndex:
    def __init__(self, settings=None):
        self.s = settings or get_settings()
        self.docs: dict[str, dict] = {}
        self.chunks: list[dict] = []
        self.mode = "empty"
        self.emb = None
        self.emb_model = None
        self.bm25 = None
        self.note = None
        self._lock = threading.Lock()

    # ---------------------------------------------------------------- loading
    def load(self, embed: bool = True, background: bool = True) -> None:
        root = self.s.knowledge_dir
        docs, chunks = {}, []
        if root.exists():
            for p in sorted(root.rglob("*.md")):
                try:
                    t = p.read_text(encoding="utf-8")
                except OSError:
                    continue
                meta, body = parse_front(t)
                did = meta.get("doc_id") or p.stem
                meta.setdefault("doc_id", did)
                secs = [{"id": m.group(2), "title": m.group(3).strip()} for m in
                        (HEAD_RE.match(l) for l in body.splitlines()) if m and m.group(2)]
                docs[did] = {"meta": meta, "markdown": body, "sections": secs, "path": str(p.relative_to(root))}
                chunks += chunk_doc(meta, body)
        with self._lock:
            self.docs, self.chunks = docs, chunks
            self.emb = None
            if not chunks:
                self.mode, self.bm25 = "empty", None
                return
            self.bm25 = BM25Okapi([_tok(c["title"] + " " + c["section_title"] + " " + c["text"]) for c in chunks])
            self.mode = "bm25"
        if embed:
            if background:
                threading.Thread(target=self._build_embeddings, daemon=True).start()
            else:
                self._build_embeddings()

    def _client(self):
        from google import genai
        g = self.s["gemini"]
        return genai.Client(vertexai=True, project=g["project"], location=g["location"])

    def _embed(self, client, model, texts, task):
        from google.genai import types
        out = []
        step = 1 if model.startswith("gemini-embedding") else 64
        for i in range(0, len(texts), step):
            r = client.models.embed_content(model=model, contents=texts[i:i + step],
                                            config=types.EmbedContentConfig(task_type=task))
            out += [e.values for e in r.embeddings]
        a = np.array(out, dtype=np.float32)
        return a / np.maximum(np.linalg.norm(a, axis=1, keepdims=True), 1e-9)

    def _build_embeddings(self):
        chunks = self.chunks
        texts = [f"{c['title']} — {c['section']} {c['section_title']}\n{c['text'][:3000]}" for c in chunks]
        g = self.s["gemini"]
        models = [g["embed_model"]] + [m for m in g.get("embed_fallbacks", []) if m != g["embed_model"]]
        cache_dir = self.s.artifacts / "knowledge"
        cache_dir.mkdir(exist_ok=True)
        errs = []
        for model in models:
            h = hashlib.sha256(("\n\x00".join(texts) + model).encode()).hexdigest()[:16]
            f = cache_dir / f"index_{h}.npz"
            try:
                if f.exists():
                    emb = np.load(f)["emb"]
                else:
                    emb = self._embed(self._client(), model, texts, "RETRIEVAL_DOCUMENT")
                    np.savez_compressed(f, emb=emb)
                with self._lock:
                    if self.chunks is chunks:
                        self.emb, self.emb_model, self.mode, self.note = emb, model, "embedding", None
                return
            except Exception as e:  # noqa: BLE001
                errs.append(f"{model}: {str(e)[:160]}")
        self.note = "embeddings unavailable, BM25 fallback: " + " | ".join(errs)

    # ---------------------------------------------------------------- queries
    def info(self) -> dict:
        return {"docs": len(self.docs), "chunks": len(self.chunks), "mode": self.mode}

    def search(self, q: str, doc_type: str | None = None, k: int = 8) -> list[dict]:
        if self.mode == "empty" or not q or not q.strip():
            return []
        idx = [i for i, c in enumerate(self.chunks) if not doc_type or str(c["doc_type"]).upper() == doc_type.upper()]
        if not idx:
            return []
        scores = None
        thr = float(self.s["knowledge"]["min_score_bm25"])
        if self.mode == "embedding" and self.emb is not None:
            try:
                qv = self._embed(self._client(), self.emb_model, [q], "RETRIEVAL_QUERY")[0]
                scores = self.emb[idx] @ qv
                thr = float(self.s["knowledge"]["min_score_embedding"])
            except Exception:  # noqa: BLE001
                scores = None
        if scores is None:
            raw = np.asarray(self.bm25.get_scores(_tok(q)))[idx]
            mx = raw.max() if len(raw) else 0
            scores = raw / mx if mx > 0 else raw
            thr = float(self.s["knowledge"]["min_score_bm25"])
        order = np.argsort(-scores)[:k]
        out = []
        for o in order:
            c = self.chunks[idx[o]]
            out.append({"doc_id": c["doc_id"], "revision": c["revision"], "section": c["section"], "title": c["title"],
                        "section_title": c["section_title"], "doc_type": c["doc_type"], "snippet": c["snippet"],
                        "score": round(float(scores[o]), 4), "above_threshold": bool(scores[o] >= thr)})
        return out

    def citations(self, q: str, k: int = 2, doc_type: str | None = None) -> list[dict]:
        return [{"doc_id": r["doc_id"], "revision": r["revision"], "section": r["section"], "title": r["title"],
                 "snippet": r["snippet"]} for r in self.search(q, doc_type, k=k * 2) if r["above_threshold"]][:k]

    def manifest(self) -> list[dict]:
        f = self.s.knowledge_dir / "manifest.json"
        raw = None
        if f.exists():
            try:
                raw = json.loads(f.read_text())
            except (OSError, ValueError):
                raw = None
        if raw is None:
            raw = [{"doc_id": d, "path": v["path"], "sections": [s["id"] for s in v["sections"]],
                    **{k: v["meta"].get(k) for k in ("title", "doc_type", "revision", "effective_date", "owner_role",
                                                      "unit", "status", "related_tags", "related_events", "related_docs",
                                                      "summary")}} for d, v in sorted(self.docs.items())]
        out = []
        for item in raw:
            did = item.get("doc_id")
            doc = self.docs.get(did)
            m = doc.get("meta", {}) if doc else {}
            srun = m.get("sim_run") or item.get("sim_run")
            sbatch = m.get("sim_batch") or item.get("sim_batch")
            swin = m.get("sim_window") if "sim_window" in m else item.get("sim_window")
            d = dict(item)
            if srun:
                d["sim_run"] = srun
                d["sim_batch"] = sbatch or DEFAULT_SIM_BATCH
            elif sbatch:
                d["sim_batch"] = sbatch
            if swin is not None:
                try:
                    win = [int(float(x)) for x in swin][:2] if isinstance(swin, list) and swin else swin
                except (TypeError, ValueError):
                    win = swin
                d["sim_window"] = win
            out.append(d)
        return out

    def get_doc(self, doc_id: str, section: str | None = None) -> dict | None:
        d = self.docs.get(doc_id)
        if not d:
            return None
        out = {"meta": d["meta"], "markdown": d["markdown"], "sections": d["sections"]}
        if section:
            cs = [c for c in self.chunks if c["doc_id"] == doc_id and (c["section"] == section or c["section"].startswith(section + "."))]
            out["section_text"] = "\n\n".join(f"### {c['section']} {c['section_title']}\n{c['text']}" for c in cs)
        return out

    def records(self, run_id: str | None, run_minutes: int | None = None, batch: str | None = None) -> list[dict]:
        """Job-record markers on the run axis (DECISIONS D6: every run starts at ts_base = 2026-09-01T00:00Z).

        - Docs with `sim_run` (+ optional `sim_batch`, default `full_v1`): placed at `sim_window[0]` on their own run's
          axis; without a usable `sim_window` they are listed with time_min null. Entries "**YYYY-MM-DD HH:MM
          (time_min N)**" become `entries` (explicit time_min wins; otherwise minutes since ts_base). With `run_id`,
          other runs' docs are dropped; with `batch`, docs from another sim_batch are dropped.
        - Records without sim_run/sim_window are never placed at an invented minute: time_min is null and they are
          listed by `date` only.
        """
        out = []
        for did, d in sorted(self.docs.items()):
            m = d["meta"]
            dt = str(m.get("doc_type") or did.split("-")[0]).upper()
            if dt not in RECORD_TYPES and did.split("-")[0] not in RECORD_TYPES:
                continue
            srun = m.get("sim_run")
            sbatch = m.get("sim_batch") or DEFAULT_SIM_BATCH
            if run_id and srun and srun != run_id:
                continue            # belongs to another run
            if batch and srun and sbatch != batch:
                continue            # same run name in another batch
            rec = {"doc_id": did, "doc_type": dt, "title": m.get("title", ""), "date": m.get("effective_date"),
                   "time_min": None, "run_id": srun or None, "sim_batch": sbatch if srun else None}
            if srun:
                w = m.get("sim_window")
                try:
                    win = [int(float(x)) for x in w][:2] if isinstance(w, list) and w else None
                except (TypeError, ValueError):
                    win = None
                rec["window"] = win
                rec["time_min"] = win[0] if win else None
                rec["entries"] = parse_entries(d["markdown"], srun, self._ts_base())
                rec["sim_run"] = srun
                rec["sim_batch"] = sbatch
                rec["sim_window"] = win
            elif m.get("sim_batch"):
                rec["sim_batch"] = m.get("sim_batch")
            out.append(rec)
        return out

    def _ts_base(self):
        try:
            v = self.s["data"]["ts_base"]
        except (KeyError, TypeError):
            v = None
        return ts_base_dt(v)


ENTRY_RE = re.compile(r"^\s*-\s*\*\*(\d{4}-\d\d-\d\d \d\d:\d\d)(?:\s*\(time_min\s*(-?\d+)\))?\*\*:?\s*(.*)$")


DEFAULT_SIM_BATCH = "full_v1"
DEFAULT_TS_BASE = "2026-09-01T00:00:00Z"


def ts_base_dt(v: str | None = None) -> _dt.datetime:
    """DECISIONS D6: ts = ts_base + time_min minutes for every run (naive UTC datetime)."""
    return _dt.datetime.fromisoformat(str(v or DEFAULT_TS_BASE).replace("Z", "+00:00")).replace(tzinfo=None)


def run_clock_start(run_id: str | None, ts_base: str | None = None):
    """Every run starts at ts_base (2026-09-01T00:00Z, DECISIONS D6); None for an empty run id."""
    return ts_base_dt(ts_base) if run_id else None


def parse_entries(body: str, run_id: str, t0: _dt.datetime | None = None) -> list[dict]:
    """Timestamped entries. time_min = the explicit "(time_min N)" if present, else minutes since the run start (D6)."""
    t0 = t0 or run_clock_start(run_id)
    sec, out = "", []
    for line in body.splitlines():
        h = HEAD_RE.match(line)
        if h:
            sec = h.group(3).strip()
            continue
        e = ENTRY_RE.match(line)
        if not e:
            continue
        tm = int(e.group(2)) if e.group(2) is not None else \
            (int((_dt.datetime.strptime(e.group(1), "%Y-%m-%d %H:%M") - t0).total_seconds() // 60) if t0 else None)
        if tm is None:
            continue
        text = re.sub(r"\s+", " ", e.group(3)).strip()
        ev = re.match(r"Event (\d+)", text)
        out.append({"time_min": tm, "timestamp": e.group(1), "section": sec, "event_code": int(ev.group(1)) if ev else None,
                    "text": text[:240]})
    return out
