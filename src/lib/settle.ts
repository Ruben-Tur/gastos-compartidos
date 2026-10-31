/**
 * «Para quedar en paz»: el mínimo número de transferencias que deja todos los saldos a cero.
 *
 * Cada transferencia puede dejar a cero, como mucho, a una persona más (la última, a dos). Por eso,
 * si las n personas con saldo se pueden separar en k grupos que suman cero por separado, bastan
 * n − k transferencias, y no se puede hacer con menos. El problema se reduce a encontrar el mayor
 * número de subgrupos disjuntos que suman cero, que es NP-difícil en general (contiene al problema
 * de la partición), así que:
 *
 *  - Hasta EXACT_LIMIT personas con saldo: programación dinámica sobre máscaras de bits, O(2ⁿ · n).
 *    Con 20 personas son ~1 millón de estados, unos milisegundos. Resultado exacto.
 *  - Por encima: algoritmo voraz (el que más debe paga al que más tiene que cobrar). Usa como mucho
 *    n − 1 transferencias, pero no siempre el mínimo.
 */

export interface Transfer {
  fromId: number;
  toId: number;
  amountCents: number;
}

export interface Balance {
  memberId: number;
  cents: number;
}

export interface SettlePlan {
  transfers: Transfer[];
  /** true si el número de transferencias es el mínimo demostrado; false si se ha usado el voraz. */
  exact: boolean;
}

export const EXACT_LIMIT = 20;

/**
 * Salda un conjunto de saldos que suma cero emparejando siempre al mayor deudor con el mayor acreedor.
 * Cada paso deja a cero al menos a uno de los dos, así que usa como mucho (personas − 1) pasos.
 * A igualdad de importe manda el orden recibido, para que el plan sea siempre el mismo.
 */
function greedy(people: Balance[]): Transfer[] {
  const rows = people.map((p, order) => ({ ...p, order }));
  const transfers: Transfer[] = [];
  const pick = (sign: 1 | -1) =>
    rows
      .filter((r) => Math.sign(r.cents) === sign)
      .sort((a, b) => Math.abs(b.cents) - Math.abs(a.cents) || a.order - b.order)[0];

  for (let debtor = pick(-1), creditor = pick(1); debtor && creditor; debtor = pick(-1), creditor = pick(1)) {
    const amount = Math.min(-debtor.cents, creditor.cents);
    transfers.push({ fromId: debtor.memberId, toId: creditor.memberId, amountCents: amount });
    debtor.cents += amount;
    creditor.cents -= amount;
  }
  return transfers;
}

/** Separa a las personas en el mayor número posible de grupos disjuntos que suman cero. */
export function zeroSumGroups(people: Balance[]): Balance[][] {
  const n = people.length;
  if (n > 30) throw new RangeError('Demasiadas personas para el cálculo exacto.');
  const size = 1 << n;
  const full = size - 1;

  // sum[m]: suma de los saldos de la máscara m (Float64: los totales pueden pasar de 2³¹ céntimos).
  const sum = new Float64Array(size);
  for (let mask = 1; mask < size; mask++) {
    const low = mask & -mask;
    sum[mask] = sum[mask ^ low] + people[31 - Math.clz32(low)].cents;
  }

  // dp[m]: mayor número de grupos que suman cero al ir añadiendo las personas de m una a una.
  // Si m suma cero, cerrar ahí un grupo cuenta uno más.
  const dp = new Uint8Array(size);
  for (let mask = 1; mask < size; mask++) {
    let best = 0;
    for (let rest = mask; rest; rest &= rest - 1) {
      const value = dp[mask ^ (rest & -rest)];
      if (value > best) best = value;
    }
    dp[mask] = best + (sum[mask] === 0 ? 1 : 0);
  }

  // Reconstrucción: se deshace el camino óptimo quitando una persona cada vez (la de menor índice
  // que mantiene el óptimo) y luego se corta la secuencia cada vez que lo acumulado vuelve a cero.
  const order: number[] = [];
  for (let mask = full; mask; ) {
    const target = dp[mask] - (sum[mask] === 0 ? 1 : 0);
    let chosen = -1;
    for (let rest = mask; rest; rest &= rest - 1) {
      const bit = rest & -rest;
      if (dp[mask ^ bit] === target) {
        chosen = 31 - Math.clz32(bit);
        break;
      }
    }
    order.push(chosen);
    mask ^= 1 << chosen;
  }
  order.reverse();

  const groups: Balance[][] = [];
  let current: Balance[] = [];
  let acc = 0;
  for (const index of order) {
    current.push(people[index]);
    acc += people[index].cents;
    if (acc === 0) {
      groups.push(current);
      current = [];
    }
  }
  return groups;
}

export function settleUp(balances: Balance[]): SettlePlan {
  const people = balances.filter((b) => b.cents !== 0);
  if (people.some((p) => !Number.isSafeInteger(p.cents))) throw new RangeError('Los saldos deben ser céntimos enteros.');
  const total = people.reduce((acc, p) => acc + p.cents, 0);
  if (total !== 0) throw new RangeError(`Los saldos suman ${total} céntimos y deberían sumar 0.`);

  if (people.length > EXACT_LIMIT) return { transfers: greedy(people), exact: false };

  // Se respeta el orden original dentro de cada grupo para que el voraz sea determinista.
  const position = new Map(people.map((p, i) => [p.memberId, i]));
  const transfers = zeroSumGroups(people).flatMap((group) =>
    greedy([...group].sort((a, b) => position.get(a.memberId)! - position.get(b.memberId)!)),
  );
  return { transfers, exact: true };
}
