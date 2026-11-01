import assert from 'node:assert/strict';
import test from 'node:test';
import { isValidCnpj, normalizeCnpj } from '../../frontend/src/services/cnpj.js';

test('CNPJ valida os formatos numérico e alfanumérico', () => {
  for (const value of ['12345678000195', '12.345.678/0001-95', '12ABC34501DE35', ' 12.abc.345/01de-35 ']) {
    assert.equal(isValidCnpj(value), true, value);
  }
  assert.equal(normalizeCnpj('12.abc.345/01de-35'), '12ABC34501DE35');
});

test('CNPJ rejeita formato inválido, repetição e alteração de dígitos', () => {
  for (const value of ['', null, '00000000000000', '11111111111111', '12345678000194', '12ABC34501DE34', '12ABC34501DEAA', '12!ABC34501DE35', '123456780001950']) {
    assert.equal(isValidCnpj(value), false, String(value));
  }
});
