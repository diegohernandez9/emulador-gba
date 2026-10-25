import { emulator } from '../core/emulator';
import { settings } from '../core/settings';
import { clear, downloadBlob, el, formatBytes, toast } from './dom';

const ACCEPTED = '.gba,.gb,.gbc,.zip,.7z';

export interface LibraryCallbacks {
  onPlay: (romName: string) => void;
  onOpenSettings: () => void;
}

export class LibraryView {
  readonly element: HTMLDivElement;

  #callbacks: LibraryCallbacks;
  #grid: HTMLUListElement;
  #romInput: HTMLInputElement;
  #saveInput: HTMLInputElement;

  constructor(callbacks: LibraryCallbacks) {
    this.#callbacks = callbacks;
    this.#grid = el('ul', { class: 'rom-grid' });

    this.#romInput = el('input', {
      type: 'file',
      accept: ACCEPTED,
      multiple: true,
      hidden: true,
    });
    this.#romInput.addEventListener('change', () => {
      void this.#handleRomFiles(this.#romInput.files);
    });

    this.#saveInput = el('input', { type: 'file', accept: '.sav,.ss1,.ss2,.ss3', hidden: true });
    this.#saveInput.addEventListener('change', () => {
      void this.#handleSaveFile(this.#saveInput.files?.[0]);
    });

    const addButton = el('button', { type: 'button', text: 'Anadir ROM', class: 'primary' });
    addButton.addEventListener('click', () => this.#romInput.click());

    const importSave = el('button', { type: 'button', text: 'Importar partida', class: 'ghost' });
    importSave.addEventListener('click', () => this.#saveInput.click());

    const settingsButton = el('button', { type: 'button', text: 'Ajustes', class: 'ghost' });
    settingsButton.addEventListener('click', () => this.#callbacks.onOpenSettings());

    this.element = el(
      'div',
      { class: 'view library' },
      el(
        'div',
        { class: 'library-header' },
        el('h1', { text: 'Mis juegos' }),
        el('div', { class: 'library-actions' }, addButton, importSave, settingsButton)
      ),
      this.#grid,
      this.#romInput,
      this.#saveInput
    );
  }

  show(): void {
    this.element.hidden = false;
    this.refresh();
  }

  hide(): void {
    this.element.hidden = true;
  }

  refresh(): void {
    const roms = emulator.listRoms().sort((a, b) => a.localeCompare(b, 'es'));
    clear(this.#grid);

    if (roms.length === 0) {
      this.#grid.append(
        el(
          'li',
          { class: 'empty-state' },
          el('strong', { text: 'Todavia no hay juegos' }),
          el('span', {
            text: 'Usa "Anadir ROM" para cargar tus archivos .gba. Se guardan en este dispositivo y quedan disponibles sin conexion.',
          })
        )
      );
      return;
    }

    for (const rom of roms) {
      this.#grid.append(this.#card(rom));
    }
  }

  #card(rom: string): HTMLLIElement {
    const size = emulator.romSize(rom);

    const play = el('button', { type: 'button', text: 'Jugar', class: 'primary' });
    play.addEventListener('click', () => this.#callbacks.onPlay(rom));

    const exportSave = el('button', { type: 'button', text: 'Exportar', class: 'ghost' });
    exportSave.addEventListener('click', () => {
      const path = emulator.savePathFor(rom);
      const data = emulator.readFile(path);
      if (!data) {
        toast('Este juego todavia no tiene partida guardada', 'error');
        return;
      }
      downloadBlob(data, path.split('/').pop() ?? 'partida.sav');
      toast('Partida exportada', 'ok');
    });

    const remove = el('button', { type: 'button', text: 'Borrar', class: 'danger' });
    remove.addEventListener('click', () => {
      if (!confirm(`Quitar "${rom}" de la biblioteca?\n\nLas partidas guardadas se conservan.`)) {
        return;
      }
      emulator.deleteRom(rom);
      void emulator.persist();
      if (settings.current.lastRom === rom) settings.update({ lastRom: null });
      this.refresh();
      toast('Juego eliminado');
    });

    return el(
      'li',
      { class: 'rom-card' },
      el('span', { class: 'rom-name', text: rom }),
      el('span', { class: 'rom-meta', text: size === null ? 'Tamano desconocido' : formatBytes(size) }),
      el('div', { class: 'rom-card-actions' }, play, exportSave, remove)
    );
  }

  async #handleRomFiles(files: FileList | null): Promise<void> {
    if (!files || files.length === 0) return;
    let imported = 0;

    for (const file of Array.from(files)) {
      try {
        await emulator.importRom(file);
        imported += 1;
      } catch (error) {
        console.error(error);
        toast(`No se pudo importar ${file.name}`, 'error');
      }
    }

    this.#romInput.value = '';
    this.refresh();
    if (imported > 0) {
      toast(imported === 1 ? 'Juego anadido' : `${imported} juegos anadidos`, 'ok');
    }
  }

  async #handleSaveFile(file: File | undefined): Promise<void> {
    if (!file) return;
    try {
      await emulator.importSaveFile(file);
      toast('Partida importada', 'ok');
    } catch (error) {
      console.error(error);
      toast('No se pudo importar la partida', 'error');
    }
    this.#saveInput.value = '';
  }
}
