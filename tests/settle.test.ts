import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { computeBalances } from '../src/lib/balances.ts';
import { EXACT_LIMIT, settleUp, zeroSumGroups, type Balance, type Transfer } from '../src/lib/settle.ts';
import { splitEqual } from '../src/lib/split.ts';
import { random } from './random.ts';

const toBalances = (values: number[]): Balance[] => values.map((cents, i) => ({ memberId: i + 1, cents }));

/** Aplica las transferencias y devuelve los saldos resultantes. */
function apply(balances: Balance[], transfers: Transfer[]) {
  const after = new Map(balances.map((b) => [b.memberId, b.cents]));
  for (const t of transfers) {
    assert.ok(t.amountCents > 0, 'transferencia de importe positivo');
    assert.notEqual(t.fromId, t.toId, 'nadie se paga a sí mismo');
    after.set(t.fromId, after.get(t.fromId)! + t.amountCents);
    after.set(t.toId, after.get(t.toId)! - t.amountCents);
  }
  return after;
}

/**
 * Mínimo por fuerza bruta, independiente del algoritmo que se prueba (búsqueda con vuelta atrás:
 * el primer saldo pendiente se cancela contra cada uno de signo contrario).
 */
function bruteForceMin(values: number[]): number {
  const debts = values.filter((v) => v !== 0);
  const dfs = (start: number): number => {
    while (start < debts.length && debts[start] === 0) start++;
    if (start === debts.length) return 0;
    let best = Infinity;
    for (let j = start + 1; j < debts.length; j++) {
      if (debts[j] * debts[start] < 0) {
        debts[j] += debts[start];
        best = Math.min(best, 1 + dfs(start + 1));
        debts[j] -= debts[start];
      }
    }
    return best;
  };
  return dfs(0);
}

/** n saldos aleatorios que suman cero; con `pairs` se fuerzan subgrupos que se cancelan entre sí. */
function randomBalances(rnd: ReturnType<typeof random>, n: number, pairs = false): number[] {
  const values = Array.from({ length: n - 1 }, () => rnd.int(-50_000, 50_000));
  if (pairs) for (let i = 1; i < values.length; i += 3) values[i] = -values[i - 1];
  values.push(0 - values.reduce((a, b) => a + b, 0)); // 0 − x y no −x, que con x = 0 da −0
  return values;
}

describe('computeBalances', () => {
  it('saldo = pagado − lo que le toca, y suma cero', () => {
    const ids = [1, 2, 3];
    const dinner = splitEqual(9000, ids);
    assert.ok(dinner.ok);
    const balances = computeBalances(ids, [{ payerId: 1, amountCents: 9000, shares: dinner.shares }]);
    assert.deepEqual([...balances.values()], [6000, -3000, -3000]);
  });

  it('los pagos registrados para saldar cuentas mueven los saldos hacia cero', () => {
    const ids = [1, 2];
    const balances = computeBalances(
      ids,
      [{ payerId: 1, amountCents: 1000, shares: [{ memberId: 1, cents: 500 }, { memberId: 2, cents: 500 }] }],
      [{ fromId: 2, toId: 1, amountCents: 500 }],
    );
    assert.deepEqual([...balances.values()], [0, 0]);
  });

  it('detecta repartos que no suman el gasto o personas fuera del grupo', () => {
    assert.throws(() => computeBalances([1], [{ payerId: 1, amountCents: 10, shares: [{ memberId: 1, cents: 9 }] }]));
    assert.throws(() => computeBalances([1], [{ payerId: 2, amountCents: 10, shares: [{ memberId: 1, cents: 10 }] }]));
  });
});

describe('settleUp', () => {
  it('sin deudas no hay transferencias', () => {
    assert.deepEqual(settleUp(toBalances([0, 0, 0])), { transfers: [], exact: true });
  });

  it('caso sencillo: dos deben a uno', () => {
    const plan = settleUp(toBalances([6000, -3000, -3000]));
    assert.equal(plan.transfers.length, 2);
    assert.ok(plan.exact);
  });

  it('sin subgrupos que sumen cero hacen falta n − 1 transferencias', () => {
    assert.equal(settleUp(toBalances([700, 300, -500, -500])).transfers.length, 3);
  });

  it('gana al voraz cuando hay subgrupos que se cancelan', () => {
    // El voraz (el que más debe paga al que más cobra) hace 6 → 5, 5 → 4, 2 → 1, 1 → 1: 4 transferencias.
    // El óptimo separa {+5, −5} y {+6, −4, −2}: 1 + 2 = 3.
    const plan = settleUp(toBalances([600, 500, -500, -400, -200]));
    assert.equal(plan.transfers.length, 3);
    assert.deepEqual(
      plan.transfers.find((t) => t.toId === 2),
      { fromId: 3, toId: 2, amountCents: 500 },
    );
  });

  it('rechaza saldos que no suman cero', () => {
    assert.throws(() => settleUp(toBalances([100, -99])));
  });

  it('es determinista', () => {
    const values = [1200, -300, -300, -600, 450, -450];
    assert.deepEqual(settleUp(toBalances(values)), settleUp(toBalances(values)));
  });

  it('zeroSumGroups devuelve grupos disjuntos que suman cero y cubren a todos', () => {
    const people = toBalances([500, -500, 300, -100, -200, 50, -50]);
    const groups = zeroSumGroups(people);
    assert.equal(groups.flat().length, people.length);
    for (const g of groups) assert.equal(g.reduce((a, b) => a + b.cents, 0), 0);
    assert.equal(groups.length, 3);
  });
});

describe('propiedades de settleUp', () => {
  const rnd = random(4322);

  it('cualquier plan deja todos los saldos a cero, con n − 1 transferencias como mucho (500 casos)', () => {
    for (let i = 0; i < 500; i++) {
      const n = rnd.int(2, 12);
      const balances = toBalances(randomBalances(rnd, n, i % 2 === 0));
      const plan = settleUp(balances);
      for (const [id, cents] of apply(balances, plan.transfers)) assert.equal(cents, 0, `saldo de ${id}`);
      const nonZero = balances.filter((b) => b.cents !== 0).length;
      assert.ok(plan.transfers.length <= Math.max(0, nonZero - 1));
    }
  });

  it('coincide con el mínimo por fuerza bruta (300 casos de hasta 8 personas)', () => {
    for (let i = 0; i < 300; i++) {
      const values = randomBalances(rnd, rnd.int(2, 8), i % 3 !== 0);
      assert.equal(settleUp(toBalances(values)).transfers.length, bruteForceMin(values), values.join(','));
    }
  });

  it(`usa el cálculo exacto hasta ${EXACT_LIMIT} personas y el voraz por encima, saldando en ambos casos`, () => {
    for (const n of [EXACT_LIMIT, EXACT_LIMIT + 5]) {
      const balances = toBalances(randomBalances(rnd, n, true));
      const started = performance.now();
      const plan = settleUp(balances);
      const ms = performance.now() - started;
      assert.equal(plan.exact, n <= EXACT_LIMIT);
      for (const cents of apply(balances, plan.transfers).values()) assert.equal(cents, 0);
      assert.ok(ms < 2000, `tarda ${ms.toFixed(0)} ms`);
    }
  });
});
