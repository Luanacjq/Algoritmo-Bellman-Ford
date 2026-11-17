/* Spy Game — interface, animações e simulação do agente. */
(() => {
  'use strict';
  const { bellmanFord, dijkstra, pathTo, fmt, analyzeRisk, cycleEdges, hopPath } = window.SpyAlgo;
  const $ = (s) => document.querySelector(s);
  const SVGNS = 'http://www.w3.org/2000/svg';
  const R = 30;

  /* ======================= DADOS DA MISSÃO ======================= */
  const BASE_EDGES = [
    { from: 'S', to: 'A', w: 4 }, { from: 'S', to: 'B', w: 5 }, { from: 'A', to: 'B', w: -2 },
    { from: 'A', to: 'C', w: 6 }, { from: 'B', to: 'C', w: 3 }, { from: 'B', to: 'D', w: 7 },
    { from: 'C', to: 'D', w: 2 }
  ];
  const TRAP_EDGE = { from: 'D', to: 'B', w: -6, extra: true };
  const BASE_V = ['S', 'A', 'B', 'C', 'D', 'E'];
  const BASE_POS = {
    S: { x: 95, y: 250 }, A: { x: 320, y: 105 }, B: { x: 320, y: 395 },
    C: { x: 590, y: 105 }, D: { x: 590, y: 395 }, E: { x: 815, y: 250 }
  };
  const CODENAMES = {
    S: 'BASE SOMBRA', A: 'ABRIGO ALFA', B: 'BUNKER BRAVO', C: 'COFRE CHARLIE',
    D: 'DOCA DELTA', E: 'ESTAÇÃO ECO', F: 'FAROL FOXTROT', G: 'GALPÃO GOLF',
    H: 'HANGAR HOTEL', I: 'ILHA ÍNDIA', J: 'JARDIM JULIET'
  };
  const SCENARIOS = {
    m1: {
      title: 'Missão 1 · Risco dos Esconderijos',
      desc: 'Rede original. Calcular o custo mínimo de S até cada esconderijo e apontar os de menor e maior risco.',
      edges: () => BASE_EDGES.map(e => ({ ...e }))
    },
    m2: {
      title: 'Missão 2 · Detecção de Armadilhas',
      desc: 'Inteligência interceptou uma nova rota D → B com peso −6. Recalcular os custos e identificar os esconderijos que são armadilhas (ciclos negativos).',
      edges: () => BASE_EDGES.concat(TRAP_EDGE).map(e => ({ ...e }))
    },
    free: {
      title: 'Laboratório · Monte sua própria rede',
      desc: 'Modo livre: edite pesos, crie rotas e esconderijos, troque a origem e arraste os nós. O algoritmo é recalculado na hora.',
      edges: null
    }
  };
  const CODE = [
    'BELLMAN-FORD(G, w, s)',
    '  INITIALIZE-SINGLE-SOURCE(G, s)',
    '  for i = 1 to |V| − 1',
    '    for each edge (u, v) ∈ G.E',
    '      RELAX(u, v, w)',
    '  for each edge (u, v) ∈ G.E',
    '    if v.d > u.d + w(u, v)',
    '      return FALSE   ▸ armadilha!',
    '  return TRUE'
  ];

  /* ======================= ESTADO ======================= */
  const state = {
    scenario: 'm1', vertices: [], edges: [], pos: {}, source: 'S',
    result: null, dij: null, step: 0, playing: false, timer: null,
    sound: true, earlyStop: true, logUpTo: -1, resultsShown: false, agentRun: 0
  };
  let edgeEls = [], nodeEls = {};

  /* ======================= SOM (WebAudio) ======================= */
  let actx = null;
  function beep(freq, dur = 0.08, type = 'square', vol = 0.04, slide = 0) {
    if (!state.sound) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = type; o.frequency.value = freq;
      if (slide) o.frequency.linearRampToValueAtTime(freq + slide, actx.currentTime + dur);
      g.gain.setValueAtTime(vol, actx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + dur);
      o.connect(g).connect(actx.destination);
      o.start(); o.stop(actx.currentTime + dur);
    } catch (_) { /* sem áudio */ }
  }
  const sfx = {
    ok: () => beep(880, 0.09, 'square', 0.035, 220),
    rej: () => beep(180, 0.05, 'triangle', 0.03),
    tick: () => beep(1400, 0.02, 'sine', 0.02),
    alarm: () => { [0, 250, 500, 750].forEach(t => setTimeout(() => beep(520, 0.22, 'sawtooth', 0.05, 380), t)); },
    win: () => { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => beep(f, 0.15, 'square', 0.035), i * 110)); },
    step: () => beep(660, 0.04, 'sine', 0.03)
  };

  /* ======================= BRIEFING ======================= */
  const BRIEF = `> Agente, sua missão é guiar nosso operativo pela rede de esconderijos.
> O mapa é um grafo orientado G = (V, E). Cada rota tem um custo de tempo/risco.
> Algumas rotas têm peso NEGATIVO: atalhos táticos inesperados.
> Cuidado: certas combinações formam LOOPS TEMPORAIS — ciclos negativos
> dos quais o agente jamais escapa.
> Ferramenta autorizada: algoritmo de Bellman-Ford.
> Esta mensagem se autodestruirá após a leitura.`;
  function typeBriefing() {
    const el = $('#briefText');
    let i = 0;
    const tick = () => {
      if (i >= BRIEF.length) return;
      el.textContent = BRIEF.slice(0, ++i);
      setTimeout(tick, BRIEF[i - 1] === '\n' ? 180 : 14);
    };
    if (location.hash.includes('play')) { $('#briefing').classList.add('hidden'); return; }
    tick();
    $('#briefing').addEventListener('click', (e) => { if (e.target.id !== 'acceptBtn') { i = BRIEF.length; el.textContent = BRIEF; } });
    $('#acceptBtn').addEventListener('click', () => {
      sfx.win();
      $('#briefing').classList.add('out');
      setTimeout(() => $('#briefing').classList.add('hidden'), 850);
    });
  }

  /* ======================= CONTAGEM REGRESSIVA ======================= */
  function countdown() {
    const target = new Date(2026, 10, 17, 0, 0, 0).getTime();
    const upd = () => {
      let s = Math.floor((target - Date.now()) / 1000);
      const el = $('#countdown');
      if (s <= 0) { el.textContent = 'MISSÃO ATIVA'; return; }
      const d = Math.floor(s / 86400); s %= 86400;
      const p = (n) => String(n).padStart(2, '0');
      el.textContent = (d ? d + 'd ' : '') + `${p(Math.floor(s / 3600))}:${p(Math.floor(s / 60) % 60)}:${p(s % 60)}`;
    };
    upd(); setInterval(upd, 1000);
  }

  /* ======================= CENÁRIOS ======================= */
  function loadScenario(key, keepGraph) {
    state.scenario = key;
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.scn === key));
    $('#scnTitle').textContent = SCENARIOS[key].title;
    $('#scnDesc').textContent = SCENARIOS[key].desc;
    $('#editor').classList.toggle('hidden', key !== 'free');
    if (!keepGraph) {
      state.vertices = BASE_V.slice();
      state.pos = JSON.parse(JSON.stringify(BASE_POS));
      state.source = 'S';
      state.edges = (SCENARIOS[key].edges || SCENARIOS.m2.edges)();
    }
    recompute();
  }

  function recompute() {
    stop();
    cancelAgent();
    state.result = bellmanFord(state.vertices, state.edges, state.source, { earlyStop: state.earlyStop });
    state.dij = dijkstra(state.vertices, state.edges, state.source);
    state.step = 0;
    state.logUpTo = -1;
    state.resultsShown = false;
    $('#log').innerHTML = '';
    $('#iterTable').dataset.key = '';
    $('#results').classList.add('hidden');
    $('#agentReport').innerHTML = '';
    buildGraph();
    buildBoard();
    buildAgentButtons();
    if (state.scenario === 'free') buildEditor();
    applyStep(false);
  }

  /* ======================= GRAFO SVG ======================= */
  function el(tag, attrs = {}, parent) {
    const n = document.createElementNS(SVGNS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }

  function buildGraph() {
    const eg = $('#edgesG'), ng = $('#nodesG');
    eg.innerHTML = ''; ng.innerHTML = '';
    edgeEls = []; nodeEls = {};
    state.edges.forEach((e, i) => {
      const g = el('g', { class: 'edge' + (e.w < 0 ? ' neg' : '') + (e.extra ? ' extra' : ''), 'data-i': i }, eg);
      const line = el('path', { class: 'edge-line' }, g);
      const flow = el('path', { class: 'edge-flow' }, g);
      const lab = el('g', { class: 'edge-label' }, g);
      el('rect', { x: -20, y: -12, width: 40, height: 24, rx: 5 }, lab);
      const t = el('text', {}, lab); t.textContent = fmt(e.w);
      edgeEls.push({ g, line, flow, lab });
    });
    state.vertices.forEach(v => {
      const g = el('g', { class: 'node', 'data-v': v }, ng);
      el('circle', { class: 'node-halo', r: 44 }, g);
      el('circle', { class: 'node-ring', r: R }, g);
      el('circle', { class: 'node-core', r: R - 6 }, g);
      const name = el('text', { class: 'node-name', dy: 8 }, g); name.textContent = v;
      const code = el('text', { class: 'node-code', y: -50 }, g); code.textContent = CODENAMES[v] || 'ESCONDERIJO ' + v;
      const dist = el('text', { class: 'node-dist', y: 58 }, g);
      nodeEls[v] = { g, dist };
      enableDrag(g, v);
    });
    layoutGraph();
  }

  function layoutGraph() {
    state.edges.forEach((e, i) => {
      const a = state.pos[e.from], b = state.pos[e.to];
      const { d, lx, ly } = geometry(a, b, e.from === e.to,
        state.edges.some(o => o.from === e.to && o.to === e.from) ? 46 : 0);
      edgeEls[i].line.setAttribute('d', d);
      edgeEls[i].flow.setAttribute('d', d);
      edgeEls[i].lab.setAttribute('transform', `translate(${lx},${ly})`);
    });
    state.vertices.forEach(v => {
      const p = state.pos[v];
      nodeEls[v].g.setAttribute('transform', `translate(${p.x},${p.y})`);
      const incoming = state.edges.some(e => e.to === v && e.from !== v);
      const outgoing = state.edges.some(e => e.from === v);
      nodeEls[v].g.classList.toggle('source', v === state.source);
      nodeEls[v].g.classList.toggle('offline', v !== state.source && !incoming && !outgoing);
    });
  }

  function geometry(a, b, self, bend) {
    if (self) {
      const d = `M ${a.x - 14} ${a.y - R + 2} C ${a.x - 60} ${a.y - 120}, ${a.x + 60} ${a.y - 120}, ${a.x + 14} ${a.y - R - 4}`;
      return { d, lx: a.x, ly: a.y - 92 };
    }
    const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len;
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    const cx = mx + nx * bend, cy = my + ny * bend;
    const unit = (x, y) => { const l = Math.hypot(x, y) || 1; return [x / l, y / l]; };
    const [sx, sy] = unit(cx - a.x, cy - a.y);
    const [ex, ey] = unit(cx - b.x, cy - b.y);
    const p0 = [a.x + sx * R, a.y + sy * R];
    const p1 = [b.x + ex * (R + 4), b.y + ey * (R + 4)];
    return {
      d: `M ${p0[0]} ${p0[1]} Q ${cx} ${cy} ${p1[0]} ${p1[1]}`,
      lx: mx + nx * bend / 2, ly: my + ny * bend / 2
    };
  }

  function enableDrag(g, v) {
    const svg = $('#map');
    let dragging = false;
    g.addEventListener('pointerdown', (ev) => {
      dragging = true; g.setPointerCapture(ev.pointerId); ev.preventDefault();
    });
    g.addEventListener('pointermove', (ev) => {
      if (!dragging) return;
      const pt = svg.createSVGPoint(); pt.x = ev.clientX; pt.y = ev.clientY;
      const p = pt.matrixTransform(svg.getScreenCTM().inverse());
      state.pos[v] = { x: Math.max(40, Math.min(860, p.x)), y: Math.max(60, Math.min(440, p.y)) };
      layoutGraph();
    });
    const end = () => { dragging = false; };
    g.addEventListener('pointerup', end);
    g.addEventListener('pointercancel', end);
  }

  function restartAnim(node, cls) {
    node.classList.remove(cls);
    void node.getBoundingClientRect();
    node.classList.add(cls);
  }

  /* ======================= RENDERIZAÇÃO DO PASSO ======================= */
  function applyStep(forward) {
    const r = state.result, st = r.steps[state.step];
    const final = st.type === 'done';

    // arestas
    edgeEls.forEach(x => x.g.classList.remove('active', 'ok', 'rej', 'bad', 'cycle', 'tree', 'traveled'));
    state.vertices.forEach(v => {
      const p = st.pred[v];
      if (p == null) return;
      let best = -1;
      state.edges.forEach((e, i) => { if (e.from === p && e.to === v && (best < 0 || e.w < state.edges[best].w)) best = i; });
      if (best >= 0) edgeEls[best].g.classList.add('tree');
    });
    if (st.edge != null) {
      const x = edgeEls[st.edge].g;
      x.classList.add('active');
      if (st.type === 'relax') x.classList.add(st.ok ? 'ok' : 'rej');
      if (st.type === 'check' && st.bad) x.classList.add('bad');
    }
    const showCycle = (st.type === 'cycle' || final) && r.hasNegativeCycle;
    if (showCycle) cycleEdges(r.cycle, state.edges).forEach(i => edgeEls[i].g.classList.add('cycle'));

    // nós
    const risk = analyzeRisk(r, state.vertices);
    state.vertices.forEach(v => {
      const n = nodeEls[v];
      n.g.classList.remove('trap', 'reached', 'min', 'max', 'arrived');
      const d = st.dist[v];
      n.dist.textContent = 'd = ' + fmt(d);
      if (d !== Infinity && v !== state.source) n.g.classList.add('reached');
      if (showCycle && r.traps.includes(v)) n.g.classList.add('trap');
      if (final && !r.hasNegativeCycle) {
        if (risk.lowest.some(x => x.v === v)) n.g.classList.add('min');
        if (risk.highest.some(x => x.v === v)) n.g.classList.add('max');
      }
    });
    if (forward && st.type === 'relax' && st.ok) restartAnim(nodeEls[state.edges[st.edge].to].g, 'updated');

    updateBoard(st, showCycle, forward);
    updateCode(st);
    updateIterTable(st);
    updateLog();

    // narração / fase
    const nar = $('#narration');
    nar.textContent = st.msg;
    nar.classList.toggle('bad', st.type === 'cycle' || (st.type === 'check' && st.bad) || (final && r.hasNegativeCycle));
    if (forward) restartAnim(nar, 'flash');
    const chip = $('#phaseChip');
    chip.textContent = st.phase;
    chip.className = 'chip' + ((st.type === 'cycle' || (final && r.hasNegativeCycle)) ? ' danger' : final ? ' success' : '');

    // progresso
    const total = r.steps.length - 1;
    $('#progressBar').style.width = (state.step / total * 100) + '%';
    $('#stepLabel').textContent = `passo ${state.step} / ${total}`;

    // efeitos sonoros e alarme
    if (forward) {
      if (st.type === 'relax') (st.ok ? sfx.ok : sfx.rej)();
      else if (st.type === 'check') (st.bad ? sfx.rej : sfx.tick)();
      else if (st.type === 'cycle') { sfx.alarm(); restartAnim($('#alarm'), 'on'); }
      else if (final && !r.hasNegativeCycle) sfx.win();
      else sfx.step();
    }
    if (final) showResults(); else { $('#results').classList.add('hidden'); state.resultsShown = false; }
  }

  /* ---------- painel de esconderijos ---------- */
  function buildBoard() {
    const b = $('#board');
    b.innerHTML = '';
    state.vertices.forEach(v => {
      const c = document.createElement('div');
      c.className = 'card'; c.id = 'card-' + v;
      c.innerHTML = `<span class="badge"></span><div class="cv">${v}</div><div class="cn">${CODENAMES[v] || 'ESCONDERIJO ' + v}</div><div class="cd">∞</div><div class="cp">π = NIL</div>`;
      b.appendChild(c);
    });
  }
  function updateBoard(st, showCycle, forward) {
    const r = state.result;
    state.vertices.forEach(v => {
      const c = $('#card-' + v);
      const d = st.dist[v];
      const cd = c.querySelector('.cd');
      const txt = fmt(d);
      if (cd.textContent !== txt && forward) restartAnim(c, 'bump');
      cd.textContent = txt;
      c.querySelector('.cp').textContent = 'π = ' + (st.pred[v] || 'NIL');
      let cls = 'card', badge = 'NÃO ALCANÇADO';
      if (v === state.source) { cls += ' src'; badge = 'ORIGEM'; }
      else if (showCycle && r.traps.includes(v)) { cls += ' trap'; badge = 'ARMADILHA'; }
      else if (d !== Infinity) { cls += ' ok'; badge = 'ALCANÇADO'; }
      else cls += ' off';
      const keepBump = c.classList.contains('bump');
      c.className = cls + (keepBump ? ' bump' : '');
      c.querySelector('.badge').textContent = badge;
    });
  }

  /* ---------- pseudocódigo ---------- */
  function buildCode() {
    $('#code').innerHTML = CODE.map((l, i) => `<div data-line="${i + 1}"><b>${i + 1}</b>${l.replace(/</g, '&lt;')}</div>`).join('');
  }
  function updateCode(st) {
    document.querySelectorAll('#code div').forEach(d => {
      const on = Number(d.dataset.line) === st.line;
      d.classList.toggle('hl', on);
      d.classList.toggle('bad', on && st.line === 8);
    });
  }

  /* ---------- tabela de iterações ---------- */
  function updateIterTable(st) {
    const r = state.result, V = state.vertices;
    const rows = r.iterations;
    let html = '<tr><th>Iteração</th>' + V.map(v => `<th>${v}</th>`).join('') + '</tr>';
    rows.forEach((it, idx) => {
      const shown = idx < st.iterShown;
      html += `<tr class="${shown ? '' : 'pending'}"><td>${it.label}</td>`;
      V.forEach(v => {
        if (!shown) { html += '<td>·</td>'; return; }
        const prev = idx > 0 ? rows[idx - 1].dist[v] : it.dist[v];
        const chg = idx > 0 && prev !== it.dist[v];
        const neg = r.traps.includes(v) && st.type === 'done';
        html += `<td class="${chg ? 'chg' : ''} ${neg ? 'neg' : ''}">${fmt(it.dist[v])}</td>`;
      });
      html += '</tr>';
    });
    if (st.type === 'done' && r.hasNegativeCycle) {
      html += '<tr><td>Final</td>' + V.map(v => `<td class="${r.dist[v] === -Infinity ? 'neg chg' : ''}">${fmt(r.dist[v])}</td>`).join('') + '</tr>';
    }
    const tbl = $('#iterTable');
    if (tbl.dataset.key !== `${state.step}`) { tbl.innerHTML = html; tbl.dataset.key = `${state.step}`; }
  }

  /* ---------- log ---------- */
  function updateLog() {
    const log = $('#log'), steps = state.result.steps;
    if (state.step < state.logUpTo) { log.innerHTML = ''; state.logUpTo = -1; }
    const frag = document.createDocumentFragment();
    for (let i = state.logUpTo + 1; i <= state.step; i++) {
      const s = steps[i];
      const p = document.createElement('p');
      p.className = s.type === 'relax' ? (s.ok ? 'ok' : 'rej')
        : (s.type === 'check' && s.bad) || s.type === 'cycle' ? 'bad'
        : ['pass', 'check-start', 'early', 'init', 'done'].includes(s.type) ? 'info' : '';
      p.innerHTML = `<span class="t">[${String(i).padStart(3, '0')}]</span>`;
      p.appendChild(document.createTextNode(s.msg));
      frag.appendChild(p);
    }
    log.appendChild(frag);
    state.logUpTo = state.step;
    log.scrollTop = log.scrollHeight;
  }

  /* ======================= RESULTADOS ======================= */
  function showResults() {
    if (state.resultsShown) return;
    state.resultsShown = true;
    const r = state.result, V = state.vertices, risk = analyzeRisk(r, V);
    const box = $('#results');
    box.classList.remove('hidden');
    box.classList.toggle('danger', r.hasNegativeCycle);

    let main;
    if (!r.hasNegativeCycle) {
      const maxD = Math.max(1, ...risk.ranking.map(x => Math.abs(x.d)));
      const minD = Math.min(0, ...risk.ranking.map(x => x.d));
      const span = maxD - minD || 1;
      const bars = risk.ranking.map(x => {
        const tag = risk.lowest.some(l => l.v === x.v) ? '<span class="tag g">MENOR RISCO</span>'
          : risk.highest.some(h => h.v === x.v) ? '<span class="tag a">MAIOR RISCO</span>' : '';
        const path = pathTo(r.pred, r.source, x.v);
        return `<div class="bar-row"><span class="bv">${x.v}</span><div class="bar"><i data-w="${Math.max(4, (x.d - minD) / span * 100)}"></i></div><span class="bd">${fmt(x.d)}</span></div>
          <div class="muted" style="margin:-4px 0 8px 34px;font-size:11px">rota: ${path ? path.join(' → ') : '—'} ${tag}</div>`;
      }).join('');
      main = `<div class="res-box"><h4>Ranking de risco (custo mínimo a partir de ${r.source})</h4>${bars || '<p class="muted">Nenhum esconderijo alcançável.</p>'}</div>
        <div class="res-box"><h4>Veredito</h4><ul class="big-list">
          <li>🟢 <b>Menor risco:</b> ${risk.lowest.map(x => `${x.v} (${CODENAMES[x.v] || x.v}) — custo ${fmt(x.d)}`).join(', ') || '—'}</li>
          <li>🟠 <b>Maior risco:</b> ${risk.highest.map(x => `${x.v} (${CODENAMES[x.v] || x.v}) — custo ${fmt(x.d)}`).join(', ') || '—'}</li>
          <li>⚫ <b>Inalcançáveis:</b> ${risk.unreachable.length ? risk.unreachable.map(v => `${v} (custo ∞, sem conexão com a rede)`).join(', ') : 'nenhum'}</li>
          <li>✅ Nenhum ciclo negativo: o algoritmo retorna <b>TRUE</b>.</li>
        </ul></div>`;
    } else {
      const cyc = r.cycle.concat(r.cycle[0]).join(' → ');
      const safe = V.filter(v => Number.isFinite(r.dist[v]));
      main = `<div class="res-box"><h4>Ciclo negativo interceptado</h4>
          <div class="cycle-str">${cyc}</div>
          <p class="muted">Peso total do ciclo: <b style="color:var(--red)">${fmt(r.cycleWeight)}</b>. A cada volta o "custo" diminui, então não existe caminho mínimo: o agente ficaria preso para sempre neste loop temporal.</p>
          <p class="muted">Rotas que ainda relaxaram na |V|-ésima passada: ${r.violated.map(i => `${state.edges[i].from}→${state.edges[i].to}`).join(', ')}</p></div>
        <div class="res-box"><h4>Classificação dos esconderijos</h4><ul class="big-list">
          ${r.traps.map(v => `<li>🔴 <b>${v}</b> · ${CODENAMES[v] || v} <span class="tag r">ARMADILHA</span> custo −∞ (último valor: ${fmt(r.rawDist[v])})</li>`).join('')}
          ${safe.map(v => `<li>🟢 <b>${v}</b> · ${CODENAMES[v] || v} <span class="tag g">${v === r.source ? 'ORIGEM' : 'SEGURO'}</span> custo ${fmt(r.dist[v])}</li>`).join('')}
          ${risk.unreachable.map(v => `<li>⚫ <b>${v}</b> · ${CODENAMES[v] || v} <span class="tag m">INALCANÇÁVEL</span> custo ∞</li>`).join('')}
        </ul></div>`;
    }

    // comparação com Dijkstra
    const dj = state.dij.dist;
    const rows = V.map(v => {
      const same = dj[v] === r.dist[v];
      return `<tr><td>${v}</td><td class="right">${fmt(r.dist[v])}</td><td class="${same ? 'right' : 'wrong'}">${fmt(dj[v])}</td><td>${same ? '✔' : '✘'}</td></tr>`;
    }).join('');
    const anyWrong = V.some(v => dj[v] !== r.dist[v]);
    const hasNeg = state.edges.some(e => e.w < 0);
    const verdict = anyWrong
      ? `<div class="verdict r">Dijkstra falhou: devolveu valores finitos e <b>não detectou</b> o ciclo negativo. Ele "trava" cada vértice ao extraí-lo da fila e nunca o revisita — por isso só Bellman-Ford serve para pesos negativos.</div>`
      : hasNeg
        ? `<div class="verdict g">Aqui Dijkstra acertou por <b>sorte da ordem de extração</b>: há pesos negativos, então ele não oferece garantia. Bellman-Ford garante o resultado correto.</div>`
        : `<div class="verdict g">Sem pesos negativos os dois algoritmos concordam (Dijkstra é mais rápido nesse caso).</div>`;
    const cmp = `<div class="res-box"><h4>Comparativo · Bellman-Ford × Dijkstra</h4>
      <table class="cmp"><tr><th>v</th><th>Bellman-Ford</th><th>Dijkstra</th><th></th></tr>${rows}</table>${verdict}</div>`;

    const s = r.stats;
    const stats = `<div class="res-box"><h4>Telemetria da execução</h4><div class="stats">
      <div class="stat"><b>${s.passesRun}</b><span>iterações executadas (máx. ${s.V - 1})</span></div>
      <div class="stat"><b>${s.compareCount}</b><span>verificações de rota</span></div>
      <div class="stat"><b>${s.relaxCount}</b><span>relaxamentos efetivos</span></div>
      <div class="stat"><b>${s.V}·${s.E}=${s.bound}</b><span>limite O(|V|·|E|)</span></div>
      </div></div>`;

    box.innerHTML = `<div class="panel-head"><h2>${r.hasNegativeCycle ? '🚨 DOSSIÊ · ARMADILHAS DETECTADAS' : '📁 DOSSIÊ · RELATÓRIO DE RISCO'}</h2>
      <span class="chip ${r.hasNegativeCycle ? 'danger' : 'success'}">${r.hasNegativeCycle ? 'RETORNO: FALSE' : 'RETORNO: TRUE'}</span></div>
      <div class="res-grid">${main}${cmp}${stats}</div>`;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      box.querySelectorAll('.bar i').forEach(i => { i.style.width = i.dataset.w + '%'; });
    }));
  }

  /* ======================= PLAYBACK ======================= */
  function delay() { return 1500 - (Number($('#speed').value) - 1) * 150; }
  function go(i, forward) {
    const max = state.result.steps.length - 1;
    i = Math.max(0, Math.min(max, i));
    if (i === state.step && forward !== undefined) return;
    state.step = i;
    applyStep(!!forward);
  }
  function play() {
    if (state.step >= state.result.steps.length - 1) go(0, false);
    state.playing = true;
    $('#btnPlay').textContent = '⏸'; $('#btnPlay').classList.add('playing');
    const tick = () => {
      if (!state.playing) return;
      if (state.step >= state.result.steps.length - 1) { stop(); return; }
      go(state.step + 1, true);
      const st = state.result.steps[state.step];
      state.timer = setTimeout(tick, st.type === 'cycle' ? Math.max(2600, delay()) : delay());
    };
    tick();
  }
  function stop() {
    state.playing = false;
    clearTimeout(state.timer);
    $('#btnPlay').textContent = '▶'; $('#btnPlay').classList.remove('playing');
  }
  function toggle() { state.playing ? stop() : play(); }

  /* ======================= AGENTE ======================= */
  function buildAgentButtons() {
    const r = state.result, box = $('#agentButtons');
    box.innerHTML = '';
    state.vertices.filter(v => v !== state.source).forEach(v => {
      const b = document.createElement('button');
      const trap = r.traps.includes(v), off = r.dist[v] === Infinity;
      b.className = 'btn' + (trap ? ' trap' : off ? ' off' : '');
      b.textContent = `${state.source} ⟶ ${v}`;
      b.addEventListener('click', () => dispatchAgent(v));
      box.appendChild(b);
    });
  }
  function cancelAgent() {
    state.agentRun++;
    $('#agent').classList.add('hidden');
    $('#agent').classList.remove('trapped');
    edgeEls.forEach(x => x.g.classList.remove('traveled'));
  }
  async function dispatchAgent(target) {
    stop();
    go(state.result.steps.length - 1, false);
    cancelAgent();
    const run = state.agentRun;
    const r = state.result, rep = $('#agentReport'), agent = $('#agent');
    const costEl = $('#agentCost');
    const alive = () => run === state.agentRun;

    if (r.dist[target] === Infinity) {
      rep.innerHTML = `⚫ <b>Sem rota.</b> ${target} não tem conexão alcançável a partir de ${state.source}. O agente não pode ser enviado (custo ∞).`;
      restartAnim(nodeEls[target].g, 'arrived');
      sfx.rej();
      return;
    }
    let seq, trapped = false;
    if (r.traps.includes(target)) {
      trapped = true;
      const entry = r.cycle.find(c => hopPath(state.edges, state.source, c)) || r.cycle[0];
      const rot = r.cycle.slice(r.cycle.indexOf(entry)).concat(r.cycle.slice(0, r.cycle.indexOf(entry)));
      const lead = hopPath(state.edges, state.source, entry) || [];
      const loop = cycleEdges(rot, state.edges);
      seq = lead.concat(loop, loop, loop);
      rep.innerHTML = `🔴 <b>Destino ${target} é uma armadilha!</b> Observe: o agente entra no ciclo <span class="route">${rot.concat(rot[0]).join(' → ')}</span> e o custo cai a cada volta…`;
    } else {
      const path = pathTo(r.pred, state.source, target);
      if (!path) { rep.textContent = 'Rota indisponível.'; return; }
      seq = [];
      for (let i = 0; i + 1 < path.length; i++) {
        let best = -1;
        state.edges.forEach((e, k) => { if (e.from === path[i] && e.to === path[i + 1] && (best < 0 || e.w < state.edges[best].w)) best = k; });
        seq.push(best);
      }
      rep.innerHTML = `🟢 Rota de menor custo: <span class="route">${path.join(' → ')}</span> · custo total <b>${fmt(r.dist[target])}</b>`;
    }

    agent.classList.remove('hidden');
    let cost = 0;
    costEl.textContent = 'custo 0';
    for (let k = 0; k < seq.length; k++) {
      const i = seq[k];
      const path = edgeEls[i].line;
      const L = path.getTotalLength();
      const dur = Math.max(450, L * 2.6) * (delay() / 900);
      await new Promise(res => {
        const t0 = performance.now();
        const frame = (now) => {
          if (!alive()) return res();
          const t = Math.min(1, (now - t0) / dur);
          const e = t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
          const p = path.getPointAtLength(L * e);
          agent.setAttribute('transform', `translate(${p.x},${p.y})`);
          if (t < 1) requestAnimationFrame(frame); else res();
        };
        requestAnimationFrame(frame);
      });
      if (!alive()) return;
      cost += state.edges[i].w;
      costEl.textContent = 'custo ' + fmt(cost);
      edgeEls[i].g.classList.add('traveled');
      if (trapped && k >= seq.length - cycleEdges(r.cycle, state.edges).length * 3) agent.classList.add('trapped');
      state.edges[i].w < 0 ? sfx.ok() : sfx.step();
    }
    if (!alive()) return;
    if (trapped) {
      costEl.textContent = 'custo → −∞';
      rep.innerHTML += `<br>Após 3 voltas o custo já está em <b>${fmt(cost)}</b> e continuaria caindo para sempre ⇒ <b style="color:var(--red)">custo −∞, agente preso.</b>`;
      sfx.alarm(); restartAnim($('#alarm'), 'on');
    } else {
      restartAnim(nodeEls[target].g, 'arrived');
      sfx.win();
    }
  }

  /* ======================= EDITOR ======================= */
  function buildEditor() {
    const src = $('#srcSel');
    src.innerHTML = state.vertices.map(v => `<option ${v === state.source ? 'selected' : ''}>${v}</option>`).join('');
    const opts = (sel) => state.vertices.map(v => `<option ${v === sel ? 'selected' : ''}>${v}</option>`).join('');
    const list = $('#edgeList');
    list.innerHTML = '';
    state.edges.forEach((e, i) => {
      const row = document.createElement('div');
      row.className = 'erow';
      row.innerHTML = `<select data-k="from">${opts(e.from)}</select><span>→</span><select data-k="to">${opts(e.to)}</select>
        <span>w</span><input type="number" step="1" value="${e.w}" data-k="w"><button class="x" title="remover">✕</button>`;
      row.querySelectorAll('[data-k]').forEach(inp => inp.addEventListener('change', () => {
        const k = inp.dataset.k;
        state.edges[i][k] = k === 'w' ? (Number(inp.value) || 0) : inp.value;
        recompute();
      }));
      row.querySelector('.x').addEventListener('click', () => { state.edges.splice(i, 1); recompute(); });
      list.appendChild(row);
    });
  }
  function randomNetwork() {
    const V = state.vertices;
    const edges = [];
    const has = (a, b) => edges.some(e => e.from === a && e.to === b);
    // garante uma espinha alcançável a partir da origem
    const order = V.filter(v => v !== state.source).sort(() => Math.random() - .5);
    let prev = state.source;
    order.slice(0, Math.max(2, order.length - 1)).forEach(v => { edges.push({ from: prev, to: v, w: 1 + Math.floor(Math.random() * 8) }); prev = v; });
    const extra = 3 + Math.floor(Math.random() * 4);
    for (let k = 0; k < extra * 4 && edges.length < order.length + extra; k++) {
      const a = V[Math.floor(Math.random() * V.length)], b = V[Math.floor(Math.random() * V.length)];
      if (a === b || has(a, b) || b === state.source) continue;
      edges.push({ from: a, to: b, w: Math.floor(Math.random() * 13) - 4 });
    }
    state.edges = edges;
    recompute();
  }

  /* ======================= INICIALIZAÇÃO ======================= */
  function bind() {
    document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => {
      const key = t.dataset.scn;
      if (key === 'free') loadScenario('free', state.scenario === 'free');
      else loadScenario(key);
      sfx.step();
    }));
    $('#btnPlay').addEventListener('click', toggle);
    $('#btnStep').addEventListener('click', () => { stop(); go(state.step + 1, true); });
    $('#btnBack').addEventListener('click', () => { stop(); go(state.step - 1, false); });
    $('#btnReset').addEventListener('click', () => { stop(); cancelAgent(); go(0, false); });
    $('#btnEnd').addEventListener('click', () => { stop(); go(state.result.steps.length - 1, true); });
    $('#earlyStop').addEventListener('change', (e) => { state.earlyStop = e.target.checked; recompute(); });
    $('#sound').addEventListener('change', (e) => { state.sound = e.target.checked; });
    $('#srcSel').addEventListener('change', (e) => { state.source = e.target.value; recompute(); });
    $('#addEdge').addEventListener('click', () => {
      state.edges.push({ from: state.vertices[0], to: state.vertices[1], w: 1 });
      recompute();
    });
    $('#addVertex').addEventListener('click', () => {
      const name = 'FGHIJKLMNOPQRTUVWXYZ'.split('').find(c => !state.vertices.includes(c));
      if (!name) return;
      state.vertices.push(name);
      state.pos[name] = { x: 140 + Math.random() * 620, y: 90 + Math.random() * 320 };
      recompute();
    });
    document.querySelectorAll('[data-preset]').forEach(b => b.addEventListener('click', () => {
      const p = b.dataset.preset;
      if (p === 'rand') return randomNetwork();
      state.vertices = BASE_V.slice();
      state.pos = JSON.parse(JSON.stringify(BASE_POS));
      state.source = 'S';
      state.edges = SCENARIOS[p].edges();
      recompute();
    }));
    document.addEventListener('keydown', (e) => {
      if (/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) return;
      if (!$('#briefing').classList.contains('hidden')) { if (e.key === 'Enter') $('#acceptBtn').click(); return; }
      if (e.code === 'Space') { e.preventDefault(); toggle(); }
      else if (e.key === 'ArrowRight') { stop(); go(state.step + 1, true); }
      else if (e.key === 'ArrowLeft') { stop(); go(state.step - 1, false); }
      else if (e.key.toLowerCase() === 'r') { stop(); cancelAgent(); go(0, false); }
    });
  }

  buildCode();
  bind();
  countdown();
  typeBriefing();
  // deep-links: index.html#play (pula briefing), #m2 / #free (cenário), #end (vai ao resultado)
  const hash = location.hash.slice(1).split(/[-,&]/);
  loadScenario(['m2', 'free'].find(k => hash.includes(k)) || 'm1');
  if (hash.includes('end')) go(state.result.steps.length - 1, false);
})();
