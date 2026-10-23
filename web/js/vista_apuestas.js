/* vista_apuestas.js — Historial: filtros por mes, estado, mercado, liga y casa; exportación a CSV. */
APP.vistas.apuestas = {
  filtrar(lista) {
    const f = APP.filtros;
    return lista.filter((a) =>
      (f.mes === 'todo' || a.mes === f.mes) &&
      (f.estado === 'todas' || a.estado === f.estado) &&
      (!f.mercado || a.selecciones.some((s) => s.mercado === f.mercado)) &&
      (!f.liga || a.selecciones.some((s) => s.liga === f.liga)) &&
      (!f.casa || a.casa === f.casa));
  },

  pintar(el) {
    const { lista, datos, sit } = APP.estado;
    const f = APP.filtros;
    const meses = [...new Set([sit.mes, ...lista.map((a) => a.mes)])].sort().reverse();
    const filtradas = this.filtrar(lista);
    const resueltas = filtradas.filter((a) => a.estado !== 'pendiente');
    const neto = CALCULOS.gananciaNetaTotal(filtradas);
    const yld = CALCULOS.yieldTotal(filtradas);

    const opciones = (lista2, actual, todos) =>
      `<option value="">${todos}</option>${lista2.map((x) => `<option value="${APP.esc(x)}"${x === actual ? ' selected' : ''}>${APP.esc(x)}</option>`).join('')}`;
    const mercados = APP.unicos(datos.selecciones.map((s) => s.mercado));
    const ligas = APP.unicos(datos.selecciones.map((s) => s.liga));
    const casas = APP.unicos(datos.apuestas.map((a) => a.casa));
    const segmento = (valor, texto) => `<button type="button" class="${f.estado === valor ? 'on' : ''}" data-accion="filtro" data-clave="estado" data-valor="${valor}">${texto}</button>`;

    // agrupar por día
    const grupos = [];
    filtradas.forEach((a) => {
      const dia = a.fecha_hora.slice(0, 10);
      const g = grupos[grupos.length - 1];
      if (g && g.dia === dia) g.items.push(a); else grupos.push({ dia, items: [a] });
    });

    el.innerHTML = `
      <header class="vista__cab">
        <div><div class="vista__sup">Historial</div><h1 class="vista__titulo">Apuestas</h1></div>
        <button class="mini" type="button" data-accion="exportar_csv">Exportar CSV</button>
      </header>
      <div class="pila" style="--hueco:14px">
        <div class="fichas" role="tablist">
          <button class="ficha ${f.mes === 'todo' ? 'on' : ''}" data-accion="filtro" data-clave="mes" data-valor="todo">Todo</button>
          ${meses.map((m) => `<button class="ficha ${f.mes === m ? 'on' : ''}" data-accion="filtro" data-clave="mes" data-valor="${m}">${APP.nombreMes(m, false)}</button>`).join('')}
        </div>
        <div class="segmentos">${segmento('todas', 'Todas')}${segmento('pendiente', 'Pendientes')}${segmento('ganada', 'Ganadas')}${segmento('perdida', 'Perdidas')}</div>
        <div class="filtros">
          <label class="campo"><select data-filtro="mercado" aria-label="Mercado">${opciones(mercados, f.mercado, 'Mercado')}</select></label>
          <label class="campo"><select data-filtro="liga" aria-label="Liga">${opciones(ligas, f.liga, 'Liga')}</select></label>
          <label class="campo"><select data-filtro="casa" aria-label="Casa">${opciones(casas, f.casa, 'Casa')}</select></label>
        </div>
        <p class="resumen-linea">${filtradas.length} ${filtradas.length === 1 ? 'apuesta' : 'apuestas'} ·
          neto <b class="${APP.clase(neto)}">${APP.dineroSigno(neto)}</b> · yield <b class="${APP.clase(yld)}">${APP.pctSigno(yld)}</b>
          ${resueltas.length !== filtradas.length ? `· ${filtradas.length - resueltas.length} pendientes` : ''}</p>
        <div class="lista" style="margin-top:-6px">
          ${grupos.length ? grupos.map((g) => `<div class="dia">${APP.etiquetaDia(g.dia)}</div>${g.items.map((a) => APP.filaApuesta(a)).join('')}`).join('')
            : `<div class="vacio"><b>${lista.length ? 'Sin resultados' : 'Aún no hay apuestas'}</b>${lista.length ? 'Prueba con otros filtros.' : 'Toca + para registrar la primera.'}</div>`}
        </div>
      </div>`;

    el.querySelectorAll('[data-filtro]').forEach((s) => s.addEventListener('change', () => {
      APP.filtros[s.dataset.filtro] = s.value;
      this.pintar(el);
    }));
  },
};

APP.acciones.filtro = (el) => {
  APP.filtros[el.dataset.clave] = el.dataset.valor;
  APP.pintar();
};

APP.acciones.exportar_csv = async () => {
  const lista = APP.vistas.apuestas.filtrar(APP.estado.lista);
  if (!lista.length) { APP.aviso('No hay apuestas para exportar con estos filtros'); return; }
  const nombre = `picks-${DATOS.ahoraLocal().slice(0, 10)}.csv`;
  const r = await EXPORTAR.entregar(nombre, EXPORTAR.csvApuestas(lista.slice().reverse()));
  if (r !== 'cancelado') APP.aviso(r === 'compartido' ? 'CSV compartido' : `Descargado ${nombre}`);
};
