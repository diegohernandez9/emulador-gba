import { registerSW } from 'virtual:pwa-register';
import './styles.css';

import { emulator } from './core/emulator';
import { settings } from './core/settings';
import { applyKeyboardBindings } from './input/keyboard';
import { el, toast } from './ui/dom';
import { LayoutEditor } from './ui/layout-editor';
import { LibraryView } from './ui/library';
import { currentOrientation, PlayerView } from './ui/player';
import { createSettingsPanel } from './ui/settings-panel';
import { createStatesPanel } from './ui/states-panel';

/** Evita un bucle de recargas si el aislamiento no llega a activarse. */
const ISOLATION_RELOAD_KEY = 'emulador-gba:isolation-reload';
/** Cada cuanto se vuelca el FS virtual a IndexedDB mientras se juega. */
const PERSIST_INTERVAL_MS = 30_000;

const root = document.querySelector<HTMLDivElement>('#app');
if (!root) throw new Error('Falta el contenedor #app');

const fatal = (title: string, detail: string): void => {
  root.replaceChildren(
    el(
      'div',
      { class: 'fatal' },
      el('h2', { text: title }),
      el('p', { text: detail }),
    )
  );
};

/**
 * mGBA necesita SharedArrayBuffer, que el navegador solo concede a documentos
 * con COOP/COEP. Si el hosting no manda esas cabeceras las pone el service
 * worker, pero eso exige una recarga para que tome el control del documento.
 */
const ensureIsolation = async (): Promise<boolean> => {
  if (globalThis.crossOriginIsolated) {
    sessionStorage.removeItem(ISOLATION_RELOAD_KEY);
    return true;
  }
  if (!('serviceWorker' in navigator)) return false;
  if (sessionStorage.getItem(ISOLATION_RELOAD_KEY)) return false;

  await navigator.serviceWorker.ready;
  sessionStorage.setItem(ISOLATION_RELOAD_KEY, '1');
  location.reload();
  // La recarga corta la ejecucion; el valor solo satisface al compilador.
  return false;
};

const main = async (): Promise<void> => {
  registerSW({ immediate: true });

  if (!(await ensureIsolation())) {
    fatal(
      'El navegador no puede ejecutar el emulador',
      'La pagina necesita aislamiento de origen cruzado (COOP/COEP) para usar SharedArrayBuffer. Sirvela por HTTPS con esas cabeceras, o espera a que el service worker quede activo y vuelve a abrirla.'
    );
    return;
  }

  // --- Vistas

  let layoutEditor: LayoutEditor | null = null;

  const openStates = (): void => createStatesPanel().open();

  const openSettings = (): void =>
    createSettingsPanel({
      gamepad: player.gamepad,
      onVideoChange: () => player.layout(),
      onTouchChange: () => player.applySettings(),
      onEditLayout: () => editLayout(),
      onRebindKeyboard: () => bindKeyboard(),
    }).open();

  const editLayout = (): void => {
    if (!layoutEditor) {
      layoutEditor = new LayoutEditor(player.touch, player.element, currentOrientation());
    }
    layoutEditor.open(currentOrientation(), () => player.applySettings());
  };

  const player = new PlayerView({
    onExit: () => {
      void stopGame();
    },
    onOpenStates: openStates,
    onOpenSettings: openSettings,
    onEditLayout: editLayout,
  });

  const library = new LibraryView({
    onPlay: (rom) => {
      void startGame(rom);
    },
    onOpenSettings: openSettings,
  });

  root.append(library.element, player.element);

  const showLibrary = (): void => {
    player.hide();
    library.show();
  };

  const showPlayer = (): void => {
    library.hide();
    player.show();
  };

  // --- Core

  const bindKeyboard = (): void => {
    if (!emulator.ready) return;
    applyKeyboardBindings((key, button) => emulator.bindKey(key, button));
  };

  try {
    await emulator.boot(player.canvas);
  } catch (error) {
    console.error(error);
    fatal(
      'No se pudo iniciar el emulador',
      error instanceof Error ? error.message : 'Error desconocido al cargar el core.'
    );
    return;
  }

  const current = settings.current;
  emulator.configure({
    autoSaveStateEnable: current.autoSaveState,
    restoreAutoSaveStateOnLoad: current.autoSaveState,
    rewindEnable: current.rewindEnabled,
    showFpsCounter: current.showFps,
    // Las direcciones opuestas simultaneas cuelgan a algunos juegos.
    allowOpposingDirections: false,
  });
  emulator.setVolume(current.volume);
  bindKeyboard();

  emulator.onCoreEvents({
    coreCrashedCallback: () => {
      toast('El emulador se detuvo por un error del juego', 'error');
      void stopGame();
    },
  });

  // --- Ciclo de vida de una partida

  let persistTimer: number | null = null;

  const startGame = async (rom: string): Promise<void> => {
    showPlayer();
    // Safari solo deja arrancar el audio dentro del gesto que abrio la partida.
    await emulator.unlockAudio();

    const ok = await emulator.start(rom);
    if (!ok) {
      toast('No se pudo cargar la ROM', 'error');
      showLibrary();
      return;
    }

    settings.update({ lastRom: rom });
    player.applySettings();
    persistTimer = globalThis.setInterval(() => {
      void emulator.persist();
    }, PERSIST_INTERVAL_MS);
  };

  const stopGame = async (): Promise<void> => {
    if (persistTimer !== null) {
      clearInterval(persistTimer);
      persistTimer = null;
    }
    await emulator.persist();
    emulator.stop();
    showLibrary();
  };

  // --- Integracion con el sistema

  // iOS puede terminar la app en segundo plano sin aviso, asi que se vuelca el
  // FS en cuanto la pagina deja de estar visible, no al cerrarse.
  const persistNow = (): void => {
    void emulator.persist();
  };

  // Se recuerda si la pausa la provoco el sistema, para no reanudar un juego
  // que el usuario dejo pausado a proposito.
  let pausedBySystem = false;

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      if (emulator.running && !emulator.paused) {
        emulator.pause();
        pausedBySystem = true;
      }
      persistNow();
      return;
    }
    if (pausedBySystem) {
      pausedBySystem = false;
      if (emulator.running) emulator.resume();
    }
  });
  globalThis.addEventListener('pagehide', persistNow);

  // Safari suspende el AudioContext al volver del segundo plano y solo lo deja
  // reanudar dentro de un gesto, asi que se reintenta con cada toque.
  document.addEventListener(
    'pointerdown',
    () => {
      void emulator.unlockAudio();
    },
    { capture: true }
  );

  globalThis.addEventListener('resize', () => player.layout());

  showLibrary();
};

void main().catch((error: unknown) => {
  console.error(error);
  fatal('Error inesperado', error instanceof Error ? error.message : String(error));
});
