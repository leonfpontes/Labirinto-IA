// Testes do núcleo da arena (rode com: node --test web/tests)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ALGORITHMS, Maze, QAgent, addMud, braid, generate, mulberry32, pathCost } from '../js/core.js';
import { ORIGINAIS } from '../js/originais.js';

const fixture = JSON.parse(readFileSync(new URL('../../tests/fixtures/paridade.json', import.meta.url)));

function build(c) {
  const m = generate(c.w, c.h, c.seed);
  if (c.lacos) braid(m, c.lacos, c.seed);
  if (c.lama) addMud(m, c.lama, c.seed);
  return m;
}

function dijkstra(m) {
  const dist = new Float64Array(m.size).fill(Infinity), done = new Uint8Array(m.size);
  dist[m.start] = 0;
  for (;;) {
    let u = -1;
    for (let i = 0; i < m.size; i++) if (!done[i] && (u < 0 || dist[i] < dist[u])) u = i;
    if (u < 0 || dist[u] === Infinity) break;
    done[u] = 1;
    for (const v of m.openNeighbors(u)) dist[v] = Math.min(dist[v], dist[u] + m.cost[v]);
  }
  return dist[m.goal];
}

test('Mulberry32 bate com os valores de referência', () => {
  const r = mulberry32(42);
  assert.deepEqual([r(), r(), r()].map((x) => x.toFixed(10)), ['0.6011037519', '0.4482905590', '0.8524657935']);
});

for (const c of fixture) {
  test(`paridade com Python: ${c.w}x${c.h} semente ${c.seed}`, () => {
    const m = build(c);
    assert.equal(m.toHex(), c.cells, 'labirinto diferente do Python');
    assert.equal(m.costString(), c.cost, 'lama diferente do Python');
    for (const [key, want] of Object.entries(c.results)) {
      const r = ALGORITHMS[key](m);
      assert.deepEqual(
        { found: r.found, cost: r.cost, path_len: r.path.length, expanded: r.expanded.length, max_frontier: r.maxFrontier },
        { found: want.found, cost: want.cost, path_len: want.path_len, expanded: want.expanded, max_frontier: want.max_frontier },
        key,
      );
    }
  });
}

for (const method of ['backtracker', 'prim', 'kruskal']) {
  test(`gerador ${method} cria labirinto perfeito`, () => {
    for (const seed of [1, 2, 3]) assert.ok(generate(23, 17, seed, method).isPerfect());
  });
}

test('labirintos de 2018 são árvores e todas as buscas saem', () => {
  for (const d of Object.values(ORIGINAIS)) {
    const m = Maze.fromDict(d);
    assert.ok(m.isPerfect());
    for (const key of Object.keys(ALGORITHMS)) assert.ok(ALGORITHMS[key](m).found, key);
  }
});

test('caminhos são válidos e custo uniforme e A* são ótimos', () => {
  for (let seed = 1; seed <= 6; seed++) {
    const m = addMud(braid(generate(20, 20, seed), 0.5, seed), 0.25, seed);
    const best = dijkstra(m);
    for (const [key, fn] of Object.entries(ALGORITHMS)) {
      const r = fn(m);
      assert.ok(r.found, key);
      assert.equal(r.path[0], m.start);
      assert.equal(r.path.at(-1), m.goal);
      for (let k = 1; k < r.path.length; k++) assert.ok(m.openNeighbors(r.path[k - 1]).includes(r.path[k]), `${key} atravessou parede`);
      assert.equal(r.cost, pathCost(m, r.path));
      if (key === 'ucs' || key === 'astar') assert.equal(r.cost, best, key);
      assert.ok(r.cost >= best);
    }
  }
});

test('marcas de fronteira nunca vêm depois da expansão', () => {
  const m = braid(generate(25, 25, 5), 0.4, 5);
  for (const fn of Object.values(ALGORITHMS)) {
    const r = fn(m);
    r.expanded.forEach((cell, step) => assert.ok(r.seenAt[cell] >= 0 && r.seenAt[cell] <= step));
  }
});

test('Q-learning aprende a sair de um labirinto pequeno', () => {
  const m = braid(generate(8, 8, 3), 0.3, 3);
  const agent = new QAgent(m, { seed: 1 });
  for (let k = 0; k < 400; k++) agent.episode();
  const path = agent.policyPath();
  assert.equal(path.at(-1), m.goal);
  assert.ok(pathCost(m, path) <= dijkstra(m) * 1.5);
});
