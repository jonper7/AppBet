/* hoja_apuesta.js — hoja para registrar una apuesta (1 o 2 selecciones), con cálculo y reglas en vivo. */
const HOJA_APUESTA = {
  form: null,
  stakeManual: false, // true cuando el usuario escribe el stake; si no, se calcula solo
  validando: false, // se activa al pulsar Registrar: entonces se muestran también los campos faltantes
  CODIGOS_CAMPO: ['casa', 'stake', 'fuente', 'estado_emocional', 'confianza', 'partido', 'liga', 'fecha_partido', 'mercado', 'seleccion', 'cuota', 'prob_propia', 'selecciones'],

  /** Fichas con las casas o ligas guardadas: un toque rellena el campo. */
  fichas(lista, campo) {
    if (!lista || !lista.length) return '';
    return `<div class="campo--completo fichas fichas--campo" data-chips="${campo}">${lista.map((n) => `<button type="button" class="ficha ficha--mini" data-valor="${APP.esc(n)}">${APP.esc(n)}</button>`).join('')}</div>`;
  },

  /** Resalta la ficha que coincide con lo escrito en el campo. */
  marcarFichas() {
    const f = this.form;
    const plegar = (t) => String(t || '').trim().replace(/\s+/g, ' ').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    f.querySelectorAll('[data-chips]').forEach((caja) => {
      const actual = plegar(f.elements[caja.dataset.chips].value);
      caja.querySelectorAll('.ficha').forEach((b) => b.classList.toggle('on', actual !== '' && plegar(b.dataset.valor) === actual));
    });
  },

  bloqueSeleccion(i, ligas) {
    const n = i + 1;
    const mercados = CONFIG.MERCADOS.map((m) => `<option value="${APP.esc(m)}">${APP.esc(m)}</option>`).join('');
    return `<fieldset class="seleccion-bloque" data-i="${i}"${i ? ' hidden' : ''} style="margin:0;border:1px solid var(--borde)">
      <div class="seleccion-bloque__tit">Selección ${n}</div>
      <div class="campos">
        <label class="campo campo--completo"><span>Partido</span><input name="partido_${i}" placeholder="Local vs Visitante" autocomplete="off"></label>
        <label class="campo"><span>Liga</span><input name="liga_${i}" list="dl-ligas" autocomplete="off"></label>
        <label class="campo"><span>Fecha del partido</span><input type="datetime-local" name="fecha_partido_${i}"></label>
        ${this.fichas(ligas, `liga_${i}`)}
        <label class="campo"><span>Mercado</span><select name="mercado_${i}">${mercados}</select></label>
        <label class="campo"><span>Línea <small class="campo__ayuda">(opcional)</small></span><input name="linea_${i}" placeholder="2.5" inputmode="decimal" autocomplete="off"></label>
        <label class="campo campo--completo"><span>Selección</span><input name="seleccion_${i}" placeholder="Local, Más de 2.5, Ambos marcan…" autocomplete="off"></label>
        <label class="campo"><span>Cuota</span><input name="cuota_${i}" placeholder="1,85" inputmode="decimal" autocomplete="off"></label>
        <label class="campo"><span>Prob. propia % <small class="campo__ayuda">(opcional)</small></span><input name="prob_propia_${i}" placeholder="58" inputmode="decimal" autocomplete="off"></label>
        <label class="campo campo--completo"><span>Nota <small class="campo__ayuda">(opcional)</small></span><input name="nota_${i}" autocomplete="off"></label>
      </div>
    </fieldset>`;
  },

  abrir() {
    const d = APP.estado.datos;
    const casas = DATOS.catalogoDe(d, 'casas');
    const ligas = DATOS.catalogoDe(d, 'ligas');
    const opciones = (lista) => lista.map((x) => `<option value="${APP.esc(x)}">${APP.esc(x)}</option>`).join('');
    const radiosConfianza = [1, 2, 3, 4, 5].map((n) => `<label><input type="radio" name="confianza" value="${n}"${n === 3 ? ' checked' : ''}>${n}</label>`).join('');
    this.validando = false;
    this.stakeManual = false;
    this.captura = null;
    const el = HOJA.abrir(`
      <h2 class="hoja__tit">Registrar apuesta</h2>
      <p class="hoja__sub">Se guarda con la hora actual (<b>${APP.fechaHora(DATOS.ahoraLocal())}</b>). Una vez registrada no se edita: solo se liquida.</p>
      <form id="form-apuesta" class="hoja__cuerpo" novalidate autocomplete="off">
        <div class="mensajes" id="ap-bloqueos"></div>
        <div class="segmentos" role="radiogroup" aria-label="Tipo">
          <label><input type="radio" name="tipo" value="simple" checked>Simple</label>
          <label><input type="radio" name="tipo" value="doble">Doble</label>
        </div>
        ${this.bloqueSeleccion(0, ligas)}${this.bloqueSeleccion(1, ligas)}
        <div class="campos">
          <label class="campo"><span>Casa</span><input name="casa" list="dl-casas" autocomplete="off"></label>
          <label class="campo"><span>Stake <small class="campo__ayuda" id="ap-stake-modo">(automático)</small></span><input name="stake" placeholder="0,00" inputmode="decimal" autocomplete="off"></label>
          ${this.fichas(casas, 'casa')}
          <div class="campo campo--completo" style="gap:6px;margin-top:-4px">
            <span class="campo__ayuda" id="ap-stake-ayuda"></span>
            <button class="mini mini--suave" type="button" data-stake-auto hidden style="justify-self:start;padding-left:0">Volver al stake automático</button>
          </div>
        </div>
        <div class="vivo" id="ap-vivo"></div>
        <div class="campos">
          <label class="campo"><span>Fuente</span><select name="fuente">${opciones(CONFIG.FUENTES)}</select></label>
          <label class="campo"><span>Estado emocional</span><select name="estado_emocional">${opciones(CONFIG.EMOCIONES)}</select></label>
        </div>
        <div class="campo"><span>Confianza (1–5)</span><div class="segmentos" role="radiogroup">${radiosConfianza}</div></div>
        <label class="campo campo--completo"><span>Captura del boleto <small class="campo__ayuda">(opcional)</small></span><input type="file" name="archivo_captura" accept="image/*"></label>
        <img id="ap-captura-vista" class="miniatura" alt="Vista previa de la captura" hidden>
        <label class="interruptor"><span>Intento recuperar una pérdida</span><input type="checkbox" name="recuperando"></label>
        <div class="mensajes" id="ap-mensajes"></div>
        <div class="hoja__pie">
          <button class="boton" type="button" data-cerrar>Cancelar</button>
          <button class="boton boton--principal" type="submit" id="ap-guardar">Registrar</button>
        </div>
        <datalist id="dl-casas">${opciones(casas)}</datalist>
        <datalist id="dl-ligas">${opciones(ligas)}</datalist>
      </form>`, () => { this.form = null; });
    this.form = el.querySelector('#form-apuesta');
    this.enlazar(el);
    this.actualizar();
  },

  enlazar(el) {
    const f = this.form;
    f.addEventListener('input', (e) => {
      if (e.target.name === 'stake') this.stakeManual = true;
      this.actualizar();
    });
    f.addEventListener('click', (e) => {
      const ficha = e.target.closest('[data-chips] .ficha');
      if (!ficha) return;
      const campo = f.elements[ficha.closest('[data-chips]').dataset.chips];
      campo.value = ficha.dataset.valor;
      campo.dispatchEvent(new Event('input', { bubbles: true }));
    });
    el.querySelector('[data-stake-auto]').addEventListener('click', () => { this.stakeManual = false; this.actualizar(); });
    f.addEventListener('change', () => {
      f.querySelector('[data-i="1"]').hidden = f.elements.tipo.value !== 'doble';
      this.actualizar();
    });
    f.addEventListener('submit', (e) => { e.preventDefault(); this.guardar(); });
    el.querySelector('[data-cerrar]').addEventListener('click', () => HOJA.cerrar());
    f.elements.archivo_captura.addEventListener('change', async (e) => {
      const vista = f.querySelector('#ap-captura-vista');
      const archivo = e.target.files && e.target.files[0];
      this.captura = null;
      vista.hidden = true;
      if (!archivo) return;
      try {
        this.captura = await this.comprimirImagen(archivo);
        vista.src = this.captura;
        vista.hidden = false;
      } catch (err) { APP.aviso('No se pudo leer la imagen'); }
    });
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-levantar]');
      if (b) this.levantar(b.dataset.levantar);
    });
  },

  /** Reduce la foto a 1280 px de lado mayor y JPEG para que ocupe poco (~100–200 KB). */
  comprimirImagen(archivo) {
    return new Promise((resolver, rechazar) => {
      const url = URL.createObjectURL(archivo);
      const img = new Image();
      img.onload = () => {
        const escala = Math.min(1, 1280 / Math.max(img.width, img.height));
        const lienzo = document.createElement('canvas');
        lienzo.width = Math.round(img.width * escala);
        lienzo.height = Math.round(img.height * escala);
        lienzo.getContext('2d').drawImage(img, 0, 0, lienzo.width, lienzo.height);
        URL.revokeObjectURL(url);
        resolver(lienzo.toDataURL('image/jpeg', 0.72));
      };
      img.onerror = () => { URL.revokeObjectURL(url); rechazar(new Error('imagen no válida')); };
      img.src = url;
    });
  },

  /** Lee el formulario como borrador numérico. */
  leer() {
    const f = this.form;
    const g = (n) => (f.elements[n] ? f.elements[n].value : '');
    const num = (n) => { const x = CALCULOS.leerNumero(g(n)); return Number.isFinite(x) ? CALCULOS.redondear2(x) : NaN; };
    const cantidad = f.elements.tipo.value === 'doble' ? 2 : 1;
    const selecciones = [];
    for (let i = 0; i < cantidad; i += 1) {
      selecciones.push({
        partido: g(`partido_${i}`), liga: g(`liga_${i}`), fecha_partido: g(`fecha_partido_${i}`), mercado: g(`mercado_${i}`),
        seleccion: g(`seleccion_${i}`), linea: g(`linea_${i}`), cuota: num(`cuota_${i}`), prob_propia: g(`prob_propia_${i}`), nota: g(`nota_${i}`),
      });
    }
    return {
      casa: g('casa'), stake: num('stake'), fuente: g('fuente'), estado_emocional: g('estado_emocional'),
      confianza: Number(g('confianza')), recuperando_perdida: f.elements.recuperando.checked, selecciones,
      captura: this.captura || null,
    };
  },

  contexto() {
    return Object.assign({}, APP.estado.ctx, { ahora: DATOS.ahoraLocal() });
  },

  /** Rellena el stake con la sugerencia (si no está en modo manual) y explica cómo se calculó. */
  autoStake() {
    const f = this.form;
    const ayuda = f.querySelector('#ap-stake-ayuda');
    f.querySelector('#ap-stake-modo').textContent = this.stakeManual ? '(manual)' : '(automático)';
    f.querySelector('[data-stake-auto]').hidden = !this.stakeManual;
    const sit = REGLAS.situacion(this.contexto());
    if (this.stakeManual) { ayuda.textContent = `Stake escrito por ti. Máximo permitido: ${APP.dinero(sit.stakeMax)}.`; return; }
    const b = this.leer();
    if (!b.selecciones.every((s) => Number.isFinite(s.cuota))) {
      f.elements.stake.value = '';
      ayuda.textContent = 'Indica la cuota y se calcula el stake solo.';
      return;
    }
    const probs = b.selecciones.map((s) => CALCULOS.leerNumero(s.prob_propia));
    const prob = probs.every((p) => p > 0 && p < 100) ? probs.reduce((a, p) => a * (p / 100), 1) : null;
    const r = CALCULOS.stakeSugerido({
      bancaActual: sit.bancaActual, stakeMax: sit.stakeMax, confianza: b.confianza,
      probFraccion: prob, cuotaTotal: CALCULOS.cuotaCombinada(b.selecciones.map((s) => s.cuota)),
    });
    f.elements.stake.value = r.stake > 0 ? r.stake.toFixed(2).replace('.', ',') : '';
    ayuda.textContent = {
      kelly: `Calculado con ¼ Kelly a partir de tu probabilidad (máximo ${APP.dinero(sit.stakeMax)}).`,
      confianza: `Calculado: ${b.confianza}/5 del stake máximo (${APP.dinero(sit.stakeMax)}). Con tu probabilidad propia usaría Kelly.`,
      sin_ventaja: `Según tu probabilidad no hay ventaja (EV ≤ 0). Se usa ${b.confianza}/5 del máximo; piénsalo dos veces.`,
      ninguno: 'No hay stake permitido.',
    }[r.metodo];
  },

  actualizar() {
    this.marcarFichas();
    this.autoStake();
    const b = this.leer();
    const ev = REGLAS.evaluarApuesta(b, this.contexto());

    // resumen en vivo
    const cuotas = b.selecciones.map((s) => s.cuota);
    const conCuotas = cuotas.every(Number.isFinite);
    const total = conCuotas ? CALCULOS.cuotaCombinada(cuotas) : null;
    const retorno = conCuotas && b.stake > 0 ? CALCULOS.retornoPotencial(b.stake, total) : null;
    const impl = conCuotas ? CALCULOS.probImplicita(total) : null;
    const valor = b.selecciones.length === 1
      ? CALCULOS.ev(b.selecciones[0].prob_propia, b.selecciones[0].cuota)
      : (conCuotas ? CALCULOS.evCombinada(b.selecciones) : null);
    const dato = (etq, val, cls = '') => `<div class="dato"><div class="dato__etq">${etq}</div><div class="dato__val ${cls}">${val}</div></div>`;
    this.form.querySelector('#ap-vivo').innerHTML =
      dato('Cuota total', total ? APP.cuota(total) : '—') + dato('Retorno pot.', retorno != null ? APP.dinero(retorno) : '—') +
      dato('Prob. implícita', impl != null ? APP.pct(impl) : '—') + dato('EV', valor != null ? APP.pctSigno(valor) : '—', valor != null ? APP.clase(valor) : 'suave');

    // mensajes de reglas
    const errores = ev.errores.filter((e) => this.validando || !this.CODIGOS_CAMPO.includes(e.codigo));
    const hayBloqueoRegla = ev.errores.some((e) => !this.CODIGOS_CAMPO.includes(e.codigo));
    const boton = (e) => (e.levantable
      ? `<div class="mensaje__acc"><button class="mini mini--ambar" type="button" data-levantar="${e.codigo}">Levantar bloqueo…</button></div>` : '');
    const bloqueos = errores.filter((e) => e.levantable).map((e) => APP.mensaje('error', APP.esc(e.mensaje), boton(e))).join('');
    const otros = errores.filter((e) => !e.levantable).map((e) => APP.mensaje('error', APP.esc(e.mensaje))).join('')
      + ev.avisos.map((a) => APP.mensaje('aviso', APP.esc(a.mensaje))).join('');
    this.form.querySelector('#ap-bloqueos').innerHTML = bloqueos;
    this.form.querySelector('#ap-mensajes').innerHTML = otros;
    this.form.querySelector('#ap-guardar').disabled = hayBloqueoRegla;
    return Object.assign({ borrador: b }, ev);
  },

  async levantar(regla) {
    const texto = regla === 'perdida_mensual'
      ? 'Llegaste al límite de pérdida que tú mismo fijaste para este mes. Si lo levantas, podrás seguir apostando y perder más de lo que decidiste tolerar. Queda anotado en el registro de cambios y vale solo para este mes.'
      : 'Alcanzaste el máximo de apuestas por día que fijaste. Si lo levantas podrás registrar más hoy. Queda anotado en el registro de cambios y vale solo para hoy.';
    const ok = await DIALOGO.confirmar({
      titulo: '¿Levantar el bloqueo?', mensaje: texto, aceptar: 'Levantar bloqueo', cancelar: 'Mantener bloqueo', peligro: true,
    });
    if (!ok) return;
    await APP.db.levantarBloqueo(regla);
    await APP.refrescar();
    if (this.form) this.actualizar();
    APP.aviso('Bloqueo levantado y registrado');
  },

  async guardar() {
    this.validando = true;
    const r = this.actualizar();
    if (!r.ok) {
      const primero = this.form.querySelector('.mensaje--error');
      if (primero) primero.scrollIntoView({ behavior: APP.reducirMovimiento() ? 'auto' : 'smooth', block: 'center' });
      return;
    }
    const b = r.borrador;
    const total = CALCULOS.cuotaCombinada(b.selecciones.map((s) => s.cuota));
    const lineas = b.selecciones.map((s) => `• ${APP.esc(s.partido)} — ${APP.esc(s.seleccion)}${s.linea ? ` ${APP.esc(s.linea)}` : ''} @${APP.cuota(s.cuota)}`).join('<br>');
    const avisos = r.avisos.map((a) => APP.mensaje('aviso', APP.esc(a.mensaje))).join('');
    const ok = await DIALOGO.confirmar({
      titulo: '¿Registrar esta apuesta?',
      mensaje: `<b>${b.selecciones.length === 1 ? 'Simple' : 'Doble'}</b> · ${APP.esc(b.casa)}<br>${lineas}<br><br>
        Stake <b>${APP.dinero(b.stake)}</b> · cuota total <b>${APP.cuota(total)}</b> · retorno potencial <b>${APP.dinero(CALCULOS.retornoPotencial(b.stake, total))}</b>
        <div class="mensajes" style="margin-top:12px">${avisos}</div>
        <p style="margin-top:12px">Después de registrarla no podrás editar la cuota, el stake, la hora ni las selecciones.</p>`,
      aceptar: 'Registrar',
    });
    if (!ok) return;
    const boton = this.form.querySelector('#ap-guardar');
    boton.disabled = true;
    try {
      await APP.db.registrarApuesta(b);
      HOJA.cerrar();
      await APP.refrescar();
      APP.aviso('Apuesta registrada');
    } catch (e) {
      boton.disabled = false;
      if (e instanceof DATOS.ErrorReglas) { await APP.refrescar(); this.actualizar(); } else APP.aviso(e.message);
    }
  },
};

APP.acciones.registrar = () => HOJA_APUESTA.abrir();
