/**
 * Importes y porcentajes. Todo el dinero se maneja como número entero de céntimos
 * y los porcentajes como puntos básicos (1 % = 100), así nunca se suman decimales de coma flotante.
 * Este archivo no depende de Astro: lo usan las páginas, el script del formulario y las pruebas.
 */

/** Importe máximo de un gasto: 1.000.000,00 €. */
export const MAX_AMOUNT_CENTS = 100_000_000;

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

const NBSP = '\u00a0';
const MINUS = '\u2212';

/** Separa los miles con punto, como se escribe en España (Intl no agrupa los números de 4 cifras en «es»). */
function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** 128460 → «1.284,60 €». Con `sign: true` añade «+» a los positivos (para saldos). */
export function formatEuros(cents: number, { sign = false } = {}): string {
  if (!Number.isSafeInteger(cents)) throw new TypeError(`Importe no válido: ${cents}`);
  const abs = Math.abs(cents);
  const euros = groupThousands(String(Math.floor(abs / 100)));
  const decimals = String(abs % 100).padStart(2, '0');
  const prefix = cents < 0 ? MINUS : sign && cents > 0 ? '+' : '';
  return `${prefix}${euros},${decimals}${NBSP}€`;
}

/** 128460 → «1284,60», el formato que se rellena en los campos de importe. */
export function centsToInput(cents: number): string {
  return `${Math.floor(cents / 100)},${String(cents % 100).padStart(2, '0')}`;
}

/**
 * Convierte en un número entero de unidades mínimas un texto con hasta `decimals` decimales.
 * Acepta coma decimal («12,5»), punto decimal («12.5») y puntos de miles («1.284,60», «1.284»):
 * si hay coma, los puntos son de miles; si no, un punto seguido de exactamente tres cifras también.
 */
function parseDecimal(raw: string, decimals: number): number | null {
  let text = raw.replace(/[\s\u00a0€%]/g, '');
  if (text === '') return null;
  if (text.includes(',')) {
    if (!/^\d{1,3}(\.\d{3})*(,\d*)?$|^\d+(,\d*)?$/.test(text)) return NaN;
    text = text.replace(/\./g, '').replace(',', '.');
  } else if (/^\d{1,3}(\.\d{3})+$/.test(text)) {
    text = text.replace(/\./g, '');
  }
  const match = /^(\d+)(?:\.(\d*))?$/.exec(text);
  if (!match) return NaN;
  const [, whole, fraction = ''] = match;
  if (fraction.length > decimals || whole.length > 12) return NaN;
  return Number(whole) * 10 ** decimals + Number(fraction.padEnd(decimals, '0') || '0');
}

/** «1.284,60» → 128460 céntimos. Debe ser mayor que cero y no superar MAX_AMOUNT_CENTS. */
export function parseAmount(raw: string): Parsed<number> {
  const cents = parseDecimal(raw, 2);
  if (cents === null) return { ok: false, error: 'Escribe un importe.' };
  if (Number.isNaN(cents)) return { ok: false, error: 'Escribe un importe válido, con hasta dos decimales: por ejemplo 12,50.' };
  if (cents <= 0) return { ok: false, error: 'El importe tiene que ser mayor que cero.' };
  if (cents > MAX_AMOUNT_CENTS) return { ok: false, error: `El importe no puede pasar de ${formatEuros(MAX_AMOUNT_CENTS)}.` };
  return { ok: true, value: cents };
}

/** «33,33» → 3333 puntos básicos. Vacío o 0 se devuelve como 0 (esa persona no participa). */
export function parsePercent(raw: string): Parsed<number> {
  const bp = parseDecimal(raw, 2);
  if (bp === null) return { ok: true, value: 0 };
  if (Number.isNaN(bp)) return { ok: false, error: 'Escribe porcentajes válidos, con hasta dos decimales: por ejemplo 33,33.' };
  if (bp > 10_000) return { ok: false, error: 'Ningún porcentaje puede pasar del 100 %.' };
  return { ok: true, value: bp };
}

/** Importe opcional de un reparto: vacío o 0 se devuelve como 0 (esa persona no participa). */
export function parseOptionalAmount(raw: string): Parsed<number> {
  const cents = parseDecimal(raw, 2);
  if (cents === null) return { ok: true, value: 0 };
  if (Number.isNaN(cents)) return { ok: false, error: 'Escribe importes válidos, con hasta dos decimales: por ejemplo 12,50.' };
  if (cents > MAX_AMOUNT_CENTS) return { ok: false, error: `Ningún importe puede pasar de ${formatEuros(MAX_AMOUNT_CENTS)}.` };
  return { ok: true, value: cents };
}

/** 3333 → «33,33 %»; 2500 → «25 %». */
export function formatPercent(bp: number): string {
  const whole = Math.floor(bp / 100);
  const rest = bp % 100;
  return `${whole}${rest ? ',' + String(rest).padStart(2, '0').replace(/0$/, '') : ''}${NBSP}%`;
}

/** 3333 → «33,33», el formato que se rellena en los campos de porcentaje. */
export function percentToInput(bp: number): string {
  return formatPercent(bp).replace(/\u00a0%$/, '');
}
