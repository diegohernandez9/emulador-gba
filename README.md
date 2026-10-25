# Emulador GBA (PWA)

Emulador de Game Boy Advance que se instala en la pantalla de inicio del iPhone como
una app normal, funciona sin conexión y **no caduca nunca** (no hay firma ni perfil de
desarrollador que renovar cada 7 días).

Usa el core real de [mGBA](https://mgba.io) compilado a WebAssembly
([`@thenick775/mgba-wasm`](https://www.npmjs.com/package/@thenick775/mgba-wasm), MPL-2.0),
el mismo que mueve gbajs3. La compatibilidad es la de mGBA, no la de un emulador escrito
desde cero.

## Qué incluye

- **Guardado y carga rápidos** en un toque desde el HUD (slot 1), más 8 slots con fecha.
- **Autoguardado de estado**: si iOS cierra la app en segundo plano, recuperas la partida.
- **Controles táctiles recolocables**: arrastra cada botón donde te quede cómodo y ajusta
  tamaño y opacidad. Las disposiciones de vertical y horizontal se guardan por separado.
- **Mapeo de teclado y mando** (DualSense, Xbox o MFi por Bluetooth).
- Avance rápido manteniendo pulsado, rebobinado, y tres modos de escalado de pantalla.
- Biblioteca local con importación de ROMs y exportación de partidas para respaldo.

Tienes que aportar tus propias ROMs, de juegos que poseas. El proyecto no incluye ninguna.

## Desarrollo

```bash
npm install
npm run dev
```

El core necesita `SharedArrayBuffer`, así que la página debe servirse con aislamiento de
origen cruzado (`COOP: same-origin` + `COEP: require-corp`). El servidor de desarrollo ya
los manda; en producción los pone `public/_headers` y, como respaldo en hostings que no
dejan configurar cabeceras, el propio service worker.

```bash
npm run build     # comprueba tipos y genera dist/
npm run preview   # sirve dist/ con las cabeceras correctas
```

## Está publicado en

**https://diegohernandez9.github.io/emulador-gba/**

Para volver a publicar después de cualquier cambio:

```bash
npm run deploy
```

Construye y empuja `dist/` a la rama `gh-pages`. GitHub Pages tarda un minuto en
refrescar.

### La primera carga es distinta

GitHub Pages no deja configurar cabeceras HTTP, así que el aislamiento de origen cruzado
lo inyecta el propio service worker. En la primera visita la página se registra, **se
recarga sola una vez** y ya arranca el emulador. Verás unos segundos de "Preparando el
emulador..." mientras descarga los 2 MB del core; a partir de ahí abre al instante y
funciona sin conexión.

Si alguna vez aparece un mensaje de error en vez del emulador, el botón *Reintentar*
rehace ese proceso.

### Desplegarlo en otro sitio

El proyecto asume la subruta `/emulador-gba/`. Para un hosting que sirva desde la raíz:

```bash
BASE_PATH=/ npm run build
```

| Hosting | Configuración de cabeceras |
| --- | --- |
| Cloudflare Pages | `public/_headers` (ya incluido) |
| Netlify | `public/_headers` (ya incluido) |
| Vercel | `vercel.json` (ya incluido) |
| GitHub Pages | No permite cabeceras: las inyecta el service worker |

## Ponerlo en el iPhone

En el iPhone:

1. Abre **https://diegohernandez9.github.io/emulador-gba/** en **Safari** (Chrome en iOS
   no permite instalar PWAs). Espera a que cargue el emulador, no solo la página.
2. Botón Compartir → **Añadir a pantalla de inicio**.
3. Ábrela desde el icono, no desde Safari: así va a pantalla completa y sin barras.
4. Entra en Ajustes → *Posición y tamaño* → **Colocar** y arrastra los botones a tu gusto.

## Sobre tus partidas

Las ROMs y las partidas viven en el almacenamiento del navegador (IndexedDB) de tu
dispositivo. Las PWAs añadidas a la pantalla de inicio no sufren el borrado automático a
los 7 días que iOS aplica a los sitios web normales, pero si borras los datos de Safari o
desinstalas el icono, se van. Usa **Exportar** en cada juego para guardar una copia del
`.sav` de vez en cuando.

## Límites conocidos en iOS

- **Sin vibración**: Safari no implementa la Vibration API, así que los botones táctiles
  solo dan respuesta visual.
- **Sin JIT**: el core corre interpretado. Para GBA sobra en un iPhone 15.
- El sonido no arranca hasta el primer toque en pantalla, porque Safari exige un gesto del
  usuario para activar el audio.

## Estructura

```
src/
  core/emulator.ts     Envoltorio del core mGBA (carga, ROMs, estados, entrada)
  core/settings.ts     Configuración persistente y disposiciones de controles
  input/touch.ts       Overlay táctil con multitouch y diagonales del d-pad
  input/gamepad.ts     Mandos físicos vía Gamepad API
  input/keyboard.ts    Traducción de teclas a nombres SDL
  ui/                  Biblioteca, jugador, ajustes, estados y editor de controles
  sw.ts                Service worker: precache offline + cabeceras de aislamiento
```
