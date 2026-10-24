const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../web/js/datos.js');

const AHORA = '2026-10-15T20:00';
const sel = (partido, cuota, liga = 'LaLiga') => ({
  partido, liga, fecha_partido: '2026-10-16T20:00', mercado: '1X2', seleccion: 'Local', cuota, prob_propia: '',
});
const borrador = (casa, selecciones, stake = 5) => ({
  casa, stake, fuente: 'análisis propio', confianza: 3, estado_emocional: 'tranquilo', recuperando_perdida: false, selecciones,
});

async function nueva() {
  const db = D.crear(D.adaptadorMemoria());
  await db.asegurarConfig(AHORA);
  return db;
}
const catalogos = async (db) => {
  const datos = await db.cargar();
  return { casas: D.catalogoDe(datos, 'casas'), ligas: D.catalogoDe(datos, 'ligas') };
};

test('al registrar se guardan la casa y las ligas nuevas, ordenadas', async () => {
  const db = await nueva();
  await db.registrarApuesta(borrador('Bet365', [sel('A', 1.5, 'Serie A'), sel('B', 1.6, 'LaLiga')]), '2026-10-14T10:00');
  assert.deepEqual(await catalogos(db), { casas: ['Bet365'], ligas: ['LaLiga', 'Serie A'] });
  await db.registrarApuesta(borrador('Codere', [sel('C', 2, 'Bundesliga')]), AHORA);
  assert.deepEqual(await catalogos(db), { casas: ['Bet365', 'Codere'], ligas: ['Bundesliga', 'LaLiga', 'Serie A'] });
});

test('una casa o liga ya guardada se reutiliza con su escritura original (sin duplicar por mayúsculas ni tildes)', async () => {
  const db = await nueva();
  await db.registrarApuesta(borrador('Bet365', [sel('A', 2, 'LaLiga')]), '2026-10-14T10:00');
  const { apuesta, selecciones } = await db.registrarApuesta(borrador('  bet365 ', [sel('B', 2, ' laliga ')]), AHORA);
  assert.equal(apuesta.casa, 'Bet365');
  assert.equal(selecciones[0].liga, 'LaLiga');
  assert.deepEqual(await catalogos(db), { casas: ['Bet365'], ligas: ['LaLiga'] });
  await db.registrarApuesta(borrador('Betway', [sel('C', 2, 'Ligue 1')]), '2026-10-16T09:00');
  const { selecciones: s2 } = await db.registrarApuesta(borrador('Betway', [sel('D', 2, 'LIGUE 1')]), '2026-10-17T09:00');
  assert.equal(s2[0].liga, 'Ligue 1');
});

test('sin lista guardada, la lista sale del historial y la primera edición la fija', async () => {
  const adaptador = D.adaptadorMemoria();
  const db = D.crear(adaptador);
  await db.asegurarConfig(AHORA);
  // historial anterior a esta mejora: apuestas guardadas sin lista
  await adaptador.guardar([
    ['apuestas', { id: 'a1', casa: 'Codere', mes: '2026-09', fecha_hora: '2026-09-01T10:00', estado: 'ganada', stake: 5, ganancia_neta: 5 }],
    ['selecciones', { id: 's1', apuesta_id: 'a1', liga: 'Premier League' }],
  ]);
  assert.deepEqual(await catalogos(db), { casas: ['Codere'], ligas: ['Premier League'] });
  await db.guardarCatalogo('casas', ['Codere', 'Bet365']);
  assert.deepEqual((await catalogos(db)).casas, ['Bet365', 'Codere']);
});

test('editar la lista: quitar un elemento no borra apuestas y lo ofrecido es solo la lista', async () => {
  const db = await nueva();
  await db.registrarApuesta(borrador('Bet365', [sel('A', 2, 'LaLiga')]), '2026-10-14T10:00');
  await db.guardarCatalogo('casas', []);
  assert.deepEqual((await catalogos(db)).casas, []);
  assert.equal((await db.cargar()).apuestas[0].casa, 'Bet365');
  await db.guardarCatalogo('ligas', ['LaLiga', 'Serie A']);
  assert.deepEqual((await catalogos(db)).ligas, ['LaLiga', 'Serie A']);
});

test('renombrar en la lista no cambia las apuestas ya registradas', async () => {
  const db = await nueva();
  const { apuesta } = await db.registrarApuesta(borrador('Bet365', [sel('A', 2)]), '2026-10-14T10:00');
  await db.guardarCatalogo('casas', ['Bet 365']);
  const datos = await db.cargar();
  assert.deepEqual(D.catalogoDe(datos, 'casas'), ['Bet 365']);
  assert.equal(datos.apuestas.find((a) => a.id === apuesta.id).casa, 'Bet365');
});

test('guardarCatalogo valida: repetidos, vacíos, largo y tipo', async () => {
  const db = await nueva();
  await assert.rejects(db.guardarCatalogo('casas', ['Bet365', ' bet365 ']), /repetido/);
  await assert.rejects(db.guardarCatalogo('casas', ['x'.repeat(61)]), /hasta 60/);
  await assert.rejects(db.guardarCatalogo('equipos', ['A']), /desconocida/);
  assert.deepEqual(await db.guardarCatalogo('casas', ['  ', 'Codere', '']), ['Codere']);
});

test('editar la lista queda en el registro de cambios', async () => {
  const db = await nueva();
  await db.guardarCatalogo('ligas', ['LaLiga']);
  await db.guardarCatalogo('ligas', ['Serie A']);
  const e = (await db.cargar()).log.filter((l) => l.tipo === 'catalogo');
  assert.equal(e.length, 2);
  const ultima = e.find((l) => l.despues[0] === 'Serie A');
  assert.deepEqual(ultima.antes, ['LaLiga']);
});

test('las listas viajan en la copia y se unen al importar sin pisar las de la app', async () => {
  const origen = await nueva();
  await origen.registrarApuesta(borrador('Bet365', [sel('A', 2, 'Serie A')]), '2026-10-14T10:00');
  await origen.guardarCatalogo('casas', ['Bet365', 'Betway']);
  const copia = JSON.parse(JSON.stringify(await origen.exportarCopia(AHORA)));
  assert.deepEqual(copia.ajustes.catalogo_casas, ['Betway', 'Bet365'].sort((a, b) => a.localeCompare(b, 'es')));

  const destino = await nueva();
  await destino.registrarApuesta(borrador('Codere', [sel('Z', 2, 'LaLiga')]), '2026-10-13T10:00');
  await destino.importarCopia(copia);
  await destino.importarCopia(copia);
  assert.deepEqual(await catalogos(destino), { casas: ['Bet365', 'Betway', 'Codere'], ligas: ['LaLiga', 'Serie A'] });
});
