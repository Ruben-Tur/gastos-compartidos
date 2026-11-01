/**
 * Datos de ejemplo «Viaje a Lisboa»: 4 personas y 23 gastos repartidos de las tres formas (a partes
 * iguales, por porcentajes y por importes). Los usan el script `npm run db:seed` y la demo sin servidor,
 * así los dos enseñan exactamente el mismo grupo. Sin dependencias de base de datos ni de Node.
 */
import type { ExpenseInput, ExpenseShare } from './groups.ts';
import { split, type SplitMode } from './split.ts';

export const SEED_GROUP_NAME = 'Viaje a Lisboa';

export const SEED_PEOPLE = ['Ana', 'Luis', 'Marta', 'Pablo'] as const;
export type SeedPerson = (typeof SEED_PEOPLE)[number];

/** [concepto, céntimos, quién paga, fecha, modo, reparto] — en «equal», la lista de participantes. */
type Row = [string, number, SeedPerson, string, SplitMode, Partial<Record<SeedPerson, number>> | SeedPerson[]];
const all = [...SEED_PEOPLE];

export const SEED_ROWS: readonly Row[] = [
  ['Hotel en la Baixa (3 noches)', 52000, 'Ana', '2026-09-10', 'equal', all],
  ['Cena en Alfama', 14640, 'Luis', '2026-09-10', 'equal', all],
  ['Tranvía 28', 3800, 'Marta', '2026-09-11', 'equal', all],
  ['Gasolina', 9230, 'Pablo', '2026-09-12', 'equal', all],
  ['Pastéis de Belém', 1860, 'Marta', '2026-09-11', 'equal', all],
  ['Supermercado Pingo Doce', 1935, 'Ana', '2026-09-10', 'equal', all],
  ['Entradas Torre de Belém', 3000, 'Luis', '2026-09-11', 'equal', ['Ana', 'Luis', 'Pablo']],
  ['Palacio da Pena', 5600, 'Ana', '2026-09-12', 'equal', all],
  ['Comida en Sintra', 7420, 'Marta', '2026-09-12', 'exact', { Ana: 1690, Luis: 2150, Marta: 1880, Pablo: 1700 }],
  ['Cafés y bicas', 1240, 'Luis', '2026-09-11', 'equal', all],
  ['Taxi al aeropuerto', 3150, 'Pablo', '2026-09-13', 'equal', all],
  ['Time Out Market', 6890, 'Ana', '2026-09-11', 'exact', { Ana: 1850, Luis: 1640, Marta: 1900, Pablo: 1500 }],
  // Pablo no bebe: paga solo el queso.
  ['Vino y queso para la terraza', 2385, 'Luis', '2026-09-11', 'percent', { Ana: 3000, Luis: 3000, Marta: 3000, Pablo: 1000 }],
  ['Ferry a Cacilhas', 1080, 'Pablo', '2026-09-12', 'equal', all],
  ['Elevador de Santa Justa', 2120, 'Marta', '2026-09-10', 'equal', all],
  ['Parking en Sintra', 1450, 'Pablo', '2026-09-12', 'equal', all],
  ['Helados en Santini', 1460, 'Luis', '2026-09-12', 'equal', all],
  ['Farmacia (crema solar)', 1295, 'Marta', '2026-09-11', 'exact', { Ana: 500, Marta: 795 }],
  ['Desayuno en Manteigaria', 2280, 'Ana', '2026-09-13', 'equal', all],
  // Marta no come pescado: 33,33 + 33,33 + 33,34 %.
  ['Sardinas asadas en Bica', 1575, 'Pablo', '2026-09-12', 'percent', { Ana: 3333, Luis: 3333, Pablo: 3334 }],
  ['Tarjetas Viva Viagem', 1200, 'Luis', '2026-09-10', 'equal', all],
  ['Copas en el Park Bar', 1350, 'Marta', '2026-09-12', 'equal', all],
  ['Regalo para la anfitriona', 1500, 'Pablo', '2026-09-13', 'equal', all],
];

/** Los gastos de ejemplo listos para guardar, con el reparto calculado y los ids reales de cada persona. */
export function seedExpenses(idOf: (name: SeedPerson) => number): ExpenseInput[] {
  return SEED_ROWS.map(([concept, amountCents, payer, date, mode, plan]) => {
    const weights = Array.isArray(plan)
      ? plan.map((name) => ({ memberId: idOf(name), value: 1 }))
      : SEED_PEOPLE.filter((name) => plan[name]).map((name) => ({ memberId: idOf(name), value: plan[name]! }));
    const result = split(mode, amountCents, weights);
    if (!result.ok) throw new Error(`«${concept}»: ${result.error}`);
    const shares: ExpenseShare[] = result.shares.map((s) => ({
      ...s,
      weight: mode === 'equal' ? null : weights.find((w) => w.memberId === s.memberId)!.value,
    }));
    return { concept, amountCents, payerId: idOf(payer), date, splitMode: mode, shares };
  });
}
