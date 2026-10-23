/* liquidar.js — liquidar a un toque (ganada / perdida / anulada) o con datos (cashout, por selección). */
const LIQUIDAR = {
  ROTULOS: { ganada: 'Ganada', perdida: 'Perdida', anulada: 'Anulada', cashout: 'Cashout' },

  botones(a) {
    const b = (estado, clase) => `<button class="mini ${clase}" type="button" data-accion="liquidar" data-id="${a.id}" data-estado="${estado}">${this.ROTULOS[estado]}</button>`;
    const sel = a.selecciones.length > 1
      ? `<button class="mini mini--suave" type="button" data-accion="por_seleccion" data-id="${a.id}">Por selección</button>` : '';
    return b('ganada', 'mini--verde') + b('perdida', 'mini--rojo') + b('anulada', 'mini--gris') + b('cashout', 'mini--ambar') + sel;
  },

  async ejecutar(id, params) {
    try {
      const r = await APP.db.liquidar(id, params);
      await APP.refrescar();
      APP.aviso(`${this.ROTULOS[r.estado]} · ${APP.dineroSigno(r.ganancia_neta)}`, {
        accion: 'Deshacer', duracion: CONFIG.TIEMPO_DESHACER_MS,
        alAccion: async () => {
          try { await APP.db.revertirLiquidacion(id); await APP.refrescar(); APP.aviso('Liquidación deshecha'); }
          catch (e) { APP.aviso(e.message); }
        },
      });
      return r;
    } catch (e) {
      APP.aviso(e.message);
      return null;
    }
  },

  async rapido(id, estado) {
    const a = APP.estado.lista.find((x) => x.id === id);
    if (!a) return null;
    if (estado === 'cashout') {
      const v = await DIALOGO.formulario({
        titulo: 'Cashout',
        mensaje: `Stake ${APP.dinero(a.stake)}. Indica el total que cobraste al cerrar la apuesta.`,
        campos: [{ id: 'retorno', etiqueta: 'Retorno cobrado', tipo: 'monto', requerido: true }],
        aceptar: 'Liquidar',
        validar: (x) => { const n = CALCULOS.leerNumero(x.retorno); return Number.isFinite(n) && n >= 0 ? null : { retorno: 'Escribe un número igual o mayor que 0.' }; },
      });
      return v ? this.ejecutar(id, { estado: 'cashout', retorno: v.retorno }) : null;
    }
    if (estado === 'perdida' && a.selecciones.length > 1) return this.porSeleccion(id, 'perdida');
    return this.ejecutar(id, { estado });
  },

  /** Doble: el resultado de cada selección determina estado y retorno (pata anulada = cuota 1.00). */
  async porSeleccion(id, sugerido) {
    const a = APP.estado.lista.find((x) => x.id === id);
    if (!a) return null;
    const opciones = [{ valor: 'ganada', texto: 'Ganada' }, { valor: 'perdida', texto: 'Perdida' }, { valor: 'anulada', texto: 'Anulada' }];
    const v = await DIALOGO.formulario({
      titulo: 'Resultado por selección',
      mensaje: `Stake ${APP.dinero(a.stake)} · una selección perdida pierde la apuesta; una anulada cuenta como cuota 1,00.`,
      campos: a.selecciones.map((s, i) => ({
        id: `r${i}`, tipo: 'select', opciones,
        etiqueta: `${s.partido} — ${s.seleccion}${s.linea ? ` ${s.linea}` : ''} @${APP.cuota(s.cuota)}`,
        valor: sugerido === 'perdida' ? (i === 0 ? 'perdida' : 'ganada') : 'ganada',
      })),
      aceptar: 'Liquidar',
    });
    if (!v) return null;
    const resultados = a.selecciones.map((s, i) => ({ id: s.id, resultado: v[`r${i}`] }));
    const liq = CALCULOS.liquidacionDesdeSelecciones(a.stake, a.selecciones.map((s, i) => ({ cuota: s.cuota, resultado: v[`r${i}`] })));
    return this.ejecutar(id, { estado: liq.estado, retorno: liq.retorno, resultados });
  },
};

APP.acciones.liquidar = (el) => LIQUIDAR.rapido(el.dataset.id, el.dataset.estado);
APP.acciones.por_seleccion = (el) => LIQUIDAR.porSeleccion(el.dataset.id, 'ganada');
