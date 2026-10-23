/* vista_analisis.js — reportes: indicadores, curva de saldo, desgloses y calibración. */
APP.analisis = { mes: 'todo', dimension: 'mercado' };

APP.vistas.analisis = {
  DIMENSIONES: [['mercado', 'Mercado'], ['liga', 'Liga'], ['casa', 'Casa'], ['fuente', 'Fuente'], ['emocion', 'Emoción'], ['tipo', 'Tipo']],

  /** Banca de referencia: la del mes elegido o, en «Todo», la suma de la banca de cada mes con apuestas. */
  bancaBase(lista, mes) {
    const { datos } = APP.estado;
    if (mes !== 'todo') return REGLAS.configVigente(datos.config, mes).banca_mensual;
    const meses = [...new Set(lista.map((a) => a.mes))];
    return meses.reduce((s, m) => s + REGLAS.configVigente(datos.config, m).banca_mensual, 0);
  },

  pintar(el) {
    const { lista, sit } = APP.estado;
    const est = APP.analisis;
    const meses = [...new Set([sit.mes, ...lista.map((a) => a.mes)])].sort().reverse();
    const filtradas = est.mes === 'todo' ? lista : lista.filter((a) => a.mes === est.mes);
    const base = this.bancaBase(filtradas, est.mes);
    const inicioCurva = est.mes === 'todo' ? 0 : base;
    const resueltas = filtradas.filter((a) => a.estado !== 'pendiente' && a.estado !== 'anulada');
    const yld = CALCULOS.yieldTotal(filtradas);
    const roi = base > 0 ? CALCULOS.gananciaNetaTotal(filtradas) / base : null;
    const ac = CALCULOS.tasaAcierto(filtradas);
    const dd = CALCULOS.drawdownMaximo(filtradas, inicioCurva);
    const ev = REPORTES.evPromedio(filtradas);
    const clv = REPORTES.clvPromedio(filtradas);
    const curva = REPORTES.curvaSaldo(filtradas, inicioCurva);
    const filas = REPORTES.desglose(filtradas, est.dimension);
    const maxNeto = Math.max(...filas.map((f) => Math.abs(f.neto)), 1);
    const cal = REPORTES.calibracion(lista);

    const tarjeta = (etq, cifra, sub, cls = '') =>
      `<div class="tarjeta"><div class="tarjeta__etq">${etq}</div><div class="tarjeta__cifra ${cls}">${cifra}</div><div class="tarjeta__sub">${sub}</div></div>`;
    const filaHtml = (f) => {
      const ancho = (Math.abs(f.neto) / maxNeto) * 50;
      const positivo = f.neto >= 0;
      return `<div class="tabla__fila" style="--w:${ancho.toFixed(1)}%;--ini:${positivo ? 50 : 50 - ancho}%;--col:${positivo ? 'var(--verde)' : 'var(--rojo)'}">
        <span class="tabla__nom">${APP.esc(f.nombre)}</span><span class="tabla__num suave">${f.n}</span>
        <span class="tabla__num ${APP.clase(f.neto)}">${APP.dineroSigno(f.neto)}</span>
        <span class="tabla__num ${APP.clase(f.yield)}">${APP.pctSigno(f.yield, 0)}</span>
        <span class="tabla__num">${APP.pct(f.acierto, 0)}</span></div>`;
    };

    let bloqueCalibracion;
    if (!cal.suficiente) {
      bloqueCalibracion = `
        <div class="vacio vacio--lista"><b>muestra insuficiente (&lt;${cal.minimo})</b>Hacen falta ${cal.minimo} selecciones liquidadas con probabilidad propia para calibrar. Llevas ${cal.n}.</div>
        <div class="barra progreso-muestra"><div class="barra__relleno" style="--p:${Math.min(100, (cal.n / cal.minimo) * 100).toFixed(0)}%"></div></div>
        <div class="barra__leyenda"><span>${cal.n} de ${cal.minimo}</span><span>Escribe tu probabilidad al registrar</span></div>`;
    } else {
      const mejor = cal.brierMercado !== null && cal.brier < cal.brierMercado;
      bloqueCalibracion = `
        <div class="brier">
          <div class="tarjeta"><div class="tarjeta__etq">Brier (tú)</div><div class="tarjeta__cifra">${cal.brier.toFixed(3).replace('.', ',')}</div><div class="tarjeta__sub">Menor es mejor · ${cal.n} selecciones</div></div>
          <div class="tarjeta ${mejor ? 'tarjeta--verde' : 'tarjeta--rojo'}"><div class="tarjeta__etq">Brier (mercado)</div><div class="tarjeta__cifra">${cal.brierMercado === null ? '—' : cal.brierMercado.toFixed(3).replace('.', ',')}</div><div class="tarjeta__sub">${mejor ? 'Tu modelo mejora al mercado' : 'El mercado calibra mejor'}</div></div>
        </div>
        <div id="calib-grafica"></div>
        <div class="tabla" style="margin-top:10px">
          <div class="tabla__fila tabla__fila--cab"><span>Tramo</span><span class="tabla__num">n</span><span class="tabla__num">Prob.</span><span class="tabla__num">Real</span><span class="tabla__num">Dif.</span></div>
          ${cal.tramos.filter((t) => t.n).map((t) => `<div class="tabla__fila"><span class="tabla__nom">${t.desde}–${t.hasta} %</span><span class="tabla__num suave">${t.n}</span><span class="tabla__num">${APP.pct(t.probMedia, 0)}</span><span class="tabla__num">${APP.pct(t.frecuencia, 0)}</span><span class="tabla__num ${APP.clase(t.frecuencia - t.probMedia)}">${APP.pctSigno(t.frecuencia - t.probMedia, 0)}</span></div>`).join('')}
        </div>`;
    }

    el.innerHTML = `
      <header class="vista__cab"><div><div class="vista__sup">Reportes</div><h1 class="vista__titulo">Análisis</h1></div></header>
      <div class="pila">
        <div class="fichas">
          <button class="ficha ${est.mes === 'todo' ? 'on' : ''}" data-accion="analisis_mes" data-valor="todo">Todo</button>
          ${meses.map((m) => `<button class="ficha ${est.mes === m ? 'on' : ''}" data-accion="analisis_mes" data-valor="${m}">${APP.nombreMes(m, false)}</button>`).join('')}
        </div>

        ${resueltas.length ? '' : `<div class="mensajes">${APP.mensaje('info', 'Aún no hay apuestas liquidadas en este periodo. Liquida alguna para ver los indicadores.')}</div>`}

        <div class="rejilla">
          ${tarjeta('Yield', APP.pctSigno(yld), `${resueltas.length} apuestas resueltas`, APP.clase(yld))}
          ${tarjeta('ROI s/ banca', APP.pctSigno(roi), `Base ${APP.dinero(base)}`, APP.clase(roi))}
          ${tarjeta('Acierto', APP.pct(ac, 0), 'Ganadas / (ganadas + perdidas)')}
          ${tarjeta('Drawdown máx.', APP.dinero(dd), 'Mayor caída desde un pico')}
          ${tarjeta('EV medio', APP.pctSigno(ev.valor), ev.n ? `Esperado ${APP.dineroSigno(ev.esperada)} · real ${APP.dineroSigno(ev.real)}` : 'Escribe tu probabilidad al apostar', APP.clase(ev.valor))}
          ${tarjeta('CLV medio', APP.pctSigno(clv.valor), clv.n ? `${clv.n} selecciones con cuota de cierre` : 'Anota la cuota de cierre en el detalle', APP.clase(clv.valor))}
        </div>

        <section class="bloque">
          <div class="bloque__cab"><div><div class="bloque__tit">${est.mes === 'todo' ? 'Ganancia acumulada' : 'Curva de saldo'}</div><div class="bloque__sub">${est.mes === 'todo' ? 'Suma de todos los meses, desde 0' : `Desde la banca inicial de ${APP.dinero(base)}`}</div></div></div>
          <div id="curva-saldo"></div>
        </section>

        <section class="bloque">
          <div class="bloque__cab"><div><div class="bloque__tit">Desgloses</div><div class="bloque__sub">Solo apuestas resueltas. Una doble cuenta en cada mercado y liga de sus selecciones.</div></div></div>
          <div class="fichas" style="margin-bottom:6px">
            ${this.DIMENSIONES.map(([k, t]) => `<button class="ficha ${est.dimension === k ? 'on' : ''}" data-accion="analisis_dim" data-valor="${k}">${t}</button>`).join('')}
          </div>
          <div class="tabla">
            <div class="tabla__fila tabla__fila--cab"><span>${this.DIMENSIONES.find(([k]) => k === est.dimension)[1]}</span><span class="tabla__num">n</span><span class="tabla__num">Neto</span><span class="tabla__num">Yield</span><span class="tabla__num">Acierto</span></div>
            ${filas.length ? filas.map(filaHtml).join('') : '<div class="vacio vacio--lista">Sin datos en este periodo.</div>'}
          </div>
        </section>

        <section class="bloque">
          <div class="bloque__cab"><div><div class="bloque__tit">Calibración</div><div class="bloque__sub">Con todo el historial: ¿tus probabilidades se cumplen?</div></div></div>
          ${bloqueCalibracion}
        </section>
      </div>`;

    GRAFICAS.linea(el.querySelector('#curva-saldo'), curva, { referencia: inicioCurva, formato: (n) => APP.dinero(n) });
    if (cal.suficiente) GRAFICAS.calibracion(el.querySelector('#calib-grafica'), cal.tramos);
  },
};

APP.acciones.analisis_mes = (el) => { APP.analisis.mes = el.dataset.valor; APP.pintar(); };
APP.acciones.analisis_dim = (el) => { APP.analisis.dimension = el.dataset.valor; APP.pintar(); };
