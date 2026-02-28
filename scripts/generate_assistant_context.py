#!/usr/bin/env python3
"""Generate a paste-ready assistant context by concatenating key repo files.

Usage examples:
  python scripts/generate_assistant_context.py --output /tmp/session_summary.txt
  python scripts/generate_assistant_context.py | head -n 200
"""
from __future__ import annotations

import argparse
import datetime
import sys
from pathlib import Path

DEFAULT_FILES = [
    "README.md",
    "docs/INDEX.md",
    "docs/ARCHITECTURE.md",
    "template/index.html",
    "ASSISTANT_CONTEXT.md",
]


def read_text(path: Path) -> str:
    if not path.exists():
        return f"\n--- MISSING: {path} ---\n"
    try:
        return path.read_text(encoding="utf-8")
    except Exception as e:
        return f"\n--- ERROR READING {path}: {e} ---\n"


def build_summary(files: list[str]) -> str:
    parts: list[str] = []
    header = (
        f"Assistant session summary generated: {datetime.datetime.utcnow().isoformat()}Z\n"
        "(Truncated if large)\n\n"
    )
    parts.append(header)
    for fn in files:
        p = Path(fn)
        parts.append(f"\n===== FILE: {fn} =====\n")
        parts.append(read_text(p))
    return "\n".join(parts)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Concatenate key repo files into a paste-ready assistant context"
    )
    parser.add_argument(
        "--files",
        "-f",
        nargs="+",
        help="List of files to include in order",
    )
    parser.add_argument("--output", "-o", help="Write summary to this file (default: stdout)")
    args = parser.parse_args(argv)

    files = args.files or DEFAULT_FILES
    summary = build_summary(files)

    if args.output:
        out_path = Path(args.output)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(summary, encoding="utf-8")
        print(f"Wrote assistant summary to: {out_path}")
    else:
        sys.stdout.write(summary)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
