/* main.js — arranque: base de datos, primera ejecución, router y service worker. */
(async function iniciar() {
  try {
    // ?demo: datos de ejemplo solo en memoria (no toca los datos reales)
    APP.demo = new URLSearchParams(location.search).has('demo');
    const adaptador = APP.demo ? DATOS.adaptadorMemoria() : DATOS.adaptadorIDB();
    APP.db = DATOS.crear(adaptador);
    if (APP.demo) {
      await DEMO.sembrar(adaptador, DATOS.ahoraLocal());
      document.getElementById('banner-demo').hidden = false;
      document.body.classList.add('demo');
    } else {
      await APP.db.asegurarConfig();
      await APP.db.respaldarSiToca().catch(() => null); // respaldo semanal automático
    }
    await APP.refrescar();
  } catch (e) {
    document.body.insertAdjacentHTML('afterbegin',
      `<div class="vista activa" style="padding-top:60px"><div class="mensajes">${APP.mensaje('error', `No se pudo abrir la base de datos del navegador. ${APP.esc(e.message || e)}`)}</div></div>`);
    return;
  }

  window.addEventListener('hashchange', APP.alCambiarHash);
  APP.alCambiarHash();

  // Al volver a la app (p. ej. otro día) se recalculan hoy, mes y límites.
  document.addEventListener('visibilitychange', () => { if (!document.hidden) APP.refrescar(); });

  // Pide almacenamiento persistente para que el sistema no borre los datos por falta de espacio.
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

  if ('serviceWorker' in navigator) {
    let recargado = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (recargado || !sessionStorage.getItem('sw-previo')) return;
      recargado = true;
      location.reload();
    });
    navigator.serviceWorker.register('sw.js').then(() => {
      if (navigator.serviceWorker.controller) sessionStorage.setItem('sw-previo', '1');
    }).catch(() => {});
  }
})();
