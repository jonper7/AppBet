/* nucleo.js — espacio APP: estado en memoria, formato, router por hash, refresco y avisos. */
const APP = {
  db: null,
  estado: { datos: null, ctx: null, ahora: null, sit: null, lista: [] },
  vista: 'inicio',
  VISTAS: ['inicio', 'apuestas', 'analisis', 'banca', 'ajustes'],
  vistas: {},     // cada vista_*.js registra { pintar(el) }
  acciones: {},   // acciones de data-accion="..."
  filtros: { mes: null, estado: 'todas', mercado: '', liga: '', casa: '' },
  sinFab: ['analisis', 'banca', 'ajustes'],
};

/* ---------- formato ---------- */
APP.esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const _nf = new Intl.NumberFormat('es', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
APP.dinero = (n) => (n == null || !Number.isFinite(n) ? '—' : _nf.format(n));
APP.dineroSigno = (n) => (n == null || !Number.isFinite(n) ? '—' : `${n > 0 ? '+' : n < 0 ? '−' : ''}${_nf.format(Math.abs(n))}`);
APP.pct = (f, dec = 1) => (f == null || !Number.isFinite(f) ? '—' : `${(f * 100).toFixed(dec).replace('.', ',')} %`);
APP.pctSigno = (f, dec = 1) => (f == null || !Number.isFinite(f) ? '—' : `${f > 0 ? '+' : f < 0 ? '−' : ''}${Math.abs(f * 100).toFixed(dec).replace('.', ',')} %`);
APP.cuota = (n) => (n == null || !Number.isFinite(n) ? '—' : n.toFixed(2).replace('.', ','));
APP.clase = (n) => (n > 0 ? 'pos' : n < 0 ? 'neg' : '');

APP.fechaHora = (s) => {
  if (!s) return '—';
  const [f, h] = s.split('T');
  const [, m, d] = f.split('-').map(Number);
  return `${d} ${CONFIG.MESES[m - 1]}${h ? ` · ${h}` : ''}`;
};
APP.etiquetaDia = (dia) => {
  const hoy = APP.estado.ahora ? APP.estado.ahora.slice(0, 10) : '';
  const ayer = hoy ? DATOS.ahoraLocal(new Date(new Date(`${hoy}T12:00`).getTime() - 864e5)).slice(0, 10) : '';
  if (dia === hoy) return 'Hoy';
  if (dia === ayer) return 'Ayer';
  const [, m, d] = dia.split('-').map(Number);
  return `${d} ${CONFIG.MESES[m - 1]}`;
};
APP.nombreMes = (mes, largo = true) => {
  const [a, m] = mes.split('-').map(Number);
  return `${(largo ? CONFIG.MESES_LARGOS : CONFIG.MESES)[m - 1]} ${a}`;
};

APP.reducirMovimiento = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Cifra que cuenta hasta su valor. */
APP.contar = (el, valor, formato = APP.dinero) => {
  if (!el) return;
  if (APP.reducirMovimiento() || !Number.isFinite(valor)) { el.textContent = formato(valor); return; }
  const t0 = performance.now();
  const dur = 650;
  const paso = (t) => {
    const k = Math.min(1, (t - t0) / dur);
    const e = 1 - Math.pow(1 - k, 3);
    el.textContent = formato(valor * e);
    if (k < 1) requestAnimationFrame(paso); else el.textContent = formato(valor);
  };
  requestAnimationFrame(paso);
};

/* ---------- avisos (toast) ---------- */
APP._tAviso = null;
APP.aviso = (texto, { accion, alAccion, duracion = 4000 } = {}) => {
  const el = document.getElementById('aviso');
  el.innerHTML = `<span>${APP.esc(texto)}</span>${accion ? `<button type="button">${APP.esc(accion)}</button>` : ''}`;
  el.classList.add('abierto');
  clearTimeout(APP._tAviso);
  const cerrar = () => el.classList.remove('abierto');
  if (accion) {
    el.querySelector('button').onclick = () => { cerrar(); clearTimeout(APP._tAviso); alAccion && alAccion(); };
  }
  APP._tAviso = setTimeout(cerrar, duracion);
};

/* ---------- datos ---------- */
APP.refrescar = async () => {
  const datos = await APP.db.cargar();
  const ahora = DATOS.ahoraLocal();
  const ctx = APP.db.contexto(datos, ahora);
  const porApuesta = new Map();
  datos.selecciones.forEach((s) => {
    if (!porApuesta.has(s.apuesta_id)) porApuesta.set(s.apuesta_id, []);
    porApuesta.get(s.apuesta_id).push(s);
  });
  const lista = datos.apuestas
    .map((a) => Object.assign({}, a, { selecciones: (porApuesta.get(a.id) || []).sort((x, y) => (x.orden || 0) - (y.orden || 0)) }))
    .sort((a, b) => (a.fecha_hora < b.fecha_hora ? 1 : -1));
  APP.estado = { datos, ctx, ahora, sit: REGLAS.situacion(ctx), lista };
  if (!APP.filtros.mes) APP.filtros.mes = REGLAS.mesDe(ahora);
  APP.pintar();
};

APP.pintar = () => {
  const v = APP.vistas[APP.vista];
  if (v && APP.estado.datos) v.pintar(document.getElementById(`vista-${APP.vista}`));
};

/* ---------- navegación ---------- */
APP.ir = (vista) => { location.hash = `#/${vista}`; };
APP.alCambiarHash = () => {
  const v = location.hash.replace('#/', '');
  APP.vista = APP.VISTAS.includes(v) ? v : 'inicio';
  document.querySelectorAll('.vista').forEach((el) => el.classList.toggle('activa', el.dataset.vista === APP.vista));
  document.querySelectorAll('.tabbar__tab').forEach((b) => b.classList.toggle('activa', b.dataset.ir === APP.vista));
  document.getElementById('tabbar').style.setProperty('--indice', APP.VISTAS.indexOf(APP.vista));
  document.getElementById('indicador').style.setProperty('--indice', APP.VISTAS.indexOf(APP.vista));
  document.getElementById('fab').classList.toggle('oculto', APP.sinFab.includes(APP.vista));
  window.scrollTo(0, 0);
  APP.animarCifras = true;
  APP.pintar();
};

document.addEventListener('click', (e) => {
  const ir = e.target.closest('[data-ir]');
  if (ir) { APP.ir(ir.dataset.ir); return; }
  const ac = e.target.closest('[data-accion]');
  if (ac && APP.acciones[ac.dataset.accion]) APP.acciones[ac.dataset.accion](ac, e);
});

/* ---------- iconos reutilizables ---------- */
APP.ICONO = {
  error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 16.5v.5"/></svg>',
  aviso: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4 3 20h18z"/><path d="M12 10v4M12 17v.5"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8v.5"/></svg>',
};
APP.mensaje = (tipo, texto, extra = '') =>
  `<div class="mensaje mensaje--${tipo}">${APP.ICONO[tipo === 'error' ? 'error' : tipo === 'aviso' ? 'aviso' : 'info']}<div>${texto}${extra}</div></div>`;

/* ---------- piezas compartidas ---------- */
APP.unicos = (lista) => [...new Set(lista.map((x) => String(x || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));

APP.ETIQUETA_ESTADO = { pendiente: 'pendiente', ganada: 'ganada', perdida: 'perdida', anulada: 'anulada', cashout: 'cashout' };

/** Fila de una apuesta (con su arreglo `selecciones`). `botones`: añade liquidar a un toque. */
APP.filaApuesta = (a, { botones = false } = {}) => {
  const partidos = a.selecciones.map((s) => s.partido).join(' + ') || '—';
  const elige = a.selecciones.map((s) => `${s.seleccion}${s.linea ? ` ${s.linea}` : ''}`).join(' + ');
  const pendiente = a.estado === 'pendiente';
  const monto = pendiente ? APP.dinero(a.stake) : APP.dineroSigno(a.ganancia_neta);
  const claseMonto = pendiente ? '' : APP.clase(a.ganancia_neta);
  const rotulo = pendiente ? 'stake · pendiente' : a.estado;
  const acciones = botones ? `<div class="mov__acciones">${LIQUIDAR.botones(a)}</div>` : '';
  return `<article class="mov mov--${a.estado}">
    <div class="mov__fila" data-accion="detalle" data-id="${a.id}" role="button" tabindex="0">
      <div style="min-width:0">
        <div class="mov__tit">${APP.esc(partidos)}</div>
        <div class="mov__meta">${APP.esc(elige)} · @${APP.cuota(a.cuota_total)}</div>
        <div class="mov__meta">${APP.esc(a.casa)} · ${a.tipo} · ${APP.fechaHora(a.fecha_hora)}</div>
      </div>
      <div><div class="mov__monto ${claseMonto}">${monto}</div><div class="mov__estado estado--${a.estado}">${rotulo}</div></div>
    </div>${acciones}</article>`;
};

/** Texto legible para una entrada de log_cambios. */
APP.textoLog = (l) => {
  switch (l.tipo) {
    case 'liquidacion': return `Liquidada como ${l.despues.estado} · retorno ${APP.dinero(l.despues.retorno)}`;
    case 'liquidacion_revertida': return `Liquidación deshecha (estaba ${l.antes.estado})`;
    case 'correccion': return `Corrección de ${l.campo}: ${l.antes || '—'} → ${l.despues}. Motivo: ${l.motivo}`;
    case 'seleccion': return `Selección actualizada: ${Object.keys(l.despues).map((k) => `${k} ${l.antes[k] ?? '—'} → ${l.despues[k] ?? '—'}`).join(', ')}`;
    case 'config': return `Parámetros guardados para ${APP.nombreMes(l.vigente_desde)}`;
    case 'bloqueo_levantado': return `Bloqueo «${l.regla === 'perdida_mensual' ? 'pérdida mensual' : 'apuestas por día'}» levantado (${l.periodo})`;
    case 'bloqueo_reactivado': return `Bloqueo «${l.regla === 'perdida_mensual' ? 'pérdida mensual' : 'apuestas por día'}» reactivado (${l.periodo})`;
    case 'cierre_mes': return `Mes ${APP.nombreMes(l.mes)} cerrado`;
    default: return l.tipo;
  }
};
