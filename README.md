# Registro de Picks

App para **registrar y auditar tus apuestas deportivas a mano**, con reglas de control que te protegen de ti mismo.
Es una PWA solo para el teléfono: HTML + CSS + JavaScript sin build, datos en el propio dispositivo (IndexedDB), funciona sin conexión. **No hay servidor, ni cuentas, ni conexión con casas de apuestas**: el registro es manual a propósito.

> Estado: **Fase 1 (MVP) y fase 2 terminadas.**

## Qué hace

- **Parámetros** editables solo para el mes siguiente (banca 100, stake máx. 10 %, pérdida máx. 30 %, 2 selecciones, cuota mínima 2,00, 2 apuestas/día).
- **Registrar** una apuesta simple o doble, con cuota total, retorno, probabilidad implícita y EV calculados en vivo, avisos de reglas y confirmación antes de guardar.
  - **El stake se calcula solo** (nunca más que el stake máximo): si pones tu probabilidad propia y hay ventaja (EV > 0), usa **¼ Kelly** sobre la banca actual; si no, usa **confianza/5 × stake máximo**. Puedes escribir otro valor a mano y volver al automático con un toque.
- **Liquidar** a un toque (ganada / perdida / anulada, con «Deshacer»), cashout (pide el retorno) y doble «por selección».
- **Inicio**: banca actual, pérdida del mes frente al límite (barra), stake máximo de hoy, apuestas de hoy, racha, yield, acierto, drawdown y semáforo de reglas.
- **Apuestas**: historial filtrable por mes, estado, mercado, liga y casa, con exportación a CSV y detalle de cada apuesta.
- **Análisis**: yield, ROI sobre la banca, acierto, drawdown, **EV medio** (con ganancia esperada frente a la real) y **CLV medio**; curva de saldo con cursor; desgloses por **mercado, liga, casa, fuente, estado emocional y tipo**; y **calibración** (Brier y curva por tramos de 10 puntos), que solo se calcula con **100 o más selecciones liquidadas** con probabilidad propia; si no, muestra «muestra insuficiente (<100)».
- **Banca**: depósitos y retiros con el total del mes y **cierre mensual** (resumen guardado e inmutable, reinicio de banca para el mes siguiente y exportación a CSV).
- **Ajustes**: parámetros del mes siguiente, bloqueos levantados, registro de cambios, **copia de seguridad JSON** (exportar / importar), **respaldos semanales automáticos** y modo demo.
- **Detalle de cada apuesta**: cuota de cierre por selección (para el CLV), captura opcional del boleto y correcciones anotadas en `log_cambios`.

## Reglas (`web/js/reglas.js`)

| # | Regla | Efecto |
|---|---|---|
| 1 | La pérdida neta del mes llega al límite (30 % de la banca inicial) | **Bloquea** el registro hasta el mes siguiente. Se puede **levantar con un aviso** explícito (solo ese mes); queda en el registro de cambios y se puede reactivar en Ajustes |
| 2 | Stake mayor al 10 % de la banca inicial | **Rechaza** |
| 3 | Subir el stake respecto a la apuesta anterior si esa fue perdida | Aviso |
| 4 | Combinada: máx. 2 selecciones, de partidos distintos, cuota total ≥ 2,00 | **Rechaza** |
| 5 | Depósitos del mes por encima de la banca mensual | Aviso |
| 6 | Dos pérdidas seguidas | Aviso: pausa sugerida |
| 7 | Una apuesta registrada no se edita | Solo se liquida; las correcciones van a `log_cambios` |
| 8 | Cambios de parámetros | Rigen desde el mes siguiente |
| + | Máximo de 2 apuestas por día | **Bloquea**, también levantable con aviso (solo ese día) |

Criterios de aceptación cubiertos por pruebas automáticas: bloqueo al llegar al 30 % de pérdida, rechazo de stake > 10 %, rechazo de combinadas de más de 2 selecciones o con cuota total < 2,00, e imposibilidad de editar apuestas registradas.

## Cómo correrla desde GitHub (GitHub Pages)

1. Sube esta carpeta a un repositorio de GitHub (rama `main` o `master`).
2. En el repositorio: **Settings → Pages → Build and deployment → Source: GitHub Actions** (solo una vez).
3. Cada `push` ejecuta `.github/workflows/pages.yml`: corre las pruebas y publica la carpeta `web/`.
4. Abre `https://<tu-usuario>.github.io/<repositorio>/` en el teléfono y, en Chrome, **Menú ⋮ → Añadir a pantalla de inicio** (o *Instalar app*). Después de la primera carga funciona sin conexión.

## Correrla en tu computadora

Necesitas un servidor local (el service worker no funciona abriendo el archivo directamente). Con Node.js:

```bash
node tools/servir.js
```

Abre <http://localhost:8080>. Sin Node, con Python:

```bash
python -m http.server 8080 --directory web
```

## Pruebas

Requiere Node.js 20 o superior (sin instalar paquetes):

```bash
node --test
```

Cubren cálculos (probabilidad implícita, cuota combinada, EV simple y combinado, yield, ROI, acierto, racha, drawdown, CLV, stake sugerido), reportes (desgloses, calibración y Brier, curva de saldo, resumen mensual), las 8 reglas y la capa de datos (inmutabilidad, liquidación, correcciones, vigencia de parámetros, copia JSON idempotente, respaldos rotativos, cierres y capturas).

## Cómo está hecha

```
web/
├── index.html · manifest.json · sw.js · iconos/
├── css/estilos.css            # estilo «cristal de noche» (ver DISENO_APP.md)
└── js/
    ├── config.js              # constantes de interfaz
    ├── calculos.js            # funciones puras: EV, yield, racha, CLV, stake…
    ├── reportes.js            # desgloses, calibración, curva de saldo, resumen mensual (puras)
    ├── reglas.js              # reglas con mensajes claros (puras)
    ├── datos.js               # IndexedDB / memoria; API sin editar ni borrar
    ├── datos_demo.js          # datos de ejemplo (modo ?demo)
    ├── exportar.js            # CSV, JSON y menú compartir
    ├── graficas.js            # gráficas SVG a mano
    ├── nucleo.js · dialogos.js
    ├── liquidar.js · hoja_apuesta.js · hoja_detalle.js
    └── vista_*.js · main.js   # una vista por pestaña
tests/                         # node --test
tools/                         # servidor local y generador de iconos
```

`calculos.js`, `reglas.js` y `datos.js` no tocan el DOM, así que se prueban directamente en Node.

## Cosas que conviene saber

- **Los datos viven solo en el teléfono.** Si borras los datos del navegador o desinstalas la app, se pierden. Exporta la copia JSON (**Ajustes → Exportar copia**) y guárdala en tu Drive desde el menú compartir; la app te lo recuerda si pasan 7 días. **Importar** una copia solo añade lo que falta (no duplica ni pisa apuestas existentes).
- **Respaldos semanales:** una web no corre en segundo plano, así que al abrir la app, si pasaron 7 días desde el último, guarda una copia con fecha dentro del propio dispositivo (4 ranuras rotativas). Protegen de errores, no de borrar los datos del navegador.
- **Modo demo:** abre `…/?demo` (o **Ajustes → Abrir modo demo**) para ver la app con 4 meses de apuestas inventadas. Viven solo en memoria y no tocan tus datos reales.
- **Cierre mensual:** guarda el resumen del mes (no se modifica) y muestra con qué banca arranca el mes siguiente; no impide seguir registrando. Los depósitos y retiros no se editan: si te equivocas, anota un movimiento que lo compense.
- **Capturas del boleto:** se reducen a ~1280 px y se guardan dentro de la base (opcionales).
- **La inmutabilidad la garantiza la app, no la base de datos.** `datos.js` no ofrece ninguna operación de editar ni borrar apuestas (ni el adaptador de IndexedDB tiene `delete`), pero quien abra las herramientas del navegador podría saltársela. Sirve para auditarte a ti mismo, no como control a prueba de manipulación.
- **La hora de la apuesta es la del momento del registro** y no se puede escribir a mano; si el partido ya empezó, la app avisa.
- **Pérdida neta del mes** = suma de la ganancia neta de las apuestas liquidadas de ese mes (las pendientes no cuentan hasta liquidarse). La **banca inicial del mes** es el parámetro «banca mensual», no un saldo arrastrado.
- **Cuota mínima 2,00**: se exige a las dobles, no a las simples.
- **Actualizar la app**: sube el número de `VERSION` en `web/sw.js` en cada cambio de archivos, para que los teléfonos descarguen la versión nueva.
- **Iconos**: `python tools/generar_iconos.py` (requiere Pillow) los regenera.
- Más adelante se puede empaquetar como APK (TWA con Bubblewrap), como en `DISENO_APP.md`.

## Ideas para más adelante

- Empaquetar como APK (TWA con Bubblewrap).
- Marcar por selección el resultado de una doble ya liquidada (hoy se hace al liquidar).
