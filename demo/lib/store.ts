/**
 * Almacén de la demo sin servidor: los grupos viven en el localStorage del visitante, bajo una clave
 * versionada. Hace lo mismo que src/lib/groups.ts (crear grupos, personas, gastos y pagos, con los
 * mismos límites y mensajes) pero sobre un objeto en memoria en vez de SQLite.
 *
 * Lo que hay en localStorage se trata como entrada no fiable: se lee con límites de tamaño, se valida
 * campo a campo con los validadores de la web (src/lib/validate.ts, split.ts…) y, si algo no cuadra,
 * se descarta entero y se vuelve a cargar el ejemplo. Sin dependencias del navegador: se prueba con node --test.
 */
import { computeBalances } from '../../src/lib/balances.ts';
import type { Expense, ExpenseInput, ExpenseShare, GroupData, Member } from '../../src/lib/groups.ts';
import { MAX_AMOUNT_CENTS } from '../../src/lib/money.ts';
import { SEED_GROUP_NAME, SEED_PEOPLE, seedExpenses } from '../../src/lib/seed-data.ts';
import { settleUp } from '../../src/lib/settle.ts';
import { split, SPLIT_MODES, type SplitMode, type Weight } from '../../src/lib/split.ts';
import { LIMITS, parseDate, requiredText } from '../../src/lib/validate.ts';

/** Clave de localStorage. Si cambia el formato de los datos, se sube la versión (v2…). */
export const STORAGE_KEY = 'cuentas-claras:demo:v1';
export const VERSION = 1;

/** Límites propios de la demo: localStorage tiene unos 5 MB por origen y lo comparte toda la web. */
export const DEMO_LIMITS = {
  groups: 10,
  expensesPerGroup: 200,
  settlementsPerGroup: 100,
  /** Tamaño máximo del JSON guardado, en caracteres. */
  storageChars: 1_000_000,
} as const;

/** El grupo de ejemplo tiene siempre el mismo id: su enlace funciona en cualquier navegador. */
export const SEED_GROUP_ID = 'ViajeALisboa_demo_000001';

export interface DemoSettlement {
  id: number;
  fromId: number;
  toId: number;
  amountCents: number;
  /** Milisegundos desde 1970. */
  createdAt: number;
}

export interface DemoGroup {
  id: string;
  name: string;
  members: Member[];
  expenses: Expense[];
  settlements: DemoSettlement[];
}

export interface DemoState {
  version: typeof VERSION;
  /** Siguiente id numérico libre para personas, gastos y pagos. */
  nextId: number;
  /** Del más reciente al más antiguo. */
  groups: DemoGroup[];
}

export type DemoGroupData = Omit<GroupData, 'settlements'> & { settlements: DemoSettlement[] };

/** Lo mínimo que se usa de localStorage (así las pruebas pueden pasar un objeto cualquiera). */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Error esperado, con un mensaje para mostrar tal cual (como UserError en la web). */
export class DemoError extends Error {}

const GROUP_ID = /^[A-Za-z0-9_-]{24}$/;

export function isGroupId(value: unknown): value is string {
  return typeof value === 'string' && GROUP_ID.test(value);
}

/** 18 bytes aleatorios en base64url (24 caracteres), con el mismo formato que los ids de la web. */
export function newGroupId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_');
}

const nameKey = (name: string) => name.toLocaleLowerCase('es');

// ---------------------------------------------------------------------------
// Ejemplo
// ---------------------------------------------------------------------------

/** Estado inicial: solo el grupo «Viaje a Lisboa», el mismo que crea `npm run db:seed`. */
export function seedState(): DemoState {
  let nextId = 1;
  const members = SEED_PEOPLE.map((name) => ({ id: nextId++, name }));
  const idOf = (name: string) => members.find((m) => m.name === name)!.id;
  const expenses = seedExpenses(idOf).map((input) => ({ id: nextId++, ...input }));
  return {
    version: VERSION,
    nextId,
    groups: [{ id: SEED_GROUP_ID, name: SEED_GROUP_NAME, members, expenses, settlements: [] }],
  };
}

// ---------------------------------------------------------------------------
// Lectura defensiva
// ---------------------------------------------------------------------------

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isId = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) > 0;
const isCents = (v: unknown, max: number): v is number => Number.isSafeInteger(v) && (v as number) > 0 && (v as number) <= max;

/** Texto ya limpio: tiene que salir igual de requiredText (sin controles, sin espacios de más, sin pasarse). */
function cleanString(v: unknown, max: number): string | null {
  if (typeof v !== 'string' || v.length > max * 4) return null;
  const checked = requiredText(v, max, '');
  return checked.ok && checked.value === v ? v : null;
}

function readMembers(raw: unknown): Member[] | null {
  if (!Array.isArray(raw) || raw.length < 2 || raw.length > LIMITS.membersPerGroup) return null;
  const ids = new Set<number>();
  const names = new Set<string>();
  const members: Member[] = [];
  for (const m of raw) {
    if (!isObj(m) || !isId(m.id) || ids.has(m.id)) return null;
    const name = cleanString(m.name, LIMITS.memberName);
    if (name === null || names.has(nameKey(name))) return null;
    ids.add(m.id);
    names.add(nameKey(name));
    members.push({ id: m.id, name });
  }
  return members;
}

function readShares(raw: unknown, mode: SplitMode, amountCents: number, memberIds: Set<number>): ExpenseShare[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > memberIds.size) return null;
  const shares: ExpenseShare[] = [];
  for (const s of raw) {
    if (!isObj(s) || !memberIds.has(s.memberId as number) || !Number.isSafeInteger(s.cents) || (s.cents as number) < 0) return null;
    const weight = s.weight === null ? null : isId(s.weight) ? s.weight : undefined;
    if (weight === undefined || (mode === 'equal') !== (weight === null)) return null;
    shares.push({ memberId: s.memberId as number, cents: s.cents as number, weight });
  }
  // El reparto guardado tiene que ser exactamente el que sale de calcularlo otra vez con split().
  const weights: Weight[] = shares.map((s) => ({ memberId: s.memberId, value: s.weight ?? 1 }));
  const result = split(mode, amountCents, weights);
  if (!result.ok || result.shares.length !== shares.length) return null;
  const same = result.shares.every((r, i) => r.memberId === shares[i].memberId && r.cents === shares[i].cents);
  return same ? shares : null;
}

function readExpenses(raw: unknown, memberIds: Set<number>): Expense[] | null {
  if (!Array.isArray(raw) || raw.length > DEMO_LIMITS.expensesPerGroup) return null;
  const ids = new Set<number>();
  const expenses: Expense[] = [];
  for (const e of raw) {
    if (!isObj(e) || !isId(e.id) || ids.has(e.id)) return null;
    const concept = cleanString(e.concept, LIMITS.concept);
    if (concept === null || !isCents(e.amountCents, MAX_AMOUNT_CENTS) || !memberIds.has(e.payerId as number)) return null;
    if (typeof e.date !== 'string') return null;
    const date = parseDate(e.date);
    if (!date.ok || date.value !== e.date) return null;
    const mode = e.splitMode as SplitMode;
    if (!SPLIT_MODES.includes(mode)) return null;
    const shares = readShares(e.shares, mode, e.amountCents, memberIds);
    if (!shares) return null;
    ids.add(e.id);
    expenses.push({ id: e.id, concept, amountCents: e.amountCents, payerId: e.payerId as number, date: date.value, splitMode: mode, shares });
  }
  return expenses;
}

function readSettlements(raw: unknown, memberIds: Set<number>): DemoSettlement[] | null {
  if (!Array.isArray(raw) || raw.length > DEMO_LIMITS.settlementsPerGroup) return null;
  const ids = new Set<number>();
  const maxCents = MAX_AMOUNT_CENTS * DEMO_LIMITS.expensesPerGroup;
  const settlements: DemoSettlement[] = [];
  for (const s of raw) {
    if (!isObj(s) || !isId(s.id) || ids.has(s.id)) return null;
    const { fromId, toId } = s;
    if (!memberIds.has(fromId as number) || !memberIds.has(toId as number) || fromId === toId) return null;
    if (!isCents(s.amountCents, maxCents) || !Number.isSafeInteger(s.createdAt) || (s.createdAt as number) < 0) return null;
    ids.add(s.id);
    settlements.push({ id: s.id, fromId: fromId as number, toId: toId as number, amountCents: s.amountCents, createdAt: s.createdAt as number });
  }
  return settlements;
}

function readGroup(raw: unknown): DemoGroup | null {
  if (!isObj(raw) || !isGroupId(raw.id)) return null;
  const name = cleanString(raw.name, LIMITS.groupName);
  const members = readMembers(raw.members);
  if (name === null || !members) return null;
  const memberIds = new Set(members.map((m) => m.id));
  const expenses = readExpenses(raw.expenses, memberIds);
  const settlements = readSettlements(raw.settlements, memberIds);
  if (!expenses || !settlements) return null;
  const group: DemoGroup = { id: raw.id, name, members, expenses, settlements };
  try {
    groupData(group); // saldos y plan: lanza si algo no cuadra
  } catch {
    return null;
  }
  return group;
}

/**
 * Convierte lo leído de localStorage en un estado válido, o null si falta algo, sobra tamaño o no
 * cuadra. Solo se copian los campos conocidos: nada de lo que venga de más llega a la aplicación.
 */
export function parseState(raw: string | null): DemoState | null {
  if (typeof raw !== 'string' || raw.length > DEMO_LIMITS.storageChars) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isObj(data) || data.version !== VERSION || !isId(data.nextId)) return null;
  if (!Array.isArray(data.groups) || data.groups.length > DEMO_LIMITS.groups) return null;
  const groups: DemoGroup[] = [];
  const groupIds = new Set<string>();
  let maxId = 0;
  for (const g of data.groups) {
    const group = readGroup(g);
    if (!group || groupIds.has(group.id)) return null;
    groupIds.add(group.id);
    groups.push(group);
    for (const item of [...group.members, ...group.expenses, ...group.settlements]) maxId = Math.max(maxId, item.id);
  }
  // nextId tiene que quedar por encima de cualquier id usado; si no, se corrige.
  return { version: VERSION, nextId: Math.max(data.nextId, maxId + 1), groups };
}

export type LoadStatus = 'ok' | 'seeded' | 'corrupt' | 'unavailable';

/**
 * Lee el estado. Primera visita: guarda y devuelve el ejemplo («seeded»). Datos no válidos: los
 * sustituye por el ejemplo («corrupt»). Sin localStorage: el ejemplo solo en memoria («unavailable»).
 */
export function loadState(storage: StorageLike | null): { state: DemoState; status: LoadStatus } {
  if (!storage) return { state: seedState(), status: 'unavailable' };
  let raw: string | null;
  try {
    raw = storage.getItem(STORAGE_KEY);
  } catch {
    return { state: seedState(), status: 'unavailable' };
  }
  const parsed = raw === null ? null : parseState(raw);
  if (parsed) return { state: parsed, status: 'ok' };
  const state = seedState();
  try {
    saveState(storage, state);
  } catch {
    return { state, status: 'unavailable' };
  }
  return { state, status: raw === null ? 'seeded' : 'corrupt' };
}

export function saveState(storage: StorageLike | null, state: DemoState): void {
  if (!storage) {
    throw new DemoError('Este navegador no deja guardar datos (almacenamiento bloqueado o modo privado estricto): la demo no puede guardar cambios.');
  }
  const json = JSON.stringify(state);
  if (json.length > DEMO_LIMITS.storageChars) {
    throw new DemoError('La demo ha llegado al máximo de datos que guarda en este navegador. Restablécela para empezar de cero.');
  }
  try {
    storage.setItem(STORAGE_KEY, json);
  } catch {
    throw new DemoError('No se ha podido guardar en este navegador: puede que el almacenamiento esté lleno o bloqueado.');
  }
}

/** «Restablecer demo»: vuelve a dejar solo el ejemplo. */
export function resetState(storage: StorageLike | null): DemoState {
  const state = seedState();
  saveState(storage, state);
  return state;
}

// ---------------------------------------------------------------------------
// Consultas
// ---------------------------------------------------------------------------

export function findGroup(state: DemoState, id: string | null): DemoGroup | undefined {
  return isGroupId(id) ? state.groups.find((g) => g.id === id) : undefined;
}

function requireGroup(state: DemoState, id: string): DemoGroup {
  const group = findGroup(state, id);
  if (!group) throw new DemoError('Ese grupo ya no está en este navegador.');
  return group;
}

/** Lo mismo que getGroupData() de la web: gastos ordenados, saldos y plan para quedar en paz. */
export function groupData(group: DemoGroup): DemoGroupData {
  const { members } = group;
  const expenses = [...group.expenses].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
  const settlements = [...group.settlements].sort((a, b) => b.id - a.id);
  const map = computeBalances(
    members.map((m) => m.id),
    expenses,
    settlements,
  );
  const balances = members.map((m) => ({ memberId: m.id, cents: map.get(m.id)! }));
  return {
    group: { id: group.id, name: group.name },
    members,
    expenses,
    settlements,
    balances,
    plan: settleUp(balances),
    totalCents: expenses.reduce((acc, e) => acc + e.amountCents, 0),
  };
}

// ---------------------------------------------------------------------------
// Cambios (mismas reglas y mensajes que src/lib/groups.ts)
// ---------------------------------------------------------------------------

/** Crea un grupo con nombres ya validados (requiredText y parseMemberNames) y devuelve su id. */
export function createGroup(state: DemoState, name: string, memberNames: string[]): string {
  if (state.groups.length >= DEMO_LIMITS.groups) {
    throw new DemoError(`La demo guarda como mucho ${DEMO_LIMITS.groups} grupos. Restablécela para empezar de cero.`);
  }
  let id = newGroupId();
  while (findGroup(state, id)) id = newGroupId();
  const members = memberNames.map((member) => ({ id: state.nextId++, name: member }));
  state.groups.unshift({ id, name, members, expenses: [], settlements: [] });
  return id;
}

export function renameGroup(state: DemoState, groupId: string, name: string) {
  requireGroup(state, groupId).name = name;
}

function checkFreeName(group: DemoGroup, name: string, exceptId?: number) {
  if (group.members.some((m) => m.id !== exceptId && nameKey(m.name) === nameKey(name))) {
    throw new DemoError(`Ya hay alguien que se llama «${name}» en el grupo.`);
  }
}

export function addMember(state: DemoState, groupId: string, name: string) {
  const group = requireGroup(state, groupId);
  if (group.members.length >= LIMITS.membersPerGroup) {
    throw new DemoError(`El grupo ya tiene el máximo de ${LIMITS.membersPerGroup} personas.`);
  }
  checkFreeName(group, name);
  group.members.push({ id: state.nextId++, name });
}

export function renameMember(state: DemoState, groupId: string, memberId: number, name: string) {
  const group = requireGroup(state, groupId);
  const member = group.members.find((m) => m.id === memberId);
  if (!member) throw new DemoError('Esa persona no está en el grupo.');
  checkFreeName(group, name, memberId);
  member.name = name;
}

/** Solo se puede quitar a alguien que no aparece en ningún gasto ni pago: si no, los saldos cambiarían. */
export function deleteMember(state: DemoState, groupId: string, memberId: number) {
  const group = requireGroup(state, groupId);
  if (!group.members.some((m) => m.id === memberId)) throw new DemoError('Esa persona no está en el grupo.');
  const used =
    group.expenses.some((e) => e.payerId === memberId || e.shares.some((s) => s.memberId === memberId)) ||
    group.settlements.some((s) => s.fromId === memberId || s.toId === memberId);
  if (used) throw new DemoError('No se puede quitar a alguien que ya aparece en gastos o pagos. Puedes cambiarle el nombre.');
  if (group.members.length <= 2) throw new DemoError('Un grupo necesita al menos dos personas.');
  group.members = group.members.filter((m) => m.id !== memberId);
}

/** Crea (expenseId null) o actualiza un gasto ya validado con validateExpense(). Devuelve su id. */
export function saveExpense(state: DemoState, groupId: string, expenseId: number | null, input: ExpenseInput): number {
  const group = requireGroup(state, groupId);
  const memberIds = new Set(group.members.map((m) => m.id));
  if (![input.payerId, ...input.shares.map((s) => s.memberId)].every((id) => memberIds.has(id))) {
    throw new DemoError('Alguna persona del gasto no está en el grupo.');
  }
  const data = {
    concept: input.concept,
    amountCents: input.amountCents,
    payerId: input.payerId,
    date: input.date,
    splitMode: input.splitMode,
    shares: input.shares.map((s) => ({ memberId: s.memberId, cents: s.cents, weight: s.weight })),
  };
  if (expenseId === null) {
    if (group.expenses.length >= DEMO_LIMITS.expensesPerGroup) {
      throw new DemoError(`En la demo, un grupo puede tener como mucho ${DEMO_LIMITS.expensesPerGroup} gastos.`);
    }
    const id = state.nextId++;
    group.expenses.push({ id, ...data });
    return id;
  }
  const index = group.expenses.findIndex((e) => e.id === expenseId);
  if (index === -1) throw new DemoError('Ese gasto ya no existe.');
  group.expenses[index] = { id: expenseId, ...data };
  return expenseId;
}

export function deleteExpense(state: DemoState, groupId: string, expenseId: number) {
  const group = requireGroup(state, groupId);
  group.expenses = group.expenses.filter((e) => e.id !== expenseId);
}

/** «Marcar como pagado»: solo vale un pago que esté en el plan actual (como en la web). */
export function settle(state: DemoState, groupId: string, fromId: number, toId: number, amountCents: number) {
  const group = requireGroup(state, groupId);
  const { plan } = groupData(group);
  const match = plan.transfers.find((t) => t.fromId === fromId && t.toId === toId && t.amountCents === amountCents);
  if (!match) throw new DemoError('Ese pago ya no está en el plan. Revisa el plan actualizado.');
  if (group.settlements.length >= DEMO_LIMITS.settlementsPerGroup) {
    throw new DemoError(`En la demo, un grupo puede tener como mucho ${DEMO_LIMITS.settlementsPerGroup} pagos registrados.`);
  }
  group.settlements.push({ id: state.nextId++, fromId, toId, amountCents, createdAt: Date.now() });
}

export function undoSettlement(state: DemoState, groupId: string, settlementId: number) {
  const group = requireGroup(state, groupId);
  group.settlements = group.settlements.filter((s) => s.id !== settlementId);
}
