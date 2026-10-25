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

**https://emulador-gba-223.netlify.app**

Para volver a publicar después de un cambio:

```bash
npm run deploy
```

## Por qué Netlify y no GitHub Pages

El core necesita `SharedArrayBuffer`, que el navegador solo concede a páginas con
aislamiento de origen cruzado (`COOP: same-origin` + `COEP: require-corp`). GitHub Pages
no permite configurar cabeceras HTTP, así que se intentó que las inyectara el service
worker. **En WebKit no funciona**: comprobado en Safari, el worker llega a controlar la
página, añade las cabeceras y el navegador las descarta igualmente. En Chrome sí
funciona, pero el objetivo era el iPhone.

Netlify las manda desde el servidor a través de [`public/_headers`](public/_headers), que
es el mecanismo estándar y no depende de ningún truco. El service worker sigue
añadiéndolas por si el sitio se mueve, pero ya no es él quien sostiene el montaje.

La consecuencia práctica: ya no hay recarga automática en la primera visita.

### Desplegarlo en otro sitio

Cualquier hosting estático sirve **siempre que permita cabeceras propias**:

| Hosting | Configuración | Sirve |
| --- | --- | --- |
| Netlify | `public/_headers` + `netlify.toml` | Sí |
| Cloudflare Pages | `public/_headers` | Sí |
| Vercel | `vercel.json` | Sí |
| GitHub Pages | No permite cabeceras | **No, en Safari** |

El build asume la raíz del dominio. Para un hosting que publique en un subdirectorio:

```bash
BASE_PATH=/subdirectorio/ npm run build
```

## Ponerlo en el iPhone

1. Abre **https://emulador-gba-223.netlify.app** en **Safari**. Chrome y Brave en iOS no
   permiten instalar PWAs, y Brave además restringe los service workers.
2. Botón Compartir → **Añadir a pantalla de inicio**.
3. Ábrela desde el icono, no desde Safari: así va a pantalla completa y sin barras.
4. `Añadir ROM` para cargar tus `.gba`.
5. Ajustes → *Posición y tamaño* → **Colocar**, y arrastra los botones a tu gusto. La
   disposición se guarda por separado en vertical y en horizontal.

Si aparece un mensaje de error en vez del emulador, trae debajo una línea de diagnóstico
(aislamiento, SharedArrayBuffer, service worker, https) que dice en qué punto se rompió.

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
