/* datos_demo.js — datos de ejemplo para probar la app sin tocar los reales.
   Se activan abriendo la app con ?demo: viven solo en memoria y desaparecen al cerrar la pestaña. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./calculos.js'), require('./reglas.js'), require('./reportes.js'));
  else root.DEMO = factory(root.CALCULOS, root.REGLAS, root.REPORTES);
})(typeof self !== 'undefined' ? self : globalThis, function (C, R, RP) {
  'use strict';

  const EQUIPOS = ['Real Madrid', 'Barcelona', 'Sevilla', 'Betis', 'Valencia', 'Villarreal', 'Man City', 'Arsenal', 'Liverpool', 'Chelsea',
    'Inter', 'Milan', 'Juventus', 'Napoli', 'Bayern', 'Dortmund', 'Leipzig', 'Leverkusen', 'PSG', 'Atlético'];
  const LIGAS = ['LaLiga', 'Premier League', 'Serie A', 'Bundesliga', 'Champions League'];
  const CASAS = ['Bet365', 'Codere', 'Betway'];
  const FUENTES = ['análisis propio', 'análisis propio', 'Claude', 'tipster', 'intuición'];
  const EMOCIONES = ['tranquilo', 'tranquilo', 'tranquilo', 'aburrido', 'tras pérdida', 'otro'];
  const MERCADOS = [
    ['1X2', ['Local', 'Empate', 'Visitante'], ''],
    ['doble oportunidad', ['1X', 'X2', '12'], ''],
    ['goles', ['Más de 2.5', 'Menos de 2.5'], '2.5'],
    ['BTTS', ['Sí', 'No'], ''],
    ['córners', ['Más de 9.5', 'Menos de 9.5'], '9.5'],
    ['tiros', ['Más de 8.5'], '8.5'],
    ['otro', ['Jugador marca'], ''],
  ];

  function rng(semilla) { // mulberry32
    let a = semilla >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const p2 = (n) => String(n).padStart(2, '0');
  const fechaDe = (anio, mes, dia) => `${anio}-${p2(mes)}-${p2(dia)}`;

  /** Mes anterior en forma [año, mes] restando k meses. */
  function restarMeses(anio, mes, k) {
    const total = anio * 12 + (mes - 1) - k;
    return [Math.floor(total / 12), (total % 12) + 1];
  }

  /**
   * Siembra el adaptador con ~4 meses de historial. `ahora` = "YYYY-MM-DDTHH:mm".
   * Se escribe directo en el adaptador (sin pasar por las reglas) para que haya casos variados.
   */
  async function sembrar(adaptador, ahora) {
    const azar = rng(20261023);
    const elegir = (l) => l[Math.floor(azar() * l.length)];
    const [anioHoy, mesHoy, diaHoy] = ahora.slice(0, 10).split('-').map(Number);
    const items = [];
    const apuestas = [];
    let n = 0;

    const nuevaSeleccion = (apuestaId, orden, dia, hora, tipo) => {
      const [mercado, opciones, linea] = elegir(MERCADOS);
      const prob = Math.round((0.42 + azar() * 0.36) * 100); // 42–78 %
      const justa = 100 / prob;
      let cuota = C.redondear2(justa * (0.92 + azar() * 0.2));
      cuota = tipo === 'doble' ? Math.min(2.2, Math.max(1.45, cuota)) : Math.max(1.3, cuota);
      const local = elegir(EQUIPOS);
      let visitante = elegir(EQUIPOS);
      while (visitante === local) visitante = elegir(EQUIPOS);
      const horaPartido = Math.min(23, hora + 2 + Math.floor(azar() * 3));
      const verdadera = Math.min(0.95, Math.max(0.05, prob / 100 - 0.02 + (azar() - 0.5) * 0.08)); // algo sobreconfiado
      return {
        id: `demo-s${apuestaId.slice(6)}-${orden}`, apuesta_id: apuestaId, orden,
        partido: `${local} vs ${visitante}`, liga: elegir(LIGAS), fecha_partido: `${dia}T${p2(horaPartido)}:00`,
        mercado, seleccion: elegir(opciones), linea, cuota, prob_propia: prob,
        cuota_cierre: azar() < 0.6 ? C.redondear2(cuota * (0.9 + azar() * 0.2)) : null,
        resultado: null, nota: '', _gana: azar() < verdadera,
      };
    };

    for (let k = 3; k >= 0; k -= 1) {
      const [anio, mes] = restarMeses(anioHoy, mesHoy, k);
      const mesTxt = `${anio}-${p2(mes)}`;
      items.push(['config', Object.assign({ id: `demo-c${mesTxt}`, vigente_desde: mesTxt, creada_en: `${mesTxt}-01T08:00` }, R.PARAMETROS_POR_DEFECTO)]);
      items.push(['depositos', { id: `demo-d${mesTxt}`, fecha: fechaDe(anio, mes, 2), monto: 100, metodo: 'tarjeta', tipo: 'deposito', motivo: 'banca del mes' }]);
      if (k === 2) items.push(['depositos', { id: `demo-r${mesTxt}`, fecha: fechaDe(anio, mes, 27), monto: 40, metodo: 'transferencia', tipo: 'retiro', motivo: 'retiro de ganancias' }]);

      const ultimoDia = k === 0 ? diaHoy : 28;
      const objetivo = k === 0 ? 99 : 28;
      for (let d = 1, hechas = 0; d <= ultimoDia && hechas < objetivo; d += 1) {
        const dia = fechaDe(anio, mes, d);
        const cuantas = azar() < 0.25 ? 2 : 1;
        for (let j = 0; j < cuantas && hechas < objetivo; j += 1) {
          n += 1; hechas += 1;
          const id = `demo-a${String(n).padStart(3, '0')}`;
          const tipo = azar() < 0.4 ? 'doble' : 'simple';
          const hora = 9 + Math.floor(azar() * 11);
          const confianza = 1 + Math.floor(azar() * 5);
          const stake = C.redondear2((10 * confianza) / 5);
          const sels = Array.from({ length: tipo === 'doble' ? 2 : 1 }, (_, i) => nuevaSeleccion(id, i, dia, hora, tipo));
          const cuotaTotal = C.cuotaCombinada(sels.map((s) => s.cuota));
          const fecha = `${dia}T${p2(hora)}:${p2(Math.floor(azar() * 60))}`;
          const base = {
            id, fecha_hora: fecha, casa: elegir(CASAS), tipo, stake, cuota_total: cuotaTotal, estado: 'pendiente', retorno: null,
            ganancia_neta: null, fuente: elegir(FUENTES), confianza, estado_emocional: elegir(EMOCIONES),
            recuperando_perdida: false, captura: null, mes: mesTxt,
          };
          const pendiente = k === 0 && d >= diaHoy - 1;
          if (!pendiente) {
            const sorteo = azar();
            const dSig = Math.min(d + 1, 28);
            base.fecha_liquidacion = `${fechaDe(anio, mes, dSig)}T09:00`;
            if (tipo === 'simple' && sorteo < 0.03) {
              base.estado = 'anulada'; base.retorno = stake; base.ganancia_neta = 0;
              sels.forEach((s) => { s.resultado = 'anulada'; });
            } else if (sorteo < 0.06) {
              base.estado = 'cashout'; base.retorno = C.redondear2(stake * (0.5 + azar() * 1.2));
              base.ganancia_neta = C.gananciaNeta('cashout', stake, base.retorno);
            } else {
              sels.forEach((s) => { s.resultado = s._gana ? 'ganada' : 'perdida'; });
              const gana = sels.every((s) => s.resultado === 'ganada');
              base.estado = gana ? 'ganada' : 'perdida';
              base.retorno = gana ? C.redondear2(stake * cuotaTotal) : 0;
              base.ganancia_neta = C.gananciaNeta(base.estado, stake, base.retorno);
            }
          }
          base.recuperando_perdida = base.estado !== 'pendiente' && apuestas.length > 0 && apuestas[apuestas.length - 1].estado === 'perdida' && azar() < 0.3;
          apuestas.push(base);
          items.push(['apuestas', base]);
          sels.forEach((s) => { const { _gana, ...limpia } = s; items.push(['selecciones', limpia]); });
        }
      }
    }

    // cierre de los dos meses más antiguos, con resumen real de lo sembrado
    const lista = apuestas.map((a) => Object.assign({}, a, {
      selecciones: items.filter((i) => i[0] === 'selecciones' && i[1].apuesta_id === a.id).map((i) => i[1]),
    }));
    const depositos = items.filter((i) => i[0] === 'depositos').map((i) => i[1]);
    const cierres = [3, 2].map((k) => {
      const [anio, mes] = restarMeses(anioHoy, mesHoy, k);
      const mesTxt = `${anio}-${p2(mes)}`;
      return { mes: mesTxt, cerrado_en: `${fechaDe(anio, mes, 28)}T22:00`, resumen: RP.resumenMes(lista, depositos, 100, mesTxt) };
    });
    items.push(['ajustes', { clave: 'cierres', valor: cierres }]);

    // se guarda por lotes para no crear una transacción gigante
    for (let i = 0; i < items.length; i += 200) await adaptador.guardar(items.slice(i, i + 200));
    return { apuestas: apuestas.length, selecciones: items.filter((i) => i[0] === 'selecciones').length };
  }

  return { sembrar };
});
