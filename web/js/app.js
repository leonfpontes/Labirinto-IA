// Interface da arena: desenha as seis buscas, controla a linha do tempo e o agente que aprende.
import { Maze, MUD_COST, N, E, S, W, NAMES, QAgent, addMud, braid, generate, pathCost, run } from './core.js';
import { ORIGINAIS } from './originais.js';

const ORDER = ['bfs', 'dfs', 'ucs', 'greedy', 'astar', 'wall'];
const DESC = {
  bfs: 'Explora em ondas, do mais perto ao mais longe.',
  dfs: 'Mergulha num corredor até o fim antes de voltar.',
  ucs: 'Sempre o ponto mais barato de alcançar até agora.',
  greedy: 'Sempre o ponto que parece mais perto da saída.',
  astar: 'Custo já pago mais a estimativa do que falta.',
  wall: 'Sem mapa: mão direita sempre na parede.',
};
const COLORS = { floor: '#14161a', wall: '#e9e4d8', explored: '#2f6fd6', thread: '#ff5a36', mud: '#5a4528', hatch: '#c9a46a', ink: '#ece7da' };
const fmt = (n) => n.toLocaleString('pt-BR');
const $ = (id) => document.getElementById(id);

const ui = {
  play: $('play'), step: $('step'), restart: $('restart'), timeline: $('timeline'), tick: $('tick'), speed: $('speed'),
  source: $('source'), method: $('method'), size: $('size'), sizeOut: $('sizeOut'), loops: $('loops'), loopsOut: $('loopsOut'),
  mud: $('mud'), mudOut: $('mudOut'), seed: $('seed'), shuffle: $('shuffle'), arena: $('arena'),
};

const state = { maze: null, results: {}, optimal: 0, T: 1, total: 1, t: 0, playing: true, last: 0 };

// ---------------------------------------------------------------- painéis
const panels = ORDER.map((key) => {
  const card = document.createElement('article');
  card.className = 'card';
  card.innerHTML = `<header><h3></h3><span class="badge"></span></header><p class="desc"></p><canvas></canvas>
    <dl class="stats"><div><dt>Expandidos</dt><dd data-k="exp">0</dd></div><div><dt>Custo</dt><dd data-k="cost">–</dd></div><div><dt>Passos</dt><dd data-k="steps">–</dd></div></dl>`;
  card.querySelector('h3').textContent = NAMES[key];
  card.querySelector('.desc').textContent = DESC[key];
  ui.arena.append(card);
  const canvas = card.querySelector('canvas');
  canvas.setAttribute('aria-label', `Labirinto resolvido por ${card.querySelector('h3').textContent}`);
  return {
    key, card, canvas, ctx: canvas.getContext('2d'), badge: card.querySelector('.badge'),
    exp: card.querySelector('[data-k=exp]'), cost: card.querySelector('[data-k=cost]'), steps: card.querySelector('[data-k=steps]'),
    layer: document.createElement('canvas'), drawn: 0, seenPtr: 0, frontier: new Set(),
  };
});

// ------------------------------------------------------------ construção
function settings() {
  return {
    source: ui.source.value, method: ui.method.value, size: +ui.size.value,
    loops: +ui.loops.value, mud: +ui.mud.value, seed: Math.max(1, Math.floor(+ui.seed.value || 1)),
  };
}

function buildMaze() {
  const s = settings();
  document.querySelectorAll('.gen').forEach((el) => el.classList.toggle('off', s.source !== 'gerado'));
  ui.method.disabled = ui.size.disabled = s.source !== 'gerado';
  const m = s.source === 'gerado' ? generate(s.size, s.size, s.seed, s.method) : Maze.fromDict(ORIGINAIS[s.source]);
  if (s.loops) braid(m, s.loops / 100, s.seed);
  if (s.mud) addMud(m, s.mud / 100, s.seed);
  try { localStorage.setItem('labirinto-ia', JSON.stringify(s)); } catch { /* sem armazenamento */ }
  return m;
}

function solve(restart = true) {
  const m = state.maze;
  state.results = Object.fromEntries(ORDER.map((k) => [k, run(m, k)]));
  for (const r of Object.values(state.results)) {
    r.expandedAt = new Int32Array(m.size).fill(0x7fffffff);
    r.expanded.forEach((c, k) => { if (r.expandedAt[c] > k) r.expandedAt[c] = k; });
    r.seenSorted = Array.from(r.seenAt.keys()).filter((c) => r.seenAt[c] >= 0).sort((a, b) => r.seenAt[a] - r.seenAt[b]);
  }
  state.optimal = state.results.ucs.cost;
  state.T = Math.max(...ORDER.map((k) => state.results[k].expanded.length));
  state.total = Math.ceil(state.T * 1.14) + 12;
  const finish = ORDER.filter((k) => state.results[k].found).sort((a, b) => state.results[a].expanded.length - state.results[b].expanded.length);
  finish.forEach((k, i) => { state.results[k].rank = 1 + finish.findIndex((j) => state.results[j].expanded.length === state.results[k].expanded.length); });
  ui.timeline.max = state.total;
  if (restart) { state.t = 0; setPlaying(true); }
  resetLayers();
  renderScore();
  draw();
}

function rebuild() { state.maze = buildMaze(); geometry(); solve(); }

// --------------------------------------------------------------- desenho
const geo = { P: 0, cell: 0, floor: null, hatch: null, walls: null, ox: 0, oy: 0 };

function geometry() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const P = Math.max(120, Math.round(panels[0].canvas.clientWidth * dpr));
  const m = state.maze;
  geo.P = P;
  geo.cell = P / Math.max(m.w, m.h);
  geo.ox = (P - geo.cell * m.w) / 2;
  geo.oy = (P - geo.cell * m.h) / 2;
  for (const p of panels) { p.canvas.width = p.canvas.height = P; p.layer.width = p.layer.height = P; }
  geo.floor = drawFloor(m, P);
  geo.hatch = drawHatch(m, P);
  geo.walls = drawWalls(m, P);
}

function cellRect(m, i, c = geo.cell, ox = geo.ox, oy = geo.oy) {
  return [ox + (i % m.w) * c, oy + Math.floor(i / m.w) * c, c, c];
}

function drawFloor(m, P, c = geo.cell, ox = geo.ox, oy = geo.oy) {
  const cv = document.createElement('canvas'); cv.width = cv.height = P;
  const g = cv.getContext('2d');
  g.fillStyle = COLORS.floor; g.fillRect(0, 0, P, P);
  g.fillStyle = COLORS.mud;
  for (let i = 0; i < m.size; i++) if (m.cost[i] >= MUD_COST) { const [x, y] = cellRect(m, i, c, ox, oy); g.fillRect(x, y, c + 0.5, c + 0.5); }
  return cv;
}

// Lama vira textura listrada por cima do azul, para não misturar cores parecidas.
function drawHatch(m, P, c = geo.cell, ox = geo.ox, oy = geo.oy) {
  const cv = document.createElement('canvas'); cv.width = cv.height = P;
  const g = cv.getContext('2d');
  g.strokeStyle = COLORS.hatch; g.lineWidth = Math.max(1, c * 0.12); g.globalAlpha = 0.9;
  const step = Math.max(3, c / 3);
  for (let i = 0; i < m.size; i++) {
    if (m.cost[i] < MUD_COST) continue;
    const [x, y] = cellRect(m, i, c, ox, oy);
    g.save(); g.beginPath(); g.rect(x, y, c, c); g.clip(); g.beginPath();
    for (let k = -c; k < c; k += step) { g.moveTo(x + k, y + c); g.lineTo(x + k + c, y); }
    g.stroke(); g.restore();
  }
  return cv;
}

function drawWalls(m, P, c = geo.cell, ox = geo.ox, oy = geo.oy) {
  const cv = document.createElement('canvas'); cv.width = cv.height = P;
  const g = cv.getContext('2d');
  g.strokeStyle = COLORS.wall; g.lineWidth = Math.max(1, c * 0.14); g.lineCap = 'square';
  g.beginPath();
  for (let i = 0; i < m.size; i++) {
    const x = ox + (i % m.w) * c, y = oy + Math.floor(i / m.w) * c, cell = m.cells[i];
    const top = Math.floor(i / m.w) === 0, left = i % m.w === 0;
    if (!(cell & N) && !(top && i === m.start) && !(top && i === m.goal)) { g.moveTo(x, y); g.lineTo(x + c, y); }
    if (!(cell & W) && left) { g.moveTo(x, y); g.lineTo(x, y + c); }
    const bottom = Math.floor(i / m.w) === m.h - 1;
    if (!(cell & S) && !(bottom && (i === m.goal || i === m.start))) { g.moveTo(x, y + c); g.lineTo(x + c, y + c); }
    if (!(cell & E)) { g.moveTo(x + c, y); g.lineTo(x + c, y + c); }
  }
  g.stroke();
  return cv;
}

function resetLayers() {
  for (const p of panels) {
    p.layer.getContext('2d').clearRect(0, 0, geo.P, geo.P);
    p.drawn = 0; p.seenPtr = 0; p.frontier.clear();
  }
}

function advance(p, r, t) {
  const m = state.maze, g = p.layer.getContext('2d');
  if (t < p.drawn) { g.clearRect(0, 0, geo.P, geo.P); p.drawn = 0; p.seenPtr = 0; p.frontier.clear(); }
  g.fillStyle = COLORS.explored;
  const end = Math.min(t, r.expanded.length);
  for (let k = p.drawn; k < end; k++) {
    const c = r.expanded[k];
    const [x, y, s] = cellRect(m, c);
    g.fillRect(x, y, s + 0.5, s + 0.5);
    p.frontier.delete(c);
  }
  p.drawn = Math.max(p.drawn, end);
  while (p.seenPtr < r.seenSorted.length && r.seenAt[r.seenSorted[p.seenPtr]] <= t) {
    const c = r.seenSorted[p.seenPtr++];
    if (r.expandedAt[c] >= t) p.frontier.add(c);
  }
}

function drawThread(g, m, path, frac, c = geo.cell, ox = geo.ox, oy = geo.oy) {
  const n = Math.max(2, Math.floor(path.length * frac));
  if (path.length < 2) return;
  const pt = (i) => [ox + ((i % m.w) + 0.5) * c, oy + (Math.floor(i / m.w) + 0.5) * c];
  g.lineJoin = g.lineCap = 'round';
  for (const [color, w] of [[COLORS.floor, Math.max(3, c * 0.62)], [COLORS.thread, Math.max(2, c * 0.4)]]) {
    g.strokeStyle = color; g.lineWidth = w; g.beginPath();
    g.moveTo(...pt(path[0]));
    for (let k = 1; k < n; k++) g.lineTo(...pt(path[k]));
    g.stroke();
  }
}

function drawMarks(g, m, c = geo.cell, ox = geo.ox, oy = geo.oy) {
  const r = Math.max(3, c * 0.34);
  const at = (i) => [ox + ((i % m.w) + 0.5) * c, oy + (Math.floor(i / m.w) + 0.5) * c];
  g.lineWidth = Math.max(2, r * 0.45);
  g.strokeStyle = COLORS.ink; g.fillStyle = COLORS.floor;
  g.beginPath(); g.arc(...at(m.start), r, 0, 7); g.fill(); g.stroke();
  g.fillStyle = COLORS.ink;
  g.beginPath(); g.arc(...at(m.goal), r, 0, 7); g.fill();
}

function draw() {
  const m = state.maze, t = Math.floor(state.t);
  for (const p of panels) {
    const r = state.results[p.key];
    advance(p, r, t);
    const g = p.ctx;
    g.drawImage(geo.floor, 0, 0);
    g.drawImage(p.layer, 0, 0);
    g.drawImage(geo.hatch, 0, 0);
    g.drawImage(geo.walls, 0, 0);
    g.strokeStyle = COLORS.ink; g.lineWidth = Math.max(1, geo.cell * 0.16);
    const inset = geo.cell * 0.22;
    for (const c of p.frontier) {
      const [x, y, s] = cellRect(m, c);
      g.strokeRect(x + inset, y + inset, s - 2 * inset, s - 2 * inset);
    }
    const len = r.expanded.length, done = t >= len;
    if (p.key === 'wall' && !done && t > 0) {
      const [x, y, s] = cellRect(m, r.expanded[t - 1]);
      g.fillStyle = COLORS.ink; g.beginPath(); g.arc(x + s / 2, y + s / 2, Math.max(2.5, s * 0.36), 0, 7); g.fill();
    }
    if (done && r.found) drawThread(g, m, r.path, Math.min(1, (t - len) / Math.max(10, state.T * 0.12)));
    drawMarks(g, m);
    p.exp.textContent = fmt(Math.min(t, len));
    p.cost.textContent = done && r.found ? fmt(r.cost) : '–';
    p.steps.textContent = done && r.found ? fmt(r.path.length - 1) : '–';
    p.badge.classList.toggle('done', done);
    if (!done) p.badge.textContent = t === 0 ? 'na largada' : 'explorando';
    else if (!r.found) p.badge.textContent = 'andou em círculos';
    else p.badge.textContent = `${r.rank}º a chegar${r.cost === state.optimal ? ' · menor custo' : ''}`;
  }
  ui.timeline.value = t;
  ui.tick.textContent = `${fmt(Math.min(t, state.T))} / ${fmt(state.T)}`;
}

// ----------------------------------------------------------------- placar
function renderScore() {
  const R = ORDER.map((k) => state.results[k]).filter((r) => r.found);
  const maxExp = Math.max(...R.map((r) => r.expanded.length));
  const maxCost = Math.max(...R.map((r) => r.cost));
  const row = (r, value, max, label, best) => `<div class="bar"><span>${r.name}</span><span class="track"><span class="fill" style="width:${(100 * value / max).toFixed(2)}%"></span>${best ? `<span class="best" style="left:calc(${(100 * best / max).toFixed(2)}% - 1px)"></span>` : ''}</span><span class="val">${label}</span></div>`;
  $('barsExpanded').innerHTML = R.map((r) => row(r, r.expanded.length, maxExp, fmt(r.expanded.length))).join('');
  $('barsCost').innerHTML = R.map((r) => row(r, r.cost, maxCost, fmt(r.cost), state.optimal)).join('');
  const first = [...R].sort((a, b) => a.expanded.length - b.expanded.length)[0];
  const ucs = state.results.ucs, astar = state.results.astar;
  let text = `${first.name} chegou primeiro, olhando ${fmt(first.expanded.length)} estados. `;
  text += first.cost > state.optimal
    ? `Mas pagou ${fmt(first.cost)}, ${Math.round(100 * (first.cost / state.optimal - 1))}% acima do menor custo possível (${fmt(state.optimal)}). `
    : `E ainda achou o menor custo possível (${fmt(state.optimal)}). `;
  const saved = 1 - astar.expanded.length / ucs.expanded.length;
  text += saved > 0.005
    ? `Entre as que garantem o menor custo, o A* olhou ${Math.round(saved * 100)}% menos estados que o custo uniforme.`
    : 'Aqui a estimativa do A* não ajudou: ele olhou tanto quanto o custo uniforme.';
  $('verdict').textContent = text;
}

// ---------------------------------------------------------------- tempo
function setPlaying(on) {
  state.playing = on;
  ui.play.textContent = on ? 'Pausar' : state.t >= state.total ? 'Repetir' : 'Continuar';
}

function frame(now) {
  const dt = Math.min(0.1, (now - (state.last || now)) / 1000);
  state.last = now;
  if (state.playing) {
    const rate = (state.T / 9) * +ui.speed.value;
    state.t = Math.min(state.total, state.t + Math.max(dt * rate, dt * 20));
    if (state.t >= state.total) setPlaying(false);
    draw();
  }
  rl.frame();
  requestAnimationFrame(frame);
}

function seek(t) { state.t = Math.max(0, Math.min(state.total, t)); setPlaying(false); draw(); }

ui.play.onclick = () => { if (!state.playing && state.t >= state.total) state.t = 0; setPlaying(!state.playing); };
ui.step.onclick = () => seek(Math.floor(state.t) + 1);
ui.restart.onclick = () => { state.t = 0; resetLayers(); setPlaying(true); draw(); };
ui.timeline.oninput = () => seek(+ui.timeline.value);
for (const [input, out, suffix] of [[ui.size, ui.sizeOut, ''], [ui.loops, ui.loopsOut, '%'], [ui.mud, ui.mudOut, '%']]) {
  input.oninput = () => { out.textContent = input.value + suffix; };
  input.onchange = rebuild;
}
ui.source.onchange = ui.method.onchange = ui.seed.onchange = rebuild;
ui.shuffle.onclick = () => { ui.seed.value = 1 + Math.floor(Math.random() * 999998); if (ui.source.value !== 'gerado') ui.source.value = 'gerado'; rebuild(); };

document.addEventListener('keydown', (e) => {
  if (e.target.closest('input,select,textarea,button')) return;
  if (e.key === ' ') { e.preventDefault(); ui.play.click(); }
  else if (e.key === 'ArrowRight') seek(Math.floor(state.t) + (e.shiftKey ? 25 : 1));
  else if (e.key === 'ArrowLeft') seek(Math.floor(state.t) - (e.shiftKey ? 25 : 1));
  else if (e.key === 'Home') ui.restart.click();
  else if (e.key.toLowerCase() === 'r') ui.shuffle.click();
});

// ----------------------------------------------- clique: saída, entrada, lama
let painting = null;
function cellAt(canvas, ev) {
  const b = canvas.getBoundingClientRect(), k = canvas.width / b.width;
  const x = Math.floor(((ev.clientX - b.left) * k - geo.ox) / geo.cell), y = Math.floor(((ev.clientY - b.top) * k - geo.oy) / geo.cell);
  const m = state.maze;
  return x >= 0 && y >= 0 && x < m.w && y < m.h ? y * m.w + x : -1;
}
for (const p of panels) {
  p.canvas.addEventListener('pointerdown', (ev) => {
    const c = cellAt(p.canvas, ev), m = state.maze, mode = document.querySelector('input[name=brush]:checked').value;
    if (c < 0) return;
    if (mode === 'mud') {
      if (c === m.start || c === m.goal) return;
      painting = m.cost[c] === 1 ? MUD_COST : 1;
      p.canvas.setPointerCapture(ev.pointerId);
      paintMud(c);
      return;
    }
    if (mode === 'goal' && c !== m.start) m.goal = c;
    if (mode === 'start' && c !== m.goal) m.start = c;
    m.cost[m.start] = m.cost[m.goal] = 1;
    geo.walls = drawWalls(m, geo.P); geo.floor = drawFloor(m, geo.P); geo.hatch = drawHatch(m, geo.P);
    solve();
  });
  p.canvas.addEventListener('pointermove', (ev) => { if (painting) { const c = cellAt(p.canvas, ev); if (c >= 0) paintMud(c); } });
  p.canvas.addEventListener('pointerup', () => { if (painting) { painting = null; solve(); } });
}
function paintMud(c) {
  const m = state.maze;
  if (c === m.start || c === m.goal || m.cost[c] === painting) return;
  m.cost[c] = painting;
  geo.floor = drawFloor(m, geo.P); geo.hatch = drawHatch(m, geo.P);
  for (const p of panels) for (const img of [geo.floor, p.layer, geo.hatch, geo.walls]) p.ctx.drawImage(img, 0, 0);
}

// ------------------------------------------------- agente que aprende (Q-learning)
const rl = (() => {
  const canvas = $('rlCanvas'), ctx = canvas.getContext('2d'), curve = $('rlCurve');
  let seed = 11, maze, agent, training = false, best = 0, floor, hatch, walls, P = 0, c = 0, stable = 0;
  const playBtn = $('rlPlay');

  function setup(newMaze) {
    if (newMaze || !maze) {
      maze = generate(16, 16, seed, 'backtracker');
      braid(maze, 0.35, seed); addMud(maze, 0.12, seed);
      best = run(maze, 'ucs');
    }
    agent = new QAgent(maze, { seed });
    stable = 0;
    resize();
    paint(); plot();
  }
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    P = Math.max(160, Math.round(canvas.clientWidth * dpr));
    canvas.width = canvas.height = P;
    c = P / maze.w;
    floor = drawFloor(maze, P, c, 0, 0);
    hatch = drawHatch(maze, P, c, 0, 0);
    walls = drawWalls(maze, P, c, 0, 0);
  }
  function paint() {
    ctx.drawImage(floor, 0, 0);
    let lo = Infinity, hi = -Infinity;
    const vals = new Float32Array(maze.size), touched = new Uint8Array(maze.size);
    for (let s = 0; s < maze.size; s++) {
      for (let a = 0; a < 4; a++) if (agent.q[s * 4 + a] !== 0) touched[s] = 1;
      if (!touched[s]) continue;
      vals[s] = agent.value(s); lo = Math.min(lo, vals[s]); hi = Math.max(hi, vals[s]);
    }
    for (let s = 0; s < maze.size; s++) {
      if (!touched[s]) continue;
      const [fx, fy] = cellRect(maze, s, c, 0, 0);
      ctx.globalAlpha = 1; ctx.fillStyle = COLORS.floor; ctx.fillRect(fx, fy, c + 0.5, c + 0.5);
      ctx.fillStyle = COLORS.explored;
      ctx.globalAlpha = 0.12 + 0.83 * (hi > lo ? (vals[s] - lo) / (hi - lo) : 1);
      const [x, y] = cellRect(maze, s, c, 0, 0);
      ctx.fillRect(x, y, c + 0.5, c + 0.5);
    }
    ctx.globalAlpha = 1;
    ctx.drawImage(hatch, 0, 0);
    ctx.drawImage(walls, 0, 0);
    const path = agent.policyPath();
    const reaches = path[path.length - 1] === maze.goal;
    if (agent.episodes > 0 && reaches) drawThread(ctx, maze, path, 1, c, 0, 0);
    drawMarks(ctx, maze, c, 0, 0);
    $('rlEp').textContent = fmt(agent.episodes);
    $('rlEps').textContent = `${Math.round(agent.epsilon * 100)}%`;
    const h = agent.history[agent.history.length - 1];
    $('rlSteps').textContent = h ? `${fmt(h.steps)}${h.reached ? '' : ' (não chegou)'}` : '–';
    const cost = pathCost(maze, path);
    $('rlPolicy').textContent = !reaches || agent.episodes === 0 ? 'ainda não chega'
      : cost === best.cost ? `custo ${fmt(cost)}, o menor possível` : `custo ${fmt(cost)} (o menor é ${fmt(best.cost)})`;
    if (reaches && cost === best.cost && agent.epsilon <= agent.minEpsilon + 1e-6) stable++;
    if (stable > 40 && training) { training = false; playBtn.textContent = 'Treinar mais'; }
  }
  function plot() {
    const W = curve.clientWidth, H = curve.clientHeight;
    if (!W || !H) return;
    const hist = agent.history, maxSteps = maze.size * 4, pad = 6;
    const bucket = Math.max(1, Math.ceil(hist.length / 300));
    const pts = [];
    for (let i = 0; i < hist.length; i += bucket) {
      const chunk = hist.slice(i, i + bucket);
      pts.push([i + chunk.length / 2, chunk.reduce((s, h) => s + h.steps, 0) / chunk.length]);
    }
    const n = Math.max(50, hist.length);
    const X = (e) => pad + (e / n) * (W - 2 * pad), Y = (v) => H - pad - (v / maxSteps) * (H - 2 * pad - 14);
    const optimal = best.path.length - 1;
    curve.innerHTML = `<line x1="${pad}" x2="${W - pad}" y1="${Y(optimal)}" y2="${Y(optimal)}" stroke="${COLORS.thread}" stroke-width="2" stroke-dasharray="6 5"/>
      <text x="${W - pad}" y="${Y(optimal) - 6}" text-anchor="end" fill="${COLORS.thread}" font-size="12">melhor rota: ${optimal} passos</text>
      ${pts.length > 1 ? `<polyline fill="none" stroke="${COLORS.ink}" stroke-width="2" points="${pts.map(([e, v]) => `${X(e).toFixed(1)},${Y(v).toFixed(1)}`).join(' ')}"/>` : ''}
      ${hist.length ? '' : `<text x="${W / 2}" y="${H / 2}" text-anchor="middle" fill="${COLORS.ink}" opacity=".7" font-size="13">Aperte Treinar para ver a curva cair</text>`}`;
  }
  playBtn.onclick = () => { training = !training; playBtn.textContent = training ? 'Pausar' : 'Treinar'; };
  $('rlReset').onclick = () => { training = false; playBtn.textContent = 'Treinar'; setup(false); };
  $('rlNew').onclick = () => { seed += 1; training = false; playBtn.textContent = 'Treinar'; setup(true); };
  const plotObserver = new ResizeObserver(() => plot());
  plotObserver.observe(curve);
  return {
    setup,
    resize: () => { if (maze) { resize(); paint(); } },
    frame() {
      if (!training) return;
      for (let k = 0; k < +$('rlSpeed').value; k++) agent.episode();
      paint(); plot();
    },
  };
})();

// ------------------------------------------------------------------ início
try {
  const saved = JSON.parse(localStorage.getItem('labirinto-ia') || 'null');
  if (saved) {
    for (const k of ['source', 'method', 'size', 'loops', 'mud', 'seed']) if (saved[k] !== undefined) ui[k].value = saved[k];
    ui.sizeOut.textContent = ui.size.value; ui.loopsOut.textContent = ui.loops.value + '%'; ui.mudOut.textContent = ui.mud.value + '%';
  }
} catch { /* sem armazenamento */ }

rebuild();
rl.setup(true);
const arenaObserver = new ResizeObserver(() => {
  if (!state.maze) return;
  const want = Math.round(panels[0].canvas.clientWidth * Math.min(window.devicePixelRatio || 1, 2));
  if (Math.abs(want - geo.P) > 4) { geometry(); resetLayers(); draw(); }
  rl.resize();
});
arenaObserver.observe(ui.arena);
requestAnimationFrame(frame);
