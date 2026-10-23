/* reglas.js — reglas de control del registro de picks (funciones puras).
   Cada regla devuelve mensajes claros. Un "error" bloquea el registro; un "aviso" solo informa.
   Las fechas son texto local "YYYY-MM-DDTHH:mm": el mes es slice(0,7) y el día slice(0,10). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./calculos.js'));
  else root.REGLAS = factory(root.CALCULOS);
})(typeof self !== 'undefined' ? self : globalThis, function (C) {
  'use strict';

  const PARAMETROS_POR_DEFECTO = Object.freeze({
    banca_mensual: 100,
    stake_max_pct: 10,
    perdida_max_pct: 30,
    max_selecciones: 2,
    cuota_min: 2.0,
    max_apuestas_dia: 2,
    perdidas_seguidas_pausa: 2,
  });

  const CUOTA_MINIMA_VALIDA = 1.01; // la cuota debe ser estrictamente mayor
  const UMBRAL_ALERTA = 0.75;

  const mesDe = (fecha) => String(fecha).slice(0, 7);
  const diaDe = (fecha) => String(fecha).slice(0, 10);
  const num2 = (n) => C.redondear2(n).toFixed(2).replace('.', ',');
  const dinero = num2;
  const pct = (n) => `${Math.round(n * 100)}%`;
  const normalizar = (t) => String(t || '').trim().toLowerCase().replace(/\s+/g, ' ');

  function mesSiguiente(mes) {
    let [a, m] = mes.split('-').map(Number);
    m += 1;
    if (m > 12) { m = 1; a += 1; }
    return `${a}-${String(m).padStart(2, '0')}`;
  }

  /** Parámetros que rigen en `mes`: la última versión con vigente_desde <= mes. */
  function configVigente(configs, mes) {
    const validas = (configs || []).filter((c) => c.vigente_desde <= mes)
      .sort((a, b) => (a.vigente_desde < b.vigente_desde ? -1 : 1));
    const c = validas[validas.length - 1];
    return Object.assign({}, PARAMETROS_POR_DEFECTO, c || {});
  }

  /** Valida parámetros editables. Devuelve lista de mensajes (vacía si todo está bien). */
  function validarConfig(p) {
    const e = [];
    const num = (k) => C.leerNumero(p[k]);
    if (!(num('banca_mensual') > 0)) e.push('La banca mensual debe ser mayor que 0.');
    const s = num('stake_max_pct');
    if (!(s > 0 && s <= 100)) e.push('El stake máximo debe estar entre 0 y 100 %.');
    const l = num('perdida_max_pct');
    if (!(l > 0 && l <= 100)) e.push('La pérdida máxima mensual debe estar entre 0 y 100 %.');
    const m = num('max_selecciones');
    if (!(Number.isInteger(m) && m >= 1 && m <= 2)) e.push('Las selecciones por combinada deben ser 1 o 2.');
    if (!(num('cuota_min') >= CUOTA_MINIMA_VALIDA)) e.push(`La cuota total mínima debe ser al menos ${num2(CUOTA_MINIMA_VALIDA)}.`);
    if (!(Number.isInteger(num('max_apuestas_dia')) && num('max_apuestas_dia') >= 1)) e.push('Las apuestas por día deben ser un entero de 1 o más.');
    if (!(Number.isInteger(num('perdidas_seguidas_pausa')) && num('perdidas_seguidas_pausa') >= 1)) e.push('Las pérdidas seguidas para sugerir pausa deben ser un entero de 1 o más.');
    return e;
  }

  const overrideActivo = (overrides, regla, periodo) =>
    (overrides || []).some((o) => o.regla === regla && o.periodo === periodo);

  /** Magnitudes derivadas del mes y del día en curso. Base de todas las reglas y del panel. */
  function situacion(ctx) {
    const cfg = ctx.config;
    const apuestas = ctx.apuestas || [];
    const mes = mesDe(ctx.ahora);
    const dia = diaDe(ctx.ahora);
    const delMes = apuestas.filter((a) => a.mes === mes);
    const gananciaMes = C.gananciaNetaTotal(delMes);
    const perdidaMes = Math.max(0, C.redondear2(-gananciaMes));
    const limitePerdida = C.redondear2((cfg.banca_mensual * cfg.perdida_max_pct) / 100);
    const stakeMax = C.redondear2((cfg.banca_mensual * cfg.stake_max_pct) / 100);
    const apuestasHoy = apuestas.filter((a) => diaDe(a.fecha_hora) === dia).length;
    const racha = C.rachaActual(apuestas);
    const depositosMes = C.redondear2(
      (ctx.depositos || []).filter((d) => d.tipo === 'deposito' && mesDe(d.fecha) === mes)
        .reduce((s, d) => s + d.monto, 0)
    );
    const usoPerdida = limitePerdida > 0 ? perdidaMes / limitePerdida : 0;
    const topePerdida = perdidaMes >= limitePerdida - 1e-9 && limitePerdida > 0;
    const topeDia = apuestasHoy >= cfg.max_apuestas_dia;
    const perdidaLevantada = overrideActivo(ctx.overrides, 'perdida_mensual', mes);
    const diaLevantado = overrideActivo(ctx.overrides, 'max_apuestas_dia', dia);
    const enJuego = C.redondear2(apuestas.filter((a) => a.estado === 'pendiente').reduce((s, a) => s + a.stake, 0));
    const bloqueado = (topePerdida && !perdidaLevantada) || (topeDia && !diaLevantado);
    return {
      mes, dia, gananciaMes, perdidaMes, limitePerdida, usoPerdida, stakeMax, apuestasHoy,
      racha, depositosMes, topePerdida, topeDia, perdidaLevantada, diaLevantado, enJuego,
      bancaActual: C.redondear2(cfg.banca_mensual + gananciaMes),
      bloqueado,
      stakeMaximoHoy: bloqueado ? 0 : stakeMax,
    };
  }

  /** Validación de campos obligatorios y rangos (no depende del historial). */
  function validarCampos(b) {
    const e = [];
    const err = (codigo, mensaje) => e.push({ codigo, mensaje, levantable: false });
    if (!String(b.casa || '').trim()) err('casa', 'Indica la casa de apuestas.');
    if (!(Number.isFinite(b.stake) && b.stake > 0)) err('stake', 'El stake debe ser mayor que 0.');
    if (!b.fuente) err('fuente', 'Indica la fuente del pick.');
    if (!b.estado_emocional) err('estado_emocional', 'Indica tu estado emocional.');
    if (!(b.confianza >= 1 && b.confianza <= 5)) err('confianza', 'La confianza va de 1 a 5.');
    (b.selecciones || []).forEach((s, i) => {
      const n = i + 1;
      if (!String(s.partido || '').trim()) err('partido', `Selección ${n}: indica el partido.`);
      if (!String(s.liga || '').trim()) err('liga', `Selección ${n}: indica la liga.`);
      if (!s.fecha_partido) err('fecha_partido', `Selección ${n}: indica la fecha del partido.`);
      if (!s.mercado) err('mercado', `Selección ${n}: indica el mercado.`);
      if (!String(s.seleccion || '').trim()) err('seleccion', `Selección ${n}: indica qué eliges.`);
      if (!(Number.isFinite(s.cuota) && s.cuota > CUOTA_MINIMA_VALIDA)) {
        err('cuota', `Selección ${n}: la cuota debe ser mayor que ${num2(CUOTA_MINIMA_VALIDA)}.`);
      }
      const p = C.leerNumero(s.prob_propia);
      if (s.prob_propia !== '' && s.prob_propia != null && !(p > 0 && p < 100)) {
        err('prob_propia', `Selección ${n}: la probabilidad propia debe estar entre 0 y 100 %.`);
      }
    });
    return e;
  }

  /**
   * Evalúa un borrador de apuesta contra todas las reglas.
   * borrador: { stake, casa, fuente, confianza, estado_emocional, recuperando_perdida,
   *             selecciones: [{ partido, liga, fecha_partido, mercado, seleccion, cuota, prob_propia }] }
   * ctx: { config, apuestas, depositos, overrides, ahora }
   */
  function evaluarApuesta(borrador, ctx) {
    const cfg = ctx.config;
    const sit = situacion(ctx);
    const selecciones = borrador.selecciones || [];
    const errores = validarCampos(borrador);
    const avisos = [];
    const error = (codigo, mensaje, levantable = false) => errores.push({ codigo, mensaje, levantable });
    const aviso = (codigo, mensaje) => avisos.push({ codigo, mensaje });

    // 1. Bloqueo por pérdida mensual (se puede levantar con aviso).
    if (sit.topePerdida) {
      if (sit.perdidaLevantada) {
        aviso('bloqueo_levantado', `Bloqueo por pérdida mensual levantado manualmente. Llevas −${dinero(sit.perdidaMes)} de un límite de ${dinero(sit.limitePerdida)}.`);
      } else {
        error('perdida_mensual', `Bloqueado: la pérdida neta del mes (−${dinero(sit.perdidaMes)}) llegó al límite de ${dinero(sit.limitePerdida)} (${cfg.perdida_max_pct} % de la banca). No se registran apuestas hasta el mes siguiente.`, true);
      }
    } else if (sit.usoPerdida >= UMBRAL_ALERTA) {
      aviso('cerca_limite', `Has consumido el ${pct(sit.usoPerdida)} del límite de pérdida mensual (−${dinero(sit.perdidaMes)} de ${dinero(sit.limitePerdida)}).`);
    }

    // Máximo de apuestas por día (mismo mecanismo de bloqueo levantable).
    if (sit.topeDia) {
      if (sit.diaLevantado) {
        aviso('dia_levantado', `Límite diario levantado manualmente: ya hay ${sit.apuestasHoy} apuestas hoy (máximo ${cfg.max_apuestas_dia}).`);
      } else {
        error('max_apuestas_dia', `Máximo de ${cfg.max_apuestas_dia} apuestas por día alcanzado (hoy: ${sit.apuestasHoy}). Vuelve mañana.`, true);
      }
    }

    // 2. Stake mayor al máximo: rechazar.
    if (Number.isFinite(borrador.stake) && C.redondear2(borrador.stake) > sit.stakeMax) {
      error('stake_max', `Stake rechazado: ${dinero(borrador.stake)} supera el máximo de ${dinero(sit.stakeMax)} (${cfg.stake_max_pct} % de la banca de ${dinero(cfg.banca_mensual)}).`);
    }

    // 3. Aviso si subo el stake respecto a la apuesta anterior después de una pérdida.
    const previa = [...(ctx.apuestas || [])].sort((a, b) => (a.fecha_hora < b.fecha_hora ? 1 : -1))[0];
    if (previa && previa.estado === 'perdida' && Number.isFinite(borrador.stake) && borrador.stake > previa.stake) {
      aviso('subida_stake', `Subes el stake tras una pérdida: ${dinero(previa.stake)} → ${dinero(borrador.stake)}. Es un patrón típico de recuperar pérdidas.`);
    }

    // Si esta apuesta pierde, ¿se supera el límite mensual?
    if (!sit.topePerdida && Number.isFinite(borrador.stake) && sit.perdidaMes + borrador.stake > sit.limitePerdida + 1e-9) {
      aviso('supera_margen', `Si pierdes esta apuesta, la pérdida del mes llegaría a −${dinero(sit.perdidaMes + borrador.stake)} y superaría el límite de ${dinero(sit.limitePerdida)}.`);
    }

    // 4. Combinada: máximo de selecciones, partidos distintos, cuota total mínima.
    if (selecciones.length === 0) {
      error('selecciones', 'Agrega al menos una selección.');
    } else if (selecciones.length > cfg.max_selecciones) {
      error('max_selecciones', `Combinada rechazada: máximo ${cfg.max_selecciones} selecciones (tienes ${selecciones.length}).`);
    } else if (selecciones.length >= 2) {
      const partidos = selecciones.map((s) => normalizar(s.partido)).filter(Boolean);
      if (new Set(partidos).size < partidos.length) {
        error('partidos_repetidos', 'Combinada rechazada: las selecciones deben ser de partidos distintos.');
      }
      const cuotas = selecciones.map((s) => s.cuota);
      if (cuotas.every(Number.isFinite)) {
        const total = C.cuotaCombinada(cuotas);
        if (total < cfg.cuota_min) {
          error('cuota_min', `Combinada rechazada: la cuota total ${num2(total)} es menor que el mínimo de ${num2(cfg.cuota_min)}.`);
        }
      }
    }

    // 5. Depósitos del mes por encima de la banca mensual.
    if (sit.depositosMes > cfg.banca_mensual) {
      aviso('depositos', `Los depósitos del mes (${dinero(sit.depositosMes)}) superan la banca mensual de ${dinero(cfg.banca_mensual)}.`);
    }

    // 6. Pausa sugerida tras pérdidas seguidas.
    if (sit.racha.tipo === 'perdida' && sit.racha.n >= cfg.perdidas_seguidas_pausa) {
      aviso('pausa', `Llevas ${sit.racha.n} pérdidas seguidas. Se sugiere una pausa antes de apostar de nuevo.`);
    }

    if (borrador.recuperando_perdida) {
      aviso('recuperando', 'Marcaste que intentas recuperar una pérdida. Revisa si el pick se sostiene por sí solo.');
    }

    // Registro tardío: el partido ya empezó cuando registras.
    const tarde = selecciones.find((s) => s.fecha_partido && String(s.fecha_partido) < ctx.ahora);
    if (tarde) {
      aviso('registro_tardio', `El partido "${tarde.partido || 'seleccionado'}" ya empezó o terminó. Registrar con el resultado a la vista invalida la auditoría.`);
    }

    return { ok: errores.length === 0, errores, avisos, situacion: sit };
  }

  /** Semáforo y detalle por regla para el panel. */
  function estadoReglas(ctx) {
    const cfg = ctx.config;
    const s = situacion(ctx);
    const items = [];
    const item = (id, titulo, nivel, detalle) => items.push({ id, titulo, nivel, detalle });

    item('perdida_mensual', 'Pérdida mensual',
      s.topePerdida ? (s.perdidaLevantada ? 'ambar' : 'rojo') : s.usoPerdida >= UMBRAL_ALERTA ? 'ambar' : 'verde',
      s.topePerdida
        ? (s.perdidaLevantada ? 'Límite alcanzado, bloqueo levantado manualmente.' : `Límite alcanzado: registro bloqueado hasta ${mesSiguiente(s.mes)}.`)
        : `${s.perdidaMes > 0 ? '−' : ''}${dinero(s.perdidaMes)} de ${dinero(s.limitePerdida)} (${pct(s.usoPerdida)})`);
    item('apuestas_dia', 'Apuestas de hoy',
      s.topeDia ? (s.diaLevantado ? 'ambar' : 'rojo') : 'verde',
      `${s.apuestasHoy} de ${cfg.max_apuestas_dia}`);
    item('stake_max', 'Stake máximo', 'verde', `${dinero(s.stakeMax)} por apuesta (${cfg.stake_max_pct} % de ${dinero(cfg.banca_mensual)})`);
    item('combinada', 'Combinada', 'verde', `Hasta ${cfg.max_selecciones} selecciones, partidos distintos, cuota total ≥ ${num2(cfg.cuota_min)}`);
    const pausa = s.racha.tipo === 'perdida' && s.racha.n >= cfg.perdidas_seguidas_pausa;
    item('pausa', 'Racha', pausa ? 'ambar' : 'verde',
      pausa ? `${s.racha.n} pérdidas seguidas: pausa sugerida` : s.racha.n ? `${s.racha.n} ${s.racha.tipo === 'ganada' ? 'ganadas' : 'perdidas'} seguidas` : 'Sin racha');
    const dep = s.depositosMes > cfg.banca_mensual;
    item('depositos', 'Depósitos del mes', dep ? 'ambar' : 'verde', `${dinero(s.depositosMes)} de ${dinero(cfg.banca_mensual)}`);

    const orden = { verde: 0, ambar: 1, rojo: 2 };
    const nivel = items.reduce((peor, i) => (orden[i.nivel] > orden[peor] ? i.nivel : peor), 'verde');
    return { nivel, items, situacion: s };
  }

  return {
    PARAMETROS_POR_DEFECTO, CUOTA_MINIMA_VALIDA, mesDe, diaDe, mesSiguiente, configVigente,
    validarConfig, overrideActivo, situacion, validarCampos, evaluarApuesta, estadoReglas,
  };
});
