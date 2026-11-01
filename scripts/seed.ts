/**
 * Datos de ejemplo: crea el grupo «Viaje a Lisboa» con 4 personas y 23 gastos repartidos de las tres
 * formas (a partes iguales, por porcentajes y por importes). Si ya existe, solo muestra su enlace.
 * Los datos están en src/lib/seed-data.ts, compartidos con la demo sin servidor.
 *
 *   npm run db:seed
 */
import { db } from '../src/db/client.ts';
import { createGroup, getMembers, saveExpense } from '../src/lib/groups.ts';
import { formatEuros } from '../src/lib/money.ts';
import { SEED_GROUP_NAME as NAME, SEED_PEOPLE, seedExpenses, type SeedPerson } from '../src/lib/seed-data.ts';

const base = process.env.SITE_URL ?? 'http://localhost:4322';

const client = await db();
const existing = await client.execute({ sql: 'SELECT id FROM expense_groups WHERE name = ? LIMIT 1', args: [NAME] });
if (existing.rows[0]) {
  console.log(`· El grupo «${NAME}» ya existe: ${new URL(`/g/${existing.rows[0].id}`, base).href}`);
  process.exit(0);
}

const id = await createGroup(NAME, [...SEED_PEOPLE]);
const members = await getMembers(id);
const idOf = (name: SeedPerson) => members.find((m) => m.name === name)!.id;
const expenses = seedExpenses(idOf);

for (const expense of expenses) await saveExpense(id, null, expense);

const total = expenses.reduce((acc, e) => acc + e.amountCents, 0);
console.log(`✓ Grupo «${NAME}» creado: ${expenses.length} gastos, ${formatEuros(total)}.`);
console.log(`  Ábrelo en ${new URL(`/g/${id}`, base).href}`);
