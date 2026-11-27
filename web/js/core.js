// Núcleo da arena: modelo de labirinto, geradores, buscas e o agente que aprende.
// Espelha o pacote Python `labirinto/`: com a mesma semente os dois produzem
// o mesmo labirinto e os mesmos números (conferido em tests/fixtures/paridade.json).

export const N = 1, E = 2, S = 4, W = 8;
export const DIRS = [N, E, S, W];
const DX = { 1: 0, 2: 1, 4: 0, 8: -1 };
const DY = { 1: -1, 2: 0, 4: 1, 8: 0 };
const OPP = { 1: 4, 4: 1, 2: 8, 8: 2 };
export const MUD_COST = 5;

export function mulberry32(seed) {
  let a = seed | 0;
  const random = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  random.int = (n) => Math.floor(random() * n);
  return random;
}

const bits = (m) => (m & 1) + ((m >> 1) & 1) + ((m >> 2) & 1) + ((m >> 3) & 1);

export class Maze {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.cells = new Uint8Array(w * h);
    this.cost = new Uint8Array(w * h).fill(1);
    this.start = 0;
    this.goal = w * h - 1;
  }
  get size() { return this.w * this.h; }
  x(i) { return i % this.w; }
  y(i) { return Math.floor(i / this.w); }
  neighbor(i, d) {
    const nx = this.x(i) + DX[d], ny = this.y(i) + DY[d];
    return nx >= 0 && nx < this.w && ny >= 0 && ny < this.h ? ny * this.w + nx : -1;
  }
  carve(a, d) {
    const b = this.neighbor(a, d);
    if (b < 0) throw new Error('passagem para fora da grade');
    this.cells[a] |= d;
    this.cells[b] |= OPP[d];
  }
  openNeighbors(i) {
    const out = [], m = this.cells[i];
    for (const d of DIRS) if (m & d) out.push(this.neighbor(i, d));
    return out;
  }
  passages() { let s = 0; for (const c of this.cells) s += bits(c); return s / 2; }
  connected() {
    const seen = new Uint8Array(this.size); seen[0] = 1;
    const stack = [0]; let n = 1;
    while (stack.length) for (const v of this.openNeighbors(stack.pop())) if (!seen[v]) { seen[v] = 1; n++; stack.push(v); }
    return n === this.size;
  }
  isPerfect() { return this.passages() === this.size - 1 && this.connected(); }
  manhattan(a, b) { return Math.abs(this.x(a) - this.x(b)) + Math.abs(this.y(a) - this.y(b)); }
  minCost() { let m = 255; for (const c of this.cost) if (c < m) m = c; return m; }
  clone() {
    const m = new Maze(this.w, this.h);
    m.cells.set(this.cells); m.cost.set(this.cost); m.start = this.start; m.goal = this.goal;
    return m;
  }
  toHex() { return Array.from(this.cells, (c) => c.toString(16)).join(''); }
  costString() { return Array.from(this.cost, (c) => (c === 1 ? '1' : '5')).join(''); }
  static fromDict(d) {
    const m = new Maze(d.w, d.h);
    for (let i = 0; i < m.size; i++) m.cells[i] = parseInt(d.cells[i], 16);
    if (d.cost) for (let i = 0; i < m.size; i++) m.cost[i] = +d.cost[i];
    m.start = d.start; m.goal = d.goal;
    return m;
  }
}

// ---------------------------------------------------------------- geradores
export function generate(w, h, seed = 1, method = 'backtracker') {
  if (method === 'prim') return generatePrim(w, h, seed);
  if (method === 'kruskal') return generateKruskal(w, h, seed);
  const rng = mulberry32(seed);
  const m = new Maze(w, h);
  const visited = new Uint8Array(m.size);
  let cur = rng.int(m.size);
  visited[cur] = 1;
  const stack = [cur];
  while (stack.length) {
    const c = stack[stack.length - 1];
    const opts = DIRS.filter((d) => { const n = m.neighbor(c, d); return n >= 0 && !visited[n]; });
    if (!opts.length) { stack.pop(); continue; }
    const d = opts[rng.int(opts.length)];
    const n = m.neighbor(c, d);
    m.carve(c, d); visited[n] = 1; stack.push(n);
  }
  return m;
}

function generatePrim(w, h, seed) {
  const rng = mulberry32(seed), m = new Maze(w, h), inside = new Uint8Array(m.size);
  const frontier = [];
  const add = (c) => { inside[c] = 1; for (const d of DIRS) { const n = m.neighbor(c, d); if (n >= 0 && !inside[n]) frontier.push([c, d]); } };
  add(rng.int(m.size));
  while (frontier.length) {
    const k = rng.int(frontier.length);
    const [c, d] = frontier[k];
    frontier[k] = frontier[frontier.length - 1]; frontier.pop();
    const n = m.neighbor(c, d);
    if (inside[n]) continue;
    m.carve(c, d); add(n);
  }
  return m;
}

function generateKruskal(w, h, seed) {
  const rng = mulberry32(seed), m = new Maze(w, h);
  const parent = Int32Array.from({ length: m.size }, (_, i) => i);
  const find = (a) => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
  const edges = [];
  for (let i = 0; i < m.size; i++) { if (m.neighbor(i, E) >= 0) edges.push([i, E]); if (m.neighbor(i, S) >= 0) edges.push([i, S]); }
  for (let i = edges.length - 1; i > 0; i--) { const j = rng.int(i + 1); [edges[i], edges[j]] = [edges[j], edges[i]]; }
  for (const [c, d] of edges) {
    const a = find(c), b = find(m.neighbor(c, d));
    if (a !== b) { parent[a] = b; m.carve(c, d); }
  }
  return m;
}

export function braid(m, fraction, seed = 1) {
  const rng = mulberry32(seed ^ 0x9e3779b9);
  for (let i = 0; i < m.size; i++) {
    if (bits(m.cells[i]) !== 1) continue;
    if (rng() >= fraction) continue;
    const closed = DIRS.filter((d) => !(m.cells[i] & d) && m.neighbor(i, d) >= 0);
    const dead = closed.filter((d) => bits(m.cells[m.neighbor(i, d)]) === 1);
    const pool = dead.length ? dead : closed;
    if (pool.length) m.carve(i, pool[rng.int(pool.length)]);
  }
  return m;
}

export function addMud(m, fraction, seed = 1) {
  const rng = mulberry32(seed ^ 0x85ebca6b);
  const target = Math.floor(m.size * fraction);
  let painted = 0, guard = 0;
  while (painted < target && guard < m.size * 4) {
    guard++;
    const cx = rng.int(m.w), cy = rng.int(m.h), r = 1 + rng.int(3);
    for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) {
      if (x < 0 || x >= m.w || y < 0 || y >= m.h) continue;
      if (Math.abs(x - cx) + Math.abs(y - cy) > r) continue;
      const i = y * m.w + x;
      if (i === m.start || i === m.goal || m.cost[i] !== 1) continue;
      m.cost[i] = MUD_COST; painted++;
    }
  }
  return m;
}

// Lê os labirintos de linhas de 2018: corredores pretos de 2 px no centro de células de `pitch` px.
export function fromLineImage({ data, width, height }, pitch = 16) {
  const black = (x, y) => data[(y * width + x) * 4] < 128;
  const cols = Math.floor((width - 2) / pitch), rows = Math.floor((height - 2) / pitch), half = pitch / 2;
  const m = new Maze(cols, rows);
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const i = y * cols + x;
    if (x + 1 < cols && black(pitch * (x + 1), half + pitch * y)) m.carve(i, E);
    if (y + 1 < rows && black(half + pitch * x, pitch * (y + 1))) m.carve(i, S);
  }
  let entry = 0, exit = 0;
  while (entry < width && !black(entry, 0)) entry++;
  while (exit < width && !black(exit, height - 1)) exit++;
  m.start = Math.min(Math.floor(entry / pitch), cols - 1);
  m.goal = (rows - 1) * cols + Math.min(Math.floor(exit / pitch), cols - 1);
  return m;
}

// ------------------------------------------------------------------- buscas
class Heap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  less(i, j) { const x = this.a[i], y = this.a[j]; return x[0] < y[0] || (x[0] === y[0] && x[1] < y[1]); }
  push(item) {
    const a = this.a; a.push(item); let i = a.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (!this.less(i, p)) break; [a[i], a[p]] = [a[p], a[i]]; i = p; }
  }
  pop() {
    const a = this.a, top = a[0], last = a.pop();
    if (a.length) {
      a[0] = last; let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1; let s = i;
        if (l < a.length && this.less(l, s)) s = l;
        if (r < a.length && this.less(r, s)) s = r;
        if (s === i) break;
        [a[i], a[s]] = [a[s], a[i]]; i = s;
      }
    }
    return top;
  }
}

function newResult(key, m) {
  const seenAt = new Int32Array(m.size).fill(-1);
  seenAt[m.start] = 0;
  return { key, name: NAMES[key], found: false, path: [], cost: 0, expanded: [], maxFrontier: 0, seenAt };
}

function finish(res, m, parent) {
  if (res.found) {
    const path = [m.goal];
    while (parent[path[path.length - 1]] >= 0) path.push(parent[path[path.length - 1]]);
    res.path = path.reverse();
    res.cost = pathCost(m, res.path);
  }
  return res;
}

export const pathCost = (m, path) => { let s = 0; for (let k = 1; k < path.length; k++) s += m.cost[path[k]]; return s; };

function bfs(m) {
  const res = newResult('bfs', m), parent = new Int32Array(m.size).fill(-2);
  parent[m.start] = -1;
  const q = [m.start]; let head = 0;
  while (head < q.length) {
    res.maxFrontier = Math.max(res.maxFrontier, q.length - head);
    const u = q[head++];
    res.expanded.push(u);
    if (u === m.goal) { res.found = true; break; }
    for (const v of m.openNeighbors(u)) if (parent[v] === -2) { parent[v] = u; res.seenAt[v] = res.expanded.length; q.push(v); }
  }
  return finish(res, m, parent);
}

function dfs(m) {
  const res = newResult('dfs', m), parent = new Int32Array(m.size).fill(-2);
  const stack = [[m.start, -1]];
  while (stack.length) {
    res.maxFrontier = Math.max(res.maxFrontier, stack.length);
    const [u, p] = stack.pop();
    if (parent[u] !== -2) continue;
    parent[u] = p;
    res.expanded.push(u);
    if (u === m.goal) { res.found = true; break; }
    const ns = m.openNeighbors(u);
    for (let k = ns.length - 1; k >= 0; k--) {
      const v = ns[k];
      if (parent[v] === -2) { stack.push([v, u]); if (res.seenAt[v] < 0) res.seenAt[v] = res.expanded.length; }
    }
  }
  return finish(res, m, parent);
}

function bestFirst(m, key, priority, useG) {
  const res = newResult(key, m), parent = new Int32Array(m.size).fill(-2);
  const best = new Float64Array(m.size).fill(Infinity), closed = new Uint8Array(m.size);
  best[m.start] = 0;
  const heap = new Heap(); let seq = 0;
  heap.push([priority(0, m.start), seq, m.start, 0, -1]);
  while (heap.size) {
    res.maxFrontier = Math.max(res.maxFrontier, heap.size);
    const [, , u, g, p] = heap.pop();
    if (closed[u]) continue;
    closed[u] = 1; parent[u] = p;
    res.expanded.push(u);
    if (u === m.goal) { res.found = true; break; }
    for (const v of m.openNeighbors(u)) {
      if (closed[v]) continue;
      const g2 = g + m.cost[v];
      if (useG) { if (g2 >= best[v]) continue; } else if (best[v] !== Infinity) continue;
      best[v] = g2;
      if (res.seenAt[v] < 0) res.seenAt[v] = res.expanded.length;
      heap.push([priority(g2, v), ++seq, v, g2, u]);
    }
  }
  return finish(res, m, parent);
}

function wallFollower(m) {
  const res = newResult('wall', m);
  let here = m.start, facing = 2;
  res.expanded.push(here);
  const limit = m.size * 8;
  while (here !== m.goal && res.expanded.length < limit) {
    let moved = false;
    for (const turn of [1, 0, 3, 2]) {
      const d = (facing + turn) % 4;
      if (m.cells[here] & DIRS[d]) { facing = d; here = m.neighbor(here, DIRS[d]); moved = true; break; }
    }
    if (!moved) break;
    if (res.seenAt[here] < 0) res.seenAt[here] = res.expanded.length;
    res.expanded.push(here);
  }
  res.found = here === m.goal;
  if (res.found) { res.path = res.expanded.slice(); res.cost = pathCost(m, res.path); }
  res.maxFrontier = 1;
  return res;
}

export const NAMES = {
  bfs: 'Busca em largura', dfs: 'Busca em profundidade', ucs: 'Custo uniforme',
  greedy: 'Gulosa', astar: 'A*', wall: 'Mão na parede',
};

export const ALGORITHMS = {
  bfs,
  dfs,
  ucs: (m) => bestFirst(m, 'ucs', (g) => g, true),
  greedy: (m) => bestFirst(m, 'greedy', (g, v) => m.manhattan(v, m.goal), false),
  astar: (m) => { const f = m.minCost(); return bestFirst(m, 'astar', (g, v) => g + f * m.manhattan(v, m.goal), true); },
  wall: wallFollower,
};

export function run(m, key) {
  const t0 = performance.now();
  const res = ALGORITHMS[key](m);
  res.ms = performance.now() - t0;
  return res;
}

// --------------------------------------------- aprendizado por reforço (Q-learning)
// O agente não conhece o mapa: aprende, tentativa após tentativa, quanto vale
// cada movimento em cada célula. Recompensa: -custo por passo, +100 na saída.
export class QAgent {
  constructor(m, { alpha = 0.5, gamma = 1, epsilon = 1, decay = 0.985, minEpsilon = 0.02, seed = 7 } = {}) {
    Object.assign(this, { m, alpha, gamma, epsilon, decay, minEpsilon });
    this.rng = mulberry32(seed);
    this.q = new Float32Array(m.size * 4);
    this.episodes = 0;
    this.history = [];
  }
  actions(s) { const out = []; for (let k = 0; k < 4; k++) if (this.m.cells[s] & DIRS[k]) out.push(k); return out; }
  bestAction(s, acts = this.actions(s)) {
    let best = acts[0], bv = -Infinity;
    for (const a of acts) { const v = this.q[s * 4 + a]; if (v > bv) { bv = v; best = a; } }
    return best;
  }
  value(s) { const acts = this.actions(s); return acts.length ? Math.max(...acts.map((a) => this.q[s * 4 + a])) : 0; }
  episode(maxSteps = this.m.size * 4) {
    const m = this.m; let s = m.start, steps = 0, ret = 0;
    while (s !== m.goal && steps < maxSteps) {
      const acts = this.actions(s);
      const a = this.rng() < this.epsilon ? acts[this.rng.int(acts.length)] : this.bestAction(s, acts);
      const s2 = m.neighbor(s, DIRS[a]);
      const r = s2 === m.goal ? 100 : -m.cost[s2];
      const target = s2 === m.goal ? r : r + this.gamma * this.value(s2);
      this.q[s * 4 + a] += this.alpha * (target - this.q[s * 4 + a]);
      s = s2; steps++; ret += r;
    }
    this.episodes++;
    this.epsilon = Math.max(this.minEpsilon, this.epsilon * this.decay);
    const rec = { steps, ret, reached: s === m.goal };
    this.history.push(rec);
    return rec;
  }
  policyPath(limit = this.m.size * 2) {
    const m = this.m, path = [m.start], seen = new Set([m.start]);
    let s = m.start;
    while (s !== m.goal && path.length < limit) {
      s = m.neighbor(s, DIRS[this.bestAction(s)]);
      if (seen.has(s)) break;
      seen.add(s); path.push(s);
    }
    return path;
  }
}
