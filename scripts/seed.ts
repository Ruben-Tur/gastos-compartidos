/**
 * Datos de ejemplo: crea el grupo «Viaje a Lisboa» con 4 personas y 23 gastos repartidos de las tres
 * formas (a partes iguales, por porcentajes y por importes). Si ya existe, solo muestra su enlace.
 *
 *   npm run db:seed
 */
import { db } from '../src/db/client.ts';
import { createGroup, getMembers, saveExpense, type ExpenseShare } from '../src/lib/groups.ts';
import { formatEuros } from '../src/lib/money.ts';
import { split, type SplitMode } from '../src/lib/split.ts';

const NAME = 'Viaje a Lisboa';
const base = process.env.SITE_URL ?? 'http://localhost:4322';

const client = await db();
const existing = await client.execute({ sql: 'SELECT id FROM expense_groups WHERE name = ? LIMIT 1', args: [NAME] });
if (existing.rows[0]) {
  console.log(`· El grupo «${NAME}» ya existe: ${new URL(`/g/${existing.rows[0].id}`, base).href}`);
  process.exit(0);
}

const people = ['Ana', 'Luis', 'Marta', 'Pablo'] as const;
type Person = (typeof people)[number];

/** [concepto, céntimos, quién paga, fecha, modo, reparto] — en «equal», la lista de participantes. */
type Row = [string, number, Person, string, SplitMode, Partial<Record<Person, number>> | Person[]];
const all = [...people];

const rows: Row[] = [
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

const id = await createGroup(NAME, [...people]);
const members = await getMembers(id);
const idOf = (name: Person) => members.find((m) => m.name === name)!.id;

for (const [concept, amountCents, payer, date, mode, plan] of rows) {
  const weights = Array.isArray(plan)
    ? plan.map((name) => ({ memberId: idOf(name), value: 1 }))
    : people.filter((name) => plan[name]).map((name) => ({ memberId: idOf(name), value: plan[name]! }));
  const result = split(mode, amountCents, weights);
  if (!result.ok) throw new Error(`«${concept}»: ${result.error}`);
  const shares: ExpenseShare[] = result.shares.map((s) => ({
    ...s,
    weight: mode === 'equal' ? null : weights.find((w) => w.memberId === s.memberId)!.value,
  }));
  await saveExpense(id, null, { concept, amountCents, payerId: idOf(payer), date, splitMode: mode, shares });
}

const total = rows.reduce((acc, r) => acc + r[1], 0);
console.log(`✓ Grupo «${NAME}» creado: ${rows.length} gastos, ${formatEuros(total)}.`);
console.log(`  Ábrelo en ${new URL(`/g/${id}`, base).href}`);
