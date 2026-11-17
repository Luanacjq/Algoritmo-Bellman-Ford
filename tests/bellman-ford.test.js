// Executar com: node tests/bellman-ford.test.js
const assert = require('node:assert/strict');
const { bellmanFord, dijkstra, analyzeRisk, pathTo, fmt } = require('../js/bellman-ford.js');

const V = ['S', 'A', 'B', 'C', 'D', 'E'];
const BASE = [
  { from: 'S', to: 'A', w: 4 }, { from: 'S', to: 'B', w: 5 }, { from: 'A', to: 'B', w: -2 },
  { from: 'A', to: 'C', w: 6 }, { from: 'B', to: 'C', w: 3 }, { from: 'B', to: 'D', w: 7 },
  { from: 'C', to: 'D', w: 2 }
];
const TRAP = BASE.concat({ from: 'D', to: 'B', w: -6 });

let passed = 0;
function test(name, fn) { fn(); passed++; console.log('  ✔ ' + name); }

console.log('Experimento 1 — Risco dos esconderijos');
const r1 = bellmanFord(V, BASE, 'S');
test('distâncias corretas', () => {
  assert.deepEqual(r1.dist, { S: 0, A: 4, B: 2, C: 5, D: 7, E: Infinity });
});
test('sem ciclo negativo', () => assert.equal(r1.hasNegativeCycle, false));
test('caminhos mínimos', () => {
  assert.deepEqual(pathTo(r1.pred, 'S', 'D'), ['S', 'A', 'B', 'C', 'D']);
  assert.deepEqual(pathTo(r1.pred, 'S', 'B'), ['S', 'A', 'B']);
});
test('menor risco = B, maior risco = D, E inalcançável', () => {
  const risk = analyzeRisk(r1, V);
  assert.deepEqual(risk.lowest.map(x => x.v), ['B']);
  assert.deepEqual(risk.highest.map(x => x.v), ['D']);
  assert.deepEqual(risk.unreachable, ['E']);
});
test('parada antecipada após 2 iterações', () => assert.equal(r1.stats.passesRun, 2));

console.log('Experimento 2 — Detecção de armadilhas (D→B = −6)');
const r2 = bellmanFord(V, TRAP, 'S');
test('detecta ciclo negativo', () => assert.equal(r2.hasNegativeCycle, true));
test('ciclo B→C→D→B com peso −1', () => {
  const rot = r2.cycle.slice(r2.cycle.indexOf('B')).concat(r2.cycle.slice(0, r2.cycle.indexOf('B')));
  assert.deepEqual(rot, ['B', 'C', 'D']);
  assert.equal(r2.cycleWeight, -1);
});
test('armadilhas = B, C, D', () => assert.deepEqual(r2.traps, ['B', 'C', 'D']));
test('S e A seguros, E inalcançável', () => {
  assert.equal(r2.dist.S, 0); assert.equal(r2.dist.A, 4); assert.equal(r2.dist.E, Infinity);
});
test('valores após |V|-1 iterações', () => {
  assert.deepEqual(r2.rawDist, { S: 0, A: 4, B: -3, C: 1, D: 3, E: Infinity });
});
test('Dijkstra NÃO percebe o ciclo (resultado finito e errado)', () => {
  const d = dijkstra(V, TRAP, 'S');
  assert.deepEqual(d.dist, { S: 0, A: 4, B: 2, C: 5, D: 7, E: Infinity });
});
test('fmt', () => { assert.equal(fmt(Infinity), '∞'); assert.equal(fmt(-Infinity), '−∞'); assert.equal(fmt(-3), '−3'); });

console.log('\nTabela de iterações (experimento 2):');
r2.iterations.forEach(it => console.log('  ' + it.label.padEnd(12) + V.map(v => `${v}=${fmt(it.dist[v])}`).join('  ')));
console.log(`\n${passed} testes passaram.`);
