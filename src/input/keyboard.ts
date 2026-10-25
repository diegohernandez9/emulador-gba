import { GBA_BUTTONS, type GbaButton } from '../core/emulator';
import { settings } from '../core/settings';

/**
 * Traduce un `KeyboardEvent.code` al nombre de tecla que usa SDL, que es lo que
 * espera `bindKey` del core. Solo cubre las teclas que tiene sentido asignar.
 */
export const sdlKeyName = (code: string): string | null => {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (/^Numpad[0-9]$/.test(code)) return `Keypad ${code.slice(6)}`;
  if (/^F([1-9]|1[0-2])$/.test(code)) return code;

  const named: Record<string, string> = {
    ArrowUp: 'Up',
    ArrowDown: 'Down',
    ArrowLeft: 'Left',
    ArrowRight: 'Right',
    Enter: 'Return',
    Space: 'Space',
    Backspace: 'Backspace',
    Tab: 'Tab',
    Escape: 'Escape',
    ShiftLeft: 'Left Shift',
    ShiftRight: 'Right Shift',
    ControlLeft: 'Left Ctrl',
    ControlRight: 'Right Ctrl',
    AltLeft: 'Left Alt',
    AltRight: 'Right Alt',
    Comma: ',',
    Period: '.',
    Slash: '/',
    Semicolon: ';',
    Quote: "'",
    BracketLeft: '[',
    BracketRight: ']',
    Backslash: '\\',
    Minus: '-',
    Equal: '=',
  };
  return named[code] ?? null;
};

/** Etiqueta legible para mostrar la asignacion actual en los ajustes. */
export const keyLabel = (sdlName: string): string => sdlName.replace('Keypad ', 'Num ');

/**
 * El core ya engancha sus propios listeners de teclado, asi que aqui solo
 * trasladamos el mapeo guardado. Los atajos de la app van aparte, en la UI.
 */
export const applyKeyboardBindings = (bind: (key: string, button: GbaButton) => void): void => {
  const mapping = settings.current.keyboard;
  for (const button of GBA_BUTTONS) {
    bind(mapping[button], button);
  }
};
