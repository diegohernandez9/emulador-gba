import type { GbaButton } from '../core/emulator';
import {
  TOUCH_CONTROLS,
  type ControlPlacement,
  type Orientation,
  type TouchControlId,
  type TouchLayout,
} from '../core/settings';

export interface TouchHandlers {
  onPress: (button: GbaButton) => void;
  onRelease: (button: GbaButton) => void;
}

interface Hitbox {
  id: TouchControlId;
  cx: number;
  cy: number;
  radius: number;
}

const SIMPLE_BUTTONS: Record<Exclude<TouchControlId, 'dpad'>, GbaButton> = {
  a: 'A',
  b: 'B',
  l: 'L',
  r: 'R',
  start: 'Start',
  select: 'Select',
};

/** Busqueda inversa para saber que nodo refleja cada boton. */
const BUTTON_TO_CONTROL = new Map<GbaButton, TouchControlId>(
  (Object.entries(SIMPLE_BUTTONS) as [Exclude<TouchControlId, 'dpad'>, GbaButton][]).map(
    ([id, button]) => [button, id]
  )
);

/** Fraccion del radio del d-pad que se ignora en el centro para evitar falsos positivos. */
const DPAD_DEADZONE = 0.22;
/** Margen extra de area tactil: el dedo no pierde el boton al rozar el borde. */
const TOUCH_SLOP = 1.18;

/** Traduce un contacto dentro del d-pad a una o dos direcciones (diagonales incluidas). */
const dpadDirections = (dx: number, dy: number, radius: number): GbaButton[] => {
  const distance = Math.hypot(dx, dy);
  if (distance < radius * DPAD_DEADZONE) return [];

  // Ocho sectores de 45 grados; los impares son diagonales.
  const angle = Math.atan2(dy, dx);
  const sector = (Math.round((angle * 4) / Math.PI) + 8) % 8;
  switch (sector) {
    case 0: return ['Right'];
    case 1: return ['Right', 'Down'];
    case 2: return ['Down'];
    case 3: return ['Left', 'Down'];
    case 4: return ['Left'];
    case 5: return ['Left', 'Up'];
    case 6: return ['Up'];
    default: return ['Right', 'Up'];
  }
};

/**
 * Overlay de controles tactiles.
 *
 * En vez de un listener por boton, hace hit-testing contra un unico contenedor.
 * Asi el multitouch sale gratis y el dedo puede deslizarse de un boton a otro
 * sin quedarse pegado, que es como se comportan los emuladores de consola.
 */
export class TouchControls {
  readonly element: HTMLDivElement;

  #handlers: TouchHandlers;
  #nodes = new Map<TouchControlId, HTMLDivElement>();
  #hitboxes: Hitbox[] = [];
  /** Botones que mantiene pulsados cada dedo activo. */
  #pointerButtons = new Map<number, GbaButton[]>();
  /** Cuantos dedos sostienen cada boton, para no soltarlo antes de tiempo. */
  #pressCount = new Map<GbaButton, number>();
  #layout: TouchLayout | null = null;
  #enabled = true;

  constructor(handlers: TouchHandlers) {
    this.#handlers = handlers;
    this.element = document.createElement('div');
    this.element.className = 'touch-overlay';

    for (const id of TOUCH_CONTROLS) {
      const node = document.createElement('div');
      node.className = `touch-control touch-${id}`;
      node.dataset.control = id;
      if (id === 'dpad') {
        node.innerHTML =
          '<span class="dpad-arm dpad-v"></span><span class="dpad-arm dpad-h"></span>';
      } else {
        node.textContent = id === 'start' || id === 'select' ? id.toUpperCase() : id.toUpperCase();
      }
      this.#nodes.set(id, node);
      this.element.append(node);
    }

    this.element.addEventListener('pointerdown', this.#onPointerDown);
    this.element.addEventListener('pointermove', this.#onPointerMove);
    this.element.addEventListener('pointerup', this.#onPointerEnd);
    this.element.addEventListener('pointercancel', this.#onPointerEnd);
    // Safari en iOS abre la lupa o el menu contextual con una pulsacion larga.
    this.element.addEventListener('contextmenu', (event) => event.preventDefault());
  }

  node(id: TouchControlId): HTMLDivElement {
    const node = this.#nodes.get(id);
    if (!node) throw new Error(`Control tactil desconocido: ${id}`);
    return node;
  }

  /** Dibuja el layout y recalcula las zonas de impacto. */
  applyLayout(layout: TouchLayout, opacity: number, visible: boolean): void {
    this.#layout = layout;
    this.element.style.setProperty('--touch-opacity', String(opacity));
    this.element.classList.toggle('is-hidden', !visible);

    for (const id of TOUCH_CONTROLS) {
      this.#place(this.node(id), layout[id]);
    }
    this.measure();
  }

  #place(node: HTMLDivElement, placement: ControlPlacement): void {
    node.style.left = `${placement.x}%`;
    node.style.top = `${placement.y}%`;
    // El tamano se expresa contra el lado menor del viewport para que el control
    // conserve proporciones al girar el telefono.
    node.style.width = `${placement.size}vmin`;
    node.style.height = `${placement.size}vmin`;
  }

  /** Recalcula las zonas tactiles. Hay que llamarla al rotar o redimensionar. */
  measure(): void {
    const host = this.element.getBoundingClientRect();
    this.#hitboxes = TOUCH_CONTROLS.map((id) => {
      const rect = this.node(id).getBoundingClientRect();
      return {
        id,
        cx: rect.left + rect.width / 2 - host.left,
        cy: rect.top + rect.height / 2 - host.top,
        radius: (Math.max(rect.width, rect.height) / 2) * TOUCH_SLOP,
      };
    });
  }

  /** Desactiva la entrada sin ocultar el overlay (modo edicion de controles). */
  setEnabled(enabled: boolean): void {
    if (this.#enabled === enabled) return;
    this.#enabled = enabled;
    this.element.classList.toggle('is-inert', !enabled);
    if (!enabled) this.releaseAll();
  }

  releaseAll(): void {
    for (const buttons of this.#pointerButtons.values()) {
      for (const button of buttons) this.#decrement(button);
    }
    this.#pointerButtons.clear();
  }

  get currentLayout(): TouchLayout | null {
    return this.#layout;
  }

  #hitTest(x: number, y: number): GbaButton[] {
    for (const box of this.#hitboxes) {
      const dx = x - box.cx;
      const dy = y - box.cy;
      if (Math.hypot(dx, dy) > box.radius) continue;

      if (box.id === 'dpad') return dpadDirections(dx, dy, box.radius / TOUCH_SLOP);
      return [SIMPLE_BUTTONS[box.id]];
    }
    return [];
  }

  #onPointerDown = (event: PointerEvent): void => {
    if (!this.#enabled) return;
    event.preventDefault();
    try {
      // La captura mantiene el seguimiento si el dedo sale del overlay, pero no
      // es imprescindible: si falla, la pulsacion debe registrarse igual.
      this.element.setPointerCapture(event.pointerId);
    } catch {
      // Puntero ya liberado por el navegador.
    }
    this.#update(event);
  };

  #onPointerMove = (event: PointerEvent): void => {
    if (!this.#enabled || !this.#pointerButtons.has(event.pointerId)) return;
    event.preventDefault();
    this.#update(event);
  };

  #onPointerEnd = (event: PointerEvent): void => {
    const previous = this.#pointerButtons.get(event.pointerId);
    if (!previous) return;
    event.preventDefault();
    for (const button of previous) this.#decrement(button);
    this.#pointerButtons.delete(event.pointerId);
  };

  #update(event: PointerEvent): void {
    const host = this.element.getBoundingClientRect();
    const next = this.#hitTest(event.clientX - host.left, event.clientY - host.top);
    const previous = this.#pointerButtons.get(event.pointerId) ?? [];

    for (const button of previous) {
      if (!next.includes(button)) this.#decrement(button);
    }
    for (const button of next) {
      if (!previous.includes(button)) this.#increment(button);
    }
    this.#pointerButtons.set(event.pointerId, next);
  }

  #increment(button: GbaButton): void {
    const count = (this.#pressCount.get(button) ?? 0) + 1;
    this.#pressCount.set(button, count);
    if (count === 1) {
      this.#handlers.onPress(button);
      this.#reflect(button, true);
    }
  }

  #decrement(button: GbaButton): void {
    const count = (this.#pressCount.get(button) ?? 1) - 1;
    if (count <= 0) {
      this.#pressCount.delete(button);
      this.#handlers.onRelease(button);
      this.#reflect(button, false);
    } else {
      this.#pressCount.set(button, count);
    }
  }

  /** Realimentacion visual: en iOS no hay vibracion, el unico feedback es este. */
  #reflect(button: GbaButton, active: boolean): void {
    const id = BUTTON_TO_CONTROL.get(button);
    if (id) {
      this.#nodes.get(id)?.classList.toggle('is-active', active);
      return;
    }
    // Direccion: el d-pad marca el brazo correspondiente.
    this.#nodes.get('dpad')?.classList.toggle(`is-${button.toLowerCase()}`, active);
  }
}

export type { Orientation };
