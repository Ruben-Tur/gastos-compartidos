/** Ayudas de presentación para las páginas (nada de lógica de dinero aquí). */
import type { SplitMode } from './split.ts';

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'];

/** «2026-10-12» → «12 oct 2026». */
export function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/** Clase de color de un saldo según su signo. */
export function moneyClass(cents: number): string {
  return cents > 0 ? 'money money--pos' : cents < 0 ? 'money money--neg' : 'money money--zero';
}

export const MODE_LABELS: Record<SplitMode, string> = {
  equal: 'a partes iguales',
  percent: 'por porcentajes',
  exact: 'por importes',
};

/** «1 persona», «4 personas». */
export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Mensajes tras una redirección (?ok=…). Solo textos fijos: nada de lo que llega en la URL se muestra. */
export const FLASH: Record<string, string> = {
  creado: 'Grupo creado. Guarda o comparte el enlace de esta página: es la única forma de volver a entrar.',
  'gasto-nuevo': 'Gasto añadido.',
  'gasto-editado': 'Gasto guardado.',
  'gasto-borrado': 'Gasto borrado.',
  pago: 'Pago registrado. Los saldos ya lo tienen en cuenta.',
  'pago-deshecho': 'Pago deshecho.',
  persona: 'Persona añadida.',
  'persona-editada': 'Nombre cambiado.',
  'persona-borrada': 'Persona quitada del grupo.',
  'grupo-editado': 'Nombre del grupo cambiado.',
};

/**
 * Mensaje fijo para el valor de ?ok=, o null. Con Object.hasOwn: un FLASH[clave] directo devolvería
 * cosas del prototipo (?ok=constructor pintaba «[object Object]» o el código de una función).
 */
export function flashMessage(key: string | null, messages: Record<string, string> = FLASH): string | null {
  return key !== null && Object.hasOwn(messages, key) ? messages[key] : null;
}
