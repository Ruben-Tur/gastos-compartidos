import { randomBytes } from 'node:crypto';

/**
 * Identificador de grupo: 18 bytes aleatorios del generador criptográfico (144 bits) en base64url,
 * 24 caracteres. Es la única «llave» del grupo, así que no puede ser correlativo ni adivinable:
 * con 2¹⁴⁴ posibilidades, probar ids al azar no encuentra nada.
 */
export function newGroupId(): string {
  return randomBytes(18).toString('base64url');
}

const GROUP_ID = /^[A-Za-z0-9_-]{24}$/;

export function isGroupId(value: unknown): value is string {
  return typeof value === 'string' && GROUP_ID.test(value);
}
