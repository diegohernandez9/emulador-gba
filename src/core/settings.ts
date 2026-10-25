import { GBA_BUTTONS, type GbaButton } from './emulator';

export const TOUCH_CONTROLS = ['dpad', 'a', 'b', 'l', 'r', 'start', 'select'] as const;
export type TouchControlId = (typeof TOUCH_CONTROLS)[number];

export type Orientation = 'portrait' | 'landscape';

/** Posicion en porcentaje del viewport para que el layout sobreviva a cualquier pantalla. */
export interface ControlPlacement {
  x: number;
  y: number;
  size: number;
}

export type TouchLayout = Record<TouchControlId, ControlPlacement>;

export interface Settings {
  keyboard: Record<GbaButton, string>;
  gamepad: Record<GbaButton, number>;
  layouts: Record<Orientation, TouchLayout>;
  touchOpacity: number;
  touchVisible: boolean;
  videoScaling: 'integer' | 'fit' | 'stretch';
  volume: number;
  fastForwardMultiplier: number;
  rewindEnabled: boolean;
  autoSaveState: boolean;
  showFps: boolean;
  lastRom: string | null;
}

/** Nombres de tecla SDL, que es lo que espera `bindKey` del core. */
const DEFAULT_KEYBOARD: Record<GbaButton, string> = {
  A: 'X',
  B: 'Z',
  L: 'A',
  R: 'S',
  Start: 'Return',
  Select: 'Backspace',
  Up: 'Up',
  Down: 'Down',
  Left: 'Left',
  Right: 'Right',
};

/** Indices del Standard Gamepad: coincide con mandos de Xbox, DualSense y MFi. */
const DEFAULT_GAMEPAD: Record<GbaButton, number> = {
  A: 1,
  B: 0,
  L: 4,
  R: 5,
  Start: 9,
  Select: 8,
  Up: 12,
  Down: 13,
  Left: 14,
  Right: 15,
};

// Las x/y son el centro del control: hay que dejar al menos medio tamano de
// margen contra cada borde o el control queda cortado.
const PORTRAIT_LAYOUT: TouchLayout = {
  dpad: { x: 27, y: 71, size: 42 },
  a: { x: 84, y: 66, size: 19 },
  b: { x: 66, y: 77, size: 19 },
  l: { x: 15, y: 46, size: 17 },
  r: { x: 85, y: 46, size: 17 },
  start: { x: 60, y: 90, size: 13 },
  select: { x: 40, y: 90, size: 13 },
};

// En horizontal la pantalla ocupa casi todo el ancho, asi que los controles se
// superponen por fuerza: se empujan a las esquinas para tapar lo menos posible.
const LANDSCAPE_LAYOUT: TouchLayout = {
  dpad: { x: 12, y: 66, size: 32 },
  a: { x: 93, y: 68, size: 15 },
  b: { x: 82, y: 84, size: 15 },
  l: { x: 8, y: 16, size: 13 },
  r: { x: 92, y: 16, size: 13 },
  start: { x: 57, y: 92, size: 10 },
  select: { x: 43, y: 92, size: 10 },
};

export const DEFAULT_SETTINGS: Settings = {
  keyboard: DEFAULT_KEYBOARD,
  gamepad: DEFAULT_GAMEPAD,
  layouts: { portrait: PORTRAIT_LAYOUT, landscape: LANDSCAPE_LAYOUT },
  touchOpacity: 0.55,
  touchVisible: true,
  videoScaling: 'fit',
  volume: 0.8,
  fastForwardMultiplier: 3,
  rewindEnabled: true,
  autoSaveState: true,
  showFps: false,
  lastRom: null,
};

const STORAGE_KEY = 'emulador-gba:settings:v1';

const clonePlacement = (p: ControlPlacement): ControlPlacement => ({ ...p });

const cloneLayout = (l: TouchLayout): TouchLayout =>
  Object.fromEntries(
    TOUCH_CONTROLS.map((id) => [id, clonePlacement(l[id])])
  ) as TouchLayout;

export const cloneSettings = (s: Settings): Settings => ({
  ...s,
  keyboard: { ...s.keyboard },
  gamepad: { ...s.gamepad },
  layouts: {
    portrait: cloneLayout(s.layouts.portrait),
    landscape: cloneLayout(s.layouts.landscape),
  },
});

/**
 * Mezcla lo guardado sobre los valores por defecto campo a campo, para que una
 * version vieja de la config no deje huecos tras agregar ajustes nuevos.
 */
const merge = (stored: unknown): Settings => {
  const base = cloneSettings(DEFAULT_SETTINGS);
  if (!stored || typeof stored !== 'object') return base;
  const raw = stored as Partial<Settings>;

  for (const button of GBA_BUTTONS) {
    const key = raw.keyboard?.[button];
    if (typeof key === 'string') base.keyboard[button] = key;
    const pad = raw.gamepad?.[button];
    if (typeof pad === 'number') base.gamepad[button] = pad;
  }

  for (const orientation of ['portrait', 'landscape'] as const) {
    for (const id of TOUCH_CONTROLS) {
      const placement = raw.layouts?.[orientation]?.[id];
      if (!placement) continue;
      const target = base.layouts[orientation][id];
      if (typeof placement.x === 'number') target.x = placement.x;
      if (typeof placement.y === 'number') target.y = placement.y;
      if (typeof placement.size === 'number') target.size = placement.size;
    }
  }

  if (typeof raw.touchOpacity === 'number') base.touchOpacity = raw.touchOpacity;
  if (typeof raw.touchVisible === 'boolean') base.touchVisible = raw.touchVisible;
  if (raw.videoScaling === 'integer' || raw.videoScaling === 'fit' || raw.videoScaling === 'stretch') {
    base.videoScaling = raw.videoScaling;
  }
  if (typeof raw.volume === 'number') base.volume = raw.volume;
  if (typeof raw.fastForwardMultiplier === 'number') {
    base.fastForwardMultiplier = raw.fastForwardMultiplier;
  }
  if (typeof raw.rewindEnabled === 'boolean') base.rewindEnabled = raw.rewindEnabled;
  if (typeof raw.autoSaveState === 'boolean') base.autoSaveState = raw.autoSaveState;
  if (typeof raw.showFps === 'boolean') base.showFps = raw.showFps;
  if (typeof raw.lastRom === 'string' || raw.lastRom === null) base.lastRom = raw.lastRom ?? null;

  return base;
};

type Listener = (settings: Settings) => void;

class SettingsStore {
  #value: Settings;
  #listeners = new Set<Listener>();

  constructor() {
    let parsed: unknown = null;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) parsed = JSON.parse(stored);
    } catch {
      // Config corrupta o storage bloqueado: arrancamos con los valores por defecto.
    }
    this.#value = merge(parsed);
  }

  get current(): Settings {
    return this.#value;
  }

  subscribe(listener: Listener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  update(patch: Partial<Settings> | ((s: Settings) => Partial<Settings>)): Settings {
    const changes = typeof patch === 'function' ? patch(this.#value) : patch;
    this.#value = { ...cloneSettings(this.#value), ...changes };
    this.#flush();
    return this.#value;
  }

  setPlacement(orientation: Orientation, id: TouchControlId, placement: ControlPlacement): void {
    const next = cloneSettings(this.#value);
    next.layouts[orientation][id] = { ...placement };
    this.#value = next;
    this.#flush();
  }

  resetLayout(orientation: Orientation): void {
    const next = cloneSettings(this.#value);
    next.layouts[orientation] = cloneLayout(DEFAULT_SETTINGS.layouts[orientation]);
    this.#value = next;
    this.#flush();
  }

  resetAll(): void {
    this.#value = cloneSettings(DEFAULT_SETTINGS);
    this.#flush();
  }

  #flush(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.#value));
    } catch {
      // Sin persistencia la sesion sigue siendo usable, solo no sobrevive al cierre.
    }
    for (const listener of this.#listeners) listener(this.#value);
  }
}

export const settings = new SettingsStore();
