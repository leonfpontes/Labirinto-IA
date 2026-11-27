"""Linha de comando: ``python -m labirinto``.

Exemplos::

    python -m labirinto resolver labirintos/labirinto.png
    python -m labirinto resolver --gerar 40 --lacos 0.3 --lama 0.15 --semente 7
    python -m labirinto gif labirintos/labirinto-20.png --saida docs/corrida.gif
    python -m labirinto exportar-web
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import List, Optional

from . import maze as mz
from .render import race_gif, render_result
from .search import ALGORITHMS, run_all

ORIGINAIS = {
    "original-20": "labirintos/labirinto-20.png",
    "original-100": "labirintos/labirinto.png",
    "original-200": "labirintos/labirinto-200.png",
}


def _load(args) -> mz.Maze:
    if args.gerar:
        m = mz.generate(args.gerar, args.gerar, args.semente)
        if args.lacos:
            mz.braid(m, args.lacos, args.semente)
        if args.lama:
            mz.add_mud(m, args.lama, args.semente)
        return m
    if not args.imagem:
        raise SystemExit("informe uma imagem de labirinto ou use --gerar N")
    return mz.from_line_png(args.imagem)


def _keys(text: str) -> List[str]:
    if text == "todos":
        return list(ALGORITHMS)
    keys = [k.strip() for k in text.split(",") if k.strip()]
    bad = [k for k in keys if k not in ALGORITHMS]
    if bad:
        raise SystemExit(f"algoritmo desconhecido: {', '.join(bad)} (opções: {', '.join(ALGORITHMS)})")
    return keys


def table(results) -> str:
    head = f"{'algoritmo':<24}{'achou':>7}{'custo':>9}{'passos':>9}{'expandidos':>12}{'fronteira':>11}{'tempo (ms)':>12}"
    lines = [head, "-" * len(head)]
    for r in results:
        lines.append(
            f"{r.name:<24}{'sim' if r.found else 'não':>7}{r.cost:>9}{len(r.path):>9}"
            f"{r.nodes_expanded:>12}{r.max_frontier:>11}{r.seconds * 1000:>12.2f}"
        )
    return "\n".join(lines)


def cmd_resolver(args) -> None:
    m = _load(args)
    results = run_all(m, _keys(args.algoritmos))
    print(f"labirinto {m.width}x{m.height}, entrada {m.xy(m.start)}, saída {m.xy(m.goal)}\n")
    print(table(results))
    if args.saida:
        out = Path(args.saida)
        out.mkdir(parents=True, exist_ok=True)
        for r in results:
            cell = max(2, min(12, 900 // max(m.width, m.height)))
            render_result(m, r, cell).save(out / f"resolucao-{r.key}.png")
        print(f"\nimagens salvas em {out}/")


def cmd_gif(args) -> None:
    m = _load(args)
    results = run_all(m, _keys(args.algoritmos))
    cell = args.celula or max(2, min(10, 300 // max(m.width, m.height)))
    path = race_gif(m, results, args.saida, cell=cell, frames=args.quadros)
    print(f"GIF salvo em {path}")


def cmd_exportar(args) -> None:
    data = {}
    for key, png in ORIGINAIS.items():
        d = mz.from_line_png(png).to_dict()
        d.pop("cost")  # sem lama: tudo custa 1
        data[key] = d
    out = Path(args.saida)
    out.write_text("export const ORIGINAIS = " + json.dumps(data, separators=(",", ":")) + ";\n",
                   encoding="utf-8")
    print(f"{len(data)} labirintos originais exportados para {out}")


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="labirinto", description="Buscas cegas e heurísticas em labirintos")
    sub = p.add_subparsers(dest="cmd", required=True)

    def common(sp):
        sp.add_argument("imagem", nargs="?", help="PNG de labirinto de linhas (pasta labirintos/)")
        sp.add_argument("--gerar", type=int, metavar="N", help="gera um labirinto N x N")
        sp.add_argument("--semente", type=int, default=2018)
        sp.add_argument("--lacos", type=float, default=0.0, help="fração de becos abertos (0 a 1)")
        sp.add_argument("--lama", type=float, default=0.0, help="fração de células com lama (custo 5)")
        sp.add_argument("--algoritmos", default="todos", help="lista separada por vírgula: " + ",".join(ALGORITHMS))

    r = sub.add_parser("resolver", help="roda as buscas e mostra o placar")
    common(r)
    r.add_argument("--saida", help="pasta para salvar uma imagem por busca")
    r.set_defaults(func=cmd_resolver)

    g = sub.add_parser("gif", help="gera um GIF com as buscas correndo lado a lado")
    common(g)
    g.add_argument("--saida", default="docs/corrida.gif")
    g.add_argument("--celula", type=int, default=0, help="tamanho da célula em px")
    g.add_argument("--quadros", type=int, default=90)
    g.set_defaults(func=cmd_gif)

    e = sub.add_parser("exportar-web", help="exporta os labirintos de 2018 para a arena web")
    e.add_argument("--saida", default="web/js/originais.js")
    e.set_defaults(func=cmd_exportar)
    return p


def main(argv: Optional[List[str]] = None) -> None:
    args = build_parser().parse_args(argv)
    args.func(args)
