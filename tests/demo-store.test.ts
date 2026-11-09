import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  addMember,
  createGroup,
  DEMO_LIMITS,
  DemoError,
  deleteExpense,
  deleteMember,
  findGroup,
  groupData,
  isGroupId,
  loadState,
  newGroupId,
  parseState,
  renameMember,
  resetState,
  saveExpense,
  saveState,
  SEED_GROUP_ID,
  seedState,
  settle,
  STORAGE_KEY,
  undoSettlement,
  type DemoState,
  type StorageLike,
} from '../demo/lib/store.ts';
import { LIMITS } from '../src/lib/validate.ts';

/** localStorage en memoria; con `failWrites` simula un almacenamiento lleno o bloqueado. */
function memoryStorage(initial: Record<string, string> = {}, { failWrites = false } = {}) {
  const data = new Map(Object.entries(initial));
  const storage: StorageLike & { data: Map<string, string> } = {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      if (failWrites) throw new Error('QuotaExceededError');
      data.set(key, value);
    },
  };
  return storage;
}

/** Copia del ejemplo modificada a mano, como haría alguien editando localStorage. */
function tampered(change: (state: any) => void): string {
  const state: any = structuredClone(seedState());
  change(state);
  return JSON.stringify(state);
}

const seedGroup = (state: DemoState) => findGroup(state, SEED_GROUP_ID)!;

describe('demo: ejemplo inicial', () => {
  it('es el mismo «Viaje a Lisboa» que crea npm run db:seed', () => {
    const data = groupData(seedGroup(seedState()));
    assert.equal(data.group.name, 'Viaje a Lisboa');
    assert.deepEqual(
      data.members.map((m) => m.name),
      ['Ana', 'Luis', 'Marta', 'Pablo'],
    );
    assert.equal(data.expenses.length, 23);
    assert.equal(data.totalCents, 128460);
    assert.deepEqual(new Set(data.expenses.map((e) => e.splitMode)), new Set(['equal', 'percent', 'exact']));
    assert.equal(data.balances.reduce((acc, b) => acc + b.cents, 0), 0);
    assert.equal(data.plan.transfers.length, 3);
  });

  it('pasa su propia validación y se guarda y se lee igual', () => {
    const state = seedState();
    assert.deepEqual(parseState(JSON.stringify(state)), state);
  });

  it('los ids nuevos tienen el formato de los de la web', () => {
    for (let i = 0; i < 50; i++) assert.ok(isGroupId(newGroupId()));
    assert.ok(isGroupId(SEED_GROUP_ID));
  });
});

describe('demo: carga desde localStorage', () => {
  it('primera visita: guarda el ejemplo', () => {
    const storage = memoryStorage();
    const { state, status } = loadState(storage);
    assert.equal(status, 'seeded');
    assert.deepEqual(parseState(storage.data.get(STORAGE_KEY)!), state);
  });

  it('segunda visita: lee lo guardado', () => {
    const storage = memoryStorage();
    const first = loadState(storage).state;
    createGroup(first, 'Piso', ['Eva', 'Juan']);
    saveState(storage, first);
    const { state, status } = loadState(storage);
    assert.equal(status, 'ok');
    assert.equal(state.groups[0].name, 'Piso');
  });

  it('datos rotos: vuelve al ejemplo y lo guarda', () => {
    for (const raw of ['{', 'null', '[]', '"texto"', '{"version":2,"nextId":1,"groups":[]}', 'x'.repeat(10)]) {
      const storage = memoryStorage({ [STORAGE_KEY]: raw });
      const { state, status } = loadState(storage);
      assert.equal(status, 'corrupt', raw);
      assert.deepEqual(state, seedState());
      assert.deepEqual(parseState(storage.data.get(STORAGE_KEY)!), seedState());
    }
  });

  it('sin localStorage o si leer falla: el ejemplo en memoria', () => {
    assert.equal(loadState(null).status, 'unavailable');
    const throwing: StorageLike = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {},
    };
    assert.equal(loadState(throwing).status, 'unavailable');
    assert.equal(loadState(memoryStorage({}, { failWrites: true })).status, 'unavailable');
  });
});

describe('demo: validación de lo guardado', () => {
  const rejects = (label: string, change: (state: any) => void) => assert.equal(parseState(tampered(change)), null, label);

  it('rechaza estructura, versión e ids no válidos', () => {
    rejects('versión', (s) => (s.version = 2));
    rejects('nextId', (s) => (s.nextId = -1));
    rejects('groups', (s) => (s.groups = {}));
    rejects('id de grupo', (s) => (s.groups[0].id = '../../etc'));
    rejects('grupo repetido', (s) => s.groups.push(structuredClone(s.groups[0])));
    rejects('id de persona', (s) => (s.groups[0].members[0].id = 1.5));
    rejects('id de gasto repetido', (s) => (s.groups[0].expenses[1].id = s.groups[0].expenses[0].id));
  });

  it('rechaza textos vacíos, largos, sin limpiar o que no son texto', () => {
    rejects('nombre vacío', (s) => (s.groups[0].name = '   '));
    rejects('nombre largo', (s) => (s.groups[0].name = 'x'.repeat(LIMITS.groupName + 1)));
    rejects('control', (s) => (s.groups[0].members[0].name = 'Ana\u0000'));
    rejects('bidi', (s) => (s.groups[0].expenses[0].concept = 'Hotel‮'));
    rejects('no es texto', (s) => (s.groups[0].expenses[0].concept = { toString: 1 }));
    rejects('nombre repetido', (s) => (s.groups[0].members[1].name = 'ANA'));
  });

  it('acepta HTML como texto normal (se pinta con textContent, nunca como HTML)', () => {
    const state = parseState(tampered((s) => (s.groups[0].name = '<img src=x onerror=alert(1)>')));
    assert.equal(state?.groups[0].name, '<img src=x onerror=alert(1)>');
  });

  it('rechaza importes, fechas, modos y personas que no cuadran', () => {
    rejects('importe 0', (s) => (s.groups[0].expenses[0].amountCents = 0));
    rejects('importe decimal', (s) => (s.groups[0].expenses[0].amountCents = 10.5));
    rejects('importe enorme', (s) => (s.groups[0].expenses[0].amountCents = 1e15));
    rejects('fecha', (s) => (s.groups[0].expenses[0].date = '2026-02-30'));
    rejects('modo', (s) => (s.groups[0].expenses[0].splitMode = 'magic'));
    rejects('pagador', (s) => (s.groups[0].expenses[0].payerId = 999));
    rejects('persona del reparto', (s) => (s.groups[0].expenses[0].shares[0].memberId = 999));
  });

  it('rechaza repartos que no salen de split() o no suman el importe', () => {
    rejects('suma', (s) => (s.groups[0].expenses[0].shares[0].cents += 1));
    rejects('céntimos movidos', (s) => {
      const [a, b] = s.groups[0].expenses[0].shares;
      a.cents += 1;
      b.cents -= 1;
    });
    rejects('peso en partes iguales', (s) => (s.groups[0].expenses[0].shares[0].weight = 1));
    rejects('sin repartir', (s) => (s.groups[0].expenses[0].shares = []));
    const percent = (s: any) => s.groups[0].expenses.find((e: any) => e.splitMode === 'percent');
    rejects('porcentajes que no suman 100', (s) => (percent(s).shares[0].weight += 1));
  });

  it('rechaza pagos imposibles', () => {
    const add = (s: any, p: object) => s.groups[0].settlements.push({ id: 900, fromId: 2, toId: 1, amountCents: 100, createdAt: 0, ...p });
    assert.notEqual(parseState(tampered((s) => add(s, {}))), null);
    rejects('a sí mismo', (s) => add(s, { toId: 2 }));
    rejects('negativo', (s) => add(s, { amountCents: -100 }));
    rejects('persona de fuera', (s) => add(s, { fromId: 999 }));
  });

  it('pone límites de tamaño', () => {
    rejects('demasiados grupos', (s) => {
      for (let i = 0; i < DEMO_LIMITS.groups; i++) s.groups.push({ ...structuredClone(s.groups[0]), id: newGroupId() });
    });
    rejects('demasiados gastos', (s) => {
      const e = s.groups[0].expenses[0];
      for (let i = 0; i < DEMO_LIMITS.expensesPerGroup; i++) s.groups[0].expenses.push({ ...structuredClone(e), id: 1000 + i });
    });
    rejects('demasiadas personas', (s) => {
      for (let i = 0; i < LIMITS.membersPerGroup; i++) s.groups[0].members.push({ id: 1000 + i, name: `P${i}` });
    });
    assert.equal(parseState(' '.repeat(DEMO_LIMITS.storageChars + 1)), null);
  });

  it('ignora campos desconocidos y corrige nextId', () => {
    const raw = tampered((s) => {
      s.extra = 'x';
      s.nextId = 1;
    }).replace('"name":"Viaje a Lisboa"', '"__proto__":{"polluted":true},"name":"Viaje a Lisboa"');
    assert.ok(raw.includes('__proto__'));
    const state = parseState(raw)!;
    assert.equal('extra' in state, false);
    assert.equal(state.nextId, seedState().nextId);
    assert.equal((state.groups[0] as any).polluted, undefined);
    assert.equal(({} as any).polluted, undefined);
  });
});

describe('demo: cambios', () => {
  it('crea grupos con límite', () => {
    const state = seedState();
    const id = createGroup(state, 'Cena', ['Eva', 'Juan']);
    assert.ok(isGroupId(id));
    assert.deepEqual(
      findGroup(state, id)!.members.map((m) => m.name),
      ['Eva', 'Juan'],
    );
    while (state.groups.length < DEMO_LIMITS.groups) createGroup(state, 'Otro', ['A', 'B']);
    assert.throws(() => createGroup(state, 'Uno más', ['A', 'B']), DemoError);
  });

  it('personas: sin nombres repetidos y sin quitar a quien ya tiene gastos', () => {
    const state = seedState();
    assert.throws(() => addMember(state, SEED_GROUP_ID, 'ana'), /Ya hay alguien/);
    addMember(state, SEED_GROUP_ID, 'Eva');
    const eva = seedGroup(state).members.at(-1)!;
    assert.throws(() => renameMember(state, SEED_GROUP_ID, eva.id, 'Luis'), /Ya hay alguien/);
    renameMember(state, SEED_GROUP_ID, eva.id, 'Eva G.');
    assert.throws(() => deleteMember(state, SEED_GROUP_ID, 1), /No se puede quitar/);
    assert.throws(() => deleteMember(state, SEED_GROUP_ID, 9999), /no está en el grupo/);
    deleteMember(state, SEED_GROUP_ID, eva.id);
    assert.equal(seedGroup(state).members.length, 4);

    const id = createGroup(state, 'Dos', ['A', 'B']);
    assert.throws(() => deleteMember(state, id, findGroup(state, id)!.members[0].id), /al menos dos/);
  });

  it('gastos: crea, edita y borra, y el resultado sigue siendo válido', () => {
    const state = seedState();
    const shares = [
      { memberId: 1, cents: 500, weight: null },
      { memberId: 2, cents: 500, weight: null },
    ];
    const input = { concept: 'Cena', amountCents: 1000, payerId: 1, date: '2026-09-14', splitMode: 'equal' as const, shares };
    const id = saveExpense(state, SEED_GROUP_ID, null, input);
    saveExpense(state, SEED_GROUP_ID, id, { ...input, concept: 'Cena editada' });
    assert.equal(groupData(seedGroup(state)).expenses[0].concept, 'Cena editada');
    assert.deepEqual(parseState(JSON.stringify(state)), state);
    assert.throws(() => saveExpense(state, SEED_GROUP_ID, 99_999, input), /ya no existe/);
    assert.throws(() => saveExpense(state, SEED_GROUP_ID, null, { ...input, payerId: 999 }), /no está en el grupo/);
    deleteExpense(state, SEED_GROUP_ID, id);
    assert.equal(seedGroup(state).expenses.length, 23);
  });

  it('pagos: solo los del plan, y deshacer los quita', () => {
    const state = seedState();
    const [first] = groupData(seedGroup(state)).plan.transfers;
    assert.throws(() => settle(state, SEED_GROUP_ID, first.fromId, first.toId, first.amountCents + 1), /ya no está en el plan/);
    settle(state, SEED_GROUP_ID, first.fromId, first.toId, first.amountCents);
    const data = groupData(seedGroup(state));
    assert.equal(data.plan.transfers.length, 2);
    assert.equal(data.balances.find((b) => b.memberId === first.fromId)!.cents, 0);
    assert.deepEqual(parseState(JSON.stringify(state)), state);
    undoSettlement(state, SEED_GROUP_ID, data.settlements[0].id);
    assert.equal(groupData(seedGroup(state)).plan.transfers.length, 3);
  });

  it('guardar: error claro si no cabe o no se puede escribir, y restablecer vuelve al ejemplo', () => {
    assert.throws(() => saveState(null, seedState()), DemoError);
    assert.throws(() => saveState(memoryStorage({}, { failWrites: true }), seedState()), DemoError);
    const storage = memoryStorage();
    const state = loadState(storage).state;
    createGroup(state, 'Piso', ['Eva', 'Juan']);
    saveState(storage, state);
    assert.deepEqual(resetState(storage), seedState());
    assert.equal(loadState(storage).state.groups.length, 1);
  });
});
