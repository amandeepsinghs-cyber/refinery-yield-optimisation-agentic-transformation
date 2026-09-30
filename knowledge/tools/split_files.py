#!/usr/bin/env python3
"""Split a Gemini response that contains several documents into files.

Usage: python3 knowledge/tools/split_files.py response.txt knowledge/corpus
The response must mark each file with a line:  === FILE: <folder>/<DOC-ID>.md ===
"""
import pathlib, re, sys

src, out = pathlib.Path(sys.argv[1]).read_text(encoding="utf-8"), pathlib.Path(sys.argv[2])
parts = re.split(r"^=== FILE: (\S+) ===\s*$", src, flags=re.M)
if len(parts) < 3: sys.exit("no '=== FILE: path ===' markers found")
for path, body in zip(parts[1::2], parts[2::2]):
    body = re.sub(r"^```(?:markdown|md)?\n|\n```\s*$", "", body.strip()) + "\n"
    p = out / path
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(body, encoding="utf-8")
    print("wrote", p)
