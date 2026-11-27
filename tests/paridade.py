"""Gera tests/fixtures/paridade.json, conferido pelos testes Python e JavaScript.

Uso: python tests/paridade.py
"""
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from labirinto.maze import add_mud, braid, generate  # noqa: E402
from labirinto.search import run_all  # noqa: E402

CASES = [
    {"w": 10, "h": 10, "seed": 1, "lacos": 0.0, "lama": 0.0},
    {"w": 24, "h": 16, "seed": 42, "lacos": 0.3, "lama": 0.0},
    {"w": 30, "h": 30, "seed": 2018, "lacos": 0.5, "lama": 0.2},
    {"w": 7, "h": 41, "seed": 99, "lacos": 1.0, "lama": 0.35},
]
FIXTURE = os.path.join(ROOT, "tests", "fixtures", "paridade.json")


def build():
    out = []
    for c in CASES:
        m = generate(c["w"], c["h"], c["seed"])
        if c["lacos"]:
            braid(m, c["lacos"], c["seed"])
        if c["lama"]:
            add_mud(m, c["lama"], c["seed"])
        out.append({**c, "cells": m.to_hex(), "cost": m.cost_string(),
                    "results": {r.key: r.summary() for r in run_all(m)}})
    return out


if __name__ == "__main__":
    with open(FIXTURE, "w", encoding="utf-8") as fh:
        json.dump(build(), fh, indent=1)
        fh.write("\n")
    print("fixture atualizada:", FIXTURE)
