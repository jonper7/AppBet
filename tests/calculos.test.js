const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../web/js/calculos.js');

const cerca = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} no es cercano a ${b}`);
const ap = (estado, stake, ganancia, hora) => ({ estado, stake, ganancia_neta: ganancia, fecha_hora: hora });

test('probabilidad implícita = 1/cuota', () => {
  cerca(C.probImplicita(2), 0.5);
  cerca(C.probImplicita(4), 0.25);
});

test('cuota combinada = producto, a 2 decimales', () => {
  assert.equal(C.cuotaCombinada([1.5, 1.5]), 2.25);
  assert.equal(C.cuotaCombinada([1.83, 1.12]), 2.05);
  assert.equal(C.cuotaCombinada([2.1]), 2.1);
});

test('retorno potencial', () => {
  assert.equal(C.retornoPotencial(10, 2.25), 22.5);
});

test('EV simple = prob * cuota - 1', () => {
  cerca(C.ev(60, 2), 0.2);
  cerca(C.ev(50, 2), 0);
  cerca(C.ev(40, 2), -0.2);
  assert.equal(C.ev('', 2), null);
  assert.equal(C.ev(null, 2), null);
});

test('EV acepta coma decimal', () => {
  cerca(C.ev('55,5', 2), 0.11);
});

test('EV de combinada = producto de probabilidades * producto de cuotas - 1', () => {
  const sels = [{ prob_propia: 60, cuota: 1.8 }, { prob_propia: 70, cuota: 1.5 }];
  cerca(C.evCombinada(sels), 0.6 * 0.7 * 1.8 * 1.5 - 1);
});

test('EV de combinada es null si falta una probabilidad', () => {
  assert.equal(C.evCombinada([{ prob_propia: 60, cuota: 1.8 }, { prob_propia: null, cuota: 1.5 }]), null);
  assert.equal(C.evCombinada([{ prob_propia: 60, cuota: 1.8 }, { prob_propia: '', cuota: 1.5 }]), null);
});

test('ganancia neta por estado', () => {
  assert.equal(C.gananciaNeta('ganada', 10, 25), 15);
  assert.equal(C.gananciaNeta('perdida', 10, 0), -10);
  assert.equal(C.gananciaNeta('anulada', 10, 10), 0);
  assert.equal(C.gananciaNeta('cashout', 10, 6.5), -3.5);
  assert.equal(C.gananciaNeta('pendiente', 10, null), null);
});

test('liquidación de combinada: pata anulada cuenta como cuota 1.00', () => {
  const r = C.liquidacionDesdeSelecciones(10, [{ cuota: 2, resultado: 'ganada' }, { cuota: 1.5, resultado: 'anulada' }]);
  assert.deepEqual(r, { estado: 'ganada', retorno: 20 });
});

test('liquidación de combinada: una pata perdida pierde todo; todas anuladas devuelve el stake', () => {
  assert.deepEqual(C.liquidacionDesdeSelecciones(10, [{ cuota: 2, resultado: 'ganada' }, { cuota: 1.5, resultado: 'perdida' }]), { estado: 'perdida', retorno: 0 });
  assert.deepEqual(C.liquidacionDesdeSelecciones(10, [{ cuota: 2, resultado: 'anulada' }, { cuota: 1.5, resultado: 'anulada' }]), { estado: 'anulada', retorno: 10 });
  assert.equal(C.liquidacionDesdeSelecciones(10, [{ cuota: 2, resultado: 'ganada' }, { cuota: 1.5, resultado: null }]), null);
});

test('yield, ROI y acierto ignoran pendientes y anuladas', () => {
  const lista = [
    ap('ganada', 10, 12, '2026-10-01T10:00'),
    ap('perdida', 10, -10, '2026-10-02T10:00'),
    ap('anulada', 10, 0, '2026-10-03T10:00'),
    ap('pendiente', 10, null, '2026-10-04T10:00'),
  ];
  assert.equal(C.totalApostado(lista), 20);
  assert.equal(C.gananciaNetaTotal(lista), 2);
  cerca(C.yieldTotal(lista), 0.1);
  cerca(C.roiBanca(lista, 100), 0.02);
  cerca(C.tasaAcierto(lista), 0.5);
});

test('yield y acierto son null sin base', () => {
  assert.equal(C.yieldTotal([]), null);
  assert.equal(C.tasaAcierto([ap('anulada', 5, 0, '2026-10-01T10:00')]), null);
});

test('racha actual: cuenta consecutivas del mismo tipo, ignora anuladas', () => {
  const lista = [
    ap('ganada', 10, 10, '2026-10-01T10:00'),
    ap('perdida', 10, -10, '2026-10-02T10:00'),
    ap('anulada', 10, 0, '2026-10-03T10:00'),
    ap('perdida', 10, -10, '2026-10-04T10:00'),
  ];
  assert.deepEqual(C.rachaActual(lista), { tipo: 'perdida', n: 2 });
  assert.deepEqual(C.rachaActual([]), { tipo: null, n: 0 });
});

test('racha: cashout cuenta según su signo', () => {
  const lista = [ap('ganada', 10, 10, '2026-10-01T10:00'), ap('cashout', 10, -3, '2026-10-02T10:00')];
  assert.deepEqual(C.rachaActual(lista), { tipo: 'perdida', n: 1 });
});

test('drawdown máximo', () => {
  const lista = [
    ap('ganada', 10, 10, '2026-10-01T10:00'),
    ap('perdida', 10, -10, '2026-10-02T10:00'),
    ap('perdida', 10, -10, '2026-10-03T10:00'),
    ap('ganada', 10, 5, '2026-10-04T10:00'),
  ];
  assert.equal(C.drawdownMaximo(lista, 100), 20);
});

test('CLV = cuota apostada / cuota cierre - 1', () => {
  cerca(C.clv(2.1, 2.0), 0.05);
  assert.equal(C.clv(2.1, null), null);
});

test('stake sugerido: sin probabilidad usa la confianza sobre el máximo', () => {
  const base = { bancaActual: 100, stakeMax: 10, probFraccion: null, cuotaTotal: 2 };
  assert.deepEqual(C.stakeSugerido({ ...base, confianza: 5 }), { stake: 10, metodo: 'confianza' });
  assert.deepEqual(C.stakeSugerido({ ...base, confianza: 3 }), { stake: 6, metodo: 'confianza' });
  assert.deepEqual(C.stakeSugerido({ ...base, confianza: 1 }), { stake: 2, metodo: 'confianza' });
});

test('stake sugerido: con ventaja usa ¼ Kelly sobre la banca actual', () => {
  // p=0.6, cuota 2.0 → f = (1.2-1)/(1) = 0.2 → ¼ = 5 % de 100 = 5
  assert.deepEqual(C.stakeSugerido({ bancaActual: 100, stakeMax: 10, confianza: 3, probFraccion: 0.6, cuotaTotal: 2 }), { stake: 5, metodo: 'kelly' });
});

test('stake sugerido: nunca supera el stake máximo', () => {
  const r = C.stakeSugerido({ bancaActual: 100, stakeMax: 10, confianza: 3, probFraccion: 0.95, cuotaTotal: 3 });
  assert.equal(r.stake, 10);
  assert.equal(r.metodo, 'kelly');
});

test('stake sugerido: sin ventaja cae al método de confianza', () => {
  const r = C.stakeSugerido({ bancaActual: 100, stakeMax: 10, confianza: 4, probFraccion: 0.4, cuotaTotal: 2 });
  assert.deepEqual(r, { stake: 8, metodo: 'sin_ventaja' });
});

test('stake sugerido: máximo 0 (registro bloqueado) devuelve 0', () => {
  assert.equal(C.stakeSugerido({ bancaActual: 100, stakeMax: 0, confianza: 3, probFraccion: null, cuotaTotal: 2 }).stake, 0);
});
