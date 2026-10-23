/* vista_banca.js — depósitos y retiros, y cierre mensual (resumen, reinicio de banca y exportación). */
APP.banca = { mes: null };

APP.vistas.banca = {
  pintar(el) {
    const { datos, lista, sit } = APP.estado;
    if (!APP.banca.mes) APP.banca.mes = sit.mes;
    const mes = APP.banca.mes;
    const meses = [...new Set([sit.mes, ...lista.map((a) => a.mes), ...datos.depositos.map((d) => d.fecha.slice(0, 7)), ...(datos.ajustes.cierres || []).map((c) => c.mes)])].sort().reverse();
    const cfg = REGLAS.configVigente(datos.config, mes);
    const movs = datos.depositos.filter((d) => d.fecha.slice(0, 7) === mes).sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0));
    const cierre = (datos.ajustes.cierres || []).find((c) => c.mes === mes);
    const resumen = cierre ? cierre.resumen : REPORTES.resumenMes(lista, datos.depositos, cfg.banca_mensual, mes);
    const futuro = mes > sit.mes;
    const siguiente = REGLAS.mesSiguiente(mes);
    const cfgSiguiente = REGLAS.configVigente(datos.config, siguiente);
    const cajaNeta = CALCULOS.redondear2(resumen.depositos - resumen.retiros);
    const dif = CALCULOS.redondear2(resumen.bancaFinal - resumen.bancaInicial);

    const tarjeta = (etq, cifra, sub, cls = '') =>
      `<div class="tarjeta"><div class="tarjeta__etq">${etq}</div><div class="tarjeta__cifra ${cls}">${cifra}</div><div class="tarjeta__sub">${sub}</div></div>`;
    const dato = (etq, val, cls = '') => `<div class="dato"><div class="dato__etq" style="color:var(--texto-suave)">${etq}</div><div class="dato__val ${cls}">${val}</div></div>`;
    const fila = (d) => `<article class="mov ${d.tipo === 'deposito' ? 'mov--caja' : 'mov--caja-retiro'}">
      <div class="mov__fila"><div><div class="mov__tit">${d.tipo === 'deposito' ? 'Depósito' : 'Retiro'}${d.metodo ? ` · ${APP.esc(d.metodo)}` : ''}</div>
      <div class="mov__meta">${APP.fechaHora(d.fecha)}${d.motivo ? ` · ${APP.esc(d.motivo)}` : ''}</div></div>
      <div class="mov__monto ${d.tipo === 'deposito' ? 'pos' : 'neg'}">${d.tipo === 'deposito' ? '+' : '−'}${APP.dinero(d.monto)}</div></div></article>`;

    const estadoCierre = cierre
      ? `<span class="insignia">Cerrado el ${APP.fechaHora(cierre.cerrado_en)}</span>`
      : (futuro ? '<span class="insignia insignia--ambar">Aún no empieza</span>' : '<span class="insignia insignia--ambar">Abierto</span>');
    const avisoPend = !cierre && resumen.pendientes ? APP.mensaje('aviso', `Tienes ${resumen.pendientes} ${resumen.pendientes === 1 ? 'apuesta pendiente' : 'apuestas pendientes'}. Si cierras ahora, el resumen solo cuenta lo liquidado.`) : '';

    el.innerHTML = `
      <header class="vista__cab"><div><div class="vista__sup">Dinero</div><h1 class="vista__titulo">Banca</h1></div></header>
      <div class="pila">
        <div class="fichas">
          ${meses.map((m) => `<button class="ficha ${mes === m ? 'on' : ''}" data-accion="banca_mes" data-valor="${m}">${APP.nombreMes(m, false)}</button>`).join('')}
        </div>

        <div class="rejilla">
          ${tarjeta('Banca inicial', APP.dinero(resumen.bancaInicial), `Parámetro de ${APP.nombreMes(mes, false)}`)}
          ${tarjeta('Saldo frente a banca', APP.dineroSigno(dif), `Saldo ${APP.dinero(resumen.bancaFinal)}`, APP.clase(dif))}
          ${tarjeta('Depósitos', APP.dinero(resumen.depositos), resumen.depositos > cfg.banca_mensual ? 'Superan la banca mensual' : `Retiros ${APP.dinero(resumen.retiros)}`, resumen.depositos > cfg.banca_mensual ? 'neg' : '')}
          ${tarjeta('Neto de caja', APP.dineroSigno(cajaNeta), 'Depósitos − retiros', APP.clase(cajaNeta))}
        </div>

        <section class="bloque">
          <div class="bloque__cab"><div><div class="bloque__tit">Depósitos y retiros</div><div class="bloque__sub">${movs.length ? `${movs.length} en ${APP.nombreMes(mes, false)}` : 'Sin movimientos este mes'}</div></div>
            <button class="mini mini--principal" type="button" data-accion="nuevo_movimiento">+ Movimiento</button></div>
          <div class="lista">${movs.length ? movs.map(fila).join('') : '<div class="vacio vacio--lista">Registra aquí el dinero que pones o sacas de la casa de apuestas. No se editan: si te equivocas, anota un movimiento que lo compense.</div>'}</div>
        </section>

        <section class="bloque">
          <div class="bloque__cab"><div><div class="bloque__tit">Cierre de ${APP.nombreMes(mes)}</div><div class="bloque__sub">Resumen del mes</div></div>${estadoCierre}</div>
          <div class="cierre">
            ${dato('Apuestas', `${resumen.apuestas} <span class="suave" style="font-size:.74rem">(${resumen.ganadas}G · ${resumen.perdidas}P${resumen.anuladas ? ` · ${resumen.anuladas}A` : ''}${resumen.cashouts ? ` · ${resumen.cashouts}C` : ''})</span>`)}
            ${dato('Apostado', APP.dinero(resumen.apostado))}
            ${dato('Ganancia neta', APP.dineroSigno(resumen.neto), APP.clase(resumen.neto))}
            ${dato('Yield', APP.pctSigno(resumen.yield), APP.clase(resumen.yield))}
            ${dato('ROI s/ banca', APP.pctSigno(resumen.roi), APP.clase(resumen.roi))}
            ${dato('Acierto', APP.pct(resumen.acierto, 0))}
            ${dato('Drawdown máx.', APP.dinero(resumen.drawdown))}
            ${dato('Banca final', APP.dinero(resumen.bancaFinal))}
          </div>
          <div class="mensajes">${avisoPend}${APP.mensaje('info', `<b>Reinicio de banca:</b> ${APP.nombreMes(siguiente)} arranca con una banca de <b>${APP.dinero(cfgSiguiente.banca_mensual)}</b> (stake máximo ${APP.dinero((cfgSiguiente.banca_mensual * cfgSiguiente.stake_max_pct) / 100)}, pérdida máxima ${APP.dinero((cfgSiguiente.banca_mensual * cfgSiguiente.perdida_max_pct) / 100)}). Si quieres otros parámetros, cámbialos en Ajustes antes de que empiece.`)}</div>
          <div class="hoja__pie" style="flex-wrap:wrap">
            ${cierre || futuro ? '' : `<button class="boton boton--principal" type="button" data-accion="cerrar_mes">Cerrar ${APP.nombreMes(mes, false)}</button>`}
            <button class="boton" type="button" data-accion="exportar_resumen">Resumen CSV</button>
            <button class="boton" type="button" data-accion="exportar_mes">Apuestas CSV</button>
          </div>
        </section>
      </div>`;
  },

  resumenActual() {
    const { datos, lista } = APP.estado;
    const mes = APP.banca.mes;
    const cierre = (datos.ajustes.cierres || []).find((c) => c.mes === mes);
    if (cierre) return cierre.resumen;
    return REPORTES.resumenMes(lista, datos.depositos, REGLAS.configVigente(datos.config, mes).banca_mensual, mes);
  },
};

APP.acciones.banca_mes = (el) => { APP.banca.mes = el.dataset.valor; APP.pintar(); };

APP.acciones.nuevo_movimiento = async () => {
  const hoy = DATOS.ahoraLocal().slice(0, 10);
  const v = await DIALOGO.formulario({
    titulo: 'Depósito o retiro',
    mensaje: 'Dinero que pones o sacas de la casa de apuestas. Una vez guardado no se edita.',
    campos: [
      { id: 'tipo', etiqueta: 'Tipo', tipo: 'select', opciones: [{ valor: 'deposito', texto: 'Depósito' }, { valor: 'retiro', texto: 'Retiro' }] },
      { id: 'monto', etiqueta: 'Monto', tipo: 'monto', requerido: true },
      { id: 'metodo', etiqueta: 'Método', tipo: 'texto', valor: 'tarjeta', requerido: true },
      { id: 'fecha', etiqueta: 'Fecha (AAAA-MM-DD)', tipo: 'texto', valor: hoy, requerido: true },
      { id: 'motivo', etiqueta: 'Motivo (opcional)', tipo: 'texto' },
    ],
    aceptar: 'Guardar',
    validar: (x) => {
      const e = {};
      const m = CALCULOS.leerNumero(x.monto);
      if (!(m > 0)) e.monto = 'El monto debe ser mayor que 0.';
      if (!/^\d{4}-\d{2}-\d{2}$/.test(x.fecha) || Number.isNaN(Date.parse(`${x.fecha}T00:00:00Z`))) e.fecha = 'Usa el formato AAAA-MM-DD.';
      else if (x.fecha > hoy) e.fecha = 'La fecha no puede ser futura.';
      return Object.keys(e).length ? e : null;
    },
  });
  if (!v) return;
  try {
    await APP.db.registrarDeposito(v);
    APP.banca.mes = v.fecha.slice(0, 7);
    await APP.refrescar();
    APP.aviso(v.tipo === 'deposito' ? 'Depósito registrado' : 'Retiro registrado');
  } catch (e) { APP.aviso(e.message); }
};

APP.acciones.cerrar_mes = async () => {
  const mes = APP.banca.mes;
  const r = APP.vistas.banca.resumenActual();
  const ok = await DIALOGO.confirmar({
    titulo: `¿Cerrar ${APP.nombreMes(mes)}?`,
    mensaje: `Se guarda el resumen del mes: ${r.apuestas} apuestas, ganancia neta <b>${APP.dineroSigno(r.neto)}</b>, banca final <b>${APP.dinero(r.bancaFinal)}</b>.${r.pendientes ? `<br><br>Hay ${r.pendientes} pendientes que no cuentan todavía.` : ''}<br><br>El resumen no se podrá modificar.`,
    aceptar: 'Cerrar mes',
  });
  if (!ok) return;
  try {
    await APP.db.cerrarMes(mes, r);
    await APP.refrescar();
    APP.aviso(`${APP.nombreMes(mes, false)} cerrado`);
  } catch (e) { APP.aviso(e.message); }
};

APP.acciones.exportar_resumen = async () => {
  const mes = APP.banca.mes;
  const r = await EXPORTAR.entregar(`picks-resumen-${mes}.csv`, EXPORTAR.csvResumen(APP.vistas.banca.resumenActual()));
  if (r !== 'cancelado') APP.aviso(r === 'compartido' ? 'Resumen compartido' : 'Resumen descargado');
};

APP.acciones.exportar_mes = async () => {
  const mes = APP.banca.mes;
  const lista = APP.estado.lista.filter((a) => a.mes === mes).reverse();
  if (!lista.length) { APP.aviso('No hay apuestas en ese mes'); return; }
  const r = await EXPORTAR.entregar(`picks-${mes}.csv`, EXPORTAR.csvApuestas(lista));
  if (r !== 'cancelado') APP.aviso(r === 'compartido' ? 'CSV compartido' : 'CSV descargado');
};
