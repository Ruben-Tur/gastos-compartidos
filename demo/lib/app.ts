/**
 * Utilidades de navegador para las páginas de la demo: rutas con parámetros (?g=…), acceso a
 * localStorage, mensajes y creación de elementos. Todo el texto del usuario se pinta con
 * textContent o atributos, nunca con innerHTML.
 */
import { FLASH, flashMessage as flashFor } from '../../src/lib/format.ts';
import { DemoError, findGroup, loadState, saveState, SEED_GROUP_ID, type DemoGroup, type DemoState } from './store.ts';

// ---------------------------------------------------------------------------
// Rutas: páginas estáticas con parámetros de consulta (sin reescrituras en el servidor)
// ---------------------------------------------------------------------------

const BASE = import.meta.env.BASE_URL.replace(/\/?$/, '/');

function url(path: string, params: Record<string, string | number | undefined>, hash?: string) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value !== undefined) query.set(key, String(value));
  const search = query.toString();
  return `${BASE}${path}${search ? `?${search}` : ''}${hash ? `#${hash}` : ''}`;
}

export const routes = {
  home: () => BASE,
  group: (id: string, ok?: string, hash?: string) => url('grupo/', { g: id, ok }, hash),
  people: (id: string, ok?: string) => url('grupo/personas/', { g: id, ok }),
  newExpense: (id: string) => url('grupo/gasto/', { g: id }),
  expense: (id: string, expenseId: number) => url('grupo/gasto/', { g: id, e: expenseId }),
};

export function param(name: string): string | null {
  return new URLSearchParams(location.search).get(name);
}

// ---------------------------------------------------------------------------
// Datos
// ---------------------------------------------------------------------------

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Carga el estado al abrir una página. Si lo guardado no era válido, se ha cambiado por el ejemplo:
 * se lleva al visitante al ejemplo con un aviso y devuelve null (la página no sigue pintando).
 */
export function boot(): { state: DemoState; firstVisit: boolean; readOnly: boolean } | null {
  const { state, status } = loadState(storage());
  if (status === 'corrupt') {
    location.replace(routes.group(SEED_GROUP_ID, 'demo-corrupta'));
    return null;
  }
  return { state, firstVisit: status === 'seeded', readOnly: status === 'unavailable' };
}

/**
 * Aplica un cambio sobre el estado recién leído y lo guarda. Si falla, no se guarda nada y se lanza
 * DemoError con el mensaje para el usuario.
 */
export function commit<T>(change: (state: DemoState) => T): T {
  const store = storage();
  const { state } = loadState(store);
  const result = change(state);
  saveState(store, state);
  return result;
}

/** Grupo del parámetro ?g=, o null si no existe en este navegador. */
export function currentGroup(state: DemoState): DemoGroup | null {
  return findGroup(state, param('g')) ?? null;
}

// ---------------------------------------------------------------------------
// Mensajes
// ---------------------------------------------------------------------------

/** Mensajes tras un cambio (?ok=…): los de la web más los propios de la demo. Solo textos fijos. */
const MESSAGES: Record<string, string> = {
  ...FLASH,
  creado: 'Grupo creado. En la demo se guarda solo en este navegador.',
  'demo-restablecida': 'Demo restablecida: vuelve a estar solo el ejemplo «Viaje a Lisboa».',
  'demo-corrupta': 'Los datos guardados de la demo no eran válidos y se ha vuelto a cargar el ejemplo.',
};

export function flashMessage(): string | null {
  return flashFor(param('ok'), MESSAGES);
}

/** Pinta el aviso tras un cambio y, si lo hay, el error (como hace la web al volver a pintar la página). */
export function showMessages(container: HTMLElement, error?: string) {
  const items: HTMLElement[] = [];
  const flash = error ? null : flashMessage();
  if (flash) items.push(h('p', { class: 'notice flash', role: 'status' }, flash));
  if (error) {
    items.push(h('p', { class: 'notice notice--error flash', role: 'alert' }, h('strong', {}, 'No se ha podido hacer:'), ` ${error}`));
  }
  container.replaceChildren(...items);
}

/** Mensaje de un error esperado; cualquier otro error se vuelve a lanzar. */
export function userMessage(error: unknown): string {
  if (error instanceof DemoError) return error.message;
  throw error;
}

/** Ruta tras guardar un cambio: como la redirección 303 de la web, la página se vuelve a pintar entera. */
export function go(href: string) {
  location.assign(href);
}

/** Título de la pestaña, igual que en la web. */
export function setTitle(title: string) {
  document.title = `${title} · Cuentas claras`;
}

// ---------------------------------------------------------------------------
// Elementos
// ---------------------------------------------------------------------------

type Child = Node | string | null | undefined | false;

/** Crea un elemento con atributos e hijos. Las cadenas se añaden como texto, nunca como HTML. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number | boolean | undefined> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) {
    if (value === undefined || value === false) continue;
    el.setAttribute(name, value === true ? '' : String(value));
  }
  el.append(...children.filter((c): c is Node | string => c !== null && c !== undefined && c !== false));
  return el;
}

/** Igual que h() pero para SVG (las barras de los saldos). */
export function svg(tag: string, attrs: Record<string, string | number> = {}, ...children: Node[]): SVGElement {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [name, value] of Object.entries(attrs)) el.setAttribute(name, String(value));
  el.append(...children);
  return el;
}

/** Texto oculto a la vista pero leído por lectores de pantalla. */
export const srOnly = (text: string) => h('span', { class: 'sr-only' }, text);

/** Bloque «Revisa el formulario:» con la lista de errores, como el de la web. */
export function errorNotice(title: string, messages: string[]): HTMLElement {
  return h('div', { class: 'notice notice--error', role: 'alert' }, h('strong', {}, title), h('ul', {}, ...messages.map((m) => h('li', {}, m))));
}

/**
 * Marca un campo como erróneo (aria-invalid, mensaje debajo y aria-describedby) o lo limpia.
 * `anchor` es el elemento tras el que va el mensaje (por defecto, el propio campo).
 */
export function setFieldError(field: HTMLElement, errorId: string, message: string | undefined, anchor: Element = field) {
  field.dataset.describedby ??= field.getAttribute('aria-describedby') ?? '';
  document.getElementById(errorId)?.remove();
  const own = field.dataset.describedby;
  if (message) {
    field.setAttribute('aria-invalid', 'true');
    field.setAttribute('aria-describedby', [own, errorId].filter(Boolean).join(' '));
    anchor.after(h('p', { class: 'field-error', id: errorId }, message));
  } else {
    field.removeAttribute('aria-invalid');
    if (own) field.setAttribute('aria-describedby', own);
    else field.removeAttribute('aria-describedby');
  }
}

/** Muestra la vista «no encontrado» y esconde la aplicación. */
export function showNotFound() {
  const notFound = document.getElementById('not-found');
  if (notFound) notFound.hidden = false;
  document.title = 'Grupo no encontrado · Cuentas claras';
}
