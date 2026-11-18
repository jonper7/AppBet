const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const R = require('../web/js/reglas.js');

// config.js es un script de navegador (const global): se evalúa aislado para leerlo
const CONFIG = JSON.parse(JSON.stringify(vm.runInNewContext(`${fs.readFileSync(path.join(__dirname, '../web/js/config.js'), 'utf8')}; CONFIG`)));

test('la guía por mercado cubre todos los mercados y coincide con las reglas', () => {
  assert.deepEqual(Object.keys(CONFIG.MERCADOS_GUIA).sort(), [...CONFIG.MERCADOS].sort());
  const conLinea = Object.entries(CONFIG.MERCADOS_GUIA).filter(([, g]) => g.linea).map(([m]) => m).sort();
  assert.deepEqual(conLinea, [...R.MERCADOS_CON_LINEA].sort());
});

test('cada mercado con opciones las tiene sin repetir, y «otro» es texto libre', () => {
  for (const [m, g] of Object.entries(CONFIG.MERCADOS_GUIA)) {
    if (m === 'otro') { assert.equal(g.opciones, null); continue; }
    assert.ok(g.opciones.length >= 2, m);
    assert.equal(new Set(g.opciones).size, g.opciones.length, m);
    assert.ok(g.ayuda.length > 0, m);
  }
  assert.deepEqual(CONFIG.MERCADOS_GUIA['1X2'].opciones, ['Local', 'Empate', 'Visitante']);
  assert.deepEqual(CONFIG.MERCADOS_GUIA.BTTS.opciones, ['Sí', 'No']);
});
