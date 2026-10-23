# Guía de diseño y arquitectura — «Finanzas» (base para nuevas apps)

Documento para replicar el estilo y la forma de trabajar de la app **Finanzas** en otra app. Describe qué se ve, cómo se mueve, cómo está construida y qué reglas seguir. Al final hay una lista de comprobación y un *prompt* listo para pegar.

---

## 1. Concepto

App **solo para el teléfono**, instalable (PWA, empaquetada como APK/TWA), que funciona **sin conexión** y guarda los datos **en el propio dispositivo**. No hay servidor ni cuentas. La seguridad de los datos se resuelve con copias JSON manuales (menú compartir → Drive).

Sensación buscada: una app nativa de iOS de noche. Superficies de cristal esmerilado sobre un fondo casi negro con luz de colores, textos grandes y apretados, movimiento con rebote suave, y gestos táctiles (deslizar, tocar para ver detalle).

Principios:

1. **Cristal y profundidad.** Las superficies son translúcidas, con borde superior más claro (luz arriba) y sombra suave.
2. **Cifras como protagonistas.** El dato importante va en grande, con peso 700–800 y tracking negativo.
3. **Movimiento físico.** Resortes con ligero rebote, nunca animaciones lineales; todo es interrumpible.
4. **Un toque, un resultado.** Las acciones frecuentes se hacen con un toque y siempre se pueden deshacer.
5. **Restricción.** Un solo acento de color por significado (verde = positivo, rojo = negativo, cian = acento/acción).
6. **Respeto al sistema.** Reduce movimiento, transparencia y contraste alto se obedecen.

---

## 2. Stack y estructura

- **Sin build.** HTML + CSS + JavaScript vanilla. Los módulos son objetos globales cargados en orden con `<script>`.
- **Datos:** IndexedDB (`DATOS`). Nada de `localStorage` para datos importantes.
- **Gráficas:** SVG hecho a mano (sin librerías).
- **Offline:** service worker con caché versionada (`finanzas-vN`; se sube el número en cada cambio).
- **Publicación:** GitHub Pages por Actions. **Empaquetado:** TWA (Bubblewrap) → APK.
- **Fuentes:** Plus Jakarta Sans (por Google Fonts, solo como respaldo) y la tipografía del sistema como principal.

```
web/
├── index.html            # todas las pestañas, barra inferior, hoja de formulario, hoja de diálogo
├── manifest.json
├── sw.js                 # caché + lista de archivos a precargar
├── iconos/               # 192, 512 y recortable (maskable)
├── css/estilos.css       # capas: base → tema cristal → componentes → estructura por pestañas
└── js/
    ├── config.js         # constantes
    ├── datos.js          # IndexedDB: movimientos, catálogos, ajustes
    ├── copia.js          # exportar/importar JSON versionado
    ├── inteligencia.js   # cálculos (proyección, recurrentes, detección)
    ├── resumen.js        # gráficas SVG y tarjetas (compartido)
    ├── nucleo.js         # espacio APP: estado, helpers, router por hash, refrescar()
    ├── dialogos.js       # DIALOGO: formulario(), confirmar()
    ├── hoja_mov.js       # hoja inferior para crear/editar
    ├── vista_*.js        # un archivo por pestaña
    └── main.js           # arranque
```

Convenciones:

- Un espacio global por módulo en mayúsculas (`APP`, `DATOS`, `DIALOGO`, `COPIA`, `RESUMEN`, `FIJOS`…).
- `APP.estado` es el único estado en memoria; `APP.refrescar()` recarga datos y repinta la pestaña activa.
- Router por `location.hash` con delegación de eventos en `.tabbar__tab`, `[data-ir]`.
- Todo texto de interfaz en español; nombres de clases y funciones también.

---

## 3. Tokens de diseño

### 3.1 Color

| Token | Valor | Uso |
|---|---|---|
| `--fondo` | `#05060d` | Fondo de la app |
| `--superficie` | `rgba(255,255,255,.055)` | Relleno base de tarjetas |
| `--superficie-2` | `rgba(255,255,255,.09)` | Campos, botones secundarios |
| `--borde` | `rgba(255,255,255,.09)` | Contorno de superficies |
| `--borde-fuerte` | `rgba(255,255,255,.22)` | Foco, separadores marcados |
| `--texto` | `#f5f7fb` | Texto principal |
| `--texto-medio` | `#c3cbdc` | Secundario |
| `--texto-suave` | `#8993ab` | Etiquetas, metadatos |
| `--verde` | `#30e8a0` | Ingreso, éxito, positivo |
| `--rojo` | `#ff5a73` | Gasto, peligro, negativo |
| `--cian` | `#4cc9ff` | Acento, foco, selección |
| `--morado` | `#b98cff` | Acento secundario (degradados) |
| ámbar | `#ffd23f` | Aviso intermedio (75–99%) |

Versiones translúcidas para fondos de estado: `--verde-2`, `--rojo-2`, `--cian-2` a `.14` de opacidad.

**Paleta de series** (donut, líneas, leyendas), en orden:
`#00ff88 #00c8ff #b060ff #ffd700 #ff4560 #ff8c42 #4dd0e1 #a3e635 #f472b6 #818cf8`

**Degradado de acción** (botón principal, FAB, mini-botón principal): `linear-gradient(145deg, #5af0b4, #2bb8ff)` con texto `#04121a`.

**Fondo «aurora»** (fijo, detrás de todo, sin animar):

```css
body::before {
  content: ""; position: fixed; inset: 0; z-index: 0; pointer-events: none;
  background:
    radial-gradient(60% 40% at 8% 0%,    rgba(48,232,160,.22), transparent 70%),
    radial-gradient(55% 40% at 100% 8%,  rgba(76,201,255,.20), transparent 70%),
    radial-gradient(70% 45% at 50% 105%, rgba(185,140,255,.22), transparent 70%);
}
```

### 3.2 Tipografía

```css
--display:       -apple-system, "SF Pro Display", "Plus Jakarta Sans", system-ui, "Segoe UI", Roboto, sans-serif;
--texto-fuente:  -apple-system, "SF Pro Text",    "Plus Jakarta Sans", system-ui, "Segoe UI", Roboto, sans-serif;
--cifra:         ui-rounded, "SF Pro Rounded",    "Plus Jakarta Sans", system-ui, "Segoe UI", Roboto, sans-serif;
```

Reglas (óptica de tamaño: cuanto más grande, más apretado):

| Elemento | Tamaño | Peso | Tracking |
|---|---|---|---|
| Título de pestaña (`.vista__titulo`) | 2.1rem | 800 | −.045em |
| Cifra hero | 3.4rem | 800 | −.055em, `tabular-nums` |
| Cifra de tarjeta | 1.45–1.75rem | 700 | −.035em |
| Título de bloque | 1.2rem | 700 | −.03em |
| Texto normal | 1rem | 400–600 | −.005em |
| Etiqueta superior (`.vista__sup`) | .7rem | 700 | +.12em, MAYÚSCULAS |
| Etiqueta de campo / dato | .66–.72rem | 600 | +.05em |
| Meta / nota | .72–.82rem | 400–600 | normal, `--texto-suave` |

Las **cifras** usan `--cifra` (redondeada) y siempre `font-variant-numeric: tabular-nums` donde se comparan.

### 3.3 Forma, espacio y sombra

- Radios: tarjeta/bloque **26px**, hero **32px**, fila/ficha de lista **20–24px**, mini-tarjetas **16–18px**, campos **14px**, botones y fichas **999px** (pastilla).
- Espaciado base 4/8; padding de bloque 22px; separación entre bloques 18px; márgenes laterales de pestaña 18px; ancho máximo 600px centrado.
- Sombra de cristal: `0 18px 40px -18px rgba(0,0,0,.75), inset 0 1px 0 rgba(255,255,255,.14)`.
- Resplandor de color bajo tarjetas de estado: `0 0 40px -22px <color>`.

### 3.4 Movimiento

```css
--resorte: cubic-bezier(.3, 1.45, .5, 1);   /* con rebote: pulsar, abrir hojas, indicador */
--suave:   cubic-bezier(.22, 1, .36, 1);    /* entradas, cambios de relleno */
```

- Pulsar cualquier control: `transform: scale(.94–.97)` con `transition-duration: .08s` (rápido al bajar, resorte al soltar).
- Entrada de pestaña: `opacity 0→1`, `translateY(14px)→0`, `.5s var(--suave)`.
- Hoja inferior: sube desde `translateY(100%)` en `.5s var(--resorte)`.
- Barras de progreso: crecen `.6–.7s var(--suave)`.
- Líneas de gráfica: se dibujan con `stroke-dashoffset` en 1.1s.
- Cifras grandes: contador animado hasta el valor (`APP.contar`).

---

## 4. Materiales (la receta del cristal)

Toda superficie flotante lleva: degradado blanco translúcido, borde con **luz arriba**, `backdrop-filter` y sombra interna superior.

```css
:root {
  --cristal: linear-gradient(160deg, rgba(255,255,255,.10), rgba(255,255,255,.035));
  --sombra:  0 18px 40px -18px rgba(0,0,0,.75), inset 0 1px 0 rgba(255,255,255,.14);
}
.bloque, .tarjeta, .mov, .fijo {
  background: var(--cristal);
  border: 1px solid var(--borde);
  border-top-color: rgba(255,255,255,.2);          /* luz arriba */
  box-shadow: var(--sombra);
  -webkit-backdrop-filter: blur(26px) saturate(170%);
  backdrop-filter: blur(26px) saturate(170%);
}
```

Grosores de material:

| Capa | Blur | Fondo |
|---|---|---|
| Tarjeta / bloque | 26px, saturate 170% | `--cristal` |
| Barra inferior | 30px, saturate 190% | `rgba(16,20,34,.72)` |
| Hoja de formulario | 40px, saturate 180% | `linear-gradient(170deg, rgba(34,40,60,.82), rgba(14,17,28,.9))` |
| Velo detrás de hojas | 10px | `rgba(2,3,8,.6)` |
| Tooltip / aviso | 20–22px | `rgba(24,28,44,.78–.85)` |

**Hero** (tarjeta protagonista, una por pantalla): fondo con dos halos de color y base azul noche, borde claro, sombra con color.

```css
.hero {
  border-radius: 32px; padding: 24px 22px 18px;
  background:
    radial-gradient(120% 120% at 0% 0%,   rgba(76,201,255,.55), transparent 55%),
    radial-gradient(110% 130% at 100% 100%, rgba(185,140,255,.5), transparent 60%),
    linear-gradient(160deg, #101a36, #0c1022);
  border: 1px solid rgba(255,255,255,.14); border-top-color: rgba(255,255,255,.3);
  box-shadow: 0 24px 50px -20px rgba(76,201,255,.45), inset 0 1px 0 rgba(255,255,255,.2);
}
```

Cifra con degradado de texto (variante de balance): `linear-gradient(120deg, #fff 10%, var(--cian) 60%, var(--verde))` con `background-clip: text`; en negativo, `#fff → var(--rojo)`.

---

## 5. Estructura de pantallas

### 5.1 Esqueleto

- `main.vista` por pestaña (solo una visible), `padding-bottom: calc(150px + env(safe-area-inset-bottom))` para no quedar tapado por la barra.
- Cabecera de pestaña (`.vista__cab`): etiqueta pequeña en mayúsculas encima + título grande; a la derecha, selector de mes en pastilla si aplica.
- **Barra inferior flotante** de 5 pestañas, separada 12px del borde, esquinas 28px, con un **indicador deslizante** que se mueve con resorte (`--indice` × 100%) y el icono activo en cian, ligeramente más grande.
- **Botón flotante (FAB)** circular 62px con el degradado de acción, encima de la barra, a la derecha.

### 5.2 Pestañas de Finanzas (plantilla a adaptar)

| Pestaña | Contenido |
|---|---|
| **Inicio** | Hero con balance + minigráfica acumulada vs. mes anterior; dos tarjetas (ingresos / gastos); avisos accionables; donut por categoría con desglose por subcategoría al tocar; proyección del mes; alertas de presupuesto |
| **Movimientos** | Fichas de año y mes (+ «Todo {año}»), filtro segmentado de tipo, calendario de calor plegable, línea de resumen, lista agrupada por día con filas deslizables |
| **Análisis** | Comparativa con el mes anterior, tendencia de 12 meses con cursor, año contra año (líneas + tabla), top de gastos |
| **Planificar** | Segmentos «Fijos / Presupuestos»; lista de fijos con registrar a un toque; sugeridos detectados; topes por categoría con barras |
| **Ajustes** | Estado de la copia, exportar/importar, CRUD de categorías (acordeón) y medios, unir subcategorías |

Para otra app: conservar **5 pestañas máximo**, la primera = resumen con un hero, la segunda = lista con filtros, una de análisis/gráficas, una de planificación/automatización y la última de ajustes + copia.

---

## 6. Componentes

### 6.1 Controles

- **Botón principal:** pastilla, degradado de acción, texto oscuro, sombra azul; `:active` → `scale(.96)`.
- **Secundario:** `rgba(255,255,255,.09)` con borde. **Peligro:** borde rojo transparente / lleno `#ff6a82 → #ff3b5c`.
- **Mini-botón (`.mini`):** 8×15px, .78rem, 700. Variantes: `--principal`, `--suave`, `--ok` (verde translúcido, sin acción).
- **Control segmentado (`.filtros`, `.segmentos`):** contenedor pastilla translúcido; la opción activa es **blanca** con texto `#0a0d18`.
- **Fichas (`.ficha`):** pastillas desplazables en horizontal, sin barra de scroll; activa = blanca; las de año en cian translúcido; vacías al 42% de opacidad.
- **Campos:** fondo `rgba(255,255,255,.07)`, radio 14px, foco con borde cian y anillo `0 0 0 4px rgba(76,201,255,.2)`; etiqueta pequeña encima.
- **Interruptor:** 42×26px, apagado `rgba(255,255,255,.14)`, encendido verde, la bolita se mueve con resorte.
- **Icono-botón (`.icono`):** círculo 36px transparente, hover claro; variante peligro con fondo rojo translúcido.

### 6.2 Hojas y diálogos

- **Hoja inferior** para crear/editar: asa de 40px arriba, radio 30px arriba, material grueso, cierra tocando el velo.
- **Diálogo** (`DIALOGO.formulario` / `confirmar`): misma hoja, por encima (z-index 50/51), con título, mensaje, campos generados (`texto`, `monto`, `numero`, `select` con grupos), errores en línea, botón peligro opcional y `extra`. Siempre devuelve una promesa.
- **Aviso (toast):** pastilla de cristal abajo con texto y acción «Deshacer» en cian.

### 6.3 Listas

- **Fila de movimiento (`.mov`):** barra de color de 4px a la izquierda, concepto (600), meta pequeña, monto a la derecha en rojo/verde.
- **Fila deslizable:** fondo celeste a la derecha = **editar**, rojo a la izquierda = **borrar**; umbral 96px, con *rubber-band* (resistencia progresiva) y proyección por velocidad al soltar; al confirmar borrado, la fila se pliega en 0.3s y aparece «Deshacer».
- **Fijo:** icono-cuadrado con el día del mes (degradado cian/morado), nombre, meta, monto y, debajo, `Registrar` (un toque) o `✓ Registrado`. Pausados al 55% de opacidad y al final.
- **Categoría (acordeón):** cabecera con flecha que gira 90°, nombre, contador, iconos editar/eliminar; dentro, subcategorías y un botón de borde discontinuo «+ Añadir».
- **Tira de aviso (`.tira`):** tarjeta de cristal con título y dos botones (sí / ahora no) o *chips* de acciones rápidas.

### 6.4 Gráficas (SVG propio)

- **Donut:** arcos con paleta; al tocar un arco o ítem de leyenda, se engrosa (stroke 20), brilla (`drop-shadow`), el resto baja al 45% y aparece un **desglose** con barras por subcategoría.
- **Líneas suaves:** curvas Catmull-Rom, área bajo la línea con degradado blanco → transparente, rejilla punteada (`2 5`), eje en .59rem, **cursor vertical** con puntos y **tooltip de cristal** que sigue el dedo (`touch-action: pan-y`).
- **Mapa de calor / calendario:** rejilla 7 columnas, celda con `color-mix` hacia rojo según nivel `--nivel` (0–1), brillo proporcional, hoy con borde cian, activa con `scale(1.14)`; escala degradada debajo; toca un día para filtrar o ver detalle.
- **Barras de progreso:** riel 8–10px redondo; verde < 75%, ámbar 75–99%, rojo ≥ 100%; marca blanca de 2px para el «hoy esperado».
- **Mini-sparkline** dentro del hero: 64px de alto, acumulado actual vs. periodo anterior.

---

## 7. Interacciones y patrones de UX

1. **Registrar con un toque** lo recurrente, con *Deshacer* inmediato (≈5 s).
2. **Nada se borra sin salida:** borrar = confirmar o deshacer; eliminar una categoría ofrece **reasignar** sus datos.
3. **Filtros persistentes y visibles:** año → mes → tipo → día, siempre en el mismo orden, con resumen de resultados debajo.
4. **Detalle por toque, no por pantalla nueva:** donut, calendario y gráficas despliegan información en el mismo bloque.
5. **Avisos útiles y descartables:** recordatorio de copia (≥10 registros y 7 días sin respaldo, aplazable 1 día), fijos pendientes como *chips*, alertas de presupuesto ≥75%.
6. **Detección tolerante** (fijos pagados): mismo tipo + subcategoría y nombre parecido, o sin descripción y monto ±20%.
7. **Proyección prudente:** ritmo diario mezclado, fijos definidos aparte y descarte de gastos atípicos (> 3× el percentil 90).
8. **Mensajes humanos:** frases cortas en español, con cifras en negrita; los errores explican qué hacer.

---

## 8. Datos y copia de seguridad

**IndexedDB `DATOS`**, tres almacenes:

- `movimientos` (clave `uuid`, índice `fecha`).
- `catalogos` (categorías, subcategorías, medios; ids numéricos consecutivos).
- `ajustes` (clave/valor: presupuestos, fijos, última copia, avisos, etc.).

**Copia JSON versionada** (`aplicacion`, `version`, `exportado_en`):

- Guarda **nombres, no ids** (categoría, subcategoría, medio), así sirve en cualquier dispositivo y se lee a simple vista.
- Importar es **idempotente** por `uuid` (importar dos veces no duplica) y crea lo que falte por nombre.
- Modo «añadir» o «reemplazar»; las copias antiguas (v1) siguen importando.
- Exportar usa `navigator.share({ files })` → menú de compartir de Android → Drive. Si no hay soporte: archivo `application/json`, luego `text/plain`, luego descarga y diálogo explicativo. `AbortError` = canceló (no cuenta como copia hecha).
- Una web no puede fijar una carpeta de destino; alternativas: compartir cada vez, descargar y sincronizar con una app de carpetas, o API de Drive con OAuth (más trabajo).

---

## 9. PWA / Android

- `manifest.json`: `display: standalone`, `orientation: portrait`, `theme_color`/`background_color` oscuros, iconos 192, 512 y **maskable**.
- `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`, `theme-color #05060d`, metas Apple (`black-translucent`).
- Respetar `env(safe-area-inset-top/bottom)` en cabecera y barra.
- **Service worker:** precarga la lista completa de archivos; **subir el número de caché en cada despliegue**; registrar con recarga en `controllerchange`.
- **TWA sin barra de dirección:** requiere `/.well-known/assetlinks.json` en la **raíz del dominio** (`https://<usuario>.github.io/.well-known/assetlinks.json`) → repo `<usuario>.github.io` con ese archivo y un `.nojekyll`. Debe contener el paquete y la huella SHA-256 del keystore. **Respaldar el keystore:** sin él no se puede actualizar la app.
- Tras instalar el APK por primera vez, abrir con internet para que Android verifique el enlace.

---

## 10. Accesibilidad

```css
@media (prefers-reduced-motion: reduce) {
  .lineas__trazo { stroke-dashoffset: 0; animation: none; }
  .hoja { animation: fundido .2s ease both; }
  .tabbar__indicador { transition: none; }
}
@media (prefers-reduced-transparency: reduce) {
  .bloque, .tarjeta, .mov, .hoja, .tooltip, .tabbar {
    -webkit-backdrop-filter: none; backdrop-filter: none; background: #121726;
  }
}
@media (prefers-contrast: more) {
  :root { --borde: rgba(255,255,255,.35); --texto-suave: #b4bdd2; }
}
```

- Objetivos táctiles ≥ 36px (iconos) y ≥ 44px en acciones principales.
- Texto sobre blanco (fichas activas) siempre `#0a0d18`.
- Color nunca es la única señal: además hay signo, icono o texto.
- `-webkit-tap-highlight-color: transparent` en controles propios.

---

## 11. Cómo montar la nueva app (orden recomendado)

1. Copiar `css/estilos.css` (tokens, cristal, tabbar, hero, fichas, segmentos, hojas, diálogos, deslizable, avisos) y reemplazar solo **textos y datos**.
2. Definir el **modelo de datos** de la nueva app (equivalente a movimientos + catálogos + ajustes) en `datos.js` y la copia en `copia.js` (versionada, por nombres).
3. Copiar `nucleo.js` (APP, router, estado), `dialogos.js` y `hoja_mov.js` casi sin cambios.
4. Crear un `vista_*.js` por pestaña, empezando por **Inicio (hero + 2 tarjetas)** y la **lista con filtros**.
5. Reutilizar de `resumen.js` solo las gráficas que apliquen (donut, líneas, calendario, barras).
6. Añadir lo que aporte valor propio: *registrar con un toque*, avisos accionables, detección automática.
7. PWA: manifest, iconos, `sw.js` con la lista de archivos; probar offline.
8. Publicar en Pages; si va a ser APK, preparar `assetlinks.json` y guardar el keystore.

Lista de comprobación antes de dar por buena una pantalla:

- [ ] ¿Hay un único elemento protagonista (hero o cifra grande)?
- [ ] ¿Cada superficie tiene luz arriba, blur y sombra?
- [ ] ¿Todo control reacciona al toque (`scale`) y suelta con resorte?
- [ ] ¿Las acciones destructivas tienen deshacer o confirmación?
- [ ] ¿Se ve bien con `prefers-reduced-motion` y `reduced-transparency`?
- [ ] ¿Respeta las zonas seguras (muesca y barra de gestos)?
- [ ] ¿Funciona sin conexión tras la primera carga?
- [ ] ¿Se subió la versión de caché del service worker?

---

## 12. Prompt de arranque — app de registro de apuestas

Pegar tal cual en el proyecto nuevo (con `DISENO_APP.md` dentro de la carpeta):

> Quiero crear una app nueva para **registrar mis apuestas** con el **mismo estilo y arquitectura** que «Finanzas» (ver `DISENO_APP.md`). Es una PWA solo para el teléfono, vanilla JS sin build, IndexedDB, gráficas SVG a mano, service worker, copia JSON por el menú compartir y empaquetado posterior como APK/TWA. No hay servidor ni cuentas.
>
> **Qué registra:** cada apuesta con fecha y hora, casa de apuestas, deporte, liga/competición, evento (local vs. visitante o descripción), mercado (1X2, más/menos, hándicap, jugador…), selección, **tipo** (simple, combinada, sistema), cuota, importe apostado (stake), estado (**pendiente, ganada, perdida, nula/devuelta, cashout**), importe cobrado, comentario y etiqueta opcional (tipster, estrategia). Las combinadas tienen varias patas, cada una con su propio resultado.
>
> **Entidades:** apuestas (uuid), patas de combinada, catálogos editables (casas, deportes, ligas, mercados, estrategias) y ajustes (bankroll inicial, unidad de apuesta, límites, última copia). Copia JSON versionada con **nombres, no ids**, importación idempotente por uuid, igual que Finanzas.
>
> **Las 5 pestañas:**
> 1. **Inicio:** hero con el **beneficio neto del periodo**; tarjetas de *apostado* y *ROI/yield*; bankroll actual; apuestas pendientes con acción rápida «Resolver»; racha actual y % de acierto; aviso de copia.
> 2. **Apuestas:** fichas de año y mes, filtro segmentado (todas / pendientes / ganadas / perdidas), filtros por casa, deporte y estrategia, calendario de calor con el resultado diario, lista agrupada por día con filas deslizables (editar / borrar con deshacer).
> 3. **Análisis:** evolución del bankroll (línea con cursor y tooltip), beneficio mensual, ROI y yield por deporte, liga, casa, mercado y rango de cuotas (donut + barras), % de acierto vs. % esperado según la cuota, mejor y peor racha, año contra año.
> 4. **Planificar:** gestión del bankroll (unidad, stake sugerido en % o Kelly fraccionado), límites mensuales de pérdida y de apostado con barras de alerta (verde, ámbar, rojo), objetivos del mes.
> 5. **Ajustes:** catálogos con editar, borrar y reasignar, unir elementos, exportar/importar la copia, importar CSV.
>
> **Acción de un toque:** resolver una apuesta pendiente (ganada / perdida / nula) con un toque, calculando el cobro automáticamente a partir de stake × cuota, con «Deshacer» inmediato. El formulario calcula en vivo ganancia potencial y probabilidad implícita.
>
> **Cálculos a validar con pruebas:** beneficio = cobrado − apostado; yield = beneficio / apostado; ROI sobre bankroll inicial; cuota combinada = producto de las cuotas de las patas; las nulas devuelven el stake y en una combinada la pata nula cuenta como cuota 1.00; cashout cuenta como cobro parcial.
>
> **Responsabilidad:** que la app sea una herramienta de control, no de incentivo. Incluir límites propios de pérdida y apostado, aviso al acercarse o superarlos, y un resumen honesto con el balance real, sin mensajes que animen a apostar más.
>
> Reutiliza los tokens, materiales de cristal, barra inferior con indicador, hojas, diálogos, filas deslizables, donut y líneas con tooltip. Verde = ganada, rojo = perdida, ámbar = pendiente, gris = nula. **Primero propón un plan por fases y espera mi confirmación antes de programar.**

### Adaptación del vocabulario de Finanzas

| Finanzas | Apuestas |
|---|---|
| Movimiento | Apuesta |
| Ingreso / Gasto | Ganada / Perdida (+ pendiente, nula, cashout) |
| Monto | Stake (apostado) y cobrado |
| Categoría / Subcategoría | Deporte / Liga |
| Medio de pago | Casa de apuestas |
| Balance del mes | Beneficio neto del mes |
| Gasto fijo (registrar a un toque) | Apuesta pendiente (resolver a un toque) |
| Presupuesto por categoría | Límite de apostado/pérdida |
| Proyección del mes | Proyección de beneficio al ritmo actual |
| Recurrentes detectados | Estrategias o tipsters detectados |
| Mapa de calor de gasto diario | Mapa de calor del resultado diario (verde/rojo) |
