/**
 * Reparto de un gasto entre sus participantes, siempre en céntimos enteros.
 * La suma de las partes es exactamente el importe del gasto: los céntimos que sobran al redondear
 * se reparten de forma determinista (mismo gasto → mismo reparto), nunca al azar.
 */
import { formatEuros, formatPercent } from './money.ts';

export type SplitMode = 'equal' | 'percent' | 'exact';
export const SPLIT_MODES: readonly SplitMode[] = ['equal', 'percent', 'exact'];

export interface Share {
  memberId: number;
  cents: number;
}

/** Lo que se pide a cada participante: nada (partes iguales), puntos básicos o céntimos. */
export interface Weight {
  memberId: number;
  value: number;
}

export type SplitResult = { ok: true; shares: Share[] } | { ok: false; error: string };

function checkTotal(total: number) {
  if (!Number.isSafeInteger(total) || total <= 0) throw new RangeError(`Importe no válido: ${total}`);
}

function checkUnique(ids: number[]): string | null {
  return new Set(ids).size === ids.length ? null : 'Una persona aparece dos veces en el reparto.';
}

/**
 * A partes iguales. Si el importe no se divide exacto, el céntimo de más va a los primeros
 * participantes en el orden recibido (el orden de las personas en el grupo).
 * 10,00 € entre 3 → 3,34 + 3,33 + 3,33.
 */
export function splitEqual(total: number, memberIds: number[]): SplitResult {
  checkTotal(total);
  if (memberIds.length === 0) return { ok: false, error: 'Elige al menos una persona para repartir el gasto.' };
  const duplicated = checkUnique(memberIds);
  if (duplicated) return { ok: false, error: duplicated };
  const base = Math.floor(total / memberIds.length);
  const remainder = total - base * memberIds.length;
  return { ok: true, shares: memberIds.map((memberId, i) => ({ memberId, cents: base + (i < remainder ? 1 : 0) })) };
}

/**
 * Por porcentajes (en puntos básicos, deben sumar 10.000 = 100 %). Método del mayor resto:
 * cada uno recibe su parte redondeada hacia abajo y los céntimos que faltan van a quienes
 * tenían mayor fracción perdida; a igualdad, al primero en el orden recibido.
 */
export function splitPercent(total: number, weights: Weight[]): SplitResult {
  checkTotal(total);
  const parts = weights.filter((w) => w.value > 0);
  if (parts.length === 0) return { ok: false, error: 'Pon un porcentaje a al menos una persona.' };
  const duplicated = checkUnique(parts.map((p) => p.memberId));
  if (duplicated) return { ok: false, error: duplicated };
  if (parts.some((p) => !Number.isSafeInteger(p.value))) return { ok: false, error: 'Hay un porcentaje no válido.' };
  const sum = parts.reduce((acc, p) => acc + p.value, 0);
  if (sum !== 10_000) {
    return { ok: false, error: `Los porcentajes suman ${formatPercent(sum)} y tienen que sumar 100 %.` };
  }

  const rows = parts.map((p, index) => {
    const exact = total * p.value; // céntimos × 10.000, sigue siendo entero seguro
    return { index, memberId: p.memberId, cents: Math.floor(exact / 10_000), lost: exact % 10_000 };
  });
  let missing = total - rows.reduce((acc, r) => acc + r.cents, 0);
  const byLost = [...rows].sort((a, b) => b.lost - a.lost || a.index - b.index);
  for (const row of byLost) {
    if (missing === 0) break;
    row.cents += 1;
    missing -= 1;
  }
  return { ok: true, shares: rows.map(({ memberId, cents }) => ({ memberId, cents })) };
}

/** Por importes exactos: lo que paga cada uno, que debe sumar el total del gasto. */
export function splitExact(total: number, weights: Weight[]): SplitResult {
  checkTotal(total);
  const parts = weights.filter((w) => w.value > 0);
  if (parts.length === 0) return { ok: false, error: 'Pon un importe a al menos una persona.' };
  const duplicated = checkUnique(parts.map((p) => p.memberId));
  if (duplicated) return { ok: false, error: duplicated };
  if (parts.some((p) => !Number.isSafeInteger(p.value))) return { ok: false, error: 'Hay un importe no válido.' };
  const sum = parts.reduce((acc, p) => acc + p.value, 0);
  if (sum !== total) {
    const diff = total - sum;
    const detail = diff > 0 ? `faltan ${formatEuros(diff)}` : `sobran ${formatEuros(-diff)}`;
    return { ok: false, error: `Los importes suman ${formatEuros(sum)} y el gasto es de ${formatEuros(total)}: ${detail}.` };
  }
  return { ok: true, shares: parts.map(({ memberId, value }) => ({ memberId, cents: value })) };
}

/** Punto de entrada común: en «equal» solo cuentan los ids; en los demás, los valores. */
export function split(mode: SplitMode, total: number, weights: Weight[]): SplitResult {
  if (mode === 'equal') return splitEqual(total, weights.map((w) => w.memberId));
  if (mode === 'percent') return splitPercent(total, weights);
  return splitExact(total, weights);
}
