/* vista_ajustes.js — parámetros (rigen desde el mes siguiente), bloqueos levantados, registro de cambios y datos. */
APP.vistas.ajustes = {
  CAMPOS: [
    ['banca_mensual', 'Banca mensual', 'decimal'],
    ['stake_max_pct', 'Stake máximo (% de la banca)', 'decimal'],
    ['perdida_max_pct', 'Pérdida máxima mensual (%)', 'decimal'],
    ['max_selecciones', 'Selecciones por combinada', 'numeric'],
    ['cuota_min', 'Cuota total mínima (dobles)', 'decimal'],
    ['max_apuestas_dia', 'Apuestas por día', 'numeric'],
    ['perdidas_seguidas_pausa', 'Pérdidas seguidas para pausa', 'numeric'],
  ],

  /** Texto de un parámetro: dinero, cuota o porcentaje según corresponda. */
  formato(k, v) {
    if (k === 'banca_mensual') return APP.dinero(v);
    if (k === 'cuota_min') return APP.cuota(v);
    if (k.endsWith('_pct')) return `${String(v).replace('.', ',')} %`;
    return String(v);
  },

  pintar(el) {
    const { ctx, sit, datos } = APP.estado;
    const cfg = ctx.config;
    const siguiente = REGLAS.mesSiguiente(sit.mes);
    const proxima = REGLAS.configVigente(datos.config, siguiente);
    const hayPropia = datos.config.some((c) => c.vigente_desde === siguiente);
    const levantados = (datos.ajustes.overrides || []).filter((o) => o.periodo === sit.mes || o.periodo === sit.dia);
    const vigentes = this.CAMPOS.map(([k, etq]) => `<div class="dato"><div class="dato__etq">${etq}</div><div class="dato__val num">${this.formato(k, cfg[k])}</div></div>`).join('');
    const campos = this.CAMPOS.map(([k, etq, modo]) =>
      `<label class="campo ${k === 'banca_mensual' ? 'campo--completo' : ''}"><span>${etq}</span><input name="${k}" value="${APP.esc(k === 'cuota_min' ? APP.cuota(proxima[k]) : String(proxima[k]).replace('.', ','))}" inputmode="${modo}" autocomplete="off"></label>`).join('');
    const bloqueos = levantados.map((o) => `
      <div class="regla" style="grid-template-columns:1fr auto;align-items:center">
        <div><div class="regla__tit">${o.regla === 'perdida_mensual' ? 'Pérdida mensual' : 'Apuestas por día'}</div><div class="regla__det">Levantado para ${o.periodo}</div></div>
        <button class="mini mini--rojo" type="button" data-accion="reactivar" data-regla="${o.regla}">Reactivar</button>
      </div>`).join('');
    const ultima = datos.ajustes.ultima_exportacion || null;
    const respaldos = Object.entries(datos.ajustes).filter(([k]) => k.startsWith('respaldo_'))
      .map(([k, v]) => ({ ranura: k, fecha: v.fecha, apuestas: v.copia.apuestas.length }))
      .sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
    const registros = datos.log.slice(0, 15).map((l) => `<div class="registro"><time>${APP.fechaHora(l.fecha_hora)}</time>${APP.esc(APP.textoLog(l))}</div>`).join('')
      || '<div class="registro suave">Aún no hay cambios registrados.</div>';

    el.innerHTML = `
      <header class="vista__cab"><div><div class="vista__sup">Configuración</div><h1 class="vista__titulo">Ajustes</h1></div></header>
      <div class="pila">
        <section class="bloque">
          <div class="bloque__cab"><div><div class="bloque__tit">Parámetros de ${APP.nombreMes(sit.mes)}</div><div class="bloque__sub">Vigentes ahora. No se pueden cambiar a mitad de mes.</div></div></div>
          <div class="ficha-datos">${vigentes}</div>
        </section>

        <section class="bloque">
          <div class="bloque__cab"><div><div class="bloque__tit">Desde ${APP.nombreMes(siguiente)}</div><div class="bloque__sub">${hayPropia ? 'Ya guardaste cambios para ese mes; puedes ajustarlos.' : 'Sin cambios: se mantienen los actuales.'}</div></div></div>
          <form id="form-config" class="hoja__cuerpo" novalidate>
            <div class="campos">${campos}</div>
            <div id="config-errores" class="mensajes"></div>
            <button class="boton boton--principal boton--ancho" type="submit">Guardar para ${APP.nombreMes(siguiente, false)}</button>
          </form>
        </section>

        ${levantados.length ? `<section class="bloque"><div class="bloque__cab"><div class="bloque__tit">Bloqueos levantados</div></div><div class="reglas">${bloqueos}</div></section>` : ''}

        <section class="bloque">
          <div class="bloque__cab"><div class="bloque__tit">Registro de cambios</div></div>
          ${registros}
        </section>

        <section class="bloque">
          <div class="bloque__cab"><div><div class="bloque__tit">Copia de seguridad</div><div class="bloque__sub">${ultima ? `Última copia exportada: ${APP.esc(APP.fechaHora(ultima))}` : 'Aún no has exportado ninguna copia'}</div></div></div>
          <div class="mensajes" style="margin-bottom:14px">${APP.mensaje('info', 'Tus datos viven <b>solo en este teléfono</b> (no hay servidor ni cuentas). Exporta la copia JSON con regularidad y guárdala en tu Drive desde el menú compartir.')}</div>
          <div class="pila" style="--hueco:10px">
            <button class="boton boton--principal boton--ancho" type="button" data-accion="exportar_json">Exportar copia (JSON)</button>
            <button class="boton boton--ancho" type="button" data-accion="importar_copia">Importar copia…</button>
            <button class="boton boton--ancho" type="button" data-accion="exportar_csv_todo">Exportar apuestas (CSV)</button>
            <input class="archivo" type="file" id="archivo-copia" accept=".json,application/json,text/plain">
          </div>
          <div class="bloque__tit" style="font-size:1rem;margin:20px 0 4px">Respaldos semanales</div>
          <div class="bloque__sub" style="margin-bottom:8px">Una copia automática cada 7 días dentro de la app (se conservan las 4 últimas). Protegen de errores, pero no de borrar los datos del navegador: exporta también al Drive.</div>
          ${respaldos.length ? respaldos.map((r) => `<div class="regla" style="grid-template-columns:1fr auto;align-items:center"><div><div class="regla__tit">${APP.esc(APP.fechaHora(r.fecha))}</div><div class="regla__det">${r.apuestas} apuestas</div></div><button class="mini" type="button" data-accion="descargar_respaldo" data-ranura="${r.ranura}">Descargar</button></div>`).join('') : '<div class="registro suave">Todavía no hay respaldos: se crea el primero al abrir la app con datos guardados.</div>'}
        </section>

        <section class="bloque">
          <div class="bloque__cab"><div class="bloque__tit">Datos de ejemplo</div></div>
          <p class="bloque__sub" style="margin-bottom:14px">Mira la app con 4 meses de apuestas inventadas, sin tocar tus datos. Se borran al cerrar la pestaña.</p>
          <a class="boton boton--ancho" href="./?demo" style="text-decoration:none">Abrir modo demo</a>
          <p class="bloque__sub" style="margin-top:14px;text-align:center">Registro de Picks · versión ${CONFIG.VERSION}</p>
        </section>
      </div>`;

    el.querySelector('#form-config').addEventListener('submit', (e) => { e.preventDefault(); this.guardar(e.target, siguiente); });
    el.querySelector('#archivo-copia').addEventListener('change', (e) => this.importar(e.target));
  },

  /** Lee el archivo elegido y añade a la app lo que le falte (nunca pisa apuestas existentes). */
  async importar(input) {
    const archivo = input.files && input.files[0];
    input.value = '';
    if (!archivo) return;
    let copia;
    try { copia = JSON.parse(await archivo.text()); } catch (e) { APP.aviso('El archivo no es un JSON válido'); return; }
    const n = Array.isArray(copia && copia.apuestas) ? copia.apuestas.length : 0;
    const ok = await DIALOGO.confirmar({
      titulo: '¿Importar esta copia?',
      mensaje: `La copia trae ${n} ${n === 1 ? 'apuesta' : 'apuestas'}. Se añade <b>solo lo que falta</b>: lo que ya tienes no se modifica, y puedes importarla varias veces sin duplicar.`,
      aceptar: 'Importar',
    });
    if (!ok) return;
    try {
      const r = await APP.db.importarCopia(copia);
      await APP.refrescar();
      APP.aviso(`Importadas ${r.apuestas} apuestas, ${r.depositos} movimientos${r.omitidas ? ` (${r.omitidas} ya existían)` : ''}`, { duracion: 6000 });
    } catch (e) { APP.aviso(e.message, { duracion: 6000 }); }
  },

  async guardar(form, siguiente) {
    const params = {};
    this.CAMPOS.forEach(([k]) => { params[k] = form.elements[k].value; });
    const errores = REGLAS.validarConfig(params);
    form.querySelector('#config-errores').innerHTML = errores.map((m) => APP.mensaje('error', APP.esc(m))).join('');
    if (errores.length) return;
    const ok = await DIALOGO.confirmar({
      titulo: `¿Guardar para ${APP.nombreMes(siguiente)}?`,
      mensaje: 'Los nuevos parámetros regirán desde el mes siguiente y no cambian nada del mes en curso. Queda anotado en el registro de cambios.',
      aceptar: 'Guardar',
    });
    if (!ok) return;
    try {
      await APP.db.guardarConfig(params);
      await APP.refrescar();
      APP.aviso(`Parámetros guardados para ${APP.nombreMes(siguiente, false)}`);
    } catch (e) { APP.aviso(e.message); }
  },
};

APP.acciones.reactivar = async (el) => {
  await APP.db.reactivarBloqueo(el.dataset.regla);
  await APP.refrescar();
  APP.aviso('Bloqueo reactivado');
};

APP.acciones.exportar_csv_todo = async () => {
  if (!APP.estado.lista.length) { APP.aviso('Aún no hay apuestas para exportar'); return; }
  const nombre = `picks-${DATOS.ahoraLocal().slice(0, 10)}.csv`;
  const r = await EXPORTAR.entregar(nombre, EXPORTAR.csvApuestas(APP.estado.lista.slice().reverse()));
  if (r !== 'cancelado') APP.aviso(r === 'compartido' ? 'CSV compartido' : `Descargado ${nombre}`);
};

/** Entrega un JSON (copia o respaldo) y anota la fecha de la última exportación. */
APP.entregarCopia = async (copia, nombre) => {
  const r = await EXPORTAR.entregar(nombre, JSON.stringify(copia, null, 1), 'application/json');
  if (r === 'cancelado') return;
  if (!APP.demo) await APP.db.guardarAjuste('ultima_exportacion', DATOS.ahoraLocal());
  await APP.refrescar();
  APP.aviso(r === 'compartido' ? 'Copia compartida' : `Descargado ${nombre}`);
};

APP.acciones.exportar_json = async () => {
  const copia = await APP.db.exportarCopia();
  await APP.entregarCopia(copia, `picks-copia-${DATOS.ahoraLocal().slice(0, 10)}.json`);
};

APP.acciones.importar_copia = () => {
  const input = document.getElementById('archivo-copia');
  if (input) input.click();
};

APP.acciones.descargar_respaldo = async (el) => {
  const r = APP.estado.datos.ajustes[el.dataset.ranura];
  if (r) await APP.entregarCopia(r.copia, `picks-respaldo-${r.fecha}.json`);
};
