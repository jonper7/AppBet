const test = require('node:test');
const assert = require('node:assert/strict');
const RP = require('../web/js/reportes.js');

const cerca = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} no es cercano a ${b}`);
let n = 0;
function apuesta(estado, stake, neto, extra = {}, sels = [{}]) {
  n += 1;
  return Object.assign({
    id: `a${n}`, estado, stake, ganancia_neta: neto, fecha_hora: `2026-10-${String((n % 28) + 1).padStart(2, '0')}T10:00`, mes: '2026-10',
    casa: 'Casa A', fuente: 'análisis propio', estado_emocional: 'tranquilo', tipo: sels.length > 1 ? 'doble' : 'simple',
    selecciones: sels.map((s) => Object.assign({ mercado: '1X2', liga: 'Liga 1', cuota: 2, prob_propia: null, cuota_cierre: null, resultado: null }, s)),
  }, extra);
}

test('desglose por mercado: agrupa, ordena por neto y cuenta la doble en cada mercado', () => {
  const lista = [
    apuesta('ganada', 10, 10, {}, [{ mercado: 'BTTS' }]),
    apuesta('perdida', 10, -10, {}, [{ mercado: '1X2' }]),
    apuesta('ganada', 10, 12, {}, [{ mercado: 'BTTS' }, { mercado: '1X2' }]),
    apuesta('pendiente', 10, null, {}, [{ mercado: 'goles' }]),
  ];
  const filas = RP.desglose(lista, 'mercado');
  assert.deepEqual(filas.map((f) => f.nombre), ['BTTS', '1X2']);
  const btts = filas.find((f) => f.nombre === 'BTTS');
  assert.equal(btts.n, 2);
  assert.equal(btts.neto, 22);
  cerca(btts.yield, 1.1);
  cerca(btts.acierto, 1);
  const x12 = filas.find((f) => f.nombre === '1X2');
  assert.equal(x12.n, 2);
  assert.equal(x12.neto, 2);
});

test('desglose por casa, fuente, emoción y tipo; las anuladas no cuentan', () => {
  const lista = [
    apuesta('ganada', 10, 10, { casa: 'A', fuente: 'Claude', estado_emocional: 'aburrido' }),
    apuesta('perdida', 10, -10, { casa: 'B', fuente: 'tipster', estado_emocional: 'tras pérdida' }),
    apuesta('anulada', 10, 0, { casa: 'B' }),
  ];
  assert.equal(RP.desglose(lista, 'casa').length, 2);
  assert.equal(RP.desglose(lista, 'casa').find((f) => f.nombre === 'B').n, 1);
  assert.deepEqual(RP.desglose(lista, 'fuente').map((f) => f.nombre), ['Claude', 'tipster']);
  assert.deepEqual(RP.desglose(lista, 'emocion').map((f) => f.nombre), ['aburrido', 'tras pérdida']);
  assert.equal(RP.desglose(lista, 'tipo')[0].nombre, 'simple');
  assert.throws(() => RP.desglose(lista, 'otra'), /desconocida/);
});

test('EV promedio y ganancia esperada frente a la real', () => {
  const lista = [
    apuesta('ganada', 10, 10, {}, [{ cuota: 2, prob_propia: 60 }]),   // EV +0.2
    apuesta('perdida', 10, -10, {}, [{ cuota: 2, prob_propia: 50 }]), // EV 0
    apuesta('ganada', 10, 5, {}, [{ cuota: 2 }]),                      // sin probabilidad: se ignora
  ];
  const r = RP.evPromedio(lista);
  assert.equal(r.n, 2);
  cerca(r.valor, 0.1);
  assert.equal(r.esperada, 2);
  assert.equal(r.real, 0);
  assert.deepEqual(RP.evPromedio([]), { valor: null, n: 0, esperada: null, real: null });
});

test('EV de apuesta doble usa el producto de probabilidades', () => {
  const a = apuesta('ganada', 10, 10, {}, [{ cuota: 1.5, prob_propia: 80 }, { cuota: 1.6, prob_propia: 70 }]);
  cerca(RP.evApuesta(a), 0.8 * 0.7 * 1.5 * 1.6 - 1);
});

test('CLV promedio solo con cuota de cierre', () => {
  const lista = [
    apuesta('ganada', 10, 10, {}, [{ cuota: 2.1, cuota_cierre: 2.0 }]),
    apuesta('ganada', 10, 10, {}, [{ cuota: 1.9, cuota_cierre: 2.0 }]),
    apuesta('ganada', 10, 10, {}, [{ cuota: 3, cuota_cierre: null }]),
  ];
  const r = RP.clvPromedio(lista);
  assert.equal(r.n, 2);
  cerca(r.valor, 0);
  assert.deepEqual(RP.clvPromedio([]), { valor: null, n: 0 });
});

function conSelecciones(k, prob, ganadas) {
  return Array.from({ length: k }, (_, i) =>
    apuesta('ganada', 1, 1, {}, [{ cuota: 2, prob_propia: prob, resultado: i < ganadas ? 'ganada' : 'perdida' }]));
}

test('calibración: con menos de 100 selecciones muestra muestra insuficiente', () => {
  const r = RP.calibracion(conSelecciones(99, 60, 60));
  assert.equal(r.suficiente, false);
  assert.equal(r.n, 99);
  assert.equal(r.minimo, 100);
});

test('calibración: con 100 o más calcula Brier y tramos de 10 puntos', () => {
  const r = RP.calibracion(conSelecciones(100, 60, 60));
  assert.equal(r.suficiente, true);
  assert.equal(r.n, 100);
  cerca(r.brier, 0.6 * 0.4 ** 2 + 0.4 * 0.6 ** 2); // 0.24
  assert.equal(r.tramos.length, 10);
  const t = r.tramos[6]; // 60-70
  assert.equal(t.desde, 60);
  assert.equal(t.n, 100);
  cerca(t.probMedia, 0.6);
  cerca(t.frecuencia, 0.6);
  assert.equal(r.tramos[0].n, 0);
  cerca(r.brierMercado, 0.25); // prob implícita 0.5 con 60 % de aciertos: 0.6*0.25+0.4*0.25
});

test('calibración: una probabilidad exacta de 90–99 cae en el último tramo y 100 % se ignora', () => {
  const lista = [...conSelecciones(100, 95, 90), apuesta('ganada', 1, 1, {}, [{ prob_propia: 100, resultado: 'ganada' }])];
  const r = RP.calibracion(lista);
  assert.equal(r.n, 100);
  assert.equal(r.tramos[9].n, 100);
});

test('calibración: ignora selecciones sin resultado o anuladas', () => {
  const lista = [...conSelecciones(100, 60, 60), apuesta('anulada', 1, 0, {}, [{ prob_propia: 60, resultado: 'anulada' }]), apuesta('pendiente', 1, null, {}, [{ prob_propia: 60, resultado: null }])];
  assert.equal(RP.calibracion(lista).n, 100);
});

test('curva de saldo: banca inicial más ganancia acumulada en orden de liquidación', () => {
  const lista = [
    apuesta('perdida', 10, -10, { fecha_hora: '2026-10-02T10:00', fecha_liquidacion: '2026-10-03T10:00' }),
    apuesta('ganada', 10, 15, { fecha_hora: '2026-10-01T10:00', fecha_liquidacion: '2026-10-02T10:00' }),
    apuesta('pendiente', 10, null),
  ];
  const c = RP.curvaSaldo(lista, 100);
  assert.deepEqual(c.map((p) => p.saldo), [100, 115, 105]);
  assert.equal(c.length, 3);
});

test('resumen mensual', () => {
  const lista = [
    apuesta('ganada', 10, 10), apuesta('perdida', 10, -10), apuesta('perdida', 10, -10), apuesta('pendiente', 10, null),
    apuesta('anulada', 10, 0), apuesta('cashout', 10, -3),
    apuesta('ganada', 10, 50, { mes: '2026-09' }),
  ];
  const dep = [
    { tipo: 'deposito', fecha: '2026-10-03', monto: 100 }, { tipo: 'retiro', fecha: '2026-10-20', monto: 30 }, { tipo: 'deposito', fecha: '2026-09-28', monto: 999 },
  ];
  const r = RP.resumenMes(lista, dep, 100, '2026-10');
  assert.equal(r.apuestas, 6);
  assert.equal(r.pendientes, 1);
  assert.equal(r.ganadas, 1);
  assert.equal(r.perdidas, 2);
  assert.equal(r.anuladas, 1);
  assert.equal(r.cashouts, 1);
  assert.equal(r.neto, -13);
  assert.equal(r.apostado, 40);
  assert.equal(r.bancaFinal, 87);
  assert.equal(r.depositos, 100);
  assert.equal(r.retiros, 30);
  cerca(r.roi, -0.13);
  cerca(r.yield, -13 / 40);
});
