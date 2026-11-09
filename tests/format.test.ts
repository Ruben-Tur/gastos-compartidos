import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { FLASH, flashMessage } from '../src/lib/format.ts';

describe('flashMessage', () => {
  it('devuelve el texto fijo de cada clave conocida', () => {
    assert.equal(flashMessage('pago'), FLASH.pago);
  });

  it('ignora claves desconocidas, vacías y las del prototipo de Object', () => {
    for (const key of [null, '', 'nada', 'constructor', '__proto__', 'toString', 'hasOwnProperty']) {
      assert.equal(flashMessage(key), null, String(key));
    }
  });
});
