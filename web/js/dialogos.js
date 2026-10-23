/* dialogos.js — HOJA (hoja inferior principal) y DIALOGO (formulario / confirmar, siempre devuelven promesa). */
const HOJA = {
  el: null, velo: null, alCerrar: null,
  _iniciar() {
    this.el = document.getElementById('hoja');
    this.velo = document.getElementById('velo');
    this.velo.addEventListener('click', () => this.cerrar());
  },
  abrir(html, alCerrar) {
    if (!this.el) this._iniciar();
    this.alCerrar = alCerrar || null;
    this.el.innerHTML = `<div class="hoja__asa"></div>${html}`;
    this.el.scrollTop = 0;
    this.velo.classList.add('abierto');
    this.el.classList.add('abierto');
    document.body.style.overflow = 'hidden';
    return this.el;
  },
  cerrar() {
    if (!this.el || !this.el.classList.contains('abierto')) return;
    this.el.classList.remove('abierto');
    this.velo.classList.remove('abierto');
    document.body.style.overflow = '';
    const f = this.alCerrar; this.alCerrar = null;
    if (f) f();
  },
  get abierta() { return !!this.el && this.el.classList.contains('abierto'); },
};

const DIALOGO = {
  _cierre: null,
  _abrir(html) {
    const el = document.getElementById('hoja-dialogo');
    const velo = document.getElementById('velo-dialogo');
    el.innerHTML = `<div class="hoja__asa"></div>${html}`;
    velo.classList.add('abierto');
    el.classList.add('abierto');
    return { el, velo };
  },
  _cerrar() {
    document.getElementById('hoja-dialogo').classList.remove('abierto');
    document.getElementById('velo-dialogo').classList.remove('abierto');
  },

  /** confirmar({ titulo, mensaje (HTML), aceptar, cancelar, peligro }) → Promise<boolean> */
  confirmar({ titulo, mensaje = '', aceptar = 'Aceptar', cancelar = 'Cancelar', peligro = false }) {
    return new Promise((resolver) => {
      const { el, velo } = this._abrir(`
        <h2 class="hoja__tit">${APP.esc(titulo)}</h2>
        <div class="hoja__sub" style="margin-bottom:0">${mensaje}</div>
        <div class="hoja__pie">
          <button class="boton" data-r="no" type="button">${APP.esc(cancelar)}</button>
          <button class="boton ${peligro ? 'boton--peligro' : 'boton--principal'}" data-r="si" type="button">${APP.esc(aceptar)}</button>
        </div>`);
      const fin = (v) => { velo.onclick = null; this._cerrar(); resolver(v); };
      el.querySelector('[data-r="si"]').onclick = () => fin(true);
      el.querySelector('[data-r="no"]').onclick = () => fin(false);
      velo.onclick = () => fin(false);
    });
  },

  /**
   * formulario({ titulo, mensaje, campos, aceptar, peligro, validar }) → Promise<valores | null>
   * campos: [{ id, etiqueta, tipo: 'texto'|'monto'|'numero'|'area'|'select', valor, opciones, requerido, ayuda }]
   * validar(valores) → { campoId: 'mensaje' } | null
   */
  formulario({ titulo, mensaje = '', campos, aceptar = 'Guardar', peligro = false, validar }) {
    return new Promise((resolver) => {
      const campo = (c) => {
        const v = c.valor == null ? '' : c.valor;
        let control;
        if (c.tipo === 'select') {
          const ops = (c.opciones || []).map((o) => (typeof o === 'string' ? { valor: o, texto: o } : o));
          control = `<select name="${c.id}">${ops.map((o) => `<option value="${APP.esc(o.valor)}"${String(o.valor) === String(v) ? ' selected' : ''}>${APP.esc(o.texto)}</option>`).join('')}</select>`;
        } else if (c.tipo === 'area') {
          control = `<textarea name="${c.id}" rows="3">${APP.esc(v)}</textarea>`;
        } else {
          const modo = c.tipo === 'monto' ? ' inputmode="decimal" autocomplete="off"' : c.tipo === 'numero' ? ' inputmode="numeric" autocomplete="off"' : '';
          control = `<input type="text" name="${c.id}" value="${APP.esc(v)}"${modo}>`;
        }
        return `<label class="campo campo--completo" data-campo="${c.id}"><span>${APP.esc(c.etiqueta)}</span>${control}<span class="campo__ayuda" data-ayuda>${APP.esc(c.ayuda || '')}</span></label>`;
      };
      const { el, velo } = this._abrir(`
        <h2 class="hoja__tit">${APP.esc(titulo)}</h2>
        ${mensaje ? `<div class="hoja__sub">${mensaje}</div>` : ''}
        <form class="hoja__cuerpo" novalidate style="margin-top:14px">${campos.map(campo).join('')}
          <div class="hoja__pie">
            <button class="boton" data-r="no" type="button">Cancelar</button>
            <button class="boton ${peligro ? 'boton--peligro' : 'boton--principal'}" type="submit">${APP.esc(aceptar)}</button>
          </div>
        </form>`);
      const form = el.querySelector('form');
      const fin = (v) => { velo.onclick = null; this._cerrar(); resolver(v); };
      form.querySelector('[data-r="no"]').onclick = () => fin(null);
      velo.onclick = () => fin(null);
      form.addEventListener('submit', (ev) => {
        ev.preventDefault();
        const valores = {};
        campos.forEach((c) => { valores[c.id] = form.elements[c.id].value.trim(); });
        const errores = {};
        campos.forEach((c) => { if (c.requerido && valores[c.id] === '') errores[c.id] = 'Este dato es obligatorio.'; });
        Object.assign(errores, (!Object.keys(errores).length && validar && validar(valores)) || {});
        form.querySelectorAll('[data-campo]').forEach((l) => {
          const msg = errores[l.dataset.campo];
          l.classList.toggle('campo--error', !!msg);
          const ay = l.querySelector('[data-ayuda]');
          const c = campos.find((x) => x.id === l.dataset.campo);
          ay.textContent = msg || (c && c.ayuda) || '';
          ay.style.color = msg ? 'var(--rojo)' : '';
        });
        if (Object.keys(errores).length) return;
        fin(valores);
      });
      const primero = form.querySelector('input, textarea');
      if (primero && !('ontouchstart' in window)) primero.focus();
    });
  },
};

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !document.getElementById('hoja-dialogo').classList.contains('abierto')) HOJA.cerrar();
});
