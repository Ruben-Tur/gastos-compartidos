/**
 * Saldo de cada persona en céntimos: lo que ha pagado menos lo que le corresponde,
 * corregido con los pagos ya hechos para saldar cuentas.
 * Positivo = le deben dinero; negativo = debe dinero. La suma de todos los saldos es siempre 0.
 */
import type { Share } from './split.ts';

export interface ExpenseForBalance {
  payerId: number;
  amountCents: number;
  shares: Share[];
}

export interface SettlementForBalance {
  fromId: number;
  toId: number;
  amountCents: number;
}

export function computeBalances(
  memberIds: number[],
  expenses: ExpenseForBalance[],
  settlements: SettlementForBalance[] = [],
): Map<number, number> {
  const balances = new Map<number, number>(memberIds.map((id) => [id, 0]));
  const add = (id: number, cents: number) => {
    const current = balances.get(id);
    if (current === undefined) throw new Error(`La persona ${id} no está en el grupo.`);
    balances.set(id, current + cents);
  };

  for (const expense of expenses) {
    const owed = expense.shares.reduce((acc, s) => acc + s.cents, 0);
    if (owed !== expense.amountCents) {
      throw new Error(`El reparto de un gasto suma ${owed} y el gasto es de ${expense.amountCents} céntimos.`);
    }
    add(expense.payerId, expense.amountCents);
    for (const share of expense.shares) add(share.memberId, -share.cents);
  }

  // Quien paga para saldar reduce lo que debe; quien cobra, lo que le deben.
  for (const s of settlements) {
    add(s.fromId, s.amountCents);
    add(s.toId, -s.amountCents);
  }
  return balances;
}
