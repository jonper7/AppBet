const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../web/js/datos.js');
const DEMO = require('../web/js/datos_demo.js');
const R = require('../web/js/reglas.js');
const RP = require('../web/js/reportes.js');
const C = require('../web/js/calculos.js');

const AHORA = '2026-10-23T12:00';


async function sembrada() {
  const adaptador = D.adaptadorMemoria();
  const info = await DEMO.sembrar(adaptador, AHORA);
  const db = D.crear(adaptador);
  const datos = await db.cargar();
  const porApuesta = new Map();
  datos.selecciones.forEach((s) => { if (!porApuesta.has(s.apuesta_id)) porApuesta.set(s.apuesta_id, []); porApuesta.get(s.apuesta_id).push(s); });
  const lista = datos.apuestas.map((a) => Object.assign({}, a, { selecciones: (porApuesta.get(a.id) || []).sort((x, y) => x.orden - y.orden) }));
  return { db, info, datos, lista };
}

test('los datos de ejemplo bastan para ver la calibración (100 o más selecciones liquidadas)', async () => {
  const { info, lista } = await sembrada();
  assert.ok(info.apuestas >= 80, `apuestas: ${info.apuestas}`);
  const cal = RP.calibracion(lista);
  assert.equal(cal.suficiente, true, `n=${cal.n}`);
  assert.ok(cal.brier > 0 && cal.brier < 1);
});

test('los datos de ejemplo son coherentes: ganancia neta, estados y fechas', async () => {
  const { lista } = await sembrada();
  lista.forEach((a) => {
    assert.ok(['pendiente', 'ganada', 'perdida', 'anulada', 'cashout'].includes(a.estado));
    assert.equal(a.cuota_total, C.cuotaCombinada(a.selecciones.map((s) => s.cuota)));
    assert.equal(a.tipo, a.selecciones.length === 1 ? 'simple' : 'doble');
    if (a.estado === 'pendiente') assert.equal(a.ganancia_neta, null);
    else assert.equal(a.ganancia_neta, C.gananciaNeta(a.estado, a.stake, a.retorno));
    if (a.tipo === 'doble') assert.ok(a.cuota_total >= 2, `doble con cuota ${a.cuota_total}`);
    assert.ok(a.stake > 0 && a.stake <= 10);
  });
  assert.ok(lista.some((a) => a.estado === 'pendiente'));
  assert.ok(lista.some((a) => a.estado === 'cashout'));
});

test('con los datos de ejemplo todo el panel y los reportes se calculan sin fallar', async () => {
  const { db, datos, lista } = await sembrada();
  const ctx = db.contexto(datos, AHORA);
  const estado = R.estadoReglas(ctx);
  assert.ok(['verde', 'ambar', 'rojo'].includes(estado.nivel));
  ['mercado', 'liga', 'casa', 'fuente', 'emocion', 'tipo'].forEach((d) => assert.ok(RP.desglose(lista, d).length > 0));
  assert.ok(RP.curvaSaldo(lista, 100).length > 50);
  assert.ok(RP.clvPromedio(lista).n > 0);
  assert.ok(RP.evPromedio(lista).n > 0);
  assert.equal(datos.ajustes.cierres.length, 2);
  assert.ok(datos.depositos.length >= 4);
});

test('sembrar es determinista', async () => {
  const a = await sembrada();
  const b = await sembrada();
  assert.deepEqual(a.lista.map((x) => [x.id, x.estado, x.ganancia_neta]), b.lista.map((x) => [x.id, x.estado, x.ganancia_neta]));
});
