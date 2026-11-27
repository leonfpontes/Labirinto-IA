"""Modelo de labirinto em grade.

Cada célula guarda uma máscara de bits com as passagens abertas
(N=1, L=2, S=4, O=8) e um custo para entrar nela (1 = chão, 5 = lama).
O mesmo modelo é usado na arena web, o que permite comparar resultados
entre as duas implementações.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterator, List, Tuple

from .rng import Mulberry32

N, E, S, W = 1, 2, 4, 8
DIRS = (N, E, S, W)
DX = {N: 0, E: 1, S: 0, W: -1}
DY = {N: -1, E: 0, S: 1, W: 0}
OPPOSITE = {N: S, S: N, E: W, W: E}
MUD_COST = 5


@dataclass
class Maze:
    width: int
    height: int
    cells: List[int] = field(default_factory=list)
    cost: List[int] = field(default_factory=list)
    start: int = 0
    goal: int = -1

    def __post_init__(self) -> None:
        size = self.width * self.height
        if not self.cells:
            self.cells = [0] * size
        if not self.cost:
            self.cost = [1] * size
        if self.goal < 0:
            self.goal = size - 1

    # ------------------------------------------------------------ geometria
    @property
    def size(self) -> int:
        return self.width * self.height

    def xy(self, idx: int) -> Tuple[int, int]:
        return idx % self.width, idx // self.width

    def index(self, x: int, y: int) -> int:
        return y * self.width + x

    def neighbor(self, idx: int, d: int) -> int:
        """Vizinho na direção ``d`` ou -1 se estiver fora da grade."""
        x, y = self.xy(idx)
        nx, ny = x + DX[d], y + DY[d]
        if 0 <= nx < self.width and 0 <= ny < self.height:
            return self.index(nx, ny)
        return -1

    def carve(self, a: int, d: int) -> None:
        b = self.neighbor(a, d)
        if b < 0:
            raise ValueError("passagem para fora da grade")
        self.cells[a] |= d
        self.cells[b] |= OPPOSITE[d]

    def open_neighbors(self, idx: int) -> Iterator[int]:
        """Vizinhos acessíveis, sempre na ordem N, L, S, O."""
        m = self.cells[idx]
        for d in DIRS:
            if m & d:
                yield self.neighbor(idx, d)

    def passages(self) -> int:
        return sum(bin(c).count("1") for c in self.cells) // 2

    def is_perfect(self) -> bool:
        """Árvore geradora: todas as células ligadas e nenhum ciclo."""
        return self.passages() == self.size - 1 and self.connected()

    def connected(self) -> bool:
        seen = {0}
        stack = [0]
        while stack:
            for n in self.open_neighbors(stack.pop()):
                if n not in seen:
                    seen.add(n)
                    stack.append(n)
        return len(seen) == self.size

    # --------------------------------------------------------- serialização
    def to_hex(self) -> str:
        return "".join("0123456789abcdef"[c] for c in self.cells)

    def cost_string(self) -> str:
        return "".join("1" if c == 1 else "5" for c in self.cost)

    def to_dict(self) -> dict:
        return {
            "w": self.width,
            "h": self.height,
            "cells": self.to_hex(),
            "cost": self.cost_string(),
            "start": self.start,
            "goal": self.goal,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "Maze":
        cells = [int(ch, 16) for ch in data["cells"]]
        cost = [int(ch) for ch in data.get("cost", "")]
        return cls(data["w"], data["h"], cells, cost, data["start"], data["goal"])


# ------------------------------------------------------------------ geração
def generate(width: int, height: int, seed: int = 1) -> Maze:
    """Labirinto perfeito por backtracking recursivo (versão iterativa)."""
    rng = Mulberry32(seed)
    maze = Maze(width, height)
    visited = [False] * maze.size
    current = rng.randint(maze.size)
    visited[current] = True
    stack = [current]
    while stack:
        c = stack[-1]
        options = [d for d in DIRS if (n := maze.neighbor(c, d)) >= 0 and not visited[n]]
        if not options:
            stack.pop()
            continue
        d = options[rng.randint(len(options))]
        n = maze.neighbor(c, d)
        maze.carve(c, d)
        visited[n] = True
        stack.append(n)
    maze.start = 0
    maze.goal = maze.size - 1
    return maze


def braid(maze: Maze, fraction: float, seed: int = 1) -> Maze:
    """Remove becos sem saída abrindo paredes, o que cria rotas alternativas."""
    rng = Mulberry32(seed ^ 0x9E3779B9)
    for idx in range(maze.size):
        if bin(maze.cells[idx]).count("1") != 1:
            continue
        if rng.random() >= fraction:
            continue
        closed = [d for d in DIRS if not maze.cells[idx] & d and maze.neighbor(idx, d) >= 0]
        dead = [d for d in closed if bin(maze.cells[maze.neighbor(idx, d)]).count("1") == 1]
        pool = dead or closed
        if pool:
            maze.carve(idx, pool[rng.randint(len(pool))])
    return maze


def add_mud(maze: Maze, fraction: float, seed: int = 1) -> Maze:
    """Espalha manchas de lama (custo 5) para diferenciar custo de distância."""
    rng = Mulberry32(seed ^ 0x85EBCA6B)
    target = int(maze.size * fraction)
    painted = 0
    guard = 0
    while painted < target and guard < maze.size * 4:
        guard += 1
        cx, cy = rng.randint(maze.width), rng.randint(maze.height)
        radius = 1 + rng.randint(3)
        for y in range(cy - radius, cy + radius + 1):
            for x in range(cx - radius, cx + radius + 1):
                if not (0 <= x < maze.width and 0 <= y < maze.height):
                    continue
                if abs(x - cx) + abs(y - cy) > radius:
                    continue
                i = maze.index(x, y)
                if i in (maze.start, maze.goal) or maze.cost[i] != 1:
                    continue
                maze.cost[i] = MUD_COST
                painted += 1
    return maze


# ------------------------------------------------------------ imagem (2018)
def from_line_png(path: str | Path, pitch: int = 16) -> Maze:
    """Lê os labirintos de linhas do projeto original (pasta ``labirintos``).

    Nessas imagens os corredores são linhas pretas de 2 px que passam pelo
    centro de células de ``pitch`` px. A entrada é a abertura na borda de
    cima e a saída, a abertura na borda de baixo.
    """
    from PIL import Image

    img = Image.open(path).convert("L")
    px = img.load()
    w_px, h_px = img.size
    cols, rows = (w_px - 2) // pitch, (h_px - 2) // pitch
    half = pitch // 2

    def black(x: int, y: int) -> bool:
        return px[x, y] < 128

    maze = Maze(cols, rows)
    for y in range(rows):
        for x in range(cols):
            i = maze.index(x, y)
            if x + 1 < cols and black(pitch * (x + 1), half + pitch * y):
                maze.carve(i, E)
            if y + 1 < rows and black(half + pitch * x, pitch * (y + 1)):
                maze.carve(i, S)
    entry = next(x for x in range(w_px) if black(x, 0))
    exit_ = next(x for x in range(w_px) if black(x, h_px - 1))
    maze.start = maze.index(min(entry // pitch, cols - 1), 0)
    maze.goal = maze.index(min(exit_ // pitch, cols - 1), rows - 1)
    return maze
