/* exportar.js — CSV del historial y entrega del archivo (menú compartir en el móvil, descarga en el resto). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.EXPORTAR = factory();
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  const COLUMNAS = [
    'id', 'fecha_hora', 'mes', 'casa', 'tipo', 'stake', 'cuota_total', 'estado', 'retorno', 'ganancia_neta',
    'fuente', 'confianza', 'estado_emocional', 'recuperando_perdida',
  ];
  const COLUMNAS_SELECCION = ['partido', 'liga', 'fecha_partido', 'mercado', 'seleccion', 'linea', 'cuota', 'cuota_cierre', 'prob_propia', 'resultado', 'nota'];
  const MAX_SELECCIONES = 2;

  function celda(v) {
    if (v === null || v === undefined) return '';
    const t = typeof v === 'boolean' ? (v ? 'sí' : 'no') : String(v);
    return /[",\n\r;]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  }

  /** `lista`: apuestas con su arreglo `selecciones`. Una fila por apuesta. */
  function csvApuestas(lista) {
    const cab = [...COLUMNAS];
    for (let i = 1; i <= MAX_SELECCIONES; i += 1) COLUMNAS_SELECCION.forEach((c) => cab.push(`${c}_${i}`));
    const filas = lista.map((a) => {
      const fila = COLUMNAS.map((c) => a[c]);
      for (let i = 0; i < MAX_SELECCIONES; i += 1) {
        const s = (a.selecciones || [])[i] || {};
        COLUMNAS_SELECCION.forEach((c) => fila.push(s[c]));
      }
      return fila;
    });
    return [cab, ...filas].map((f) => f.map(celda).join(',')).join('\r\n');
  }

  /** Entrega un archivo: menú compartir si el sistema lo permite; si no, descarga. */
  async function entregar(nombre, texto, mime = 'text/csv') {
    const partes = mime === 'text/csv' ? ['\ufeff', texto] : [texto]; // BOM solo en CSV (Excel); el JSON no lo admite
    const blob = new Blob(partes, { type: `${mime};charset=utf-8` });
    // Android a veces rechaza compartir application/json: se reintenta como text/plain y, si no, se descarga.
    for (const tipo of mime === 'text/plain' ? [mime] : [mime, 'text/plain']) {
      const archivo = new File([blob], nombre, { type: tipo });
      if (navigator.canShare && navigator.canShare({ files: [archivo] })) {
        try {
          await navigator.share({ files: [archivo], title: nombre });
          return 'compartido';
        } catch (e) {
          if (e && e.name === 'AbortError') return 'cancelado';
        }
      }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = nombre;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return 'descargado';
  }

  /** Resumen de un cierre mensual: cabecera y una fila. */
  function csvResumen(r) {
    const cols = ['mes', 'apuestas', 'pendientes', 'ganadas', 'perdidas', 'anuladas', 'cashouts', 'apostado', 'neto', 'yield', 'roi', 'acierto', 'drawdown', 'bancaInicial', 'bancaFinal', 'depositos', 'retiros'];
    return [cols, cols.map((c) => r[c])].map((f) => f.map(celda).join(',')).join('\r\n');
  }

  return { csvApuestas, csvResumen, entregar };
});
