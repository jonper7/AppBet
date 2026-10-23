/* vista_inicio.js — Panel: banca, pérdida del mes, límites de hoy, yield/acierto, semáforo y pendientes. */
APP.vistas.inicio = {
  pintar(el) {
    const { ctx, sit, lista, datos } = APP.estado;
    const cfg = ctx.config;
    const reglas = REGLAS.estadoReglas(ctx);
    const delMes = lista.filter((a) => a.mes === sit.mes);
    const pendientes = lista.filter((a) => a.estado === 'pendiente').reverse();
    const yMes = CALCULOS.yieldTotal(delMes);
    const yTodo = CALCULOS.yieldTotal(lista);
    const acMes = CALCULOS.tasaAcierto(delMes);
    const ganadas = delMes.filter((a) => a.estado === 'ganada').length;
    const decididas = ganadas + delMes.filter((a) => a.estado === 'perdida').length;
    const dd = CALCULOS.drawdownMaximo(delMes, cfg.banca_mensual);
    const racha = sit.racha;

    const textoNivel = { verde: 'Todo en orden', ambar: 'Atención', rojo: 'Registro bloqueado' }[reglas.nivel];
    const nivelBarra = sit.topePerdida ? 'rojo' : sit.usoPerdida >= 0.75 ? 'ambar' : 'verde';
    const restante = Math.max(0, CALCULOS.redondear2(sit.limitePerdida - sit.perdidaMes));

    const avisos = [];
    if (sit.topePerdida && !sit.perdidaLevantada) avisos.push(APP.mensaje('error', `<b>Registro bloqueado.</b> La pérdida del mes llegó al límite. Podrás volver a registrar en ${APP.nombreMes(REGLAS.mesSiguiente(sit.mes))}.`));
    if (sit.topeDia && !sit.diaLevantado) avisos.push(APP.mensaje('error', `Alcanzaste el máximo de ${cfg.max_apuestas_dia} apuestas de hoy.`));
    if (racha.tipo === 'perdida' && racha.n >= cfg.perdidas_seguidas_pausa) avisos.push(APP.mensaje('aviso', `${racha.n} pérdidas seguidas. Se sugiere una pausa.`));
    if (sit.depositosMes > cfg.banca_mensual) avisos.push(APP.mensaje('aviso', `Los depósitos del mes (${APP.dinero(sit.depositosMes)}) superan la banca mensual.`));
    const exportada = datos.ajustes.ultima_exportacion;
    const dias = exportada ? Math.floor((Date.parse(`${sit.dia}T00:00:00Z`) - Date.parse(`${exportada.slice(0, 10)}T00:00:00Z`)) / 864e5) : null;
    if (!APP.demo && lista.length >= 5 && (dias === null || dias >= 7)) {
      avisos.push(APP.mensaje('aviso', dias === null ? 'Aún no has exportado una copia de tus datos.' : `Hace ${dias} días que no exportas una copia de tus datos.`,
        '<div class="mensaje__acc"><button class="mini mini--principal" type="button" data-accion="exportar_json">Exportar copia</button></div>'));
    }
    if (!lista.length) avisos.push(APP.mensaje('info', 'Aún no hay apuestas. Toca <b>+</b> para registrar la primera.'));

    const tarjeta = (etq, cifra, sub, cls = '', cifraCls = '') =>
      `<div class="tarjeta ${cls}"><div class="tarjeta__etq">${etq}</div><div class="tarjeta__cifra ${cifraCls}">${cifra}</div><div class="tarjeta__sub">${sub}</div></div>`;
    const rachaTxt = racha.n ? `${racha.n} ${racha.tipo === 'ganada' ? (racha.n === 1 ? 'ganada' : 'ganadas') : (racha.n === 1 ? 'perdida' : 'perdidas')}` : '—';

    el.innerHTML = `
      <header class="vista__cab">
        <div><div class="vista__sup">Registro de picks</div><h1 class="vista__titulo">Inicio</h1></div>
        <span class="pastilla">${APP.nombreMes(sit.mes, false)}</span>
      </header>
      <div class="pila">
        <section class="hero ${reglas.nivel === 'rojo' ? 'hero--rojo' : ''}">
          <div class="hero__fila">
            <div class="hero__etq">Banca actual</div>
            <span class="semaforo"><span class="punto punto--${reglas.nivel}"></span>${textoNivel}</span>
          </div>
          <div class="hero__cifra ${sit.bancaActual < cfg.banca_mensual ? '' : ''}" id="hero-cifra">${APP.dinero(sit.bancaActual)}</div>
          <div class="hero__pie">
            <div class="dato"><div class="dato__etq">Inicio de mes</div><div class="dato__val">${APP.dinero(cfg.banca_mensual)}</div></div>
            <div class="dato"><div class="dato__etq">Neto del mes</div><div class="dato__val ${APP.clase(sit.gananciaMes)}">${APP.dineroSigno(sit.gananciaMes)}</div></div>
            <div class="dato"><div class="dato__etq">En juego</div><div class="dato__val">${APP.dinero(sit.enJuego)}</div></div>
          </div>
        </section>

        ${avisos.length ? `<div class="mensajes">${avisos.join('')}</div>` : ''}

        <section class="bloque">
          <div class="bloque__cab">
            <div><div class="bloque__tit">Pérdida del mes</div><div class="bloque__sub">Límite ${cfg.perdida_max_pct} % de la banca inicial</div></div>
            <div class="num" style="font-weight:700"><span class="${sit.perdidaMes > 0 ? 'neg' : ''}">${sit.perdidaMes > 0 ? '−' : ''}${APP.dinero(sit.perdidaMes)}</span> <span class="suave">/ ${APP.dinero(sit.limitePerdida)}</span></div>
          </div>
          <div class="barra barra--${nivelBarra}" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(Math.min(1, sit.usoPerdida) * 100)}"><div class="barra__relleno" style="--p:${Math.min(100, sit.usoPerdida * 100).toFixed(1)}%"></div></div>
          <div class="barra__leyenda"><span>${APP.pct(Math.min(1, sit.usoPerdida), 0)} del límite</span><span>${sit.topePerdida ? 'Límite alcanzado' : `Quedan ${APP.dinero(restante)}`}</span></div>
        </section>

        <div class="rejilla">
          ${tarjeta('Apuestas hoy', `${sit.apuestasHoy} / ${cfg.max_apuestas_dia}`, sit.topeDia ? 'Máximo alcanzado' : `Quedan ${Math.max(0, cfg.max_apuestas_dia - sit.apuestasHoy)}`, sit.topeDia ? 'tarjeta--rojo' : '')}
          ${tarjeta('Stake máx. hoy', APP.dinero(sit.stakeMaximoHoy), sit.bloqueado ? 'Registro bloqueado' : `${cfg.stake_max_pct} % de ${APP.dinero(cfg.banca_mensual)}`, sit.bloqueado ? 'tarjeta--rojo' : '')}
          ${tarjeta('Yield del mes', APP.pctSigno(yMes), `Histórico ${APP.pctSigno(yTodo)}`, '', APP.clase(yMes))}
          ${tarjeta('Acierto del mes', APP.pct(acMes, 0), decididas ? `${ganadas} de ${decididas} resueltas` : 'Sin resueltas')}
          ${tarjeta('Racha actual', rachaTxt, racha.tipo === 'perdida' && racha.n >= cfg.perdidas_seguidas_pausa ? 'Pausa sugerida' : 'Ganadas o perdidas seguidas', racha.tipo === 'perdida' && racha.n >= cfg.perdidas_seguidas_pausa ? 'tarjeta--ambar' : '', racha.tipo === 'ganada' ? 'pos' : racha.tipo === 'perdida' ? 'neg' : '')}
          ${tarjeta('Drawdown máx.', APP.dinero(dd), 'Mayor caída del mes')}
        </div>

        <section class="bloque">
          <div class="bloque__cab"><div class="bloque__tit">Semáforo de reglas</div></div>
          <div class="reglas">
            ${reglas.items.map((r) => `<div class="regla"><span class="punto punto--${r.nivel}"></span><div><div class="regla__tit">${APP.esc(r.titulo)}</div><div class="regla__det">${APP.esc(r.detalle)}</div></div></div>`).join('')}
          </div>
        </section>

        <section>
          <div class="bloque__cab" style="padding:0 4px"><div class="bloque__tit">Pendientes por liquidar</div><span class="suave" style="font-size:.8rem">${pendientes.length}</span></div>
          <div class="lista">
            ${pendientes.length ? pendientes.map((a) => APP.filaApuesta(a, { botones: true })).join('') : '<div class="vacio"><b>Nada pendiente</b>Las apuestas registradas aparecen aquí hasta liquidarlas.</div>'}
          </div>
        </section>
      </div>`;

    if (APP.animarCifras) {
      APP.animarCifras = false;
      APP.contar(el.querySelector('#hero-cifra'), sit.bancaActual);
    }
  },
};
