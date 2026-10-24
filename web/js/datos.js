/* datos.js — capa de datos (IndexedDB en el teléfono, memoria en las pruebas).
   Garantía de auditoría (regla 7): esta API NO ofrece editar ni borrar apuestas.
   Una apuesta solo cambia al liquidarse; cualquier corrección se anota en `log_cambios`. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./calculos.js'), require('./reglas.js'));
  else root.DATOS = factory(root.CALCULOS, root.REGLAS);
})(typeof self !== 'undefined' ? self : globalThis, function (C, R) {
  'use strict';

  // Todos los almacenes usan `id`, salvo `ajustes` (clave/valor).
  const CLAVE = { apuestas: 'id', selecciones: 'id', depositos: 'id', config: 'id', log_cambios: 'id', ajustes: 'clave', capturas: 'id' };
  const ALMACENES = Object.keys(CLAVE);
  const ESTADOS_LIQUIDACION = ['ganada', 'perdida', 'anulada', 'cashout'];
  const RESULTADOS = ['ganada', 'perdida', 'anulada'];
  const CAMPOS_SELECCION_EDITABLES = ['resultado', 'cuota_cierre']; // el resto de la selección es inmutable
  const REGLAS_LEVANTABLES = ['perdida_mensual', 'max_apuestas_dia'];
  const VENTANA_DESHACER_MIN = 5;
  const VERSION_COPIA = 2;
  const RANURAS_RESPALDO = 4;      // respaldos semanales rotativos (no hace falta borrar nada)
  const DIAS_ENTRE_RESPALDOS = 7;
  const MAX_CAPTURA_CHARS = 2000000;
  const AJUSTES_EDITABLES = ['ultima_exportacion'];

  class ErrorReglas extends Error {
    constructor(errores) {
      super(errores.map((e) => e.mensaje).join(' '));
      this.name = 'ErrorReglas';
      this.errores = errores;
    }
  }

  const uuid = () => (typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10));

  /** Fecha/hora local como "YYYY-MM-DDTHH:mm". */
  function ahoraLocal(d = new Date()) {
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  const minutosEntre = (a, b) => (new Date(b) - new Date(a)) / 60000;

  // ---------- Adaptadores: todos(), obtener(), guardar([[almacen, objeto], ...]) ----------
  // No existe ninguna operación de borrado: por diseño los registros no se eliminan.

  function adaptadorMemoria() {
    const alm = {};
    ALMACENES.forEach((n) => { alm[n] = new Map(); });
    const copia = (o) => JSON.parse(JSON.stringify(o));
    return {
      async todos(n) { return [...alm[n].values()].map(copia); },
      async obtener(n, k) { const v = alm[n].get(k); return v ? copia(v) : undefined; },
      async guardar(items) { items.forEach(([n, o]) => alm[n].set(o[CLAVE[n]], copia(o))); },
    };
  }

  function adaptadorIDB(nombre = 'registro_de_picks') {
    let abierta = null;
    const abrir = () => {
      if (!abierta) {
        abierta = new Promise((res, rej) => {
          const rq = indexedDB.open(nombre, 2);
          rq.onupgradeneeded = () => {
            const db = rq.result;
            ALMACENES.forEach((n) => { if (!db.objectStoreNames.contains(n)) db.createObjectStore(n, { keyPath: CLAVE[n] }); });
          };
          rq.onsuccess = () => {
            // si otra pestaña abre una versión más nueva, esta suelta la base para no bloquear la actualización
            rq.result.onversionchange = () => { rq.result.close(); abierta = null; };
            res(rq.result);
          };
          rq.onerror = () => rej(rq.error);
          rq.onblocked = () => rej(new Error('Cierra las otras pestañas de la app para actualizar la base de datos.'));
        });
      }
      return abierta;
    };
    const pedir = (rq) => new Promise((res, rej) => { rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error); });
    return {
      async todos(n) { const db = await abrir(); return pedir(db.transaction(n).objectStore(n).getAll()); },
      async obtener(n, k) { const db = await abrir(); return pedir(db.transaction(n).objectStore(n).get(k)); },
      async guardar(items) {
        const db = await abrir();
        const nombres = [...new Set(items.map((i) => i[0]))];
        return new Promise((res, rej) => {
          const tx = db.transaction(nombres, 'readwrite');
          items.forEach(([n, o]) => tx.objectStore(n).put(o));
          tx.oncomplete = () => res();
          tx.onerror = () => rej(tx.error);
          tx.onabort = () => rej(tx.error);
        });
      },
    };
  }

  // ---------- Catálogos de casas y ligas ----------

  const TIPOS_CATALOGO = ['casas', 'ligas'];
  const MAX_ELEMENTOS_CATALOGO = 200;
  const MAX_LARGO_NOMBRE = 60;

  /** Para comparar nombres sin importar mayúsculas, tildes ni espacios sobrantes. */
  const plegar = (t) => String(t || '').trim().replace(/\s+/g, ' ').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const limpiar = (t) => String(t || '').trim().replace(/\s+/g, ' ');
  const ordenar = (lista) => [...lista].sort((a, b) => a.localeCompare(b, 'es'));

  /** Añade los valores nuevos (sin repetir, ignorando mayúsculas y tildes). */
  function unirNombres(base, extra) {
    const salida = [...base];
    extra.map(limpiar).filter(Boolean).forEach((n) => {
      if (!salida.some((x) => plegar(x) === plegar(n))) salida.push(n);
    });
    return ordenar(salida);
  }

  /** Lista de casas o ligas: la guardada o, si aún no hay, la que sale del historial. */
  function catalogoDe(datos, tipo) {
    const guardado = datos.ajustes[`catalogo_${tipo}`];
    if (Array.isArray(guardado)) return guardado;
    const origen = tipo === 'casas' ? datos.apuestas.map((a) => a.casa) : datos.selecciones.map((s) => s.liga);
    return unirNombres([], origen);
  }

  // ---------- Instancia ----------

  function crear(adaptador) {
    const reloj = () => ahoraLocal();

    async function cargar() {
      const [config, apuestas, selecciones, depositos, log, ajustes] = await Promise.all(
        ['config', 'apuestas', 'selecciones', 'depositos', 'log_cambios', 'ajustes'].map((n) => adaptador.todos(n))
      );
      return {
        config, apuestas, selecciones, depositos,
        log: log.sort((a, b) => (a.fecha_hora < b.fecha_hora ? 1 : -1)),
        ajustes: Object.fromEntries(ajustes.map((a) => [a.clave, a.valor])),
      };
    }

    /** Contexto para las reglas, a partir de lo cargado. */
    function contexto(datos, ahora) {
      return {
        config: R.configVigente(datos.config, R.mesDe(ahora)),
        apuestas: datos.apuestas,
        depositos: datos.depositos,
        overrides: datos.ajustes.overrides || [],
        ahora,
      };
    }

    const entradaLog = (tipo, ahora, extra) => ['log_cambios', Object.assign({ id: uuid(), fecha_hora: ahora, tipo }, extra)];

    /** Primera ejecución: crea los parámetros por defecto, vigentes desde el mes en curso. */
    async function asegurarConfig(ahora = reloj()) {
      const existentes = await adaptador.todos('config');
      if (existentes.length) return;
      await adaptador.guardar([
        ['config', Object.assign({ id: uuid(), vigente_desde: R.mesDe(ahora), creada_en: ahora }, R.PARAMETROS_POR_DEFECTO)],
      ]);
    }

    function normalizarBorrador(b) {
      return {
        casa: String(b.casa || '').trim(),
        stake: C.redondear2(C.leerNumero(b.stake)),
        fuente: b.fuente,
        confianza: Number(b.confianza),
        estado_emocional: b.estado_emocional,
        recuperando_perdida: !!b.recuperando_perdida,
        captura: typeof b.captura === 'string' && b.captura.startsWith('data:image/') && b.captura.length <= MAX_CAPTURA_CHARS ? b.captura : null,
        selecciones: (b.selecciones || []).map((s) => {
          const prob = C.leerNumero(s.prob_propia);
          return {
            partido: String(s.partido || '').trim(),
            liga: String(s.liga || '').trim(),
            fecha_partido: s.fecha_partido || '',
            mercado: s.mercado,
            seleccion: String(s.seleccion || '').trim(),
            linea: String(s.linea || '').trim(),
            cuota: C.redondear2(C.leerNumero(s.cuota)),
            prob_propia: s.prob_propia === '' || s.prob_propia == null ? null : prob,
            nota: String(s.nota || '').trim(),
          };
        }),
      };
    }

    /** Registra una apuesta nueva (siempre pendiente). Lanza ErrorReglas si alguna regla la rechaza. */
    async function registrarApuesta(borrador, ahora = reloj()) {
      const datos = await cargar();
      const b = normalizarBorrador(borrador);
      const evaluacion = R.evaluarApuesta(b, contexto(datos, ahora));
      if (!evaluacion.ok) throw new ErrorReglas(evaluacion.errores);

      // Casas y ligas: se usa la escritura de la lista si ya existe (p. ej. «laliga» → «LaLiga») y lo nuevo se guarda.
      const casas = catalogoDe(datos, 'casas');
      const ligas = catalogoDe(datos, 'ligas');
      const canonico = (lista, v) => lista.find((x) => plegar(x) === plegar(v)) || limpiar(v);
      b.casa = canonico(casas, b.casa);
      b.selecciones.forEach((s) => { s.liga = canonico(ligas, s.liga); });
      const casasNuevas = unirNombres(casas, [b.casa]);
      const ligasNuevas = unirNombres(ligas, b.selecciones.map((s) => s.liga));
      const itemsCatalogo = [];
      if (casasNuevas.length !== casas.length) itemsCatalogo.push(['ajustes', { clave: 'catalogo_casas', valor: casasNuevas }]);
      if (ligasNuevas.length !== ligas.length) itemsCatalogo.push(['ajustes', { clave: 'catalogo_ligas', valor: ligasNuevas }]);

      const id = uuid();
      const apuesta = {
        id, fecha_hora: ahora, casa: b.casa,
        tipo: b.selecciones.length === 1 ? 'simple' : 'doble',
        stake: b.stake,
        cuota_total: C.cuotaCombinada(b.selecciones.map((s) => s.cuota)),
        estado: 'pendiente', retorno: null, ganancia_neta: null,
        fuente: b.fuente, confianza: b.confianza, estado_emocional: b.estado_emocional,
        recuperando_perdida: b.recuperando_perdida, captura: b.captura ? id : null,
        mes: R.mesDe(ahora),
      };
      const selecciones = b.selecciones.map((s, i) => Object.assign({
        id: uuid(), apuesta_id: id, orden: i, cuota_cierre: null, resultado: null,
      }, s));
      await adaptador.guardar([
        ['apuestas', apuesta], ...selecciones.map((s) => ['selecciones', s]),
        ...(b.captura ? [['capturas', { id, data: b.captura }]] : []),
        ...itemsCatalogo,
      ]);
      return { apuesta, selecciones, avisos: evaluacion.avisos };
    }

    /**
     * Guarda la lista editada de casas o ligas (la que se ofrece al registrar).
     * No toca apuestas ya registradas: conservan el nombre con que se guardaron.
     */
    async function guardarCatalogo(tipo, lista, ahora = reloj()) {
      if (!TIPOS_CATALOGO.includes(tipo)) throw new Error('Lista desconocida.');
      const limpia = [];
      (lista || []).forEach((n) => {
        const nombre = limpiar(n);
        if (!nombre) return;
        if (nombre.length > MAX_LARGO_NOMBRE) throw new Error(`Cada nombre admite hasta ${MAX_LARGO_NOMBRE} caracteres.`);
        if (limpia.some((x) => plegar(x) === plegar(nombre))) throw new Error(`«${nombre}» está repetido en la lista.`);
        limpia.push(nombre);
      });
      if (limpia.length > MAX_ELEMENTOS_CATALOGO) throw new Error(`La lista admite hasta ${MAX_ELEMENTOS_CATALOGO} elementos.`);
      const datos = await cargar();
      const antes = catalogoDe(datos, tipo);
      const despues = ordenar(limpia);
      await adaptador.guardar([
        ['ajustes', { clave: `catalogo_${tipo}`, valor: despues }],
        entradaLog('catalogo', ahora, { lista: tipo, antes, despues }),
      ]);
      return despues;
    }

    /**
     * Liquida una apuesta pendiente. `resultados` (opcional): [{ id, resultado }] por selección.
     * ganada/perdida/anulada calculan el retorno solas; cashout exige `retorno`.
     */
    async function liquidar(id, { estado, retorno, resultados } = {}, ahora = reloj()) {
      const apuesta = await adaptador.obtener('apuestas', id);
      if (!apuesta) throw new Error('La apuesta no existe.');
      if (apuesta.estado !== 'pendiente') throw new Error('La apuesta ya está liquidada y no se puede cambiar.');
      if (!ESTADOS_LIQUIDACION.includes(estado)) throw new Error(`Estado de liquidación no válido: ${estado}.`);

      let cobro;
      if (estado === 'cashout') cobro = C.redondear2(C.leerNumero(retorno));
      else if (estado === 'ganada' && retorno != null && retorno !== '') cobro = C.redondear2(C.leerNumero(retorno));
      else cobro = C.retornoAutomatico(estado, apuesta.stake, apuesta.cuota_total);
      if (!Number.isFinite(cobro) || cobro < 0) throw new Error('El retorno debe ser un número igual o mayor que 0.');
      if (estado === 'ganada' && !(cobro > apuesta.stake)) throw new Error('Una apuesta ganada debe devolver más que el stake.');

      const todas = (await adaptador.todos('selecciones')).filter((s) => s.apuesta_id === id);
      const porId = new Map((resultados || []).map((r) => [r.id, r.resultado]));
      const actualizadas = todas.map((s) => {
        let r = porId.get(s.id);
        if (r === undefined) {
          if (estado === 'ganada') r = 'ganada';
          else if (estado === 'anulada') r = 'anulada';
          else if (estado === 'perdida' && todas.length === 1) r = 'perdida';
          else r = s.resultado;
        }
        if (r && !RESULTADOS.includes(r)) throw new Error(`Resultado no válido: ${r}.`);
        return Object.assign({}, s, { resultado: r || null });
      });

      const nueva = Object.assign({}, apuesta, {
        estado, retorno: cobro,
        ganancia_neta: C.gananciaNeta(estado, apuesta.stake, cobro),
        fecha_liquidacion: ahora,
      });
      await adaptador.guardar([
        ['apuestas', nueva],
        ...actualizadas.map((s) => ['selecciones', s]),
        entradaLog('liquidacion', ahora, { apuesta_id: id, despues: { estado, retorno: cobro } }),
      ]);
      return nueva;
    }

    /** Deshacer una liquidación reciente (toast "Deshacer"). Queda registrado en el log. */
    async function revertirLiquidacion(id, ahora = reloj()) {
      const apuesta = await adaptador.obtener('apuestas', id);
      if (!apuesta || apuesta.estado === 'pendiente') throw new Error('No hay liquidación que deshacer.');
      if (minutosEntre(apuesta.fecha_liquidacion, ahora) > VENTANA_DESHACER_MIN) {
        throw new Error(`Solo se puede deshacer dentro de ${VENTANA_DESHACER_MIN} minutos. Anota una corrección.`);
      }
      const todas = (await adaptador.todos('selecciones')).filter((s) => s.apuesta_id === id);
      const nueva = Object.assign({}, apuesta, { estado: 'pendiente', retorno: null, ganancia_neta: null, fecha_liquidacion: null });
      await adaptador.guardar([
        ['apuestas', nueva],
        ...todas.map((s) => ['selecciones', Object.assign({}, s, { resultado: null })]),
        entradaLog('liquidacion_revertida', ahora, { apuesta_id: id, antes: { estado: apuesta.estado, retorno: apuesta.retorno } }),
      ]);
      return nueva;
    }

    /** Solo `resultado` y `cuota_cierre` de una selección pueden cambiar; todo cambio queda en el log. */
    async function actualizarSeleccion(id, cambios, ahora = reloj()) {
      const sel = await adaptador.obtener('selecciones', id);
      if (!sel) throw new Error('La selección no existe.');
      for (const k of Object.keys(cambios)) {
        if (!CAMPOS_SELECCION_EDITABLES.includes(k)) {
          throw new Error(`El campo "${k}" no se puede editar: las selecciones registradas son inmutables. Anota una corrección.`);
        }
      }
      if ('resultado' in cambios && cambios.resultado !== null && !RESULTADOS.includes(cambios.resultado)) throw new Error('Resultado no válido.');
      if ('cuota_cierre' in cambios && cambios.cuota_cierre !== null) {
        const c = C.leerNumero(cambios.cuota_cierre);
        if (!(c > R.CUOTA_MINIMA_VALIDA)) throw new Error('La cuota de cierre debe ser mayor que 1.01.');
        cambios = Object.assign({}, cambios, { cuota_cierre: C.redondear2(c) });
      }
      const nueva = Object.assign({}, sel, cambios);
      const antes = {}; const despues = {};
      Object.keys(cambios).forEach((k) => { antes[k] = sel[k]; despues[k] = nueva[k]; });
      await adaptador.guardar([
        ['selecciones', nueva],
        entradaLog('seleccion', ahora, { apuesta_id: sel.apuesta_id, seleccion_id: id, antes, despues }),
      ]);
      return nueva;
    }

    /** Corrección de un dato inmutable: no toca la apuesta, solo deja constancia en `log_cambios`. */
    async function registrarCorreccion(apuestaId, { campo, valor_registrado, valor_correcto, motivo }, ahora = reloj()) {
      if (!(await adaptador.obtener('apuestas', apuestaId))) throw new Error('La apuesta no existe.');
      if (!String(campo || '').trim()) throw new Error('Indica qué dato se corrige.');
      if (!String(valor_correcto || '').trim()) throw new Error('Indica el valor correcto.');
      if (!String(motivo || '').trim()) throw new Error('Explica el motivo de la corrección.');
      const [almacen, entrada] = entradaLog('correccion', ahora, {
        apuesta_id: apuestaId, campo, antes: valor_registrado || '', despues: valor_correcto, motivo,
      });
      await adaptador.guardar([[almacen, entrada]]);
      return entrada;
    }

    /** Regla 8: los parámetros nuevos rigen desde el mes siguiente. */
    async function guardarConfig(params, ahora = reloj()) {
      const errores = R.validarConfig(params);
      if (errores.length) throw new Error(errores.join(' '));
      const siguiente = R.mesSiguiente(R.mesDe(ahora));
      const configs = await adaptador.todos('config');
      const previa = configs.find((c) => c.vigente_desde === siguiente);
      const entrada = {
        id: previa ? previa.id : uuid(), vigente_desde: siguiente, creada_en: ahora,
        banca_mensual: C.redondear2(C.leerNumero(params.banca_mensual)),
        stake_max_pct: C.leerNumero(params.stake_max_pct),
        perdida_max_pct: C.leerNumero(params.perdida_max_pct),
        max_selecciones: C.leerNumero(params.max_selecciones),
        cuota_min: C.redondear2(C.leerNumero(params.cuota_min)),
        max_apuestas_dia: C.leerNumero(params.max_apuestas_dia),
        perdidas_seguidas_pausa: C.leerNumero(params.perdidas_seguidas_pausa),
      };
      const antes = previa || R.configVigente(configs, siguiente);
      await adaptador.guardar([
        ['config', entrada],
        entradaLog('config', ahora, { vigente_desde: siguiente, antes, despues: entrada }),
      ]);
      return entrada;
    }

    async function leerOverrides() {
      const fila = await adaptador.obtener('ajustes', 'overrides');
      return fila ? fila.valor : [];
    }

    /** Levanta un bloqueo (con aviso previo en la interfaz) solo para el mes/día en curso. */
    async function levantarBloqueo(regla, ahora = reloj()) {
      if (!REGLAS_LEVANTABLES.includes(regla)) throw new Error('Esta regla no se puede levantar.');
      const periodo = regla === 'perdida_mensual' ? R.mesDe(ahora) : R.diaDe(ahora);
      const actuales = await leerOverrides();
      if (actuales.some((o) => o.regla === regla && o.periodo === periodo)) return;
      await adaptador.guardar([
        ['ajustes', { clave: 'overrides', valor: [...actuales, { regla, periodo, desde: ahora }] }],
        entradaLog('bloqueo_levantado', ahora, { regla, periodo }),
      ]);
    }

    async function reactivarBloqueo(regla, ahora = reloj()) {
      const periodo = regla === 'perdida_mensual' ? R.mesDe(ahora) : R.diaDe(ahora);
      const actuales = await leerOverrides();
      await adaptador.guardar([
        ['ajustes', { clave: 'overrides', valor: actuales.filter((o) => !(o.regla === regla && o.periodo === periodo)) }],
        entradaLog('bloqueo_reactivado', ahora, { regla, periodo }),
      ]);
    }

    async function registrarDeposito({ fecha, monto, metodo, tipo, motivo }, ahora = reloj()) {
      const m = C.redondear2(C.leerNumero(monto));
      if (!(m > 0)) throw new Error('El monto debe ser mayor que 0.');
      if (!['deposito', 'retiro'].includes(tipo)) throw new Error('El tipo debe ser depósito o retiro.');
      const d = { id: uuid(), fecha: fecha || ahora.slice(0, 10), monto: m, metodo: String(metodo || '').trim(), tipo, motivo: String(motivo || '').trim() };
      await adaptador.guardar([['depositos', d]]);
      return d;
    }

    async function obtenerCaptura(apuestaId) {
      const fila = await adaptador.obtener('capturas', apuestaId);
      return fila ? fila.data : null;
    }

    /** Solo ajustes de uso interno (p. ej. fecha de la última exportación). */
    async function guardarAjuste(clave, valor) {
      if (!AJUSTES_EDITABLES.includes(clave)) throw new Error(`El ajuste "${clave}" no se puede escribir.`);
      await adaptador.guardar([['ajustes', { clave, valor }]]);
    }

    // ---------- Copia de seguridad (JSON versionado) ----------

    /** Copia completa. Las selecciones van dentro de cada apuesta; no incluye los respaldos internos. */
    async function exportarCopia(ahora = reloj()) {
      const [config, apuestas, selecciones, depositos, log, ajustes, capturas] = await Promise.all(
        ['config', 'apuestas', 'selecciones', 'depositos', 'log_cambios', 'ajustes', 'capturas'].map((n) => adaptador.todos(n))
      );
      const aj = Object.fromEntries(ajustes.map((a) => [a.clave, a.valor]));
      const porApuesta = new Map();
      selecciones.forEach((s) => {
        if (!porApuesta.has(s.apuesta_id)) porApuesta.set(s.apuesta_id, []);
        porApuesta.get(s.apuesta_id).push(s);
      });
      return {
        aplicacion: 'registro-de-picks',
        version: VERSION_COPIA,
        exportado_en: ahora,
        config,
        apuestas: apuestas.map((a) => Object.assign({}, a, {
          selecciones: (porApuesta.get(a.id) || []).sort((x, y) => (x.orden || 0) - (y.orden || 0)),
        })),
        depositos,
        log_cambios: log,
        ajustes: {
          overrides: aj.overrides || [], cierres: aj.cierres || [],
          ...(Array.isArray(aj.catalogo_casas) ? { catalogo_casas: aj.catalogo_casas } : {}),
          ...(Array.isArray(aj.catalogo_ligas) ? { catalogo_ligas: aj.catalogo_ligas } : {}),
        },
        capturas,
      };
    }

    async function leerOverridesYCierres() {
      const [o, c] = await Promise.all([adaptador.obtener('ajustes', 'overrides'), adaptador.obtener('ajustes', 'cierres')]);
      return { overrides: o ? o.valor : [], cierres: c ? c.valor : [] };
    }

    /**
     * Importa una copia añadiendo solo lo que falta (idempotente por id).
     * Nunca pisa una apuesta ya registrada: los datos existentes ganan.
     */
    async function importarCopia(copia) {
      if (!copia || copia.aplicacion !== 'registro-de-picks') throw new Error('El archivo no es una copia de Registro de Picks.');
      if (!(copia.version >= 1 && copia.version <= VERSION_COPIA)) throw new Error('La copia es de una versión más nueva de la app. Actualiza la app e inténtalo de nuevo.');
      const lista = (x) => (Array.isArray(x) ? x : []);
      const existentes = {};
      for (const n of ['config', 'apuestas', 'selecciones', 'depositos', 'log_cambios', 'capturas']) {
        existentes[n] = new Set((await adaptador.todos(n)).map((o) => o.id));
      }
      const cuenta = { apuestas: 0, selecciones: 0, depositos: 0, config: 0, log: 0, capturas: 0, omitidas: 0 };
      const items = [];
      const poner = (almacen, obj, clave) => {
        if (!obj || !obj.id) return;
        if (existentes[almacen].has(obj.id)) { if (almacen === 'apuestas') cuenta.omitidas += 1; return; }
        existentes[almacen].add(obj.id);
        items.push([almacen, obj]);
        cuenta[clave] += 1;
      };
      lista(copia.config).forEach((c) => poner('config', c, 'config'));
      lista(copia.apuestas).forEach((a) => {
        const { selecciones, ...apuesta } = a;
        const nueva = !existentes.apuestas.has(apuesta.id);
        poner('apuestas', apuesta, 'apuestas');
        if (nueva) lista(selecciones).forEach((s) => poner('selecciones', s, 'selecciones'));
      });
      lista(copia.depositos).forEach((d) => poner('depositos', d, 'depositos'));
      lista(copia.log_cambios).forEach((l) => poner('log_cambios', l, 'log'));
      lista(copia.capturas).forEach((c) => poner('capturas', c, 'capturas'));

      // ajustes: se fusionan (bloqueos levantados y cierres mensuales)
      const aj = copia.ajustes || {};
      const actuales = await leerOverridesYCierres();
      const nuevosOverrides = lista(aj.overrides).filter((o) => !actuales.overrides.some((x) => x.regla === o.regla && x.periodo === o.periodo));
      if (nuevosOverrides.length) items.push(['ajustes', { clave: 'overrides', valor: [...actuales.overrides, ...nuevosOverrides] }]);
      const nuevosCierres = lista(aj.cierres).filter((c) => !actuales.cierres.some((x) => x.mes === c.mes));
      if (nuevosCierres.length) items.push(['ajustes', { clave: 'cierres', valor: [...actuales.cierres, ...nuevosCierres] }]);

      // listas de casas y ligas: se unen las de la app, las de la copia y los nombres de las apuestas importadas
      const antes = await cargar();
      const nombresImportados = {
        casas: lista(copia.apuestas).map((a) => a.casa),
        ligas: lista(copia.apuestas).flatMap((a) => lista(a.selecciones).map((s) => s.liga)),
      };
      TIPOS_CATALOGO.forEach((tipo) => {
        const actual = catalogoDe(antes, tipo);
        const unida = unirNombres(actual, [...lista(aj[`catalogo_${tipo}`]), ...nombresImportados[tipo]]);
        if (unida.length !== actual.length) items.push(['ajustes', { clave: `catalogo_${tipo}`, valor: unida }]);
      });

      if (items.length) await adaptador.guardar(items);
      return cuenta;
    }

    // ---------- Respaldo semanal automático (en el propio dispositivo) ----------

    const diasDesdeEpoca = (fecha) => Date.parse(`${String(fecha).slice(0, 10)}T00:00:00Z`) / 864e5;

    /** Cada 7 días guarda una copia con fecha en una de 4 ranuras rotativas. Devuelve null si no tocaba. */
    async function respaldarSiToca(ahora = reloj()) {
      const datos = await cargar();
      if (!datos.apuestas.length && !datos.depositos.length) return null;
      const hoy = ahora.slice(0, 10);
      const ranuras = Object.entries(datos.ajustes).filter(([k]) => k.startsWith('respaldo_'));
      const ultima = ranuras.map(([, v]) => v.fecha).sort().pop();
      if (ultima && diasDesdeEpoca(hoy) - diasDesdeEpoca(ultima) < DIAS_ENTRE_RESPALDOS) return null;
      const ranura = Math.floor(diasDesdeEpoca(hoy) / DIAS_ENTRE_RESPALDOS) % RANURAS_RESPALDO;
      const copia = await exportarCopia(ahora);
      await adaptador.guardar([['ajustes', { clave: `respaldo_${ranura}`, valor: { fecha: hoy, creado_en: ahora, copia } }]]);
      return { ranura, fecha: hoy };
    }

    async function listarRespaldos() {
      const datos = await cargar();
      return Object.entries(datos.ajustes).filter(([k]) => k.startsWith('respaldo_'))
        .map(([k, v]) => ({ ranura: k, fecha: v.fecha, creado_en: v.creado_en, apuestas: v.copia.apuestas.length, copia: v.copia }))
        .sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
    }

    // ---------- Cierre mensual ----------

    /** Guarda el resumen del mes (inmutable). No se puede cerrar un mes futuro ni cerrarlo dos veces. */
    async function cerrarMes(mes, resumen, ahora = reloj()) {
      if (!/^\d{4}-\d{2}$/.test(mes)) throw new Error('Mes no válido.');
      if (mes > R.mesDe(ahora)) throw new Error('No se puede cerrar un mes que aún no empieza.');
      const { cierres } = await leerOverridesYCierres();
      if (cierres.some((c) => c.mes === mes)) throw new Error('Ese mes ya está cerrado.');
      const entrada = { mes, cerrado_en: ahora, resumen };
      await adaptador.guardar([
        ['ajustes', { clave: 'cierres', valor: [...cierres, entrada] }],
        entradaLog('cierre_mes', ahora, { mes }),
      ]);
      return entrada;
    }

    return {
      guardarCatalogo, obtenerCaptura, guardarAjuste, exportarCopia, importarCopia, respaldarSiToca, listarRespaldos, cerrarMes,
      cargar, contexto, asegurarConfig, registrarApuesta, liquidar, revertirLiquidacion,
      actualizarSeleccion, registrarCorreccion, guardarConfig, levantarBloqueo, reactivarBloqueo,
      registrarDeposito,
    };
  }

  return { crear, adaptadorMemoria, adaptadorIDB, ahoraLocal, ErrorReglas, ALMACENES, catalogoDe, plegar };
});
