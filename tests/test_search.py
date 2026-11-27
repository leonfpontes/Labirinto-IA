import heapq

import pytest

from labirinto.maze import add_mud, braid, from_line_png, generate
from labirinto.search import ALGORITHMS, run, run_all

OPTIMAL = ("ucs", "astar")


def reference_cost(m):
    """Dijkstra escrito do jeito mais simples possível, para conferir os outros."""
    dist = {m.start: 0}
    heap = [(0, m.start)]
    while heap:
        d, u = heapq.heappop(heap)
        if d > dist[u]:
            continue
        for v in m.open_neighbors(u):
            nd = d + m.cost[v]
            if nd < dist.get(v, float("inf")):
                dist[v] = nd
                heapq.heappush(heap, (nd, v))
    return dist[m.goal]


def mazes():
    yield "perfeito", generate(25, 25, 1)
    yield "lacos", braid(generate(25, 25, 2), 0.5, 2)
    yield "lama", add_mud(braid(generate(30, 30, 3), 0.4, 3), 0.25, 3)
    yield "original-20", from_line_png("labirintos/labirinto-20.png")


@pytest.mark.parametrize("label,m", list(mazes()))
@pytest.mark.parametrize("key", list(ALGORITHMS))
def test_every_algorithm_reaches_the_exit_with_a_valid_path(label, m, key):
    res = run(m, key)
    assert res.found, f"{key} não achou a saída em {label}"
    assert res.path[0] == m.start and res.path[-1] == m.goal
    for a, b in zip(res.path, res.path[1:]):
        assert b in set(m.open_neighbors(a)), f"{key} atravessou uma parede"
    assert res.cost == sum(m.cost[i] for i in res.path[1:])
    assert res.expanded[0] == m.start


@pytest.mark.parametrize("label,m", list(mazes()))
def test_uniform_cost_and_astar_are_optimal(label, m):
    best = reference_cost(m)
    for key in OPTIMAL:
        assert run(m, key).cost == best, f"{key} não achou o menor custo em {label}"


def test_bfs_finds_fewest_steps_when_there_is_no_mud():
    m = braid(generate(30, 30, 5), 0.5, 5)
    steps = len(run(m, "bfs").path)
    assert steps == len(run(m, "ucs").path)
    assert all(len(r.path) >= steps for r in run_all(m))


def test_astar_expands_no_more_than_uniform_cost():
    for seed in range(1, 8):
        m = add_mud(braid(generate(30, 30, seed), 0.4, seed), 0.2, seed)
        assert run(m, "astar").nodes_expanded <= run(m, "ucs").nodes_expanded


def test_perfect_maze_has_a_single_route():
    m = generate(30, 30, 9)
    costs = {r.cost for r in run_all(m, ["bfs", "dfs", "ucs", "greedy", "astar"])}
    assert len(costs) == 1


def test_results_match_the_2018_maze_numbers():
    m = from_line_png("labirintos/labirinto.png")
    assert run(m, "bfs").cost == 372
