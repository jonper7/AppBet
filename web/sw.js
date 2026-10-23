/* Service worker: precarga todo y sirve sin conexión.
   IMPORTANTE: sube el número de VERSION en cada cambio de archivos para que los teléfonos se actualicen. */
const VERSION = 'picks-v11';
const ARCHIVOS = [
  './', 'index.html', 'manifest.json',
  'css/estilos.css',
  'js/config.js', 'js/calculos.js', 'js/reglas.js', 'js/reportes.js', 'js/datos.js', 'js/datos_demo.js', 'js/exportar.js', 'js/nucleo.js', 'js/dialogos.js', 'js/graficas.js',
  'js/liquidar.js', 'js/hoja_apuesta.js', 'js/hoja_detalle.js',
  'js/vista_inicio.js', 'js/vista_apuestas.js', 'js/vista_analisis.js', 'js/vista_banca.js', 'js/vista_ajustes.js', 'js/main.js',
  'iconos/icono-192.png', 'iconos/icono-512.png', 'iconos/icono-maskable-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((claves) => Promise.all(claves.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || fetch(e.request).then((r) => {
      if (r.ok) { const copia = r.clone(); caches.open(VERSION).then((c) => c.put(e.request, copia)); }
      return r;
    }).catch(() => (e.request.mode === 'navigate' ? caches.match('index.html') : Response.error())))
  );
});
