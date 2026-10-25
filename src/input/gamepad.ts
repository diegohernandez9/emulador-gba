import { GBA_BUTTONS, type GbaButton } from '../core/emulator';
import { settings } from '../core/settings';

/** Umbral del stick analogico a partir del cual cuenta como direccion pulsada. */
const AXIS_THRESHOLD = 0.5;

export interface GamepadHandlers {
  onPress: (button: GbaButton) => void;
  onRelease: (button: GbaButton) => void;
}

/**
 * Mandos fisicos via Gamepad API. Safari en iOS 16+ los expone para DualSense,
 * mandos de Xbox y MFi. La API no emite eventos de pulsacion, hay que sondear,
 * asi que corre en su propio rAF y solo mientras hay un mando conectado.
 */
export class GamepadInput {
  #handlers: GamepadHandlers;
  #active = new Set<GbaButton>();
  #frame: number | null = null;
  #listening = false;
  /** Callback temporal usado por la pantalla de configuracion para capturar un boton. */
  #captureResolve: ((index: number) => void) | null = null;

  constructor(handlers: GamepadHandlers) {
    this.#handlers = handlers;
  }

  start(): void {
    if (this.#listening) return;
    this.#listening = true;
    globalThis.addEventListener('gamepadconnected', this.#onConnected);
    globalThis.addEventListener('gamepaddisconnected', this.#onDisconnected);
    if (this.#anyConnected()) this.#schedule();
  }

  stop(): void {
    this.#listening = false;
    globalThis.removeEventListener('gamepadconnected', this.#onConnected);
    globalThis.removeEventListener('gamepaddisconnected', this.#onDisconnected);
    if (this.#frame !== null) cancelAnimationFrame(this.#frame);
    this.#frame = null;
    this.releaseAll();
  }

  get connected(): boolean {
    return this.#anyConnected();
  }

  releaseAll(): void {
    for (const button of this.#active) this.#handlers.onRelease(button);
    this.#active.clear();
  }

  /** Espera la siguiente pulsacion fisica y devuelve su indice, para remapear. */
  captureNextButton(): Promise<number> {
    return new Promise((resolve) => {
      this.#captureResolve = resolve;
      this.#schedule();
    });
  }

  cancelCapture(): void {
    this.#captureResolve = null;
  }

  #anyConnected(): boolean {
    return navigator.getGamepads?.().some((pad) => pad !== null) ?? false;
  }

  #onConnected = (): void => this.#schedule();

  #onDisconnected = (): void => {
    if (!this.#anyConnected()) {
      this.releaseAll();
      if (this.#frame !== null) cancelAnimationFrame(this.#frame);
      this.#frame = null;
    }
  };

  #schedule(): void {
    if (this.#frame !== null || !this.#listening) return;
    this.#frame = requestAnimationFrame(this.#poll);
  }

  #poll = (): void => {
    this.#frame = null;
    const pads = navigator.getGamepads?.() ?? [];
    const pad = pads.find((candidate) => candidate !== null) ?? null;

    if (pad) {
      if (this.#captureResolve) {
        const pressed = pad.buttons.findIndex((b) => b.pressed);
        if (pressed >= 0) {
          const resolve = this.#captureResolve;
          this.#captureResolve = null;
          resolve(pressed);
        }
      } else {
        this.#apply(pad);
      }
    }

    if (this.#listening && (this.#anyConnected() || this.#captureResolve)) {
      this.#frame = requestAnimationFrame(this.#poll);
    }
  };

  #apply(pad: Gamepad): void {
    const mapping = settings.current.gamepad;
    const [axisX = 0, axisY = 0] = pad.axes;

    for (const button of GBA_BUTTONS) {
      let down = pad.buttons[mapping[button]]?.pressed ?? false;

      // El stick izquierdo tambien mueve la cruceta: muchos mandos no exponen
      // el d-pad digital de forma consistente.
      if (button === 'Left') down ||= axisX < -AXIS_THRESHOLD;
      else if (button === 'Right') down ||= axisX > AXIS_THRESHOLD;
      else if (button === 'Up') down ||= axisY < -AXIS_THRESHOLD;
      else if (button === 'Down') down ||= axisY > AXIS_THRESHOLD;

      const wasDown = this.#active.has(button);
      if (down && !wasDown) {
        this.#active.add(button);
        this.#handlers.onPress(button);
      } else if (!down && wasDown) {
        this.#active.delete(button);
        this.#handlers.onRelease(button);
      }
    }
  }
}
