"""Evaluation harness for the FCC Soft-Sensor Gemini Copilot.

Evaluates the copilot against the golden set (Scenes 5 & 6 + Guardrails) using the real
fastapi/Vertex AI chat_stream code path.
Outputs:
  - cockpit/api/artifacts/copilot_eval.md (Markdown report)
  - cockpit/api/artifacts/copilot_eval.json (Machine-readable JSON)

Run from cockpit/api: `.venv/bin/python scripts/eval_copilot.py [--strict]` (or `make copilot-eval`).
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))  # make `app` importable when run as a script

import argparse
import asyncio
import json
import logging
import os
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import yaml

from app.copilot.chat import chat_stream
from app.knowledge.index import CITE_RE
from app.state import get_state

log = logging.getLogger("eval_copilot")


def parse_sse_events(sse_chunk: str) -> list[tuple[str, dict]]:
    """Parse SSE string blocks into (event_type, data) tuples."""
    events = []
    blocks = sse_chunk.split("\n\n")
    for block in blocks:
        block = block.strip()
        if not block:
            continue
        ev_type = None
        data = None
        for line in block.splitlines():
            if line.startswith("event: "):
                ev_type = line[7:].strip()
            elif line.startswith("data: "):
                payload = line[6:].strip()
                try:
                    data = json.loads(payload)
                except Exception:
                    data = {"raw": payload}
        if ev_type is not None:
            events.append((ev_type, data or {}))
    return events


async def run_single_case(case: dict[str, Any]) -> dict[str, Any]:
    """Execute one case against the real copilot code path and evaluate rules."""
    cid = case["id"]
    q = case["question"]
    ctx = dict(case.get("context") or {})
    ctx["run_id"] = case.get("run", "random_s140")

    messages = [{"role": "user", "content": q}]

    tools_called = []
    citations = []
    final_chunks = []
    thoughts = []
    errors = []

    t0 = time.perf_counter()
    try:
        async for chunk in chat_stream(messages, ctx):
            for ev_type, data in parse_sse_events(chunk):
                if ev_type == "tool_call":
                    tools_called.append(data.get("name"))
                elif ev_type == "citation":
                    doc_id = data.get("doc_id")
                    rev = data.get("revision")
                    sec = data.get("section")
                    citations.append(f"[{doc_id} r{rev} §{sec}]")
                elif ev_type == "final":
                    final_chunks.append(data.get("delta", ""))
                elif ev_type == "thought":
                    thoughts.append(data.get("text", ""))
                elif ev_type == "error":
                    errors.append(data.get("message", ""))
    except Exception as e:
        errors.append(f"Exception during stream: {str(e)[:300]}")
    latency_s = round(time.perf_counter() - t0, 2)

    final_text = "".join(final_chunks).strip()

    # Also detect any citation patterns in the final text
    for m in CITE_RE.finditer(final_text):
        tag = m.group(0)
        if tag not in citations:
            citations.append(tag)

    # --- Rule evaluation ---
    rule_results: dict[str, dict[str, Any]] = {}

    # 1. Tools called rule
    must_call = case.get("must_call_tools") or []
    tool_failures = []
    for req in must_call:
        options = [t.strip() for t in req.split("|")]
        if not any(opt in tools_called for opt in options):
            tool_failures.append(req)
    rule_results["must_call_tools"] = {
        "pass": len(tool_failures) == 0,
        "expected": must_call,
        "actual": tools_called,
        "detail": f"Missing required tool call: {tool_failures}" if tool_failures else "OK",
    }

    # 2. Must cite rule
    must_cite = case.get("must_cite") or []
    cite_failures = []
    all_cited_text = " ".join(citations) + " " + final_text
    for req in must_cite:
        options = [d.strip() for d in req.split("|")]
        found = False
        for opt in options:
            bare_doc = opt.split()[0]
            if bare_doc in all_cited_text:
                found = True
                break
        if not found:
            cite_failures.append(req)
    rule_results["must_cite"] = {
        "pass": len(cite_failures) == 0,
        "expected": must_cite,
        "actual": citations,
        "detail": f"Missing required citation: {cite_failures}" if cite_failures else "OK",
    }

    # 3. Must contain regex rule
    must_contain_pat = case.get("must_contain")
    if must_contain_pat:
        matched = bool(re.search(must_contain_pat, final_text))
        rule_results["must_contain"] = {
            "pass": matched,
            "pattern": must_contain_pat,
            "detail": "Pattern matched" if matched else f"Pattern not found in response: '{must_contain_pat}'",
        }
    else:
        rule_results["must_contain"] = {"pass": True, "detail": "None"}

    # 4. Must not contain regex rule
    must_not_contain_pat = case.get("must_not_contain")
    if must_not_contain_pat:
        matched_forbidden = bool(re.search(must_not_contain_pat, final_text))
        rule_results["must_not_contain"] = {
            "pass": not matched_forbidden,
            "pattern": must_not_contain_pat,
            "detail": "Forbidden pattern absent" if not matched_forbidden else f"Forbidden pattern present: '{must_not_contain_pat}'",
        }
    else:
        rule_results["must_not_contain"] = {"pass": True, "detail": "None"}

    # 5. Latency rule
    max_lat = case.get("max_latency_s", 20.0)
    lat_pass = latency_s <= (max_lat + 2.0)  # 2s grace for network variability
    rule_results["latency"] = {
        "pass": lat_pass,
        "actual_s": latency_s,
        "max_s": max_lat,
        "detail": f"{latency_s}s <= {max_lat}s" if lat_pass else f"Exceeded latency limit: {latency_s}s > {max_lat}s",
    }

    # 6. Stream errors
    no_errors = len(errors) == 0
    rule_results["no_errors"] = {
        "pass": no_errors,
        "detail": "OK" if no_errors else f"Encountered errors: {errors}",
    }

    passed = all(r["pass"] for r in rule_results.values())

    return {
        "id": cid,
        "scene": case.get("scene", "unknown"),
        "question": q,
        "passed": passed,
        "latency_s": latency_s,
        "tools_called": tools_called,
        "citations": citations,
        "final_text": final_text,
        "errors": errors,
        "rule_results": rule_results,
    }


def generate_markdown_report(results: list[dict[str, Any]], meta: dict[str, Any]) -> str:
    """Generate structured markdown evaluation report."""
    total = len(results)
    passed_count = sum(1 for r in results if r["passed"])
    pass_rate = (passed_count / total * 100) if total else 0.0

    lines = []
    lines.append("# Gemini Copilot Golden Set Evaluation Report")
    lines.append("")
    lines.append(f"**BLUF: {passed_count}/{total} cases passed ({pass_rate:.1f}% pass rate).**")
    lines.append("")
    lines.append(f"- **Evaluated at:** {meta['timestamp']}")
    lines.append(f"- **Model:** `{meta['model']}` (Vertex AI `{meta['location']}`, project `{meta['project']}`)")
    lines.append(f"- **Total Duration:** {meta['total_duration_s']:.1f}s (Average latency: {meta['avg_latency_s']:.2f}s)")
    lines.append(f"- **Corpus mode:** {meta['knowledge_mode']} ({meta['knowledge_docs']} documents, {meta['knowledge_chunks']} chunks)")
    lines.append("")

    # Scene breakdown
    scenes = sorted(set(r["scene"] for r in results))
    lines.append("## Results by Scene")
    lines.append("")
    lines.append("| Scene | Cases | Passed | Pass Rate |")
    lines.append("|---|---|---|---|")
    for sc in scenes:
        sc_cases = [r for r in results if r["scene"] == sc]
        sc_passed = sum(1 for r in sc_cases if r["passed"])
        sc_rate = (sc_passed / len(sc_cases) * 100) if sc_cases else 0.0
        lines.append(f"| `{sc}` | {len(sc_cases)} | {sc_passed} | {sc_rate:.1f}% |")
    lines.append("")

    # Summary table
    lines.append("## Case Summary")
    lines.append("")
    lines.append("| ID | Scene | Latency | Status | Tools Called | Citations | Issues |")
    lines.append("|---|---|---|---|---|---|---|")
    for r in results:
        status_icon = "PASS" if r["passed"] else "**FAIL**"
        tools_str = ", ".join(f"`{t}`" for t in r["tools_called"]) or "*(none)*"
        cites_str = ", ".join(r["citations"]) or "*(none)*"
        issues = []
        for rname, rres in r["rule_results"].items():
            if not rres["pass"]:
                issues.append(f"{rname}: {rres['detail']}")
        issues_str = "; ".join(issues) if issues else "*(none)*"
        lines.append(f"| `{r['id']}` | `{r['scene']}` | {r['latency_s']}s | {status_icon} | {tools_str} | {cites_str} | {issues_str} |")
    lines.append("")

    # Detailed traces
    lines.append("## Detailed Traces")
    lines.append("")
    for r in results:
        lines.append(f"### Case: `{r['id']}` ({r['scene']})")
        lines.append(f"- **Question:** \"{r['question']}\"")
        lines.append(f"- **Status:** {'PASS' if r['passed'] else 'FAIL'} (Latency: {r['latency_s']}s)")
        lines.append(f"- **Tools Called:** {', '.join(f'`{t}`' for t in r['tools_called']) or 'None'}")
        lines.append(f"- **Citations:** {', '.join(r['citations']) or 'None'}")
        lines.append("")
        lines.append("**Copilot Response:**")
        lines.append("> " + r["final_text"].replace("\n", "\n> "))
        lines.append("")
        lines.append("**Rule Breakdown:**")
        for rname, rres in r["rule_results"].items():
            check_str = "PASS" if rres["pass"] else "FAIL"
            lines.append(f"- `{rname}`: **{check_str}** — {rres['detail']}")
        lines.append("")

    return "\n".join(lines)


async def main_async(args: argparse.Namespace) -> int:
    golden_path = Path(args.golden).resolve()
    if not golden_path.exists():
        log.error("Golden file not found: %s", golden_path)
        return 2

    with open(golden_path, "r", encoding="utf-8") as f:
        data = yaml.safe_load(f)
    cases = data.get("cases", [])

    if args.filter:
        cases = [c for c in cases if args.filter.lower() in c["id"].lower()]
    if args.scene:
        cases = [c for c in cases if c.get("scene") == args.scene]
    if args.max_cases:
        cases = cases[:int(args.max_cases)]

    if not cases:
        print("No cases matching criteria.")
        return 0

    st = get_state()
    st.knowledge.load(embed=True, background=False)

    meta = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "project": st.s["gemini"]["project"],
        "location": st.s["gemini"]["location"],
        "model": st.s["gemini"]["text_model"],
        "knowledge_mode": st.knowledge.mode,
        "knowledge_docs": len(st.knowledge.docs),
        "knowledge_chunks": len(st.knowledge.chunks),
    }

    print(f"=== Running Copilot Golden Set Evaluation ({len(cases)} cases) ===")
    print(f"Model: {meta['model']} ({meta['project']}, {meta['location']})")
    print(f"Knowledge mode: {meta['knowledge_mode']}")
    print("-" * 75)

    results = []
    t_start = time.perf_counter()

    for idx, case in enumerate(cases, 1):
        cid = case["id"]
        sys.stdout.write(f"[{idx:02d}/{len(cases):02d}] {cid:32s} ... ")
        sys.stdout.flush()

        res = await run_single_case(case)
        results.append(res)

        status_str = "PASS" if res["passed"] else "FAIL"
        print(f"{status_str:4s} ({res['latency_s']:.1f}s)")
        if not res["passed"]:
            for rname, rres in res["rule_results"].items():
                if not rres["pass"]:
                    print(f"     -> {rname}: {rres['detail']}")

    t_total = time.perf_counter() - t_start
    meta["total_duration_s"] = t_total
    meta["avg_latency_s"] = (sum(r["latency_s"] for r in results) / len(results)) if results else 0.0

    passed_count = sum(1 for r in results if r["passed"])
    total_count = len(results)
    pass_rate = (passed_count / total_count * 100) if total_count else 0.0

    print("-" * 75)
    print(f"Evaluation Complete: {passed_count}/{total_count} passed ({pass_rate:.1f}%) in {t_total:.1f}s")

    # Write JSON report
    out_json = Path(args.output_json).resolve()
    out_json.parent.mkdir(parents=True, exist_ok=True)
    with open(out_json, "w", encoding="utf-8") as f:
        json.dump({"meta": meta, "results": results}, f, indent=2)
    print(f"Wrote JSON report to: {out_json}")

    # Write Markdown report
    out_md = Path(args.output_md).resolve()
    out_md.parent.mkdir(parents=True, exist_ok=True)
    md_content = generate_markdown_report(results, meta)
    with open(out_md, "w", encoding="utf-8") as f:
        f.write(md_content)
    print(f"Wrote Markdown report to: {out_md}")

    if args.strict and passed_count < total_count:
        return 1
    return 0


def main():
    parser = argparse.ArgumentParser(description="Evaluate FCC Soft-Sensor Copilot against golden set")
    base_dir = Path(__file__).resolve().parent.parent
    parser.add_argument("--golden", default=str(base_dir / "golden" / "golden.yaml"),
                        help="Path to golden.yaml file")
    parser.add_argument("--filter", default=None, help="Filter cases by id substring")
    parser.add_argument("--scene", default=None, help="Filter cases by scene")
    parser.add_argument("--max-cases", type=int, default=None, help="Cap number of cases run")
    parser.add_argument("--output-json", default=str(base_dir / "artifacts" / "copilot_eval.json"),
                        help="Destination for JSON results")
    parser.add_argument("--output-md", default=str(base_dir / "artifacts" / "copilot_eval.md"),
                        help="Destination for Markdown report")
    parser.add_argument("--strict", action="store_true", help="Exit code 1 on any failure")

    args = parser.parse_args()
    exit_code = asyncio.run(main_async(args))
    sys.exit(exit_code)


if __name__ == "__main__":
    main()
