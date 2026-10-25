import {
  settings,
  TOUCH_CONTROLS,
  type Orientation,
  type TouchControlId,
} from '../core/settings';
import type { TouchControls } from '../input/touch';
import { el, toast } from './dom';

const LABELS: Record<TouchControlId, string> = {
  dpad: 'Cruceta',
  a: 'Boton A',
  b: 'Boton B',
  l: 'Gatillo L',
  r: 'Gatillo R',
  start: 'Start',
  select: 'Select',
};

const MIN_SIZE = 8;
const MAX_SIZE = 56;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

/**
 * Modo de edicion del mando en pantalla: arrastrar para mover, deslizador para
 * el tamano. Mientras esta activo el overlay no manda pulsaciones al emulador.
 */
export class LayoutEditor {
  #touch: TouchControls;
  #host: HTMLElement;
  #orientation: Orientation;
  #selected: TouchControlId = 'dpad';
  #bar: HTMLDivElement | null = null;
  #sizeInput: HTMLInputElement | null = null;
  #titleNode: HTMLSpanElement | null = null;
  #dragPointer: number | null = null;
  #onDone: (() => void) | null = null;

  constructor(touch: TouchControls, host: HTMLElement, orientation: Orientation) {
    this.#touch = touch;
    this.#host = host;
    this.#orientation = orientation;
  }

  get active(): boolean {
    return this.#bar !== null;
  }

  open(orientation: Orientation, onDone: () => void): void {
    if (this.#bar) return;
    this.#orientation = orientation;
    this.#onDone = onDone;

    this.#touch.setEnabled(false);
    this.#touch.element.classList.add('is-editing');

    for (const id of TOUCH_CONTROLS) {
      const node = this.#touch.node(id);
      node.addEventListener('pointerdown', this.#onPointerDown);
    }

    this.#bar = this.#buildBar();
    this.#host.append(this.#bar);
    this.#select('dpad');
  }

  close(): void {
    if (!this.#bar) return;

    for (const id of TOUCH_CONTROLS) {
      const node = this.#touch.node(id);
      node.removeEventListener('pointerdown', this.#onPointerDown);
      node.classList.remove('is-selected');
    }
    globalThis.removeEventListener('pointermove', this.#onPointerMove);
    globalThis.removeEventListener('pointerup', this.#onPointerUp);
    globalThis.removeEventListener('pointercancel', this.#onPointerUp);

    this.#touch.element.classList.remove('is-editing');
    this.#touch.setEnabled(true);
    this.#bar.remove();
    this.#bar = null;
    this.#dragPointer = null;

    this.#onDone?.();
    this.#onDone = null;
  }

  #buildBar(): HTMLDivElement {
    this.#titleNode = el('span', { text: LABELS[this.#selected] });

    const size = el('input', {
      type: 'range',
      min: String(MIN_SIZE),
      max: String(MAX_SIZE),
      step: '1',
    });
    size.addEventListener('input', () => {
      const placement = settings.current.layouts[this.#orientation][this.#selected];
      this.#commit({ ...placement, size: Number(size.value) });
    });
    this.#sizeInput = size;

    const opacity = el('input', {
      type: 'range',
      min: '15',
      max: '100',
      step: '5',
      value: String(Math.round(settings.current.touchOpacity * 100)),
    });
    opacity.addEventListener('input', () => {
      settings.update({ touchOpacity: Number(opacity.value) / 100 });
      this.#refresh();
    });

    const reset = el('button', { type: 'button', text: 'Restablecer', class: 'ghost' });
    reset.addEventListener('click', () => {
      settings.resetLayout(this.#orientation);
      this.#refresh();
      this.#select(this.#selected);
      toast('Disposicion restablecida');
    });

    const done = el('button', { type: 'button', text: 'Listo', class: 'primary' });
    done.addEventListener('click', () => this.close());

    return el(
      'div',
      { class: 'edit-bar' },
      el(
        'div',
        { class: 'edit-hint' },
        'Arrastra los botones para moverlos. La disposicion se guarda por separado en vertical y horizontal.'
      ),
      el('div', { class: 'edit-bar-row' }, el('label', { text: 'Control' }), this.#titleNode),
      el('div', { class: 'edit-bar-row' }, el('label', { text: 'Tamano' }), size),
      el('div', { class: 'edit-bar-row' }, el('label', { text: 'Opacidad' }), opacity),
      el('div', { class: 'edit-bar-row' }, reset, done)
    );
  }

  #select(id: TouchControlId): void {
    this.#selected = id;
    for (const candidate of TOUCH_CONTROLS) {
      this.#touch.node(candidate).classList.toggle('is-selected', candidate === id);
    }
    if (this.#titleNode) this.#titleNode.textContent = LABELS[id];
    if (this.#sizeInput) {
      this.#sizeInput.value = String(settings.current.layouts[this.#orientation][id].size);
    }
  }

  #onPointerDown = (event: PointerEvent): void => {
    const target = event.currentTarget as HTMLDivElement;
    const id = target.dataset.control as TouchControlId | undefined;
    if (!id) return;

    event.preventDefault();
    event.stopPropagation();
    this.#select(id);
    this.#dragPointer = event.pointerId;

    globalThis.addEventListener('pointermove', this.#onPointerMove);
    globalThis.addEventListener('pointerup', this.#onPointerUp);
    globalThis.addEventListener('pointercancel', this.#onPointerUp);
  };

  #onPointerMove = (event: PointerEvent): void => {
    if (event.pointerId !== this.#dragPointer) return;
    event.preventDefault();

    const bounds = this.#touch.element.getBoundingClientRect();
    if (bounds.width === 0 || bounds.height === 0) return;

    // Se guarda en porcentaje para que la posicion aguante cualquier pantalla.
    const x = clamp(((event.clientX - bounds.left) / bounds.width) * 100, 3, 97);
    const y = clamp(((event.clientY - bounds.top) / bounds.height) * 100, 3, 97);
    const placement = settings.current.layouts[this.#orientation][this.#selected];
    this.#commit({ ...placement, x, y });
  };

  #onPointerUp = (event: PointerEvent): void => {
    if (event.pointerId !== this.#dragPointer) return;
    this.#dragPointer = null;
    globalThis.removeEventListener('pointermove', this.#onPointerMove);
    globalThis.removeEventListener('pointerup', this.#onPointerUp);
    globalThis.removeEventListener('pointercancel', this.#onPointerUp);
  };

  #commit(placement: { x: number; y: number; size: number }): void {
    settings.setPlacement(this.#orientation, this.#selected, placement);
    this.#refresh();
  }

  #refresh(): void {
    const current = settings.current;
    this.#touch.applyLayout(
      current.layouts[this.#orientation],
      current.touchOpacity,
      true
    );
    this.#touch.node(this.#selected).classList.add('is-selected');
  }
}
