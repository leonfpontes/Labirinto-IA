import pytest

from labirinto.maze import E, N, S, W, Maze, add_mud, braid, from_line_png, generate
from labirinto.rng import Mulberry32

ORIGINAIS = [("labirintos/labirinto-20.png", 20), ("labirintos/labirinto.png", 100), ("labirintos/labirinto-200.png", 200)]


def test_mulberry32_known_values():
    # valores de referência do Mulberry32 em JavaScript com semente 42
    rng = Mulberry32(42)
    assert [round(rng.random(), 10) for _ in range(3)] == [0.6011037519, 0.4482905590, 0.8524657935]


@pytest.mark.parametrize("path,size", ORIGINAIS)
def test_original_png_is_a_perfect_maze(path, size):
    m = from_line_png(path)
    assert (m.width, m.height) == (size, size)
    assert m.is_perfect()
    assert m.xy(m.start)[1] == 0
    assert m.xy(m.goal)[1] == size - 1


@pytest.mark.parametrize("w,h,seed", [(1, 1, 1), (2, 3, 5), (25, 25, 42), (60, 30, 2018)])
def test_generator_makes_perfect_mazes(w, h, seed):
    m = generate(w, h, seed)
    assert m.is_perfect()
    assert (m.start, m.goal) == (0, w * h - 1)


def test_generator_is_deterministic():
    assert generate(30, 30, 7).cells == generate(30, 30, 7).cells
    assert generate(30, 30, 7).cells != generate(30, 30, 8).cells


def test_passages_are_symmetric():
    m = generate(20, 20, 3)
    braid(m, 0.6, 3)
    opposite = {N: S, S: N, E: W, W: E}
    for i in range(m.size):
        for d in (N, E, S, W):
            if m.cells[i] & d:
                assert m.cells[m.neighbor(i, d)] & opposite[d]


def test_braid_adds_loops_and_keeps_everything_connected():
    m = braid(generate(30, 30, 11), 1.0, 11)
    assert m.connected()
    assert m.passages() > m.size - 1
    dead_ends = sum(1 for c in m.cells if bin(c).count("1") == 1)
    assert dead_ends < 0.05 * m.size


def test_mud_never_covers_start_or_goal():
    m = add_mud(generate(30, 30, 4), 0.3, 4)
    assert m.cost[m.start] == 1 and m.cost[m.goal] == 1
    assert 0.25 * m.size <= sum(c == 5 for c in m.cost) <= 0.35 * m.size


def test_round_trip_dict():
    m = add_mud(braid(generate(12, 9, 9), 0.4, 9), 0.2, 9)
    m.start, m.goal = 3, 50
    back = Maze.from_dict(m.to_dict())
    assert (back.cells, back.cost, back.start, back.goal) == (m.cells, m.cost, m.start, m.goal)


def test_parity_fixture_is_up_to_date():
    import json

    from tests.paridade import FIXTURE, build

    with open(FIXTURE, encoding="utf-8") as fh:
        assert json.load(fh) == build(), "rode: python tests/paridade.py"
