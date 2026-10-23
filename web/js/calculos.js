/* calculos.js — funciones puras (sin DOM, sin almacenamiento).
   Se carga como global CALCULOS en el navegador y con require() en las pruebas. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CALCULOS = factory();
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  const redondear2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

  /** Acepta "1,85" o "1.85". Devuelve NaN si no es un número. */
  function leerNumero(texto) {
    if (typeof texto === 'number') return texto;
    const limpio = String(texto == null ? '' : texto).trim().replace(',', '.');
    if (limpio === '') return NaN;
    return Number(limpio);
  }

  /** Probabilidad implícita (0–1) = 1 / cuota. */
  const probImplicita = (cuota) => (cuota > 0 ? 1 / cuota : NaN);

  /** Cuota combinada = producto de las cuotas, a 2 decimales. */
  function cuotaCombinada(cuotas) {
    if (!cuotas.length) return NaN;
    return redondear2(cuotas.reduce((a, c) => a * c, 1));
  }

  const retornoPotencial = (stake, cuotaTotal) => redondear2(stake * cuotaTotal);

  /** EV = prob_propia * cuota − 1. `probPct` va en porcentaje (0–100). */
  function ev(probPct, cuota) {
    const p = leerNumero(probPct);
    if (!Number.isFinite(p) || !(cuota > 0)) return null;
    return (p / 100) * cuota - 1;
  }

  /** EV de combinada = (producto de probabilidades) * (producto de cuotas) − 1.
      Devuelve null si falta la probabilidad de alguna selección. */
  function evCombinada(selecciones) {
    if (!selecciones.length) return null;
    let p = 1;
    let c = 1;
    for (const s of selecciones) {
      const pp = leerNumero(s.prob_propia);
      if (!Number.isFinite(pp)) return null;
      p *= pp / 100;
      c *= s.cuota;
    }
    return p * c - 1;
  }

  /** Ganancia neta según el estado. `retorno` es lo cobrado (stake incluido). */
  function gananciaNeta(estado, stake, retorno) {
    switch (estado) {
      case 'ganada':
      case 'cashout':
        return redondear2(retorno - stake);
      case 'perdida':
        return redondear2(-stake);
      case 'anulada':
        return 0;
      default:
        return null; // pendiente
    }
  }

  /** Retorno que corresponde a cada estado sin intervención del usuario. */
  function retornoAutomatico(estado, stake, cuotaTotal) {
    if (estado === 'ganada') return retornoPotencial(stake, cuotaTotal);
    if (estado === 'perdida') return 0;
    if (estado === 'anulada') return redondear2(stake);
    return null;
  }

  /** Liquidación de una combinada a partir del resultado de cada pata.
      Pata anulada cuenta como cuota 1.00; cualquier pata perdida pierde todo. */
  function liquidacionDesdeSelecciones(stake, selecciones) {
    if (selecciones.some((s) => !s.resultado)) return null;
    if (selecciones.some((s) => s.resultado === 'perdida')) {
      return { estado: 'perdida', retorno: 0 };
    }
    if (selecciones.every((s) => s.resultado === 'anulada')) {
      return { estado: 'anulada', retorno: redondear2(stake) };
    }
    const cuota = selecciones.reduce((a, s) => a * (s.resultado === 'ganada' ? s.cuota : 1), 1);
    return { estado: 'ganada', retorno: redondear2(stake * cuota) };
  }

  const esLiquidada = (a) => a.estado && a.estado !== 'pendiente';
  const porFecha = (a, b) => (a.fecha_hora < b.fecha_hora ? -1 : a.fecha_hora > b.fecha_hora ? 1 : 0);

  /** Total apostado en apuestas con resultado (excluye pendientes y anuladas). */
  function totalApostado(apuestas) {
    return redondear2(
      apuestas.filter((a) => esLiquidada(a) && a.estado !== 'anulada').reduce((s, a) => s + a.stake, 0)
    );
  }

  function gananciaNetaTotal(apuestas) {
    return redondear2(apuestas.filter(esLiquidada).reduce((s, a) => s + (a.ganancia_neta || 0), 0));
  }

  /** Yield = ganancia neta / total apostado (en fracción). null si no hay base. */
  function yieldTotal(apuestas) {
    const base = totalApostado(apuestas);
    return base > 0 ? gananciaNetaTotal(apuestas) / base : null;
  }

  /** ROI sobre la banca = ganancia neta / banca inicial. */
  function roiBanca(apuestas, bancaInicial) {
    return bancaInicial > 0 ? gananciaNetaTotal(apuestas) / bancaInicial : null;
  }

  /** % de acierto = ganadas / (ganadas + perdidas). Cashout y anuladas no cuentan. */
  function tasaAcierto(apuestas) {
    const g = apuestas.filter((a) => a.estado === 'ganada').length;
    const p = apuestas.filter((a) => a.estado === 'perdida').length;
    return g + p > 0 ? g / (g + p) : null;
  }

  /** Resultado "efectivo" para rachas: cashout cuenta según su signo; anuladas se ignoran. */
  function resultadoRacha(a) {
    if (a.estado === 'ganada') return 'ganada';
    if (a.estado === 'perdida') return 'perdida';
    if (a.estado === 'cashout') {
      if (a.ganancia_neta > 0) return 'ganada';
      if (a.ganancia_neta < 0) return 'perdida';
    }
    return null;
  }

  /** Racha actual: { tipo: 'ganada' | 'perdida' | null, n }. */
  function rachaActual(apuestas) {
    const orden = apuestas.filter(esLiquidada).sort(porFecha).reverse();
    let tipo = null;
    let n = 0;
    for (const a of orden) {
      const r = resultadoRacha(a);
      if (!r) continue;
      if (tipo === null) tipo = r;
      if (r !== tipo) break;
      n += 1;
    }
    return { tipo, n };
  }

  /** Curva de ganancia acumulada (orden de registro) y su drawdown máximo (≥ 0). */
  function drawdownMaximo(apuestas, bancaInicial = 0) {
    let saldo = bancaInicial;
    let pico = saldo;
    let max = 0;
    for (const a of apuestas.filter(esLiquidada).sort(porFecha)) {
      saldo += a.ganancia_neta || 0;
      pico = Math.max(pico, saldo);
      max = Math.max(max, pico - saldo);
    }
    return redondear2(max);
  }

  const FRACCION_KELLY = 0.25;

  /**
   * Stake sugerido, siempre ≤ stakeMax.
   * - Con probabilidad propia y ventaja (EV > 0): ¼ Kelly sobre la banca actual.
   * - Si no: stakeMax × confianza / 5.
   * `probFraccion` es la probabilidad (0–1) de que gane la apuesta completa, o null.
   */
  function stakeSugerido({ bancaActual, stakeMax, confianza, probFraccion, cuotaTotal }) {
    if (!(stakeMax > 0)) return { stake: 0, metodo: 'ninguno' };
    if (Number.isFinite(probFraccion) && cuotaTotal > 1 && bancaActual > 0) {
      const f = (probFraccion * cuotaTotal - 1) / (cuotaTotal - 1);
      if (f > 0) {
        const kelly = redondear2(Math.min(stakeMax, bancaActual * f * FRACCION_KELLY));
        if (kelly > 0) return { stake: kelly, metodo: 'kelly' };
      }
      const c = Math.min(5, Math.max(1, Number(confianza) || 3));
      return { stake: redondear2((stakeMax * c) / 5), metodo: 'sin_ventaja' };
    }
    const c = Math.min(5, Math.max(1, Number(confianza) || 3));
    return { stake: redondear2((stakeMax * c) / 5), metodo: 'confianza' };
  }

  /** CLV = cuota apostada / cuota de cierre − 1. null si no hay cuota de cierre. */
  function clv(cuotaApostada, cuotaCierre) {
    const c = leerNumero(cuotaCierre);
    return Number.isFinite(c) && c > 0 ? cuotaApostada / c - 1 : null;
  }

  return {
    redondear2, leerNumero, probImplicita, cuotaCombinada, retornoPotencial,
    ev, evCombinada, gananciaNeta, retornoAutomatico, liquidacionDesdeSelecciones,
    esLiquidada, totalApostado, gananciaNetaTotal, yieldTotal, roiBanca, tasaAcierto,
    rachaActual, drawdownMaximo, clv, stakeSugerido,
  };
});
