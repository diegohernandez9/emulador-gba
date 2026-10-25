type Attrs<K extends keyof HTMLElementTagNameMap> = Partial<
  Omit<HTMLElementTagNameMap[K], 'style' | 'dataset' | 'children'>
> & {
  class?: string;
  text?: string;
  html?: string;
  dataset?: Record<string, string>;
  style?: Partial<CSSStyleDeclaration>;
};

type Child = Node | string | null | undefined | false;

export const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs<K> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  const { class: className, text, html, dataset, style, ...rest } = attrs;

  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  if (html !== undefined) node.innerHTML = html;
  if (dataset) Object.assign(node.dataset, dataset);
  if (style) Object.assign(node.style, style);
  Object.assign(node, rest);

  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child);
  }
  return node;
};

export const clear = (node: Element): void => {
  node.replaceChildren();
};

let toastHost: HTMLDivElement | null = null;

export const toast = (message: string, kind: 'info' | 'ok' | 'error' = 'info'): void => {
  if (!toastHost) {
    toastHost = el('div', { class: 'toast-host' });
    document.body.append(toastHost);
  }
  const node = el('div', { class: `toast ${kind}`, text: message });
  toastHost.append(node);
  setTimeout(() => {
    node.style.transition = 'opacity 200ms ease';
    node.style.opacity = '0';
    setTimeout(() => node.remove(), 220);
  }, kind === 'error' ? 3600 : 1700);
};

/** Interruptor accesible con el aspecto del de iOS. */
export const toggle = (checked: boolean, onChange: (next: boolean) => void): HTMLButtonElement => {
  const button = el('button', { class: 'switch', type: 'button' });
  button.setAttribute('role', 'switch');
  button.setAttribute('aria-checked', String(checked));
  button.addEventListener('click', () => {
    const next = button.getAttribute('aria-checked') !== 'true';
    button.setAttribute('aria-checked', String(next));
    onChange(next);
  });
  return button;
};

export const field = (label: string, control: Node, hint?: string): HTMLDivElement =>
  el(
    'div',
    { class: 'field' },
    el('span', {}, el('span', { text: label }), hint ? el('small', { text: hint }) : null),
    control
  );

/** Hoja modal anclada abajo, que es donde alcanza el pulgar en un telefono. */
export const sheet = (
  title: string,
  build: (close: () => void) => Node[]
): { open: () => void; close: () => void } => {
  let backdrop: HTMLDivElement | null = null;

  const close = (): void => {
    backdrop?.remove();
    backdrop = null;
  };

  const open = (): void => {
    if (backdrop) return;
    const closeButton = el('button', { class: 'ghost', text: 'Cerrar', type: 'button' });
    closeButton.addEventListener('click', close);

    const panel = el(
      'div',
      { class: 'sheet' },
      el('div', { class: 'sheet-header' }, el('h2', { text: title }), closeButton),
      el('div', { class: 'sheet-body' }, ...build(close))
    );

    backdrop = el('div', { class: 'sheet-backdrop' }, panel);
    backdrop.addEventListener('pointerdown', (event) => {
      if (event.target === backdrop) close();
    });
    document.body.append(backdrop);
  };

  return { open, close };
};

export const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export const downloadBlob = (data: BlobPart, filename: string, type = 'application/octet-stream'): void => {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const link = el('a', { href: url, download: filename });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
