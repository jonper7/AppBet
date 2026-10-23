const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../web/js/datos.js');

const AHORA = '2026-10-15T20:00';
const sel = (partido, cuota, extra = {}) => Object.assign({
  partido, liga: 'Liga', fecha_partido: '2026-10-16T20:00', mercado: '1X2', seleccion: 'Local', cuota, prob_propia: '',
}, extra);
const borrador = (stake, selecciones) => ({
  casa: 'Casa', stake, fuente: 'análisis propio', confianza: 3, estado_emocional: 'tranquilo',
  recuperando_perdida: false, selecciones,
});

async function nueva() {
  const db = D.crear(D.adaptadorMemoria());
  await db.asegurarConfig(AHORA);
  return db;
}

test('registrar guarda la apuesta pendiente con sus selecciones y la cuota combinada', async () => {
  const db = await nueva();
  const { apuesta, selecciones } = await db.registrarApuesta(borrador(5, [sel('A vs B', 1.5), sel('C vs D', 1.6)]), AHORA);
  assert.equal(apuesta.tipo, 'doble');
  assert.equal(apuesta.cuota_total, 2.4);
  assert.equal(apuesta.estado, 'pendiente');
  assert.equal(apuesta.fecha_hora, AHORA);
  assert.equal(apuesta.mes, '2026-10');
  assert.equal(selecciones.length, 2);
  assert.deepEqual(selecciones.map((s) => s.orden), [0, 1]);
  const datos = await db.cargar();
  assert.equal(datos.apuestas.length, 1);
  assert.equal(datos.selecciones.length, 2);
});

test('criterio: se rechaza un stake mayor al 10% y no se guarda nada', async () => {
  const db = await nueva();
  await assert.rejects(db.registrarApuesta(borrador(10.5, [sel('A vs B', 1.8)]), AHORA), /Stake rechazado/);
  assert.equal((await db.cargar()).apuestas.length, 0);
});

test('criterio: se rechazan combinadas de más de 2 selecciones o con cuota total < 2.00', async () => {
  const db = await nueva();
  await assert.rejects(db.registrarApuesta(borrador(5, [sel('A', 1.5), sel('B', 1.5), sel('C', 1.5)]), AHORA), /máximo 2 selecciones/);
  await assert.rejects(db.registrarApuesta(borrador(5, [sel('A', 1.4), sel('B', 1.4)]), AHORA), /menor que el mínimo/);
  assert.equal((await db.cargar()).apuestas.length, 0);
});

test('criterio: al llegar al 30% de pérdida se bloquea hasta levantarlo con aviso', async () => {
  const db = await nueva();
  for (const [i, h] of ['2026-10-02T10:00', '2026-10-03T10:00', '2026-10-04T10:00'].entries()) {
    const { apuesta } = await db.registrarApuesta(borrador(10, [sel(`P${i}`, 1.8)]), h);
    await db.liquidar(apuesta.id, { estado: 'perdida' }, h);
  }
  await assert.rejects(db.registrarApuesta(borrador(5, [sel('Z', 1.8)]), AHORA), /Bloqueado/);
  await db.levantarBloqueo('perdida_mensual', AHORA);
  const { apuesta } = await db.registrarApuesta(borrador(5, [sel('Z', 1.8)]), AHORA);
  assert.equal(apuesta.estado, 'pendiente');
  // al reactivar vuelve a bloquear
  await db.reactivarBloqueo('perdida_mensual', AHORA);
  await assert.rejects(db.registrarApuesta(borrador(5, [sel('Y', 1.8)]), '2026-10-15T21:00'), /Bloqueado/);
  const tipos = (await db.cargar()).log.map((l) => l.tipo);
  assert.ok(tipos.includes('bloqueo_levantado') && tipos.includes('bloqueo_reactivado'));
});

test('liquidar calcula el retorno y la ganancia neta', async () => {
  const db = await nueva();
  const g = (await db.registrarApuesta(borrador(10, [sel('A', 2.5)]), AHORA)).apuesta;
  const r = await db.liquidar(g.id, { estado: 'ganada' }, AHORA);
  assert.equal(r.retorno, 25);
  assert.equal(r.ganancia_neta, 15);
  const p = (await db.registrarApuesta(borrador(5, [sel('B', 2.5)]), '2026-10-15T21:00')).apuesta;
  assert.equal((await db.liquidar(p.id, { estado: 'perdida' }, AHORA)).ganancia_neta, -5);
});

test('cashout pide el retorno y la anulada devuelve el stake', async () => {
  const db = await nueva();
  const a = (await db.registrarApuesta(borrador(10, [sel('A', 2.5)]), '2026-10-14T10:00')).apuesta;
  await assert.rejects(db.liquidar(a.id, { estado: 'cashout' }, AHORA), /retorno/);
  assert.equal((await db.liquidar(a.id, { estado: 'cashout', retorno: '6,5' }, AHORA)).ganancia_neta, -3.5);
  const b = (await db.registrarApuesta(borrador(10, [sel('B', 2.5)]), '2026-10-14T12:00')).apuesta;
  const anulada = await db.liquidar(b.id, { estado: 'anulada' }, AHORA);
  assert.equal(anulada.retorno, 10);
  assert.equal(anulada.ganancia_neta, 0);
});

test('criterio: una apuesta liquidada no se puede liquidar de nuevo', async () => {
  const db = await nueva();
  const a = (await db.registrarApuesta(borrador(10, [sel('A', 2.5)]), AHORA)).apuesta;
  await db.liquidar(a.id, { estado: 'perdida' }, AHORA);
  await assert.rejects(db.liquidar(a.id, { estado: 'ganada' }, AHORA), /ya está liquidada/);
});

test('criterio: no existe forma de editar ni borrar una apuesta registrada', async () => {
  const db = await nueva();
  for (const nombre of ['editarApuesta', 'actualizarApuesta', 'modificarApuesta', 'borrarApuesta', 'eliminarApuesta']) {
    assert.equal(typeof db[nombre], 'undefined');
  }
  const adaptador = D.adaptadorMemoria();
  assert.equal(typeof adaptador.borrar, 'undefined');
  assert.equal(typeof adaptador.eliminar, 'undefined');
});

test('criterio: las selecciones son inmutables salvo resultado y cuota de cierre', async () => {
  const db = await nueva();
  const { selecciones } = await db.registrarApuesta(borrador(10, [sel('A', 2.5)]), AHORA);
  for (const campo of ['cuota', 'partido', 'seleccion', 'mercado', 'liga', 'fecha_partido', 'prob_propia']) {
    await assert.rejects(db.actualizarSeleccion(selecciones[0].id, { [campo]: 9 }, AHORA), /inmutables/);
  }
  const ok = await db.actualizarSeleccion(selecciones[0].id, { cuota_cierre: '2,2' }, AHORA);
  assert.equal(ok.cuota_cierre, 2.2);
  assert.equal(ok.cuota, 2.5);
});

test('las correcciones se guardan en log_cambios sin tocar la apuesta', async () => {
  const db = await nueva();
  const { apuesta } = await db.registrarApuesta(borrador(10, [sel('A', 2.5)]), AHORA);
  await assert.rejects(db.registrarCorreccion(apuesta.id, { campo: 'cuota', valor_correcto: '2.6', motivo: '' }, AHORA), /motivo/);
  await db.registrarCorreccion(apuesta.id, { campo: 'cuota', valor_registrado: '2.5', valor_correcto: '2.6', motivo: 'Error al teclear' }, AHORA);
  const datos = await db.cargar();
  const entrada = datos.log.find((l) => l.tipo === 'correccion');
  assert.equal(entrada.apuesta_id, apuesta.id);
  assert.equal(entrada.despues, '2.6');
  assert.equal(datos.apuestas[0].cuota_total, 2.5);
  assert.equal(datos.selecciones[0].cuota, 2.5);
});

test('deshacer una liquidación reciente la revierte y queda en el log; fuera de plazo no', async () => {
  const db = await nueva();
  const a = (await db.registrarApuesta(borrador(10, [sel('A', 2.5)]), AHORA)).apuesta;
  await db.liquidar(a.id, { estado: 'ganada' }, '2026-10-15T20:01');
  const rev = await db.revertirLiquidacion(a.id, '2026-10-15T20:03');
  assert.equal(rev.estado, 'pendiente');
  assert.equal(rev.ganancia_neta, null);
  assert.ok((await db.cargar()).log.some((l) => l.tipo === 'liquidacion_revertida'));
  await db.liquidar(a.id, { estado: 'perdida' }, '2026-10-15T20:10');
  await assert.rejects(db.revertirLiquidacion(a.id, '2026-10-15T20:30'), /dentro de/);
});

test('regla 8: guardar parámetros crea la versión del mes siguiente y no cambia el mes actual', async () => {
  const db = await nueva();
  await db.guardarConfig({ banca_mensual: '250', stake_max_pct: 5, perdida_max_pct: 20, max_selecciones: 2, cuota_min: '2,00', max_apuestas_dia: 3, perdidas_seguidas_pausa: 2 }, AHORA);
  const datos = await db.cargar();
  const R = require('../web/js/reglas.js');
  assert.equal(R.configVigente(datos.config, '2026-10').banca_mensual, 100);
  assert.equal(R.configVigente(datos.config, '2026-11').banca_mensual, 250);
  assert.equal(R.configVigente(datos.config, '2026-11').stake_max_pct, 5);
  assert.ok(datos.log.some((l) => l.tipo === 'config'));
  await assert.rejects(db.guardarConfig({ banca_mensual: 0 }, AHORA));
});

test('liquidar una doble por selección: pata anulada cuenta como 1.00', async () => {
  const db = await nueva();
  const C = require('../web/js/calculos.js');
  const { apuesta, selecciones } = await db.registrarApuesta(borrador(10, [sel('A', 2), sel('B', 1.5)]), AHORA);
  const resultados = [{ id: selecciones[0].id, resultado: 'ganada' }, { id: selecciones[1].id, resultado: 'anulada' }];
  const liq = C.liquidacionDesdeSelecciones(10, selecciones.map((s) => Object.assign({}, s, { resultado: resultados.find((r) => r.id === s.id).resultado })));
  const r = await db.liquidar(apuesta.id, Object.assign({ resultados }, liq), AHORA);
  assert.equal(r.retorno, 20);
  assert.equal(r.ganancia_neta, 10);
  const guardadas = (await db.cargar()).selecciones;
  assert.deepEqual(guardadas.map((s) => s.resultado).sort(), ['anulada', 'ganada']);
});
