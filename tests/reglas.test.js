const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../web/js/reglas.js');

const AHORA = '2026-10-15T20:00';
const cfg = R.PARAMETROS_POR_DEFECTO; // banca 100, stake máx 10, pérdida máx 30
const sel = (partido, cuota, extra = {}) => Object.assign({
  partido, liga: 'Liga', fecha_partido: '2026-10-16T20:00', mercado: '1X2', seleccion: 'Local', cuota, prob_propia: '',
}, extra);
const borrador = (stake, selecciones, extra = {}) => Object.assign({
  casa: 'Casa', stake, fuente: 'análisis propio', confianza: 3, estado_emocional: 'tranquilo',
  recuperando_perdida: false, selecciones,
}, extra);
const hecha = (id, estado, stake, ganancia, hora, mes = '2026-10') => ({
  id, estado, stake, ganancia_neta: ganancia, fecha_hora: hora, mes, retorno: null,
});
const ctx = (apuestas = [], extra = {}) => Object.assign({ config: cfg, apuestas, depositos: [], overrides: [], ahora: AHORA }, extra);
const codigos = (lista) => lista.map((x) => x.codigo);

test('una simple válida se acepta', () => {
  const r = R.evaluarApuesta(borrador(10, [sel('A vs B', 1.8)]), ctx());
  assert.equal(r.ok, true);
  assert.deepEqual(r.errores, []);
});

test('regla 2: stake mayor al 10% de la banca se rechaza', () => {
  const r = R.evaluarApuesta(borrador(10.01, [sel('A vs B', 1.8)]), ctx());
  assert.equal(r.ok, false);
  assert.ok(codigos(r.errores).includes('stake_max'));
});

test('regla 2: stake exactamente en el máximo se acepta', () => {
  assert.equal(R.evaluarApuesta(borrador(10, [sel('A vs B', 1.8)]), ctx()).ok, true);
});

test('el stake máximo sale de la banca inicial del mes configurada', () => {
  const c = ctx([], { config: Object.assign({}, cfg, { banca_mensual: 200 }) });
  assert.equal(R.evaluarApuesta(borrador(20, [sel('A vs B', 1.8)]), c).ok, true);
  assert.equal(R.evaluarApuesta(borrador(20.01, [sel('A vs B', 1.8)]), c).ok, false);
});

test('regla 1: al llegar al 30% de pérdida se bloquea el registro', () => {
  const previas = [hecha('1', 'perdida', 10, -10, '2026-10-02T10:00'), hecha('2', 'perdida', 10, -10, '2026-10-03T10:00'), hecha('3', 'perdida', 10, -10, '2026-10-04T10:00')];
  const r = R.evaluarApuesta(borrador(5, [sel('A vs B', 1.8)]), ctx(previas));
  assert.equal(r.ok, false);
  const e = r.errores.find((x) => x.codigo === 'perdida_mensual');
  assert.ok(e);
  assert.equal(e.levantable, true);
});

test('regla 1: justo por debajo del límite no bloquea', () => {
  const previas = [hecha('1', 'perdida', 10, -10, '2026-10-02T10:00'), hecha('2', 'perdida', 10, -10, '2026-10-03T10:00'), hecha('3', 'perdida', 9.99, -9.99, '2026-10-04T10:00')];
  assert.equal(R.evaluarApuesta(borrador(5, [sel('A vs B', 1.8)]), ctx(previas)).ok, true);
});

test('regla 1: las ganancias compensan la pérdida neta del mes', () => {
  const previas = [hecha('1', 'perdida', 10, -10, '2026-10-02T10:00'), hecha('2', 'perdida', 10, -10, '2026-10-03T10:00'),
    hecha('3', 'ganada', 10, 15, '2026-10-04T10:00'), hecha('4', 'perdida', 10, -10, '2026-10-05T10:00')];
  assert.equal(R.evaluarApuesta(borrador(5, [sel('A vs B', 1.8)]), ctx(previas)).ok, true);
});

test('regla 1: las pérdidas de otro mes no cuentan', () => {
  const previas = [hecha('1', 'perdida', 10, -30, '2026-09-20T10:00', '2026-09')];
  assert.equal(R.evaluarApuesta(borrador(5, [sel('A vs B', 1.8)]), ctx(previas)).ok, true);
});

test('regla 1: el bloqueo se puede levantar y queda como aviso', () => {
  const previas = [hecha('1', 'perdida', 10, -30, '2026-10-02T10:00')];
  const c = ctx(previas, { overrides: [{ regla: 'perdida_mensual', periodo: '2026-10' }] });
  const r = R.evaluarApuesta(borrador(5, [sel('A vs B', 1.8)]), c);
  assert.equal(r.ok, true);
  assert.ok(codigos(r.avisos).includes('bloqueo_levantado'));
});

test('regla 1: levantar el bloqueo de un mes no afecta al mes siguiente', () => {
  const previas = [hecha('1', 'perdida', 10, -30, '2026-11-02T10:00', '2026-11')];
  const c = ctx(previas, { ahora: '2026-11-15T20:00', overrides: [{ regla: 'perdida_mensual', periodo: '2026-10' }] });
  assert.equal(R.evaluarApuesta(borrador(5, [sel('A vs B', 1.8)]), c).ok, false);
});

test('regla 3: aviso si subo el stake después de una pérdida', () => {
  const previas = [hecha('1', 'perdida', 5, -5, '2026-10-14T10:00')];
  const r = R.evaluarApuesta(borrador(8, [sel('A vs B', 1.8)]), ctx(previas));
  assert.ok(codigos(r.avisos).includes('subida_stake'));
  assert.equal(r.ok, true);
});

test('regla 3: sin aviso si la anterior fue ganada o el stake no sube', () => {
  const ganada = [hecha('1', 'ganada', 5, 5, '2026-10-14T10:00')];
  assert.ok(!codigos(R.evaluarApuesta(borrador(8, [sel('A vs B', 1.8)]), ctx(ganada)).avisos).includes('subida_stake'));
  const perdida = [hecha('1', 'perdida', 5, -5, '2026-10-14T10:00')];
  assert.ok(!codigos(R.evaluarApuesta(borrador(5, [sel('A vs B', 1.8)]), ctx(perdida)).avisos).includes('subida_stake'));
});

test('regla 4: más de 2 selecciones se rechaza', () => {
  const r = R.evaluarApuesta(borrador(5, [sel('A vs B', 1.5), sel('C vs D', 1.5), sel('E vs F', 1.5)]), ctx());
  assert.equal(r.ok, false);
  assert.ok(codigos(r.errores).includes('max_selecciones'));
});

test('regla 4: doble con cuota total menor a 2.00 se rechaza', () => {
  const r = R.evaluarApuesta(borrador(5, [sel('A vs B', 1.4), sel('C vs D', 1.4)]), ctx());
  assert.equal(r.ok, false);
  assert.ok(codigos(r.errores).includes('cuota_min'));
});

test('regla 4: doble con cuota total exactamente 2.00 se acepta', () => {
  assert.equal(R.evaluarApuesta(borrador(5, [sel('A vs B', 2), sel('C vs D', 1.02)]), ctx()).ok, true);
  assert.equal(R.evaluarApuesta(borrador(5, [sel('A vs B', 1.6), sel('C vs D', 1.25)]), ctx()).ok, true);
});

test('regla 4: la doble exige partidos distintos', () => {
  const r = R.evaluarApuesta(borrador(5, [sel('A vs B', 1.6), sel('  a VS b ', 1.6)]), ctx());
  assert.equal(r.ok, false);
  assert.ok(codigos(r.errores).includes('partidos_repetidos'));
});

test('la cuota mínima de 2.00 no se exige a las simples', () => {
  assert.equal(R.evaluarApuesta(borrador(5, [sel('A vs B', 1.5)]), ctx()).ok, true);
});

test('regla 5: aviso si los depósitos del mes superan la banca mensual', () => {
  const dep = [{ tipo: 'deposito', fecha: '2026-10-03', monto: 60 }, { tipo: 'deposito', fecha: '2026-10-09', monto: 50 },
    { tipo: 'retiro', fecha: '2026-10-10', monto: 30 }, { tipo: 'deposito', fecha: '2026-09-28', monto: 500 }];
  const r = R.evaluarApuesta(borrador(5, [sel('A vs B', 1.8)]), ctx([], { depositos: dep }));
  assert.ok(codigos(r.avisos).includes('depositos'));
  assert.equal(r.ok, true);
});

test('regla 5: sin aviso si los depósitos no superan la banca', () => {
  const dep = [{ tipo: 'deposito', fecha: '2026-10-03', monto: 100 }];
  assert.ok(!codigos(R.evaluarApuesta(borrador(5, [sel('A vs B', 1.8)]), ctx([], { depositos: dep })).avisos).includes('depositos'));
});

test('regla 6: pausa sugerida tras 2 pérdidas seguidas', () => {
  const previas = [hecha('1', 'perdida', 5, -5, '2026-10-13T10:00'), hecha('2', 'perdida', 5, -5, '2026-10-14T10:00')];
  const r = R.evaluarApuesta(borrador(5, [sel('A vs B', 1.8)]), ctx(previas));
  assert.ok(codigos(r.avisos).includes('pausa'));
  assert.equal(r.ok, true);
});

test('regla 6: una ganada en medio rompe la racha', () => {
  const previas = [hecha('1', 'perdida', 5, -5, '2026-10-12T10:00'), hecha('2', 'ganada', 5, 5, '2026-10-13T10:00'), hecha('3', 'perdida', 5, -5, '2026-10-14T10:00')];
  assert.ok(!codigos(R.evaluarApuesta(borrador(5, [sel('A vs B', 1.8)]), ctx(previas)).avisos).includes('pausa'));
});

test('máximo de apuestas por día: la tercera del día se rechaza y se puede levantar', () => {
  const hoy = [hecha('1', 'pendiente', 5, null, '2026-10-15T09:00'), hecha('2', 'pendiente', 5, null, '2026-10-15T12:00')];
  const r = R.evaluarApuesta(borrador(5, [sel('A vs B', 1.8)]), ctx(hoy));
  assert.equal(r.ok, false);
  assert.equal(r.errores.find((e) => e.codigo === 'max_apuestas_dia').levantable, true);
  const c = ctx(hoy, { overrides: [{ regla: 'max_apuestas_dia', periodo: '2026-10-15' }] });
  assert.equal(R.evaluarApuesta(borrador(5, [sel('A vs B', 1.8)]), c).ok, true);
});

test('las apuestas de ayer no cuentan para el límite diario', () => {
  const ayer = [hecha('1', 'pendiente', 5, null, '2026-10-14T09:00'), hecha('2', 'pendiente', 5, null, '2026-10-14T12:00')];
  assert.equal(R.evaluarApuesta(borrador(5, [sel('A vs B', 1.8)]), ctx(ayer)).ok, true);
});

test('validaciones: cuota debe ser mayor que 1.01, stake mayor que 0, campos obligatorios', () => {
  assert.ok(codigos(R.evaluarApuesta(borrador(5, [sel('A vs B', 1.01)]), ctx()).errores).includes('cuota'));
  assert.ok(codigos(R.evaluarApuesta(borrador(0, [sel('A vs B', 1.8)]), ctx()).errores).includes('stake'));
  assert.ok(codigos(R.evaluarApuesta(borrador(5, [sel('', 1.8)]), ctx()).errores).includes('partido'));
  assert.ok(codigos(R.evaluarApuesta(borrador(5, [sel('A vs B', 1.8, { liga: '' })]), ctx()).errores).includes('liga'));
  assert.ok(codigos(R.evaluarApuesta(borrador(5, []), ctx()).errores).includes('selecciones'));
  assert.ok(codigos(R.evaluarApuesta(borrador(5, [sel('A vs B', NaN)]), ctx()).errores).includes('cuota'));
});

test('validaciones: probabilidad propia fuera de rango', () => {
  const r = R.evaluarApuesta(borrador(5, [sel('A vs B', 1.8, { prob_propia: 120 })]), ctx());
  assert.ok(codigos(r.errores).includes('prob_propia'));
});

test('aviso de registro tardío si el partido ya empezó', () => {
  const r = R.evaluarApuesta(borrador(5, [sel('A vs B', 1.8, { fecha_partido: '2026-10-15T18:00' })]), ctx());
  assert.ok(codigos(r.avisos).includes('registro_tardio'));
});

test('regla 8: los parámetros nuevos rigen desde el mes siguiente', () => {
  const configs = [
    { vigente_desde: '2026-10', banca_mensual: 100 },
    { vigente_desde: '2026-11', banca_mensual: 250 },
  ];
  assert.equal(R.configVigente(configs, '2026-10').banca_mensual, 100);
  assert.equal(R.configVigente(configs, '2026-11').banca_mensual, 250);
  assert.equal(R.configVigente(configs, '2027-03').banca_mensual, 250);
  assert.equal(R.configVigente([], '2026-10').banca_mensual, 100);
  assert.equal(R.mesSiguiente('2026-12'), '2027-01');
  assert.equal(R.mesSiguiente('2026-10'), '2026-11');
});

test('validarConfig rechaza valores fuera de rango', () => {
  assert.deepEqual(R.validarConfig(R.PARAMETROS_POR_DEFECTO), []);
  assert.ok(R.validarConfig(Object.assign({}, cfg, { banca_mensual: 0 })).length > 0);
  assert.ok(R.validarConfig(Object.assign({}, cfg, { max_selecciones: 3 })).length > 0);
  assert.ok(R.validarConfig(Object.assign({}, cfg, { cuota_min: 1 })).length > 0);
});

test('semáforo: verde, ámbar y rojo', () => {
  assert.equal(R.estadoReglas(ctx()).nivel, 'verde');
  const cerca = [hecha('1', 'perdida', 10, -10, '2026-10-02T10:00'), hecha('2', 'perdida', 10, -10, '2026-10-03T10:00'), hecha('3', 'perdida', 3, -3, '2026-10-04T10:00')];
  assert.equal(R.estadoReglas(ctx(cerca)).nivel, 'ambar');
  const tope = [hecha('1', 'perdida', 10, -30, '2026-10-02T10:00')];
  assert.equal(R.estadoReglas(ctx(tope)).nivel, 'rojo');
  assert.equal(R.estadoReglas(ctx(tope, { overrides: [{ regla: 'perdida_mensual', periodo: '2026-10' }] })).nivel, 'ambar');
});

test('situación: stake máximo hoy es 0 cuando el registro está bloqueado', () => {
  assert.equal(R.situacion(ctx()).stakeMaximoHoy, 10);
  assert.equal(R.situacion(ctx([hecha('1', 'perdida', 10, -30, '2026-10-02T10:00')])).stakeMaximoHoy, 0);
});
