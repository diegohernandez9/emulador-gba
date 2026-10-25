import { emulator, GBA_BUTTONS, type GbaButton } from '../core/emulator';
import { settings } from '../core/settings';
import type { GamepadInput } from '../input/gamepad';
import { keyLabel, sdlKeyName } from '../input/keyboard';
import { el, field, sheet, toast, toggle } from './dom';

export interface SettingsPanelDeps {
  gamepad: GamepadInput;
  onVideoChange: () => void;
  onTouchChange: () => void;
  onEditLayout: () => void;
  onRebindKeyboard: () => void;
}

const SCALING_LABELS: Record<string, string> = {
  fit: 'Ajustar a pantalla',
  integer: 'Escalado entero (mas nitido)',
  stretch: 'Estirar (deforma)',
};

/** Fila de asignacion: muestra la tecla o boton actual y espera uno nuevo al pulsarla. */
const bindingRow = (
  button: GbaButton,
  currentLabel: string,
  listen: (done: (label: string | null) => void) => () => void
): HTMLDivElement => {
  const action = el('button', { type: 'button', text: currentLabel });
  let cancel: (() => void) | null = null;

  action.addEventListener('click', () => {
    if (cancel) {
      cancel();
      cancel = null;
      action.classList.remove('listening');
      action.textContent = currentLabel;
      return;
    }
    action.classList.add('listening');
    action.textContent = 'Pulsa...';
    cancel = listen((label) => {
      cancel = null;
      action.classList.remove('listening');
      if (label) currentLabel = label;
      action.textContent = currentLabel;
    });
  });

  return el('div', { class: 'binding-row' }, el('span', { text: button }), action);
};

export const createSettingsPanel = (deps: SettingsPanelDeps) =>
  sheet('Ajustes', () => {
    const current = settings.current;

    // --- Video
    const scaling = el('select');
    for (const value of ['fit', 'integer', 'stretch'] as const) {
      const option = el('option', { value, text: SCALING_LABELS[value] ?? value });
      if (current.videoScaling === value) option.selected = true;
      scaling.append(option);
    }
    scaling.addEventListener('change', () => {
      settings.update({ videoScaling: scaling.value as 'fit' | 'integer' | 'stretch' });
      deps.onVideoChange();
    });

    // --- Audio
    const volume = el('input', {
      type: 'range',
      min: '0',
      max: '100',
      step: '5',
      value: String(Math.round(current.volume * 100)),
    });
    volume.addEventListener('input', () => {
      const value = Number(volume.value) / 100;
      settings.update({ volume: value });
      if (emulator.ready) emulator.setVolume(value);
    });

    // --- Controles tactiles
    const touchVisible = toggle(current.touchVisible, (next) => {
      settings.update({ touchVisible: next });
      deps.onTouchChange();
    });

    const opacity = el('input', {
      type: 'range',
      min: '15',
      max: '100',
      step: '5',
      value: String(Math.round(current.touchOpacity * 100)),
    });
    opacity.addEventListener('input', () => {
      settings.update({ touchOpacity: Number(opacity.value) / 100 });
      deps.onTouchChange();
    });

    const editLayout = el('button', { type: 'button', text: 'Colocar' });
    editLayout.addEventListener('click', () => deps.onEditLayout());

    // --- Velocidad y rebobinado
    const fastForward = el('input', {
      type: 'number',
      min: '2',
      max: '16',
      step: '1',
      value: String(current.fastForwardMultiplier),
    });
    fastForward.addEventListener('change', () => {
      const value = Math.max(2, Math.min(16, Number(fastForward.value) || 3));
      fastForward.value = String(value);
      settings.update({ fastForwardMultiplier: value });
    });

    const rewind = toggle(current.rewindEnabled, (next) => {
      settings.update({ rewindEnabled: next });
      if (emulator.ready) emulator.setRewindEnabled(next);
    });

    const autoSave = toggle(current.autoSaveState, (next) => {
      settings.update({ autoSaveState: next });
      if (emulator.ready) emulator.configure({ autoSaveStateEnable: next });
    });

    // --- Teclado
    const keyboardRows = GBA_BUTTONS.map((button) =>
      bindingRow(button, keyLabel(settings.current.keyboard[button]), (done) => {
        const handler = (event: KeyboardEvent): void => {
          event.preventDefault();
          const sdl = sdlKeyName(event.code);
          cleanup();
          if (!sdl) {
            toast('Esa tecla no se puede asignar', 'error');
            done(null);
            return;
          }
          settings.update((state) => ({ keyboard: { ...state.keyboard, [button]: sdl } }));
          deps.onRebindKeyboard();
          done(keyLabel(sdl));
        };
        const cleanup = (): void => globalThis.removeEventListener('keydown', handler, true);
        globalThis.addEventListener('keydown', handler, true);
        return cleanup;
      })
    );

    // --- Mando
    const gamepadRows = GBA_BUTTONS.map((button) =>
      bindingRow(button, `Boton ${settings.current.gamepad[button]}`, (done) => {
        void deps.gamepad.captureNextButton().then((index) => {
          settings.update((state) => ({ gamepad: { ...state.gamepad, [button]: index } }));
          done(`Boton ${index}`);
        });
        return () => deps.gamepad.cancelCapture();
      })
    );

    const resetAll = el('button', { type: 'button', text: 'Restablecer todo', class: 'danger' });
    resetAll.addEventListener('click', () => {
      settings.resetAll();
      deps.onVideoChange();
      deps.onTouchChange();
      deps.onRebindKeyboard();
      toast('Ajustes restablecidos. Vuelve a abrir el panel.');
    });

    return [
      el('p', { class: 'section-title', text: 'Pantalla' }),
      field('Escalado', scaling),

      el('p', { class: 'section-title', text: 'Sonido' }),
      field('Volumen', volume),

      el('p', { class: 'section-title', text: 'Controles en pantalla' }),
      field('Mostrar controles', touchVisible),
      field('Opacidad', opacity),
      field('Posicion y tamano', editLayout, 'Se guarda aparte en vertical y horizontal'),

      el('p', { class: 'section-title', text: 'Velocidad' }),
      field('Multiplicador de avance rapido', fastForward),
      field('Rebobinado', rewind, 'Permite retroceder unos segundos'),
      field('Autoguardado de estado', autoSave, 'Recupera la partida si cierras la app'),

      el('p', { class: 'section-title', text: 'Teclado' }),
      el('div', { class: 'binding-list' }, ...keyboardRows),

      el('p', { class: 'section-title', text: 'Mando' }),
      el(
        'div',
        { class: 'edit-hint' },
        deps.gamepad.connected
          ? 'Mando detectado.'
          : 'Conecta un mando por Bluetooth para asignar sus botones.'
      ),
      el('div', { class: 'binding-list' }, ...gamepadRows),

      resetAll,
    ];
  });
