/* reportes.js — cálculos de la pestaña Análisis y del cierre mensual (funciones puras).
   Trabajan con apuestas que traen su arreglo `selecciones` (ver APP.estado.lista). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./calculos.js'));
  else root.REPORTES = factory(root.CALCULOS);
})(typeof self !== 'undefined' ? self : globalThis, function (C) {
  'use strict';

  const MUESTRA_MINIMA = 100;
  const unicos = (l) => [...new Set(l.map((x) => String(x || '').trim()).filter(Boolean))];
  const resuelta = (a) => C.esLiquidada(a) && a.estado !== 'anulada';
  const orden = (a) => a.fecha_liquidacion || a.fecha_hora;

  /** Dimensiones de desglose. Una doble cuenta en cada mercado/liga de sus selecciones. */
  const DIMENSIONES = {
    mercado: (a) => unicos(a.selecciones.map((s) => s.mercado)),
    liga: (a) => unicos(a.selecciones.map((s) => s.liga)),
    casa: (a) => unicos([a.casa]),
    fuente: (a) => unicos([a.fuente]),
    emocion: (a) => unicos([a.estado_emocional]),
    tipo: (a) => unicos([a.tipo]),
  };

  function filaGrupo(nombre, lista) {
    return {
      nombre,
      n: lista.length,
      apostado: C.totalApostado(lista),
      neto: C.gananciaNetaTotal(lista),
      yield: C.yieldTotal(lista),
      acierto: C.tasaAcierto(lista),
    };
  }

  /** Desglose de apuestas resueltas por dimensión, ordenado por ganancia neta (mayor primero). */
  function desglose(apuestas, dimension) {
    const claves = DIMENSIONES[dimension];
    if (!claves) throw new Error(`Dimensión desconocida: ${dimension}`);
    const grupos = new Map();
    apuestas.filter(resuelta).forEach((a) => {
      claves(a).forEach((k) => {
        if (!grupos.has(k)) grupos.set(k, []);
        grupos.get(k).push(a);
      });
    });
    return [...grupos.entries()].map(([k, l]) => filaGrupo(k, l)).sort((x, y) => y.neto - x.neto);
  }

  /** EV de la apuesta al momento de apostar (simple o combinada); null si falta alguna probabilidad. */
  function evApuesta(a) {
    if (!a.selecciones.length) return null;
    return a.selecciones.length === 1 ? C.ev(a.selecciones[0].prob_propia, a.selecciones[0].cuota) : C.evCombinada(a.selecciones);
  }

  /** EV medio de las apuestas resueltas con probabilidad propia, y ganancia esperada frente a la real. */
  function evPromedio(apuestas) {
    const con = apuestas.filter(resuelta).map((a) => ({ a, ev: evApuesta(a) })).filter((x) => x.ev !== null);
    if (!con.length) return { valor: null, n: 0, esperada: null, real: null };
    return {
      valor: con.reduce((s, x) => s + x.ev, 0) / con.length,
      n: con.length,
      esperada: C.redondear2(con.reduce((s, x) => s + x.a.stake * x.ev, 0)),
      real: C.redondear2(con.reduce((s, x) => s + (x.a.ganancia_neta || 0), 0)),
    };
  }

  /** CLV medio de las selecciones que tienen cuota de cierre. */
  function clvPromedio(apuestas) {
    const valores = [];
    apuestas.forEach((a) => a.selecciones.forEach((s) => {
      const v = C.clv(s.cuota, s.cuota_cierre);
      if (v !== null) valores.push(v);
    }));
    return { valor: valores.length ? valores.reduce((x, y) => x + y, 0) / valores.length : null, n: valores.length };
  }

  /**
   * Calibración: Brier score y curva por tramos de 10 puntos.
   * Solo con `minimo` (100) o más selecciones liquidadas con probabilidad propia.
   */
  function calibracion(apuestas, minimo = MUESTRA_MINIMA) {
    const puntos = [];
    apuestas.forEach((a) => a.selecciones.forEach((s) => {
      const p = C.leerNumero(s.prob_propia);
      if ((s.resultado === 'ganada' || s.resultado === 'perdida') && p > 0 && p < 100) {
        puntos.push({ p: p / 100, o: s.resultado === 'ganada' ? 1 : 0, implicita: s.cuota > 0 ? 1 / s.cuota : null });
      }
    }));
    if (puntos.length < minimo) return { suficiente: false, n: puntos.length, minimo };
    const brier = puntos.reduce((s, x) => s + (x.p - x.o) ** 2, 0) / puntos.length;
    const conImplicita = puntos.filter((x) => x.implicita !== null);
    const brierMercado = conImplicita.length ? conImplicita.reduce((s, x) => s + (x.implicita - x.o) ** 2, 0) / conImplicita.length : null;
    const tramos = Array.from({ length: 10 }, (_, i) => ({ desde: i * 10, hasta: (i + 1) * 10, n: 0, probMedia: null, frecuencia: null }));
    const sumas = tramos.map(() => ({ p: 0, o: 0 }));
    puntos.forEach((x) => {
      const i = Math.min(9, Math.floor(x.p * 10));
      tramos[i].n += 1; sumas[i].p += x.p; sumas[i].o += x.o;
    });
    tramos.forEach((t, i) => { if (t.n) { t.probMedia = sumas[i].p / t.n; t.frecuencia = sumas[i].o / t.n; } });
    return { suficiente: true, n: puntos.length, minimo, brier, brierMercado, tramos };
  }

  /** Curva de saldo: banca inicial + ganancia acumulada, en orden de liquidación. */
  function curvaSaldo(apuestas, bancaInicial) {
    let saldo = bancaInicial;
    const puntos = [{ i: 0, fecha: null, saldo: C.redondear2(saldo), delta: 0 }];
    apuestas.filter(C.esLiquidada).sort((a, b) => (orden(a) < orden(b) ? -1 : orden(a) > orden(b) ? 1 : 0)).forEach((a, k) => {
      saldo += a.ganancia_neta || 0;
      puntos.push({ i: k + 1, fecha: orden(a), saldo: C.redondear2(saldo), delta: a.ganancia_neta || 0, id: a.id });
    });
    return puntos;
  }

  /** Resumen de un mes para el cierre mensual. */
  function resumenMes(apuestas, depositos, bancaInicial, mes) {
    const delMes = apuestas.filter((a) => a.mes === mes);
    const cuenta = (e) => delMes.filter((a) => a.estado === e).length;
    const movs = depositos.filter((d) => String(d.fecha).slice(0, 7) === mes);
    const suma = (t) => C.redondear2(movs.filter((d) => d.tipo === t).reduce((s, d) => s + d.monto, 0));
    const neto = C.gananciaNetaTotal(delMes);
    return {
      mes,
      apuestas: delMes.length,
      pendientes: cuenta('pendiente'),
      ganadas: cuenta('ganada'),
      perdidas: cuenta('perdida'),
      anuladas: cuenta('anulada'),
      cashouts: cuenta('cashout'),
      apostado: C.totalApostado(delMes),
      neto,
      yield: C.yieldTotal(delMes),
      roi: C.roiBanca(delMes, bancaInicial),
      acierto: C.tasaAcierto(delMes),
      drawdown: C.drawdownMaximo(delMes, bancaInicial),
      bancaInicial: C.redondear2(bancaInicial),
      bancaFinal: C.redondear2(bancaInicial + neto),
      depositos: suma('deposito'),
      retiros: suma('retiro'),
    };
  }

  return { MUESTRA_MINIMA, DIMENSIONES, desglose, evApuesta, evPromedio, clvPromedio, calibracion, curvaSaldo, resumenMes };
});
