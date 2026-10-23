/* graficas.js — gráficas SVG hechas a mano (sin librerías): curva con cursor y calibración. */
const GRAFICAS = {
  _id: 0,

  /** Curva suave (Catmull-Rom → Bézier) a partir de puntos [x, y] ya escalados. */
  _trazo(pts) {
    if (pts.length < 2) return '';
    let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
    for (let i = 0; i < pts.length - 1; i += 1) {
      const p0 = pts[i - 1] || pts[i];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[i + 2] || p2;
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
      const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
    }
    return d;
  },

  /**
   * Curva con rejilla punteada, línea de referencia y cursor con tooltip que sigue el dedo.
   * puntos: [{ saldo, fecha, delta }] · opciones: { referencia, formato, alto }
   */
  linea(host, puntos, { referencia = null, formato = (n) => String(n), alto = 210 } = {}) {
    const W = 420; const H = alto; const m = { l: 6, r: 6, t: 16, b: 14 };
    const id = `g${this._id += 1}`;
    if (puntos.length < 2) {
      host.innerHTML = '<div class="vacio" style="padding:26px 10px"><b>Aún no hay curva</b>Liquida apuestas para ver la evolución.</div>';
      return;
    }
    const ys = puntos.map((p) => p.saldo).concat(referencia !== null ? [referencia] : []);
    let min = Math.min(...ys); let max = Math.max(...ys);
    if (max - min < 1) { max += 1; min -= 1; }
    const colchon = (max - min) * 0.12; min -= colchon; max += colchon;
    const x = (i) => m.l + (i / (puntos.length - 1)) * (W - m.l - m.r);
    const y = (v) => m.t + (1 - (v - min) / (max - min)) * (H - m.t - m.b);
    const pts = puntos.map((p, i) => [x(i), y(p.saldo)]);
    const trazo = this._trazo(pts);
    const area = `${trazo} L${x(puntos.length - 1).toFixed(1)},${H - m.b} L${x(0).toFixed(1)},${H - m.b} Z`;
    const sube = puntos[puntos.length - 1].saldo >= puntos[0].saldo;
    const color = sube ? 'var(--verde)' : 'var(--rojo)';
    const rejilla = [0, 1, 2, 3].map((k) => {
      const v = min + ((max - min) * k) / 3;
      return `<line x1="${m.l}" x2="${W - m.r}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" class="lineas__rejilla"/>
              <text x="${m.l + 2}" y="${(y(v) - 4).toFixed(1)}" class="lineas__eje" font-size="12">${APP.esc(formato(v))}</text>`;
    }).join('');
    const ref = referencia !== null
      ? `<line x1="${m.l}" x2="${W - m.r}" y1="${y(referencia).toFixed(1)}" y2="${y(referencia).toFixed(1)}" class="lineas__ref"/>` : '';
    host.innerHTML = `
      <div class="lineas" style="color:${color}">
        <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Curva de saldo" style="touch-action:pan-y">
          <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="currentColor" stop-opacity=".32"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/></linearGradient></defs>
          ${rejilla}${ref}
          <path d="${area}" fill="url(#${id})"/>
          <path d="${trazo}" class="lineas__trazo" pathLength="1" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>
          <g class="lineas__cursor" hidden><line y1="${m.t}" y2="${H - m.b}" class="lineas__guia"/><circle r="6" fill="#fff" stroke="currentColor" stroke-width="3.5"/></g>
        </svg>
        <div class="lineas__tip" hidden></div>
      </div>`;
    const cont = host.querySelector('.lineas');
    const svg = cont.querySelector('svg');
    const cursor = cont.querySelector('.lineas__cursor');
    const tip = cont.querySelector('.lineas__tip');
    const mover = (ev) => {
      const r = svg.getBoundingClientRect();
      const px = ((ev.clientX - r.left) / r.width) * W;
      const i = Math.max(0, Math.min(puntos.length - 1, Math.round(((px - m.l) / (W - m.l - m.r)) * (puntos.length - 1))));
      const p = puntos[i];
      cursor.hidden = false;
      cursor.querySelector('line').setAttribute('x1', x(i)); cursor.querySelector('line').setAttribute('x2', x(i));
      const c = cursor.querySelector('circle'); c.setAttribute('cx', x(i)); c.setAttribute('cy', y(p.saldo));
      tip.hidden = false;
      tip.innerHTML = `<b>${APP.esc(formato(p.saldo))}</b><span>${i === 0 ? 'Inicio' : `${APP.fechaHora(p.fecha)} · ${APP.dineroSigno(p.delta)}`}</span>`;
      const izq = (x(i) / W) * r.width;
      tip.style.left = `${Math.max(60, Math.min(r.width - 60, izq))}px`;
    };
    const ocultar = () => { cursor.hidden = true; tip.hidden = true; };
    svg.addEventListener('pointermove', mover);
    svg.addEventListener('pointerdown', mover);
    svg.addEventListener('pointerleave', ocultar);
    svg.addEventListener('pointerup', (ev) => { if (ev.pointerType !== 'mouse') setTimeout(ocultar, 1400); });
  },

  /** Calibración: probabilidad propia (x) frente a frecuencia real (y), con la diagonal ideal. */
  calibracion(host, tramos) {
    const S = 260; const m = 30;
    const x = (v) => m + v * (S - m - 8);
    const y = (v) => S - m - v * (S - m - 8);
    const con = tramos.filter((t) => t.n > 0);
    const maxN = Math.max(...con.map((t) => t.n), 1);
    const guias = [0, 0.25, 0.5, 0.75, 1].map((v) => `
      <line x1="${m}" x2="${S - 8}" y1="${y(v)}" y2="${y(v)}" class="lineas__rejilla"/>
      <text x="${m - 6}" y="${y(v) + 3}" class="lineas__eje" font-size="9" text-anchor="end">${Math.round(v * 100)}</text>
      <text x="${x(v)}" y="${S - m + 14}" class="lineas__eje" font-size="9" text-anchor="middle">${Math.round(v * 100)}</text>`).join('');
    const linea = con.map((t) => `${x(t.probMedia).toFixed(1)},${y(t.frecuencia).toFixed(1)}`).join(' ');
    const puntos = con.map((t) => `<circle cx="${x(t.probMedia).toFixed(1)}" cy="${y(t.frecuencia).toFixed(1)}" r="${(4 + 6 * Math.sqrt(t.n / maxN)).toFixed(1)}" class="calib__punto"><title>${t.desde}–${t.hasta} %: ${Math.round(t.frecuencia * 100)} % real (${t.n})</title></circle>`).join('');
    host.innerHTML = `
      <svg viewBox="0 0 ${S} ${S}" role="img" aria-label="Curva de calibración" class="calib">
        ${guias}
        <line x1="${x(0)}" y1="${y(0)}" x2="${x(1)}" y2="${y(1)}" class="calib__ideal"/>
        <polyline points="${linea}" class="calib__linea" fill="none"/>
        ${puntos}
        <text x="${(m + S - 8) / 2}" y="${S - 2}" class="lineas__eje" font-size="9" text-anchor="middle">Tu probabilidad (%)</text>
        <text x="8" y="${(S - m) / 2}" class="lineas__eje" font-size="9" text-anchor="middle" transform="rotate(-90 8 ${(S - m) / 2})">Acierto real (%)</text>
      </svg>`;
  },
};
