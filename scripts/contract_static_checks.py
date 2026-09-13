#!/usr/bin/env python3
"""
Contract static preflight checks (spec section 18, generic rules).

Verifies, by source inspection (no GenVM required), that both contracts:
  - declare the exact stable-runtime `Depends` hash string;
  - use `from genlayer import *` (not a v0.3-only import path);
  - use the required stable decorators (@gl.public.view / @gl.public.write /
    @gl.contract_interface);
  - never reference forbidden v0.3-only syntax
    (gl.contract.Contract, @gl.contract.interface, run_nondet_default);
  - never contain a hardcoded private key / mnemonic pattern.

Exits non-zero with a clear message on any violation, so CI fails fast on a
regression to the wrong runtime family.
"""
import re
import sys
from pathlib import Path

REQUIRED_DEPENDS = '{ "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }'

FORBIDDEN_PATTERNS = [
    "gl.contract.Contract",
    "@gl.contract.interface",
    "run_nondet_default",
]

REQUIRED_SUBSTRINGS = [
    "from genlayer import *",
]

PRIVATE_KEY_PATTERNS = [
    re.compile(r"0x[0-9a-fA-F]{64}\b"),  # raw 32-byte hex key literal
    re.compile(r"(?i)(private_key|priv_key|mnemonic|secret_key)\s*=\s*[\"']\S"),  # assigned secret literal
]

CONTRACTS = [
    Path(__file__).resolve().parent.parent / "contracts" / "FailoverRegistry.py",
    Path(__file__).resolve().parent.parent / "contracts" / "FailoverGate.py",
]


def check_file(path: Path) -> list:
    problems = []
    text = path.read_text()

    if REQUIRED_DEPENDS not in text:
        problems.append(f"{path.name}: missing exact required Depends hash string")

    for required in REQUIRED_SUBSTRINGS:
        if required not in text:
            problems.append(f"{path.name}: missing required import '{required}'")

    for forbidden in FORBIDDEN_PATTERNS:
        if forbidden in text:
            problems.append(f"{path.name}: contains forbidden v0.3-only syntax '{forbidden}'")

    if "@gl.public.view" not in text and "@gl.public.write" not in text:
        problems.append(f"{path.name}: no @gl.public.view/@gl.public.write decorators found")

    for pattern in PRIVATE_KEY_PATTERNS:
        if pattern.search(text):
            problems.append(f"{path.name}: matches a pattern resembling a hardcoded private key/mnemonic")

    return problems


def main() -> int:
    all_problems = []
    for path in CONTRACTS:
        if not path.exists():
            all_problems.append(f"missing expected contract file: {path}")
            continue
        all_problems.extend(check_file(path))

    if all_problems:
        print("Contract static preflight FAILED:")
        for p in all_problems:
            print(f" - {p}")
        return 1

    print("Contract static preflight passed:")
    for path in CONTRACTS:
        print(f" - {path.name}: Depends hash OK, stable imports OK, no forbidden v0.3 syntax, no embedded key")
    return 0


if __name__ == "__main__":
    sys.exit(main())
