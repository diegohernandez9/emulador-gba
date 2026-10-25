import { emulator } from '../core/emulator';
import { QUICK_SLOT } from './player';
import { clear, el, sheet, toast } from './dom';

/** Slots visibles. El primero es el que usan los botones de guardado rapido. */
const SLOTS = [1, 2, 3, 4, 5, 6, 7, 8];

const formatDate = (date: Date): string => {
  if (date.getTime() === 0) return 'Guardado';
  return new Intl.DateTimeFormat('es-CL', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

export const createStatesPanel = () =>
  sheet('Estados de guardado', () => {
    const grid = el('div', { class: 'slot-grid' });

    const render = (): void => {
      const used = emulator.stateSlots();
      clear(grid);

      for (const slot of SLOTS) {
        const stamp = used.get(slot);
        const isQuick = slot === QUICK_SLOT;

        const save = el('button', { type: 'button', text: 'Guardar' });
        save.addEventListener('click', () => {
          void emulator.saveState(slot).then((ok) => {
            toast(ok ? `Guardado en ${slot}` : 'No se pudo guardar', ok ? 'ok' : 'error');
            render();
          });
        });

        const load = el('button', { type: 'button', text: 'Cargar' });
        load.disabled = !stamp;
        load.addEventListener('click', () => {
          const ok = emulator.loadState(slot);
          toast(ok ? `Cargado del ${slot}` : 'No se pudo cargar', ok ? 'ok' : 'error');
        });

        const remove = el('button', { type: 'button', text: 'X', class: 'danger', title: 'Borrar' });
        remove.disabled = !stamp;
        remove.addEventListener('click', () => {
          void emulator.deleteState(slot).then(() => {
            toast(`Slot ${slot} borrado`);
            render();
          });
        });

        grid.append(
          el(
            'div',
            { class: 'slot' },
            el('span', { class: 'slot-label', text: isQuick ? `Slot ${slot} (rapido)` : `Slot ${slot}` }),
            el('span', { class: 'slot-state', text: stamp ? formatDate(stamp) : 'Vacio' }),
            el('div', { class: 'slot-actions' }, save, load, remove)
          )
        );
      }
    };

    render();

    return [
      el(
        'div',
        { class: 'edit-hint' },
        'Los botones Guardar y Cargar del HUD usan siempre el slot 1.'
      ),
      grid,
    ];
  });
