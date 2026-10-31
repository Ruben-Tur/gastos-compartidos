/**
 * Formulario de gasto: lee los campos, los valida y los convierte en un gasto con su reparto.
 * Si algo falla devuelve los errores por campo y los valores escritos, para volver a pintar el
 * formulario tal y como estaba.
 */
import type { Expense, ExpenseInput, ExpenseShare, Member } from './groups.ts';
import { centsToInput, parseAmount, parseOptionalAmount, parsePercent, percentToInput } from './money.ts';
import { split, SPLIT_MODES, type SplitMode, type Weight } from './split.ts';
import { field, LIMITS, parseDate, parseId, requiredText, today } from './validate.ts';

export interface ExpenseFormValues {
  concept: string;
  amount: string;
  date: string;
  payer: string;
  mode: SplitMode;
  /** Por persona: si participa (partes iguales), su porcentaje y su importe, tal y como se escribieron. */
  rows: Record<number, { included: boolean; percent: string; amount: string }>;
}

export type ExpenseErrors = Partial<Record<'concept' | 'amount' | 'date' | 'payer' | 'split', string>>;

export function emptyValues(members: Member[]): ExpenseFormValues {
  return {
    concept: '',
    amount: '',
    date: today(),
    payer: String(members[0]?.id ?? ''),
    mode: 'equal',
    rows: Object.fromEntries(members.map((m) => [m.id, { included: true, percent: '', amount: '' }])),
  };
}

export function valuesFromExpense(expense: Expense, members: Member[]): ExpenseFormValues {
  const byMember = new Map(expense.shares.map((s) => [s.memberId, s]));
  return {
    concept: expense.concept,
    amount: centsToInput(expense.amountCents),
    date: expense.date,
    payer: String(expense.payerId),
    mode: expense.splitMode,
    rows: Object.fromEntries(
      members.map((m) => {
        const share = byMember.get(m.id);
        const percent = expense.splitMode === 'percent' && share?.weight ? percentToInput(share.weight) : '';
        const amount = expense.splitMode === 'exact' && share ? centsToInput(share.cents) : '';
        return [m.id, { included: expense.splitMode === 'equal' ? Boolean(share) : true, percent, amount }];
      }),
    ),
  };
}

export function readExpenseForm(form: FormData, members: Member[]): ExpenseFormValues {
  const mode = field(form, 'mode') as SplitMode;
  return {
    concept: field(form, 'concept').slice(0, 500),
    amount: field(form, 'amount').slice(0, 40),
    date: field(form, 'date').slice(0, 20),
    payer: field(form, 'payer').slice(0, 20),
    mode: SPLIT_MODES.includes(mode) ? mode : 'equal',
    rows: Object.fromEntries(
      members.map((m) => [
        m.id,
        {
          included: form.get(`in-${m.id}`) === 'on',
          percent: field(form, `pct-${m.id}`).slice(0, 20),
          amount: field(form, `amt-${m.id}`).slice(0, 40),
        },
      ]),
    ),
  };
}

export function validateExpense(
  values: ExpenseFormValues,
  members: Member[],
): { ok: true; input: ExpenseInput } | { ok: false; errors: ExpenseErrors } {
  const errors: ExpenseErrors = {};

  const concept = requiredText(values.concept, LIMITS.concept, 'un concepto');
  if (!concept.ok) errors.concept = concept.error;
  const amount = parseAmount(values.amount);
  if (!amount.ok) errors.amount = amount.error;
  const date = parseDate(values.date);
  if (!date.ok) errors.date = date.error;
  const payerId = parseId(values.payer);
  if (payerId === null || !members.some((m) => m.id === payerId)) errors.payer = 'Elige quién ha pagado.';

  // Pesos de cada participante según el modo (en partes iguales, solo importa quién está marcado).
  const weights: Weight[] = [];
  for (const m of members) {
    const row = values.rows[m.id];
    if (!row) continue;
    if (values.mode === 'equal') {
      if (row.included) weights.push({ memberId: m.id, value: 1 });
      continue;
    }
    const parsed = values.mode === 'percent' ? parsePercent(row.percent) : parseOptionalAmount(row.amount);
    if (!parsed.ok) {
      errors.split = parsed.error;
      break;
    }
    if (parsed.value > 0) weights.push({ memberId: m.id, value: parsed.value });
  }

  // El reparto solo se puede comprobar con un importe válido.
  let shares: ExpenseShare[] = [];
  if (!errors.split && amount.ok) {
    const result = split(values.mode, amount.value, weights);
    if (result.ok) {
      const weightOf = new Map(weights.map((w) => [w.memberId, w.value]));
      shares = result.shares.map((s) => ({ ...s, weight: values.mode === 'equal' ? null : weightOf.get(s.memberId)! }));
    } else {
      errors.split = result.error;
    }
  }

  if (Object.keys(errors).length > 0 || !concept.ok || !amount.ok || !date.ok || payerId === null) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    input: { concept: concept.value, amountCents: amount.value, payerId, date: date.value, splitMode: values.mode, shares },
  };
}
