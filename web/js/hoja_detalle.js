/* hoja_detalle.js — detalle de una apuesta: datos, selecciones, historial de cambios y correcciones. */
const HOJA_DETALLE = {
  abrir(id) {
    const a = APP.estado.lista.find((x) => x.id === id);
    if (!a) return;
    const dato = (etq, val, cls = '') => `<div class="dato"><div class="dato__etq">${etq}</div><div class="dato__val ${cls}">${val}</div></div>`;
    const valor = a.selecciones.length === 1
      ? CALCULOS.ev(a.selecciones[0].prob_propia, a.selecciones[0].cuota)
      : CALCULOS.evCombinada(a.selecciones);
    const log = APP.estado.datos.log.filter((l) => l.apuesta_id === a.id);
    const sels = a.selecciones.map((s) => {
      const clv = CALCULOS.clv(s.cuota, s.cuota_cierre);
      return `
      <div class="sel-detalle">
        <div class="mov__tit">${APP.esc(s.partido)}</div>
        <div class="mov__meta">${APP.esc(s.liga)} · ${APP.esc(s.mercado)} · ${APP.fechaHora(s.fecha_partido)}</div>
        <div class="mov__meta">${APP.esc(s.seleccion)}${s.linea ? ` ${APP.esc(s.linea)}` : ''} @${APP.cuota(s.cuota)}
          ${s.prob_propia != null ? ` · prob. propia ${APP.esc(s.prob_propia)} %` : ''}
          ${s.cuota_cierre ? ` · cierre @${APP.cuota(s.cuota_cierre)} · CLV <b class="${APP.clase(clv)}">${APP.pctSigno(clv)}</b>` : ''}
          ${s.resultado ? ` · <span class="estado--${s.resultado}">${s.resultado}</span>` : ''}</div>
        ${s.nota ? `<div class="mov__meta">“${APP.esc(s.nota)}”</div>` : ''}
        <button class="mini mini--suave" type="button" data-cierre="${s.id}" style="padding-left:0">${s.cuota_cierre ? 'Cambiar' : 'Anotar'} cuota de cierre</button>
      </div>`;
    }).join('');
    const liquidacion = a.estado === 'pendiente'
      ? `<div class="bloque__cab" style="margin:6px 0 0"><div class="bloque__tit" style="font-size:1rem">Liquidar</div></div><div class="mov__acciones" style="margin-top:0">${LIQUIDAR.botones(a)}</div>` : '';
    const registros = log.length
      ? log.map((l) => `<div class="registro"><time>${APP.fechaHora(l.fecha_hora)}</time>${APP.esc(APP.textoLog(l))}</div>`).join('')
      : '<div class="registro suave">Sin cambios ni correcciones.</div>';

    const el = HOJA.abrir(`
      <h2 class="hoja__tit">${a.tipo === 'simple' ? 'Apuesta simple' : 'Apuesta doble'}</h2>
      <p class="hoja__sub">${APP.fechaHora(a.fecha_hora)} · ${APP.esc(a.casa)} · <span class="estado--${a.estado}"><b>${a.estado}</b></span></p>
      <div class="hoja__cuerpo">
        <div class="ficha-datos">
          ${dato('Stake', APP.dinero(a.stake))}
          ${dato('Cuota total', APP.cuota(a.cuota_total))}
          ${dato('Retorno', a.retorno == null ? '—' : APP.dinero(a.retorno))}
          ${dato('Ganancia neta', a.ganancia_neta == null ? '—' : APP.dineroSigno(a.ganancia_neta), APP.clase(a.ganancia_neta))}
          ${dato('Fuente', APP.esc(a.fuente))}
          ${dato('Confianza', `${a.confianza} / 5`)}
          ${dato('Estado emocional', APP.esc(a.estado_emocional))}
          ${dato('Recuperando pérdida', a.recuperando_perdida ? 'Sí' : 'No')}
          ${dato('EV al apostar', valor == null ? '—' : APP.pctSigno(valor), valor == null ? 'suave' : APP.clase(valor))}
          ${dato('Mes', APP.nombreMes(a.mes, false))}
        </div>
        <div>${sels}</div>
        ${a.captura ? '<div id="detalle-captura"></div>' : ''}
        ${liquidacion}
        <div>
          <div class="bloque__tit" style="font-size:1rem;margin-bottom:6px">Historial de cambios</div>
          ${registros}
        </div>
        <div class="hoja__pie" style="margin-top:4px">
          <button class="boton" type="button" data-corregir>Anotar corrección</button>
          <button class="boton boton--principal" type="button" data-cerrar>Cerrar</button>
        </div>
      </div>`);
    el.querySelector('[data-cerrar]').onclick = () => HOJA.cerrar();
    el.querySelector('[data-corregir]').onclick = () => this.corregir(a);
    el.querySelectorAll('[data-cierre]').forEach((b) => { b.onclick = () => this.cuotaCierre(a, b.dataset.cierre); });
    if (a.captura) {
      APP.db.obtenerCaptura(a.id).then((data) => {
        const hueco = HOJA.abierta && el.querySelector('#detalle-captura');
        if (data && hueco) hueco.innerHTML = `<img class="miniatura" src="${data}" alt="Captura del boleto">`;
      });
    }
    // si se liquida desde aquí, se cierra el detalle para ver el aviso con «Deshacer»
    el.querySelectorAll('[data-accion="liquidar"], [data-accion="por_seleccion"]').forEach((b) => b.addEventListener('click', () => setTimeout(() => HOJA.cerrar(), 0)));
  },

  /** Cuota de cierre de una selección (para el CLV): es lo único, junto al resultado, que puede anotarse después. */
  async cuotaCierre(a, seleccionId) {
    const s = a.selecciones.find((x) => x.id === seleccionId);
    const v = await DIALOGO.formulario({
      titulo: 'Cuota de cierre',
      mensaje: `La cuota que tenía <b>${APP.esc(s.seleccion)}</b> justo antes de empezar el partido (apostaste a @${APP.cuota(s.cuota)}). Sirve para medir el CLV.`,
      campos: [{ id: 'cuota_cierre', etiqueta: 'Cuota de cierre', tipo: 'monto', valor: s.cuota_cierre ? String(s.cuota_cierre).replace('.', ',') : '', requerido: true }],
      aceptar: 'Guardar',
      validar: (x) => (CALCULOS.leerNumero(x.cuota_cierre) > REGLAS.CUOTA_MINIMA_VALIDA ? null : { cuota_cierre: 'Debe ser mayor que 1,01.' }),
    });
    if (!v) return;
    try {
      await APP.db.actualizarSeleccion(seleccionId, { cuota_cierre: v.cuota_cierre });
      await APP.refrescar();
      this.abrir(a.id);
      APP.aviso('Cuota de cierre guardada');
    } catch (e) { APP.aviso(e.message); }
  },

  async corregir(a) {
    const v = await DIALOGO.formulario({
      titulo: 'Anotar corrección',
      mensaje: 'La apuesta original <b>no se modifica</b>: la corrección queda en el registro de cambios, con su motivo.',
      campos: [
        { id: 'campo', etiqueta: 'Dato a corregir', tipo: 'select', opciones: ['cuota', 'stake', 'hora', 'selección', 'partido', 'otro'] },
        { id: 'valor_registrado', etiqueta: 'Valor registrado', tipo: 'texto' },
        { id: 'valor_correcto', etiqueta: 'Valor correcto', tipo: 'texto', requerido: true },
        { id: 'motivo', etiqueta: 'Motivo', tipo: 'area', requerido: true },
      ],
      aceptar: 'Anotar',
    });
    if (!v) return;
    try {
      await APP.db.registrarCorreccion(a.id, v);
      await APP.refrescar();
      this.abrir(a.id);
      APP.aviso('Corrección anotada');
    } catch (e) { APP.aviso(e.message); }
  },
};

APP.acciones.detalle = (el) => HOJA_DETALLE.abrir(el.dataset.id);
