/**
 * Acceso a datos de los grupos. Todas las consultas son parametrizadas (nunca se concatena texto
 * del usuario en el SQL) y cada operación comprueba que lo que toca pertenece al grupo del enlace.
 */
import type { Row } from '@libsql/client';
import { db } from '../db/client.ts';
import { computeBalances } from './balances.ts';
import { newGroupId } from './ids.ts';
import { settleUp, type SettlePlan } from './settle.ts';
import type { Share, SplitMode } from './split.ts';
import { LIMITS } from './validate.ts';

export interface Group {
  id: string;
  name: string;
}

export interface Member {
  id: number;
  name: string;
}

export interface ExpenseShare extends Share {
  /** Lo que se escribió en el formulario: puntos básicos (porcentajes), céntimos (importes) o null. */
  weight: number | null;
}

export interface Expense {
  id: number;
  concept: string;
  amountCents: number;
  payerId: number;
  date: string;
  splitMode: SplitMode;
  shares: ExpenseShare[];
}

export interface Settlement {
  id: number;
  fromId: number;
  toId: number;
  amountCents: number;
  createdAt: Date;
}

export interface GroupData {
  group: Group;
  members: Member[];
  expenses: Expense[];
  settlements: Settlement[];
  /** Saldo de cada persona, en el orden de `members`. */
  balances: { memberId: number; cents: number }[];
  plan: SettlePlan;
  totalCents: number;
}

/** Error esperado (límite alcanzado, nombre repetido…) con un mensaje para mostrar tal cual. */
export class UserError extends Error {}

const num = (row: Row, key: string) => Number(row[key]);
const str = (row: Row, key: string) => String(row[key]);

export async function getGroup(id: string): Promise<Group | null> {
  const c = await db();
  const { rows } = await c.execute({ sql: 'SELECT id, name FROM expense_groups WHERE id = ?', args: [id] });
  return rows[0] ? { id: str(rows[0], 'id'), name: str(rows[0], 'name') } : null;
}

export async function getMembers(groupId: string): Promise<Member[]> {
  const c = await db();
  const { rows } = await c.execute({
    sql: 'SELECT id, name FROM members WHERE group_id = ? ORDER BY position, id',
    args: [groupId],
  });
  return rows.map((r) => ({ id: num(r, 'id'), name: str(r, 'name') }));
}

export async function getExpenses(groupId: string): Promise<Expense[]> {
  const c = await db();
  const [expenses, shares] = await c.batch(
    [
      {
        sql: `SELECT id, concept, amount_cents, payer_id, date, split_mode FROM expenses
              WHERE group_id = ? ORDER BY date DESC, id DESC`,
        args: [groupId],
      },
      {
        sql: `SELECT s.expense_id, s.member_id, s.share_cents, s.weight FROM expense_shares s
              JOIN expenses e ON e.id = s.expense_id
              JOIN members m ON m.id = s.member_id
              WHERE e.group_id = ? ORDER BY m.position, m.id`,
        args: [groupId],
      },
    ],
    'read',
  );
  const byExpense = new Map<number, ExpenseShare[]>();
  for (const r of shares.rows) {
    const list = byExpense.get(num(r, 'expense_id')) ?? [];
    list.push({ memberId: num(r, 'member_id'), cents: num(r, 'share_cents'), weight: r.weight === null ? null : num(r, 'weight') });
    byExpense.set(num(r, 'expense_id'), list);
  }
  return expenses.rows.map((r) => ({
    id: num(r, 'id'),
    concept: str(r, 'concept'),
    amountCents: num(r, 'amount_cents'),
    payerId: num(r, 'payer_id'),
    date: str(r, 'date'),
    splitMode: str(r, 'split_mode') as SplitMode,
    shares: byExpense.get(num(r, 'id')) ?? [],
  }));
}

export async function getSettlements(groupId: string): Promise<Settlement[]> {
  const c = await db();
  const { rows } = await c.execute({
    sql: 'SELECT id, from_id, to_id, amount_cents, created_at FROM settlements WHERE group_id = ? ORDER BY id DESC',
    args: [groupId],
  });
  return rows.map((r) => ({
    id: num(r, 'id'),
    fromId: num(r, 'from_id'),
    toId: num(r, 'to_id'),
    amountCents: num(r, 'amount_cents'),
    createdAt: new Date(num(r, 'created_at') * 1000),
  }));
}

/** Todo lo que necesita la página del grupo: datos, saldos y plan para quedar en paz. */
export async function getGroupData(id: string): Promise<GroupData | null> {
  const group = await getGroup(id);
  if (!group) return null;
  const [members, expenses, settlements] = await Promise.all([getMembers(id), getExpenses(id), getSettlements(id)]);
  const map = computeBalances(
    members.map((m) => m.id),
    expenses,
    settlements,
  );
  const balances = members.map((m) => ({ memberId: m.id, cents: map.get(m.id)! }));
  return {
    group,
    members,
    expenses,
    settlements,
    balances,
    plan: settleUp(balances),
    totalCents: expenses.reduce((acc, e) => acc + e.amountCents, 0),
  };
}

export async function createGroup(name: string, memberNames: string[]): Promise<string> {
  const c = await db();
  const id = newGroupId();
  await c.batch(
    [
      { sql: 'INSERT INTO expense_groups (id, name) VALUES (?, ?)', args: [id, name] },
      ...memberNames.map((member, position) => ({
        sql: 'INSERT INTO members (group_id, name, position) VALUES (?, ?, ?)',
        args: [id, member, position],
      })),
    ],
    'write',
  );
  return id;
}

export async function renameGroup(groupId: string, name: string) {
  const c = await db();
  await c.execute({ sql: 'UPDATE expense_groups SET name = ? WHERE id = ?', args: [name, groupId] });
}

function isUniqueViolation(error: unknown) {
  return error instanceof Error && /UNIQUE constraint failed/i.test(error.message);
}

/**
 * Nombres repetidos sin distinguir mayúsculas, también con tildes y eñes: el índice UNIQUE de SQLite
 * (COLLATE NOCASE) solo pliega letras ASCII y dejaba tener a la vez «Ángel» y «ángel». Es la misma
 * regla que al crear el grupo (parseMemberNames) y que la demo.
 */
async function checkFreeName(groupId: string, name: string, exceptId?: number) {
  const key = name.toLocaleLowerCase('es');
  const taken = (await getMembers(groupId)).some((m) => m.id !== exceptId && m.name.toLocaleLowerCase('es') === key);
  if (taken) throw new UserError(`Ya hay alguien que se llama «${name}» en el grupo.`);
}

export async function addMember(groupId: string, name: string) {
  const c = await db();
  const { rows } = await c.execute({
    sql: 'SELECT COUNT(*) AS total, COALESCE(MAX(position), -1) AS last FROM members WHERE group_id = ?',
    args: [groupId],
  });
  if (num(rows[0], 'total') >= LIMITS.membersPerGroup) {
    throw new UserError(`El grupo ya tiene el máximo de ${LIMITS.membersPerGroup} personas.`);
  }
  await checkFreeName(groupId, name);
  try {
    await c.execute({
      sql: 'INSERT INTO members (group_id, name, position) VALUES (?, ?, ?)',
      args: [groupId, name, num(rows[0], 'last') + 1],
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new UserError(`Ya hay alguien que se llama «${name}» en el grupo.`);
    throw error;
  }
}

export async function renameMember(groupId: string, memberId: number, name: string) {
  const c = await db();
  await checkFreeName(groupId, name, memberId);
  try {
    const result = await c.execute({
      sql: 'UPDATE members SET name = ? WHERE id = ? AND group_id = ?',
      args: [name, memberId, groupId],
    });
    if (result.rowsAffected === 0) throw new UserError('Esa persona no está en el grupo.');
  } catch (error) {
    if (isUniqueViolation(error)) throw new UserError(`Ya hay alguien que se llama «${name}» en el grupo.`);
    throw error;
  }
}

/** Solo se puede quitar a alguien que no aparece en ningún gasto ni pago: si no, los saldos cambiarían. */
export async function deleteMember(groupId: string, memberId: number) {
  const c = await db();
  const { rows } = await c.execute({
    sql: `SELECT
            (SELECT COUNT(*) FROM members WHERE id = :m AND group_id = :g) AS mine,
            (SELECT COUNT(*) FROM expenses WHERE payer_id = :m)
          + (SELECT COUNT(*) FROM expense_shares WHERE member_id = :m)
          + (SELECT COUNT(*) FROM settlements WHERE from_id = :m OR to_id = :m) AS uses,
            (SELECT COUNT(*) FROM members WHERE group_id = :g) AS total`,
    args: { m: memberId, g: groupId },
  });
  // Sin esta comprobación, un id de otro grupo daba «Persona quitada del grupo» sin borrar nada
  // (o el mensaje de «ya aparece en gastos» por los gastos del otro grupo).
  if (num(rows[0], 'mine') === 0) throw new UserError('Esa persona no está en el grupo.');
  if (num(rows[0], 'uses') > 0) {
    throw new UserError('No se puede quitar a alguien que ya aparece en gastos o pagos. Puedes cambiarle el nombre.');
  }
  if (num(rows[0], 'total') <= 2) throw new UserError('Un grupo necesita al menos dos personas.');
  await c.execute({ sql: 'DELETE FROM members WHERE id = ? AND group_id = ?', args: [memberId, groupId] });
}

export interface ExpenseInput {
  concept: string;
  amountCents: number;
  payerId: number;
  date: string;
  splitMode: SplitMode;
  shares: ExpenseShare[];
}

/** Crea (expenseId null) o actualiza un gasto con su reparto, todo en una transacción. */
export async function saveExpense(groupId: string, expenseId: number | null, input: ExpenseInput): Promise<number> {
  const c = await db();
  const tx = await c.transaction('write');
  try {
    // El pagador y los participantes tienen que ser de este grupo (los ids llegan del formulario).
    const ids = [input.payerId, ...input.shares.map((s) => s.memberId)];
    const { rows } = await tx.execute({
      sql: `SELECT COUNT(DISTINCT id) AS n FROM members WHERE group_id = ? AND id IN (${ids.map(() => '?').join(',')})`,
      args: [groupId, ...ids],
    });
    if (num(rows[0], 'n') !== new Set(ids).size) throw new UserError('Alguna persona del gasto no está en el grupo.');

    let id = expenseId;
    if (id === null) {
      const count = await tx.execute({ sql: 'SELECT COUNT(*) AS n FROM expenses WHERE group_id = ?', args: [groupId] });
      if (num(count.rows[0], 'n') >= LIMITS.expensesPerGroup) {
        throw new UserError(`El grupo ya tiene el máximo de ${LIMITS.expensesPerGroup} gastos.`);
      }
      const inserted = await tx.execute({
        sql: `INSERT INTO expenses (group_id, concept, amount_cents, payer_id, date, split_mode)
              VALUES (?, ?, ?, ?, ?, ?) RETURNING id`,
        args: [groupId, input.concept, input.amountCents, input.payerId, input.date, input.splitMode],
      });
      id = num(inserted.rows[0], 'id');
    } else {
      const updated = await tx.execute({
        sql: `UPDATE expenses SET concept = ?, amount_cents = ?, payer_id = ?, date = ?, split_mode = ?, updated_at = unixepoch()
              WHERE id = ? AND group_id = ?`,
        args: [input.concept, input.amountCents, input.payerId, input.date, input.splitMode, id, groupId],
      });
      if (updated.rowsAffected === 0) throw new UserError('Ese gasto ya no existe.');
      await tx.execute({ sql: 'DELETE FROM expense_shares WHERE expense_id = ?', args: [id] });
    }
    for (const share of input.shares) {
      await tx.execute({
        sql: 'INSERT INTO expense_shares (expense_id, member_id, share_cents, weight) VALUES (?, ?, ?, ?)',
        args: [id, share.memberId, share.cents, share.weight],
      });
    }
    await tx.commit();
    return id;
  } catch (error) {
    await tx.rollback();
    throw error;
  } finally {
    tx.close();
  }
}

export async function deleteExpense(groupId: string, expenseId: number) {
  const c = await db();
  await c.batch(
    [
      {
        sql: 'DELETE FROM expense_shares WHERE expense_id IN (SELECT id FROM expenses WHERE id = ? AND group_id = ?)',
        args: [expenseId, groupId],
      },
      { sql: 'DELETE FROM expenses WHERE id = ? AND group_id = ?', args: [expenseId, groupId] },
    ],
    'write',
  );
}

export async function addSettlement(groupId: string, fromId: number, toId: number, amountCents: number) {
  const c = await db();
  const { rows } = await c.execute({ sql: 'SELECT COUNT(*) AS n FROM settlements WHERE group_id = ?', args: [groupId] });
  if (num(rows[0], 'n') >= LIMITS.settlementsPerGroup) {
    throw new UserError(`El grupo ya tiene el máximo de ${LIMITS.settlementsPerGroup} pagos registrados.`);
  }
  await c.execute({
    sql: 'INSERT INTO settlements (group_id, from_id, to_id, amount_cents) VALUES (?, ?, ?, ?)',
    args: [groupId, fromId, toId, amountCents],
  });
}

export async function deleteSettlement(groupId: string, settlementId: number) {
  const c = await db();
  await c.execute({ sql: 'DELETE FROM settlements WHERE id = ? AND group_id = ?', args: [settlementId, groupId] });
}
