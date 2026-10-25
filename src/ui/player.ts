import { emulator, type GbaButton } from '../core/emulator';
import { settings, type Orientation } from '../core/settings';
import { GamepadInput } from '../input/gamepad';
import { TouchControls } from '../input/touch';
import { el, toast } from './dom';

/** Resolucion nativa del GBA. */
const GBA_WIDTH = 240;
const GBA_HEIGHT = 160;
/** Slot reservado al guardado rapido; los demas quedan para el usuario. */
export const QUICK_SLOT = 1;
/** En vertical la pantalla ocupa la mitad de arriba y abajo van los controles. */
const PORTRAIT_SCREEN_SHARE = 0.52;

export interface PlayerCallbacks {
  onExit: () => void;
  onOpenStates: () => void;
  onOpenSettings: () => void;
  onEditLayout: () => void;
}

export const currentOrientation = (): Orientation =>
  globalThis.innerWidth >= globalThis.innerHeight ? 'landscape' : 'portrait';

export class PlayerView {
  readonly element: HTMLDivElement;
  readonly canvas: HTMLCanvasElement;
  readonly touch: TouchControls;

  #callbacks: PlayerCallbacks;
  #gamepad: GamepadInput;
  #screenWrap: HTMLDivElement;
  #hud: HTMLDivElement;
  #resizeObserver: ResizeObserver;

  constructor(callbacks: PlayerCallbacks) {
    this.#callbacks = callbacks;

    this.canvas = el('canvas', { id: 'screen', width: GBA_WIDTH, height: GBA_HEIGHT });
    this.#screenWrap = el('div', { class: 'screen-wrap' }, this.canvas);

    const press = (button: GbaButton): void => emulator.press(button);
    const release = (button: GbaButton): void => emulator.release(button);

    this.touch = new TouchControls({ onPress: press, onRelease: release });
    this.#gamepad = new GamepadInput({ onPress: press, onRelease: release });

    this.#hud = this.#buildHud();
    this.element = el(
      'div',
      { class: 'view player', hidden: true },
      this.#screenWrap,
      this.touch.element,
      this.#hud
    );

    this.#resizeObserver = new ResizeObserver(() => this.layout());
    this.#resizeObserver.observe(this.#screenWrap);
    globalThis.addEventListener('orientationchange', () => {
      // Safari reporta el tamano nuevo un instante despues de rotar.
      setTimeout(() => this.layout(), 120);
    });
  }

  #buildHud(): HTMLDivElement {
    const menuButton = el('button', { type: 'button', text: 'Menu' });
    menuButton.addEventListener('click', () => this.openMenu());

    const saveButton = el('button', { type: 'button', text: 'Guardar', title: 'Guardado rapido' });
    saveButton.addEventListener('click', () => void this.quickSave());

    const loadButton = el('button', { type: 'button', text: 'Cargar', title: 'Carga rapida' });
    loadButton.addEventListener('click', () => this.quickLoad());

    const ffButton = el('button', { type: 'button', text: '>>', title: 'Avance rapido' });
    // Mantener pulsado acelera; al soltar vuelve a velocidad normal.
    const startFf = (event: PointerEvent): void => {
      event.preventDefault();
      emulator.setFastForward(settings.current.fastForwardMultiplier);
      ffButton.classList.add('primary');
    };
    const stopFf = (): void => {
      emulator.setFastForward(1);
      ffButton.classList.remove('primary');
    };
    ffButton.addEventListener('pointerdown', startFf);
    ffButton.addEventListener('pointerup', stopFf);
    ffButton.addEventListener('pointercancel', stopFf);
    ffButton.addEventListener('pointerleave', stopFf);

    return el(
      'div',
      { class: 'hud' },
      menuButton,
      el('div', { class: 'hud-quick' }, saveButton, loadButton, ffButton)
    );
  }

  show(): void {
    this.element.hidden = false;
    this.#gamepad.start();
    this.applySettings();
    this.layout();
  }

  hide(): void {
    this.element.hidden = true;
    this.#gamepad.stop();
    this.touch.releaseAll();
  }

  /** Vuelca la configuracion visual y de entrada sobre la vista. */
  applySettings(): void {
    const current = settings.current;
    this.touch.applyLayout(
      current.layouts[currentOrientation()],
      current.touchOpacity,
      current.touchVisible
    );
    this.layout();
  }

  /**
   * Dimensiona el canvas. El buffer sigue siendo de 240x160: solo cambia el
   * tamano con el que se pinta, para no perder nitidez de pixel.
   */
  layout(): void {
    const orientation = currentOrientation();
    const bounds = this.#screenWrap.getBoundingClientRect();
    if (bounds.width === 0 || bounds.height === 0) return;

    const availableWidth = bounds.width;
    const availableHeight =
      orientation === 'portrait' ? bounds.height * PORTRAIT_SCREEN_SHARE : bounds.height;

    const mode = settings.current.videoScaling;
    let width: number;
    let height: number;

    if (mode === 'stretch') {
      width = availableWidth;
      height = availableHeight;
    } else {
      const raw = Math.min(availableWidth / GBA_WIDTH, availableHeight / GBA_HEIGHT);
      // El escalado entero evita que unos pixeles queden mas gruesos que otros.
      const factor = mode === 'integer' ? Math.max(1, Math.floor(raw)) : raw;
      width = GBA_WIDTH * factor;
      height = GBA_HEIGHT * factor;
    }

    this.canvas.style.width = `${Math.round(width)}px`;
    this.canvas.style.height = `${Math.round(height)}px`;
    this.#screenWrap.style.alignItems = orientation === 'portrait' ? 'flex-start' : 'center';

    // En vertical sobra sitio bajo la pantalla, asi que el HUD baja ahi en vez
    // de flotar sobre el juego. En horizontal no hay hueco y se queda encima.
    this.#hud.style.top =
      orientation === 'portrait'
        ? `calc(var(--safe-top) + ${Math.round(height)}px + 10px)`
        : '';

    this.touch.applyLayout(
      settings.current.layouts[orientation],
      settings.current.touchOpacity,
      settings.current.touchVisible
    );
  }

  // --- Guardado rapido ------------------------------------------------------

  async quickSave(): Promise<void> {
    if (!emulator.running) return;
    const ok = await emulator.saveState(QUICK_SLOT);
    toast(ok ? 'Partida guardada' : 'No se pudo guardar', ok ? 'ok' : 'error');
  }

  quickLoad(): void {
    if (!emulator.running) return;
    const ok = emulator.loadState(QUICK_SLOT);
    toast(ok ? 'Partida cargada' : 'No hay guardado rapido', ok ? 'ok' : 'error');
  }

  // --- Menu -----------------------------------------------------------------

  openMenu(): void {
    emulator.pause();

    const backdrop = el('div', { class: 'sheet-backdrop' });
    // Cerrar el menu siempre reanuda: si el juego venia pausado porque iOS mando
    // la app al fondo, este es el gesto con el que el usuario la retoma.
    const close = (resume: boolean): void => {
      backdrop.remove();
      if (resume) emulator.resume();
    };

    const item = (label: string, action: () => void, cls = ''): HTMLButtonElement => {
      const button = el('button', { type: 'button', text: label, class: cls });
      button.addEventListener('click', action);
      return button;
    };

    const closeButton = item('Cerrar', () => close(true), 'ghost');

    const body = el(
      'div',
      { class: 'sheet-body' },
      item('Reanudar', () => close(true), 'primary'),
      item('Estados de guardado', () => {
        close(false);
        this.#callbacks.onOpenStates();
      }),
      item('Colocar controles', () => {
        close(false);
        this.#callbacks.onEditLayout();
      }),
      item('Ajustes', () => {
        close(false);
        this.#callbacks.onOpenSettings();
      }),
      item('Reiniciar juego', () => {
        emulator.reset();
        close(true);
        toast('Juego reiniciado');
      }),
      item(
        'Salir a la biblioteca',
        () => {
          close(false);
          this.#callbacks.onExit();
        },
        'danger'
      )
    );

    const panel = el(
      'div',
      { class: 'sheet' },
      el('div', { class: 'sheet-header' }, el('h2', { text: 'Menu' }), closeButton),
      body
    );

    backdrop.append(panel);
    backdrop.addEventListener('pointerdown', (event) => {
      if (event.target === backdrop) close(true);
    });
    document.body.append(backdrop);
  }

  get gamepad(): GamepadInput {
    return this.#gamepad;
  }
}
