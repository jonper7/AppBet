const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../web/js/exportar.js');

test('CSV: una fila por apuesta con sus selecciones y escape de comillas y comas', () => {
  const csv = E.csvApuestas([{
    id: 'a1', fecha_hora: '2026-10-15T20:00', mes: '2026-10', casa: 'Casa, S.A.', tipo: 'simple', stake: 10, cuota_total: 2.1,
    estado: 'ganada', retorno: 21, ganancia_neta: 11, fuente: 'Claude', confianza: 4, estado_emocional: 'tranquilo', recuperando_perdida: false,
    selecciones: [{ partido: 'A vs "B"', liga: 'Liga', mercado: 'BTTS', seleccion: 'Sí', cuota: 2.1, prob_propia: 55, resultado: 'ganada' }],
  }]);
  const [cab, fila] = csv.split('\r\n');
  assert.ok(cab.startsWith('id,fecha_hora,mes,casa,tipo,stake'));
  assert.ok(cab.includes('partido_2'));
  assert.ok(fila.includes('"Casa, S.A."'));
  assert.ok(fila.includes('"A vs ""B"""'));
  assert.ok(fila.includes(',no,')); // recuperando_perdida
  assert.equal(fila.split(',').length > cab.split(',').length - 1, true);
});
