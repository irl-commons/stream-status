#!/usr/bin/env python3
"""Check that every implementation passes the shared fixtures and agrees.

Usage:
  conformance.py REPORT.json...

Each report comes from one implementation's runner (for example
`python3 tools/stream_status.py report` or `npm run --silent conformance` in
packages/typescript). A report must cover every file in fixtures/manifest.json.
A fixture passes when every implementation with the needed capability passes
it, and when they all observed the same thing (the same validity, the same
reader outcomes and views, the same in-band bytes). Python standard library
only.
"""
from __future__ import annotations

import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
MANIFEST = ROOT / "fixtures" / "manifest.json"


def load(path: pathlib.Path) -> dict:
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def compare(reports: list[dict]) -> list[str]:
    problems: list[str] = []
    manifest = load(MANIFEST)
    names = [report.get("implementation", "?") for report in reports]
    for report, name in zip(reports, names):
        if report.get("format") != "stream-status-conformance-report" or report.get("v") != 0:
            problems.append(f"{name}: not a v0 conformance report")
    if problems:
        return problems

    for suite, entry in manifest["suites"].items():
        capability = entry["capability"]
        for fixture in entry["files"]:
            observed: dict[str, object] = {}
            for report, name in zip(reports, names):
                result = report["results"].get(fixture)
                supported = capability in report.get("capabilities", [])
                if result is None:
                    problems.append(f"{fixture}: {name} has no result")
                    continue
                if result["result"] == "skip":
                    if supported:
                        problems.append(f"{fixture}: {name} skipped a case it claims to support")
                    continue
                if not supported:
                    problems.append(f"{fixture}: {name} ran a case without claiming {capability!r}")
                if result["result"] != "pass":
                    why = "; ".join(result.get("why", [])) or result["result"]
                    problems.append(f"{fixture}: {name} failed: {why}")
                observed[name] = result.get("observed")
            if not observed:
                problems.append(f"{fixture}: no implementation ran it")
            values = list(observed.values())
            for other, value in list(observed.items())[1:]:
                if value != values[0]:
                    first = next(iter(observed))
                    problems.append(
                        f"{fixture}: {first} and {other} disagree:\n"
                        f"    {first}: {json.dumps(values[0], sort_keys=True)}\n"
                        f"    {other}: {json.dumps(value, sort_keys=True)}"
                    )
    return problems


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print(__doc__)
        return 2
    reports = [load(pathlib.Path(path)) for path in argv[1:]]
    problems = compare(reports)
    for problem in problems:
        print(f"FAIL {problem}")
    total = sum(len(entry["files"]) for entry in load(MANIFEST)["suites"].values())
    names = ", ".join(report.get("implementation", "?") for report in reports)
    if problems:
        print(f"{len(problems)} problems across {total} fixtures ({names})")
        return 1
    print(f"{total} fixtures, all agree ({names})")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
