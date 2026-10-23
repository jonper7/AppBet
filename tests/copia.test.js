const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../web/js/datos.js');

const AHORA = '2026-10-15T20:00';
const sel = (partido, cuota, extra = {}) => Object.assign({
  partido, liga: 'Liga', fecha_partido: '2026-10-16T20:00', mercado: '1X2', seleccion: 'Local', cuota, prob_propia: '',
}, extra);
const borrador = (stake, selecciones, extra = {}) => Object.assign({
  casa: 'Casa', stake, fuente: 'análisis propio', confianza: 3, estado_emocional: 'tranquilo',
  recuperando_perdida: false, selecciones,
}, extra);

async function conDatos() {
  const db = D.crear(D.adaptadorMemoria());
  await db.asegurarConfig(AHORA);
  const a = (await db.registrarApuesta(borrador(5, [sel('A', 1.5), sel('B', 1.6)]), '2026-10-14T10:00')).apuesta;
  await db.liquidar(a.id, { estado: 'ganada' }, '2026-10-14T20:00');
  await db.registrarApuesta(borrador(5, [sel('C', 2)]), AHORA);
  await db.registrarDeposito({ monto: '50', tipo: 'deposito', metodo: 'tarjeta', motivo: 'inicio' }, AHORA);
  await db.levantarBloqueo('max_apuestas_dia', AHORA);
  return db;
}

test('exportar copia: versionada, con selecciones dentro de cada apuesta y sin respaldos internos', async () => {
  const db = await conDatos();
  const copia = await db.exportarCopia(AHORA);
  assert.equal(copia.aplicacion, 'registro-de-picks');
  assert.equal(copia.version, 2);
  assert.equal(copia.apuestas.length, 2);
  const doble = copia.apuestas.find((a) => a.tipo === 'doble');
  assert.deepEqual(doble.selecciones.map((s) => s.orden), [0, 1]);
  assert.equal(copia.depositos.length, 1);
  assert.equal(copia.ajustes.overrides.length, 1);
  assert.equal(Object.keys(copia.ajustes).some((k) => k.startsWith('respaldo_')), false);
});

test('importar una copia en una app vacía reconstruye todo; importarla dos veces no duplica', async () => {
  const origen = await conDatos();
  const copia = JSON.parse(JSON.stringify(await origen.exportarCopia(AHORA)));
  const destino = D.crear(D.adaptadorMemoria());
  const r1 = await destino.importarCopia(copia);
  assert.equal(r1.apuestas, 2);
  assert.equal(r1.selecciones, 3);
  assert.equal(r1.depositos, 1);
  const r2 = await destino.importarCopia(copia);
  assert.equal(r2.apuestas, 0);
  assert.equal(r2.selecciones, 0);
  assert.equal(r2.omitidas, 2);
  const datos = await destino.cargar();
  assert.equal(datos.apuestas.length, 2);
  assert.equal(datos.selecciones.length, 3);
  assert.equal(datos.ajustes.overrides.length, 1);
});

test('importar nunca pisa una apuesta existente (los datos de la app ganan)', async () => {
  const db = await conDatos();
  const copia = JSON.parse(JSON.stringify(await db.exportarCopia(AHORA)));
  const pendiente = copia.apuestas.find((a) => a.estado === 'ganada');
  pendiente.estado = 'perdida'; pendiente.ganancia_neta = -5; // copia manipulada
  await db.importarCopia(copia);
  const datos = await db.cargar();
  assert.equal(datos.apuestas.find((a) => a.id === pendiente.id).estado, 'ganada');
});

test('importar rechaza archivos ajenos o de una versión más nueva', async () => {
  const db = D.crear(D.adaptadorMemoria());
  await assert.rejects(db.importarCopia({ foo: 1 }), /no es una copia/);
  await assert.rejects(db.importarCopia(null), /no es una copia/);
  await assert.rejects(db.importarCopia({ aplicacion: 'registro-de-picks', version: 99 }), /versión más nueva/);
});

test('respaldo semanal: sin datos no respalda; con datos respalda y espera 7 días', async () => {
  const vacia = D.crear(D.adaptadorMemoria());
  assert.equal(await vacia.respaldarSiToca('2026-10-15T10:00'), null);

  const db = await conDatos();
  const r = await db.respaldarSiToca('2026-10-15T10:00');
  assert.equal(r.fecha, '2026-10-15');
  assert.equal(await db.respaldarSiToca('2026-10-18T10:00'), null);          // 3 días: aún no
  assert.equal(await db.respaldarSiToca('2026-10-21T23:00'), null);          // 6 días: aún no
  const r2 = await db.respaldarSiToca('2026-10-22T08:00');                   // 7 días: toca
  assert.equal(r2.fecha, '2026-10-22');
  const lista = await db.listarRespaldos();
  assert.equal(lista.length, 2);
  assert.equal(lista[0].fecha, '2026-10-22');
  assert.equal(lista[0].apuestas, 2);
});

test('respaldos: solo hay 4 ranuras rotativas (los más viejos se sobrescriben)', async () => {
  const db = await conDatos();
  for (let semana = 0; semana < 8; semana += 1) {
    const d = new Date(Date.UTC(2026, 9, 15 + semana * 7));
    await db.respaldarSiToca(`${d.toISOString().slice(0, 10)}T09:00`);
  }
  const lista = await db.listarRespaldos();
  assert.equal(lista.length, 4);
  assert.equal(lista[0].fecha, '2026-12-03');
});

test('los respaldos no se meten dentro de la copia exportada (no crece sin límite)', async () => {
  const db = await conDatos();
  await db.respaldarSiToca('2026-10-15T10:00');
  const copia = await db.exportarCopia(AHORA);
  assert.equal(JSON.stringify(copia).includes('respaldo_'), false);
});

test('cierre mensual: guarda el resumen una vez, no permite meses futuros y queda en el log', async () => {
  const db = await conDatos();
  const entrada = await db.cerrarMes('2026-09', { neto: 12 }, AHORA);
  assert.equal(entrada.mes, '2026-09');
  await assert.rejects(db.cerrarMes('2026-09', { neto: 99 }, AHORA), /ya está cerrado/);
  await assert.rejects(db.cerrarMes('2026-11', {}, AHORA), /aún no empieza/);
  await assert.rejects(db.cerrarMes('septiembre', {}, AHORA), /no válido/);
  const datos = await db.cargar();
  assert.equal(datos.ajustes.cierres.length, 1);
  assert.equal(datos.ajustes.cierres[0].resumen.neto, 12);
  assert.ok(datos.log.some((l) => l.tipo === 'cierre_mes'));
});

test('los cierres viajan en la copia y se fusionan al importar', async () => {
  const a = await conDatos();
  await a.cerrarMes('2026-09', { neto: 1 }, AHORA);
  const copia = JSON.parse(JSON.stringify(await a.exportarCopia(AHORA)));
  const b = D.crear(D.adaptadorMemoria());
  await b.importarCopia(copia);
  await b.importarCopia(copia);
  assert.equal((await b.cargar()).ajustes.cierres.length, 1);
});

test('captura: se guarda aparte, la apuesta guarda su referencia y viaja en la copia', async () => {
  const db = D.crear(D.adaptadorMemoria());
  await db.asegurarConfig(AHORA);
  const png = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';
  const { apuesta } = await db.registrarApuesta(borrador(5, [sel('A', 2)], { captura: png }), AHORA);
  assert.equal(apuesta.captura, apuesta.id);
  assert.equal(await db.obtenerCaptura(apuesta.id), png);
  assert.equal((await db.exportarCopia(AHORA)).capturas.length, 1);
  const sin = (await db.registrarApuesta(borrador(5, [sel('B', 2)], { captura: 'no-es-una-imagen' }), '2026-10-15T21:00')).apuesta;
  assert.equal(sin.captura, null);
});

test('guardarAjuste solo acepta ajustes permitidos', async () => {
  const db = D.crear(D.adaptadorMemoria());
  await db.guardarAjuste('ultima_exportacion', '2026-10-15');
  assert.equal((await db.cargar()).ajustes.ultima_exportacion, '2026-10-15');
  await assert.rejects(db.guardarAjuste('overrides', []), /no se puede escribir/);
});
