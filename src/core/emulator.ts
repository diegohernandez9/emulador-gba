import type * as mGBANS from '@thenick775/mgba-wasm';

export type Emulator = mGBANS.mGBAEmulator;
export type CoreSettings = mGBANS.coreSettings;

/** Botones del GBA tal como los nombra el core. */
export const GBA_BUTTONS = [
  'A', 'B', 'L', 'R', 'Start', 'Select', 'Up', 'Down', 'Left', 'Right',
] as const;
export type GbaButton = (typeof GBA_BUTTONS)[number];

/** Descarta las entradas de directorio que devuelve el FS de Emscripten. */
const isRealFile = (name: string): boolean => name !== '.' && name !== '..';

export class EmulatorNotReadyError extends Error {
  constructor() {
    super('El core todavia no esta inicializado');
    this.name = 'EmulatorNotReadyError';
  }
}

/**
 * Envoltorio sobre el core mGBA-wasm.
 *
 * El core es un runtime con estado: se crea una sola vez contra un canvas y
 * despues se maneja de forma imperativa. Esta clase concentra ese estado y
 * ofrece una superficie acotada al resto de la app.
 */
export class GbaEmulator {
  #core: Emulator | null = null;
  #running = false;
  #paused = false;
  #currentRom: string | null = null;

  get ready(): boolean {
    return this.#core !== null;
  }

  get running(): boolean {
    return this.#running;
  }

  get paused(): boolean {
    return this.#paused;
  }

  get currentRom(): string | null {
    return this.#currentRom;
  }

  get core(): Emulator {
    if (!this.#core) throw new EmulatorNotReadyError();
    return this.#core;
  }

  /**
   * Arranca el runtime. `mgba.js` se carga desde /core/ en vez de node_modules
   * porque el worker de pthreads se instancia a partir de esa misma URL y debe
   * ser un archivo estatico del mismo origen.
   */
  async boot(canvas: HTMLCanvasElement): Promise<void> {
    if (this.#core) return;

    if (!globalThis.crossOriginIsolated) {
      throw new Error(
        'La pagina no esta aislada (COOP/COEP). El core de mGBA necesita SharedArrayBuffer.'
      );
    }

    // El import se construye en tiempo de ejecucion para que el bundler no
    // reescriba la ruta: mgba.js vive en /public y debe llegar al navegador tal
    // cual, junto a su .wasm, porque el worker de pthreads se crea desde esa URL.
    const importCore = new Function('url', 'return import(url)') as (
      url: string
    ) => Promise<{ default: typeof mGBANS.default }>;
    // BASE_URL incluye la barra final y vale '/' cuando se sirve desde la raiz.
    const mod = await importCore(`${import.meta.env.BASE_URL}core/mgba.js`);
    const core = await mod.default({ canvas });
    await core.FSInit();
    this.#core = core;
  }

  /** Guarda el FS virtual en IndexedDB. Sin esto nada sobrevive al cierre. */
  async persist(): Promise<void> {
    if (!this.#core) return;
    await this.#core.FSSync();
  }

  configure(settings: CoreSettings): void {
    this.core.setCoreSettings(settings);
  }

  onCoreEvents(callbacks: mGBANS.coreCallbacks): void {
    this.core.addCoreCallbacks(callbacks);
  }

  // --- ROMs -----------------------------------------------------------------

  listRoms(): string[] {
    // readdir del FS de Emscripten incluye las entradas '.' y '..'.
    return this.#core ? this.#core.listRoms().filter(isRealFile) : [];
  }

  /** Copia el archivo al FS virtual y lo persiste. Devuelve el nombre guardado. */
  async importRom(file: File): Promise<string> {
    const core = this.core;
    await new Promise<void>((resolve) => core.uploadRom(file, resolve));
    await core.FSSync();
    return file.name;
  }

  /** Importa un .sav o un save state exportado previamente. */
  async importSaveFile(file: File): Promise<void> {
    const core = this.core;
    await new Promise<void>((resolve) => core.uploadSaveOrSaveState(file, resolve));
    await core.FSSync();
  }

  deleteRom(romName: string): void {
    const core = this.core;
    const { gamePath } = core.filePaths();
    try {
      core.FS.unlink(`${gamePath}/${romName}`);
    } catch {
      // Si ya no existe en el FS damos la operacion por hecha.
    }
  }

  /** Tamano en bytes de una ROM del FS virtual, o null si no se puede leer. */
  romSize(romName: string): number | null {
    if (!this.#core) return null;
    const { gamePath } = this.#core.filePaths();
    try {
      const stat = this.#core.FS.stat(`${gamePath}/${romName}`) as { size: number };
      return stat.size;
    } catch {
      return null;
    }
  }

  /** Ruta del guardado nativo (.sav) asociado a una ROM. */
  savePathFor(romName: string): string {
    const { savePath } = this.core.filePaths();
    return `${savePath}/${romName.replace(/\.[^.]+$/, '')}.sav`;
  }

  async start(romName: string): Promise<boolean> {
    const core = this.core;
    if (this.#running) this.stop();

    const { gamePath } = core.filePaths();
    const ok = core.loadGame(`${gamePath}/${romName}`);
    if (!ok) return false;

    this.#running = true;
    this.#paused = false;
    this.#currentRom = romName;
    return true;
  }

  stop(): void {
    if (!this.#core || !this.#running) return;
    this.#core.quitGame();
    this.#running = false;
    this.#paused = false;
    this.#currentRom = null;
  }

  reset(): void {
    if (this.#running) this.core.quickReload();
  }

  // --- Ejecucion ------------------------------------------------------------

  pause(): void {
    if (!this.#running || this.#paused) return;
    this.core.pauseGame();
    this.core.pauseAudio();
    this.#paused = true;
  }

  resume(): void {
    if (!this.#running || !this.#paused) return;
    this.core.resumeGame();
    this.core.resumeAudio();
    void this.unlockAudio();
    this.#paused = false;
  }

  /**
   * Safari exige que el AudioContext se reanude dentro de un gesto del usuario,
   * de lo contrario el juego corre en silencio.
   */
  async unlockAudio(): Promise<void> {
    const ctx = this.#core?.SDL2?.audioContext;
    if (ctx && ctx.state !== 'running') await ctx.resume();
  }

  setVolume(percent: number): void {
    this.core.setVolume(Math.max(0, Math.min(1, percent)));
  }

  setFastForward(multiplier: number): void {
    this.core.setFastForwardMultiplier(multiplier);
  }

  setRewindEnabled(enabled: boolean): void {
    this.core.toggleRewind(enabled);
  }

  // --- Entrada --------------------------------------------------------------

  press(button: GbaButton): void {
    if (this.#running) this.core.buttonPress(button);
  }

  release(button: GbaButton): void {
    if (this.#running) this.core.buttonUnpress(button);
  }

  /** Asocia una tecla fisica (nombre SDL) a un boton del GBA. */
  bindKey(sdlKeyName: string, button: GbaButton): void {
    this.core.bindKey(sdlKeyName, button);
  }

  /** Corta la entrada propia del core mientras el usuario edita los controles. */
  setInputEnabled(enabled: boolean): void {
    this.core.toggleInput(enabled);
  }

  // --- Guardado -------------------------------------------------------------

  /** Save state en un slot. Es la operacion del guardado rapido. */
  async saveState(slot: number): Promise<boolean> {
    const ok = this.core.saveState(slot);
    if (ok) await this.core.FSSync();
    return ok;
  }

  loadState(slot: number): boolean {
    return this.core.loadState(slot);
  }

  /** Vuelca la SRAM de la partida (el guardado nativo del juego) a IndexedDB. */
  async flushBatterySave(): Promise<void> {
    if (!this.#running) return;
    await this.core.FSSync();
  }

  /**
   * Slots de save state ocupados por la ROM en curso, con su fecha.
   * mGBA escribe los estados como `<nombre-rom>.ss<slot>` dentro de /data/states.
   */
  stateSlots(): Map<number, Date> {
    const found = new Map<number, Date>();
    if (!this.#core || !this.#currentRom) return found;

    const { saveStatePath } = this.#core.filePaths();
    const base = this.#currentRom.replace(/\.[^.]+$/, '');

    let entries: string[];
    try {
      entries = this.#core.FS.readdir(saveStatePath) as string[];
    } catch {
      return found;
    }

    for (const entry of entries) {
      const match = entry.match(/^(.*)\.ss(\d+)$/);
      if (!match || match[1] !== base) continue;
      const slot = Number(match[2]);
      try {
        const stat = this.#core.FS.stat(`${saveStatePath}/${entry}`) as { mtime: Date };
        found.set(slot, new Date(stat.mtime));
      } catch {
        found.set(slot, new Date(0));
      }
    }
    return found;
  }

  /** Borra un slot de save state de la ROM en curso. */
  async deleteState(slot: number): Promise<void> {
    if (!this.#core || !this.#currentRom) return;
    const { saveStatePath } = this.#core.filePaths();
    const base = this.#currentRom.replace(/\.[^.]+$/, '');
    try {
      this.#core.FS.unlink(`${saveStatePath}/${base}.ss${slot}`);
      await this.#core.FSSync();
    } catch {
      // Ya no estaba: nada que borrar.
    }
  }

  listSaves(): string[] {
    return this.#core ? this.#core.listSaves().filter(isRealFile) : [];
  }

  /** Exporta un archivo del FS virtual para descargarlo. */
  readFile(path: string): Uint8Array<ArrayBuffer> | null {
    try {
      const data = this.core.FS.readFile(path) as Uint8Array;
      // El core corre con threads, asi que el FS puede devolver una vista sobre
      // SharedArrayBuffer, y con eso no se puede construir un Blob: hay que
      // copiar los bytes a memoria no compartida.
      const copy = new Uint8Array(data.byteLength);
      copy.set(data);
      return copy;
    } catch {
      return null;
    }
  }

  screenshot(fileName?: string): boolean {
    return this.#running ? this.core.screenshot(fileName) : false;
  }
}

export const emulator = new GbaEmulator();
