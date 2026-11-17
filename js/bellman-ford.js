/**
 * Spy Game — núcleo algorítmico.
 * Bellman-Ford com registro passo a passo (para animação), detecção de ciclos
 * negativos, extração do ciclo, propagação de "armadilhas" (vértices com custo −∞)
 * e Dijkstra para comparação.
 *
 * Funciona no navegador (window.SpyAlgo) e no Node (module.exports).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SpyAlgo = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const INF = Infinity;

  function fmt(d) {
    if (d === INF) return '∞';
    if (d === -INF) return '−∞';
    return d < 0 ? '−' + Math.abs(d) : String(d);
  }

  /**
   * Executa Bellman-Ford.
   * @param {string[]} vertices
   * @param {{from:string,to:string,w:number}[]} edges
   * @param {string} source
   * @param {{earlyStop?:boolean}} opts
   */
  function bellmanFord(vertices, edges, source, opts) {
    opts = opts || {};
    const earlyStop = opts.earlyStop !== false;
    const n = vertices.length;
    const dist = {};
    const pred = {};
    vertices.forEach(v => { dist[v] = INF; pred[v] = null; });
    dist[source] = 0;

    const steps = [];
    const iterations = [];
    let iterShown = 0;
    let relaxCount = 0;
    let compareCount = 0;
    let passesRun = 0;

    const snap = () => ({ dist: Object.assign({}, dist), pred: Object.assign({}, pred), iterShown });
    const push = (s) => steps.push(Object.assign(snap(), s));

    push({
      type: 'init', line: 2, phase: 'INICIALIZAÇÃO',
      msg: `Inicializando: d[${source}] = 0, demais esconderijos = ∞, predecessores = NIL.`
    });
    iterations.push({ label: 'Inicial', dist: Object.assign({}, dist) });
    iterShown = 1;

    for (let i = 1; i <= n - 1; i++) {
      passesRun = i;
      let changed = false;
      push({ type: 'pass', pass: i, line: 3, phase: `ITERAÇÃO ${i}/${n - 1}`,
        msg: `Iteração ${i} de ${n - 1}: varrendo todas as ${edges.length} rotas.` });

      edges.forEach((e, idx) => {
        compareCount++;
        const du = dist[e.from];
        const before = dist[e.to];
        const cand = du === INF ? INF : du + e.w;
        let ok = false;
        if (du !== INF && cand < before) {
          dist[e.to] = cand;
          pred[e.to] = e.from;
          ok = true;
          changed = true;
          relaxCount++;
        }
        let msg;
        if (du === INF) msg = `Rota ${e.from}→${e.to}: ${e.from} ainda não foi alcançado (∞). Ignorada.`;
        else if (ok) msg = `RELAXA ${e.from}→${e.to}: ${fmt(du)} + (${fmt(e.w)}) = ${fmt(cand)} < ${fmt(before)} ⇒ d[${e.to}] = ${fmt(cand)}, π[${e.to}] = ${e.from}.`;
        else msg = `Rota ${e.from}→${e.to}: ${fmt(du)} + (${fmt(e.w)}) = ${fmt(cand)} ≥ ${fmt(before)}. Sem melhoria.`;
        push({ type: 'relax', pass: i, edge: idx, ok, before, cand, line: ok ? 5 : 4,
          phase: `ITERAÇÃO ${i}/${n - 1}`, msg });
      });

      iterations.push({ label: `Iteração ${i}`, dist: Object.assign({}, dist), changed });
      iterShown = iterations.length;
      push({ type: 'pass-end', pass: i, changed, line: 3, phase: `ITERAÇÃO ${i}/${n - 1}`,
        msg: changed ? `Fim da iteração ${i}: houve atualizações.` : `Fim da iteração ${i}: nenhuma distância mudou.` });

      if (!changed && earlyStop) {
        push({ type: 'early', line: 3, phase: 'PARADA ANTECIPADA',
          msg: `Otimização: nenhuma mudança na iteração ${i} ⇒ distâncias estabilizadas. Encerrando as iterações mais cedo.` });
        break;
      }
    }

    // Verificação de ciclo negativo (|V|-ésima passada)
    push({ type: 'check-start', line: 6, phase: 'VARREDURA DE ARMADILHAS',
      msg: 'Varredura final: se alguma rota ainda puder ser relaxada, existe um ciclo negativo.' });

    const violated = [];
    edges.forEach((e, idx) => {
      compareCount++;
      const du = dist[e.from];
      const bad = du !== INF && du + e.w < dist[e.to];
      if (bad) violated.push(idx);
      push({ type: 'check', edge: idx, bad, line: bad ? 8 : 7, phase: 'VARREDURA DE ARMADILHAS',
        msg: bad
          ? `⚠ ${e.from}→${e.to}: ${fmt(du)} + (${fmt(e.w)}) = ${fmt(du + e.w)} < ${fmt(dist[e.to])}. Ainda relaxa ⇒ CICLO NEGATIVO!`
          : `${e.from}→${e.to}: OK (não relaxa).` });
    });

    // Extração do ciclo (técnica: relaxar mais uma vez, depois voltar n vezes por π)
    let cycle = [];
    if (violated.length) {
      const d2 = Object.assign({}, dist);
      const p2 = Object.assign({}, pred);
      let x = null;
      edges.forEach(e => {
        if (d2[e.from] !== INF && d2[e.from] + e.w < d2[e.to]) {
          d2[e.to] = d2[e.from] + e.w;
          p2[e.to] = e.from;
          x = e.to;
        }
      });
      for (let k = 0; k < n; k++) x = p2[x];
      const rev = [];
      let cur = x;
      do { rev.push(cur); cur = p2[cur]; } while (cur !== x && cur != null && rev.length <= n);
      cycle = rev.reverse();
      // rotaciona para começar pelo vértice que aparece primeiro em V (leitura mais natural)
      const start = cycle.reduce((b, v) => (vertices.indexOf(v) < vertices.indexOf(b) ? v : b), cycle[0]);
      const k0 = cycle.indexOf(start);
      cycle = cycle.slice(k0).concat(cycle.slice(0, k0));
    }

    // Armadilhas: todo vértice alcançável a partir de um vértice que ainda relaxa
    const trapSet = new Set();
    const queue = violated.map(i => edges[i].to).concat(cycle);
    queue.forEach(v => trapSet.add(v));
    while (queue.length) {
      const u = queue.shift();
      edges.forEach(e => {
        if (e.from === u && !trapSet.has(e.to)) { trapSet.add(e.to); queue.push(e.to); }
      });
    }
    const traps = vertices.filter(v => trapSet.has(v));

    const finalDist = Object.assign({}, dist);
    traps.forEach(v => { finalDist[v] = -INF; });

    const cycleWeight = cycle.length ? cycleEdges(cycle, edges).reduce((s, i) => s + edges[i].w, 0) : 0;

    if (violated.length) {
      push({ type: 'cycle', line: 8, cycle, traps, phase: 'ARMADILHA DETECTADA',
        msg: `🚨 Ciclo negativo ${cycle.concat(cycle[0]).join(' → ')} (peso total ${fmt(cycleWeight)}). Esconderijos comprometidos: ${traps.join(', ')} ⇒ custo −∞.` });
    }
    const s = snap();
    s.dist = finalDist;
    steps.push(Object.assign(s, {
      type: 'done', line: violated.length ? 8 : 9, cycle, traps,
      phase: violated.length ? 'MISSÃO COMPROMETIDA' : 'MISSÃO CONCLUÍDA',
      msg: violated.length
        ? 'Algoritmo retorna FALSE: existem armadilhas temporais na rede.'
        : 'Algoritmo retorna TRUE: rotas mais seguras calculadas para todos os esconderijos.'
    }));

    return {
      source,
      dist: finalDist,
      rawDist: dist,
      pred,
      steps,
      iterations,
      hasNegativeCycle: violated.length > 0,
      violated,
      cycle,
      cycleWeight,
      traps,
      stats: { passesRun, relaxCount, compareCount, V: n, E: edges.length, bound: n * edges.length }
    };
  }

  /** Índices das arestas que formam o ciclo (na ordem). */
  function cycleEdges(cycle, edges) {
    const out = [];
    for (let i = 0; i < cycle.length; i++) {
      const u = cycle[i], v = cycle[(i + 1) % cycle.length];
      let best = -1;
      edges.forEach((e, idx) => {
        if (e.from === u && e.to === v && (best < 0 || e.w < edges[best].w)) best = idx;
      });
      if (best >= 0) out.push(best);
    }
    return out;
  }

  /** Reconstrói o caminho origem → alvo seguindo os predecessores. */
  function pathTo(pred, source, target) {
    const path = [target];
    let cur = target;
    const guard = new Set([target]);
    while (cur !== source) {
      cur = pred[cur];
      if (cur == null || guard.has(cur)) return null;
      guard.add(cur);
      path.push(cur);
    }
    return path.reverse();
  }

  /** Dijkstra clássico (vértice finalizado não é reaberto) — para comparação. */
  function dijkstra(vertices, edges, source) {
    const dist = {}, pred = {}, done = new Set();
    vertices.forEach(v => { dist[v] = INF; pred[v] = null; });
    dist[source] = 0;
    const order = [];
    while (done.size < vertices.length) {
      let u = null;
      vertices.forEach(v => { if (!done.has(v) && (u === null || dist[v] < dist[u])) u = v; });
      if (u === null || dist[u] === INF) break;
      done.add(u);
      order.push(u);
      edges.forEach(e => {
        if (e.from === u && !done.has(e.to) && dist[u] + e.w < dist[e.to]) {
          dist[e.to] = dist[u] + e.w;
          pred[e.to] = u;
        }
      });
    }
    return { dist, pred, order };
  }

  /** Classificação de risco (experimento 1). */
  function analyzeRisk(result, vertices) {
    const reachable = vertices
      .filter(v => v !== result.source && Number.isFinite(result.dist[v]))
      .map(v => ({ v, d: result.dist[v] }))
      .sort((a, b) => a.d - b.d);
    const unreachable = vertices.filter(v => result.dist[v] === INF);
    const traps = result.traps.slice();
    return {
      ranking: reachable,
      lowest: reachable.length ? reachable.filter(r => r.d === reachable[0].d) : [],
      highest: reachable.length ? reachable.filter(r => r.d === reachable[reachable.length - 1].d) : [],
      unreachable,
      traps
    };
  }

  /** Caminho com menos saltos (BFS) — usado para levar o agente até o ciclo. */
  function hopPath(edges, source, target) {
    const prevEdge = {};
    const seen = new Set([source]);
    const q = [source];
    while (q.length) {
      const u = q.shift();
      if (u === target) break;
      edges.forEach((e, i) => {
        if (e.from === u && !seen.has(e.to)) { seen.add(e.to); prevEdge[e.to] = i; q.push(e.to); }
      });
    }
    if (!seen.has(target)) return null;
    const out = [];
    let cur = target;
    while (cur !== source) { const i = prevEdge[cur]; out.push(i); cur = edges[i].from; }
    return out.reverse();
  }

  return { INF, fmt, bellmanFord, dijkstra, pathTo, analyzeRisk, cycleEdges, hopPath };
});
