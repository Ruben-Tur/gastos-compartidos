import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { centsToInput, formatEuros, formatPercent, parseAmount, parseOptionalAmount, parsePercent, percentToInput } from '../src/lib/money.ts';

const value = <T>(r: { ok: true; value: T } | { ok: false; error: string }) => {
  assert.ok(r.ok, r.ok ? '' : r.error);
  return r.value;
};

describe('formatEuros', () => {
  it('usa el formato español con punto de miles también en números de 4 cifras', () => {
    assert.equal(formatEuros(128460), '1.284,60\u00a0€');
    assert.equal(formatEuros(5), '0,05\u00a0€');
    assert.equal(formatEuros(100_000_000), '1.000.000,00\u00a0€');
  });

  it('marca el signo de los saldos', () => {
    assert.equal(formatEuros(-8725), '\u221287,25\u00a0€');
    assert.equal(formatEuros(8725, { sign: true }), '+87,25\u00a0€');
    assert.equal(formatEuros(0, { sign: true }), '0,00\u00a0€');
  });

  it('rechaza lo que no son céntimos enteros', () => {
    assert.throws(() => formatEuros(1.5));
  });
});

describe('parseAmount', () => {
  it('entiende coma decimal, punto decimal y puntos de miles', () => {
    assert.equal(value(parseAmount('1.284,60')), 128460);
    assert.equal(value(parseAmount('1284,6')), 128460);
    assert.equal(value(parseAmount('12.5')), 1250);
    assert.equal(value(parseAmount('1.284')), 128400);
    assert.equal(value(parseAmount(' 38 € ')), 3800);
    assert.equal(value(parseAmount('0,01')), 1);
  });

  it('no pierde céntimos con importes que en coma flotante fallan', () => {
    // Number('4.35') * 100 da 434.99999999999994: aquí el texto pasa a céntimos sin usar decimales.
    assert.equal(value(parseAmount('1,15')), 115);
    assert.equal(value(parseAmount('19,99')), 1999);
    assert.equal(value(parseAmount('4,35')), 435);
  });

  it('rechaza importes vacíos, negativos, cero, con más de dos decimales o enormes', () => {
    for (const bad of ['', '0', '0,00', '-5', '12,345', 'abc', '1,2,3', '1.28,5', '1000000,01', '1e5']) {
      assert.equal(parseAmount(bad).ok, false, bad);
    }
  });

  it('centsToInput es la inversa para rellenar formularios', () => {
    for (const cents of [1, 99, 100, 128460, 100_000_000]) assert.equal(value(parseAmount(centsToInput(cents))), cents);
  });
});

describe('porcentajes', () => {
  it('lee puntos básicos con hasta dos decimales', () => {
    assert.equal(value(parsePercent('33,33')), 3333);
    assert.equal(value(parsePercent('25')), 2500);
    assert.equal(value(parsePercent('12.5 %')), 1250);
    assert.equal(value(parsePercent('')), 0);
    assert.equal(parsePercent('100,01').ok, false);
    assert.equal(parsePercent('1,234').ok, false);
  });

  it('formatea sin ceros sobrantes', () => {
    assert.equal(formatPercent(3333), '33,33\u00a0%');
    assert.equal(formatPercent(1250), '12,5\u00a0%');
    assert.equal(formatPercent(2500), '25\u00a0%');
    assert.equal(percentToInput(1250), '12,5');
  });

  it('importes opcionales: vacío es 0', () => {
    assert.equal(value(parseOptionalAmount('')), 0);
    assert.equal(value(parseOptionalAmount('3,5')), 350);
    assert.equal(parseOptionalAmount('-3').ok, false);
  });
});
