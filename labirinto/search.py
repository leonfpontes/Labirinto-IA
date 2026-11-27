"""Algoritmos de busca e o agente da mão na parede.

Todas as buscas devolvem um :class:`SearchResult` com a ordem em que os
estados foram expandidos. É essa ordem que a arena web e o GIF animam.
As regras de desempate são as mesmas da versão JavaScript, então os
números batem entre as duas.
"""
from __future__ import annotations

import heapq
import time
from collections import deque
from dataclasses import dataclass, field
from typing import Callable, Dict, List, Optional

from .maze import DIRS, Maze


@dataclass
class SearchResult:
    key: str
    name: str
    found: bool
    path: List[int] = field(default_factory=list)
    cost: int = 0
    expanded: List[int] = field(default_factory=list)
    max_frontier: int = 0
    seconds: float = 0.0

    @property
    def nodes_expanded(self) -> int:
        return len(self.expanded)

    @property
    def unique_expanded(self) -> int:
        return len(set(self.expanded))

    def summary(self) -> dict:
        return {
            "key": self.key,
            "found": self.found,
            "cost": self.cost,
            "path_len": len(self.path),
            "expanded": self.nodes_expanded,
            "max_frontier": self.max_frontier,
        }


def manhattan(maze: Maze, a: int, b: int) -> int:
    ax, ay = maze.xy(a)
    bx, by = maze.xy(b)
    return abs(ax - bx) + abs(ay - by)


def _path(parent: Dict[int, int], goal: int) -> List[int]:
    out = [goal]
    while parent.get(out[-1], -1) >= 0:
        out.append(parent[out[-1]])
    return out[::-1]


def _cost(maze: Maze, path: List[int]) -> int:
    return sum(maze.cost[i] for i in path[1:])


def bfs(maze: Maze) -> SearchResult:
    res = SearchResult("bfs", "Busca em largura", False)
    parent = {maze.start: -1}
    q = deque([maze.start])
    while q:
        res.max_frontier = max(res.max_frontier, len(q))
        u = q.popleft()
        res.expanded.append(u)
        if u == maze.goal:
            res.found = True
            break
        for v in maze.open_neighbors(u):
            if v not in parent:
                parent[v] = u
                q.append(v)
    if res.found:
        res.path = _path(parent, maze.goal)
        res.cost = _cost(maze, res.path)
    return res


def dfs(maze: Maze) -> SearchResult:
    res = SearchResult("dfs", "Busca em profundidade", False)
    parent: Dict[int, int] = {}
    stack = [(maze.start, -1)]
    while stack:
        res.max_frontier = max(res.max_frontier, len(stack))
        u, p = stack.pop()
        if u in parent:
            continue
        parent[u] = p
        res.expanded.append(u)
        if u == maze.goal:
            res.found = True
            break
        for v in reversed(list(maze.open_neighbors(u))):
            if v not in parent:
                stack.append((v, u))
    if res.found:
        res.path = _path(parent, maze.goal)
        res.cost = _cost(maze, res.path)
    return res


def _best_first(maze: Maze, key: str, name: str, priority: Callable[[int, int], float],
                use_g: bool) -> SearchResult:
    """Busca de melhor-primeiro com fila de prioridade.

    ``priority(g, v)`` define a ordem; ``use_g`` liga a relaxação por custo
    acumulado (custo uniforme e A*). Sem ela temos a gulosa pura.
    """
    res = SearchResult(key, name, False)
    best_g = {maze.start: 0}
    parent: Dict[int, int] = {}
    closed = set()
    seq = 0
    heap = [(priority(0, maze.start), seq, maze.start, 0, -1)]
    while heap:
        res.max_frontier = max(res.max_frontier, len(heap))
        _, _, u, g, p = heapq.heappop(heap)
        if u in closed:
            continue
        closed.add(u)
        parent[u] = p
        res.expanded.append(u)
        if u == maze.goal:
            res.found = True
            break
        for v in maze.open_neighbors(u):
            if v in closed:
                continue
            g2 = g + maze.cost[v]
            if use_g:
                if g2 >= best_g.get(v, float("inf")):
                    continue
            elif v in best_g:
                continue
            best_g[v] = g2
            seq += 1
            heapq.heappush(heap, (priority(g2, v), seq, v, g2, u))
    if res.found:
        res.path = _path(parent, maze.goal)
        res.cost = _cost(maze, res.path)
    return res


def uniform_cost(maze: Maze) -> SearchResult:
    return _best_first(maze, "ucs", "Custo uniforme", lambda g, v: g, True)


def greedy(maze: Maze) -> SearchResult:
    return _best_first(maze, "greedy", "Gulosa", lambda g, v: manhattan(maze, v, maze.goal), False)


def astar(maze: Maze) -> SearchResult:
    floor = min(maze.cost)
    return _best_first(maze, "astar", "A*",
                       lambda g, v: g + floor * manhattan(maze, v, maze.goal), True)


def wall_follower(maze: Maze) -> SearchResult:
    """Agente sem mapa: anda sempre com a mão direita encostada na parede."""
    res = SearchResult("wall", "Mão na parede", False)
    here, facing = maze.start, 2  # entra pelo topo, olhando para o sul
    res.expanded.append(here)
    limit = maze.size * 8
    while here != maze.goal and len(res.expanded) < limit:
        for turn in (1, 0, 3, 2):  # direita, frente, esquerda, volta
            d = (facing + turn) % 4
            if maze.cells[here] & DIRS[d]:
                facing = d
                here = maze.neighbor(here, DIRS[d])
                break
        else:
            break
        res.expanded.append(here)
    res.found = here == maze.goal
    if res.found:
        res.path = list(res.expanded)
        res.cost = _cost(maze, res.path)
    res.max_frontier = 1
    return res


ALGORITHMS: Dict[str, Callable[[Maze], SearchResult]] = {
    "bfs": bfs,
    "dfs": dfs,
    "ucs": uniform_cost,
    "greedy": greedy,
    "astar": astar,
    "wall": wall_follower,
}


def run(maze: Maze, key: str) -> SearchResult:
    t0 = time.perf_counter()
    res = ALGORITHMS[key](maze)
    res.seconds = time.perf_counter() - t0
    return res


def run_all(maze: Maze, keys: Optional[List[str]] = None) -> List[SearchResult]:
    return [run(maze, k) for k in (keys or list(ALGORITHMS))]
