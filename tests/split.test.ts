import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { split, splitEqual, splitExact, splitPercent, type Share, type SplitResult } from '../src/lib/split.ts';
import { random } from './random.ts';

const shares = (r: SplitResult): Share[] => {
  assert.ok(r.ok, r.ok ? '' : r.error);
  return r.shares;
};
const cents = (r: SplitResult) => shares(r).map((s) => s.cents);
const total = (list: Share[]) => list.reduce((acc, s) => acc + s.cents, 0);

describe('splitEqual', () => {
  it('reparte exacto cuando se puede', () => {
    assert.deepEqual(cents(splitEqual(12000, [1, 2, 3, 4])), [3000, 3000, 3000, 3000]);
  });

  it('da los céntimos sobrantes a los primeros, en orden', () => {
    assert.deepEqual(cents(splitEqual(1000, [1, 2, 3])), [334, 333, 333]);
    assert.deepEqual(cents(splitEqual(1001, [1, 2, 3])), [334, 334, 333]);
    assert.deepEqual(cents(splitEqual(2, [7, 8, 9])), [1, 1, 0]);
  });

  it('es determinista: mismo gasto, mismo reparto', () => {
    assert.deepEqual(splitEqual(14640, [3, 1, 2]), splitEqual(14640, [3, 1, 2]));
  });

  it('pide al menos un participante y sin repetir', () => {
    assert.equal(splitEqual(1000, []).ok, false);
    assert.equal(splitEqual(1000, [1, 1]).ok, false);
  });
});

describe('splitPercent', () => {
  it('reparte por porcentajes', () => {
    const r = splitPercent(10000, [
      { memberId: 1, value: 5000 },
      { memberId: 2, value: 3000 },
      { memberId: 3, value: 2000 },
    ]);
    assert.deepEqual(cents(r), [5000, 3000, 2000]);
  });

  it('reparte el céntimo sobrante al mayor resto y, a igualdad, al primero', () => {
    // 100 céntimos en tercios: 33,33 / 33,33 / 33,34 % → 33,333 / 33,333 / 33,334 → 33 / 33 / 34.
    assert.deepEqual(
      cents(splitPercent(100, [{ memberId: 1, value: 3333 }, { memberId: 2, value: 3333 }, { memberId: 3, value: 3334 }])),
      [33, 33, 34],
    );
    // 1 céntimo al 50/50: va al primero.
    assert.deepEqual(cents(splitPercent(1, [{ memberId: 1, value: 5000 }, { memberId: 2, value: 5000 }])), [1, 0]);
  });

  it('exige que sumen 100 %', () => {
    const r = splitPercent(1000, [{ memberId: 1, value: 3333 }, { memberId: 2, value: 3333 }, { memberId: 3, value: 3333 }]);
    assert.equal(r.ok, false);
    assert.match(r.ok ? '' : r.error, /99,99/);
    assert.equal(splitPercent(1000, [{ memberId: 1, value: 6000 }, { memberId: 2, value: 6000 }]).ok, false);
  });

  it('ignora a quien tiene 0 %', () => {
    assert.deepEqual(shares(splitPercent(900, [{ memberId: 1, value: 10000 }, { memberId: 2, value: 0 }])), [
      { memberId: 1, cents: 900 },
    ]);
  });
});

describe('splitExact', () => {
  it('acepta importes que suman el total', () => {
    assert.deepEqual(cents(splitExact(5000, [{ memberId: 1, value: 2000 }, { memberId: 2, value: 3000 }])), [2000, 3000]);
  });

  it('dice cuánto falta o sobra', () => {
    const short = splitExact(5000, [{ memberId: 1, value: 2000 }, { memberId: 2, value: 2000 }]);
    assert.match(short.ok ? '' : short.error, /faltan 10,00/);
    const over = splitExact(5000, [{ memberId: 1, value: 4000 }, { memberId: 2, value: 2000 }]);
    assert.match(over.ok ? '' : over.error, /sobran 10,00/);
  });
});

describe('propiedades de los repartos (1.000 casos aleatorios por modo)', () => {
  const rnd = random(20261031);

  it('la suma de las partes es siempre el total y nadie se lleva más de un céntimo de diferencia en partes iguales', () => {
    for (let i = 0; i < 1000; i++) {
      const amount = rnd.int(1, 2_000_000);
      const ids = Array.from({ length: rnd.int(1, 12) }, (_, k) => k + 1);
      const list = shares(splitEqual(amount, ids));
      assert.equal(total(list), amount);
      const values = list.map((s) => s.cents);
      assert.ok(Math.max(...values) - Math.min(...values) <= 1);
    }
  });

  it('porcentajes: suma exacta y cada parte a menos de un céntimo de su valor teórico', () => {
    for (let i = 0; i < 1000; i++) {
      const amount = rnd.int(1, 2_000_000);
      const n = rnd.int(1, 10);
      // n porcentajes enteros en puntos básicos que suman 10.000.
      const cuts = Array.from({ length: n - 1 }, () => rnd.int(0, 10_000)).sort((a, b) => a - b);
      const bps = [...cuts, 10_000].map((c, k) => c - (k ? cuts[k - 1] : 0));
      const weights = bps.map((value, k) => ({ memberId: k + 1, value })).filter((w) => w.value > 0);
      const list = shares(splitPercent(amount, weights));
      assert.equal(total(list), amount);
      list.forEach((s, k) => assert.ok(Math.abs(s.cents - (amount * weights[k].value) / 10_000) < 1));
    }
  });

  it('el punto de entrada común respeta el modo', () => {
    assert.deepEqual(cents(split('equal', 300, [{ memberId: 1, value: 0 }, { memberId: 2, value: 0 }])), [150, 150]);
    assert.deepEqual(cents(split('exact', 300, [{ memberId: 1, value: 100 }, { memberId: 2, value: 200 }])), [100, 200]);
  });
});
