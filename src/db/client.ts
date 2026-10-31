import { mkdirSync } from 'node:fs';
import { createClient, type InStatement } from '@libsql/client';
import { env } from '../lib/env.ts';

if (env.databaseUrl.startsWith('file:')) mkdirSync('./data', { recursive: true });

export const client = createClient({ url: env.databaseUrl, authToken: env.databaseAuthToken });

/**
 * Esquema. Todo el dinero en céntimos enteros (INTEGER), nunca REAL.
 * Los borrados en cascada se hacen a mano en src/lib/groups.ts para no depender de que
 * PRAGMA foreign_keys esté activo en cada conexión; las REFERENCES documentan las relaciones.
 */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS expense_groups (
  id          TEXT PRIMARY KEY,           -- 144 bits aleatorios en base64url (src/lib/ids.ts)
  name        TEXT NOT NULL,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS members (
  id        INTEGER PRIMARY KEY,
  group_id  TEXT NOT NULL REFERENCES expense_groups(id),
  name      TEXT NOT NULL,
  position  INTEGER NOT NULL,
  UNIQUE (group_id, name COLLATE NOCASE)
);

CREATE TABLE IF NOT EXISTS expenses (
  id            INTEGER PRIMARY KEY,
  group_id      TEXT NOT NULL REFERENCES expense_groups(id),
  concept       TEXT NOT NULL,
  amount_cents  INTEGER NOT NULL CHECK (amount_cents > 0),
  payer_id      INTEGER NOT NULL REFERENCES members(id),
  date          TEXT NOT NULL,              -- YYYY-MM-DD
  split_mode    TEXT NOT NULL CHECK (split_mode IN ('equal', 'percent', 'exact')),
  created_at    INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at    INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS expenses_group_idx ON expenses (group_id, date);

-- Parte de cada participante. weight guarda lo que se escribió (puntos básicos o céntimos) para
-- volver a rellenar el formulario al editar; share_cents es lo que cuenta para los saldos.
CREATE TABLE IF NOT EXISTS expense_shares (
  expense_id   INTEGER NOT NULL REFERENCES expenses(id),
  member_id    INTEGER NOT NULL REFERENCES members(id),
  share_cents  INTEGER NOT NULL CHECK (share_cents >= 0),
  weight       INTEGER,
  PRIMARY KEY (expense_id, member_id)
);
CREATE INDEX IF NOT EXISTS expense_shares_member_idx ON expense_shares (member_id);

-- Pagos hechos para saldar cuentas («marcar como pagado»).
CREATE TABLE IF NOT EXISTS settlements (
  id            INTEGER PRIMARY KEY,
  group_id      TEXT NOT NULL REFERENCES expense_groups(id),
  from_id       INTEGER NOT NULL REFERENCES members(id),
  to_id         INTEGER NOT NULL REFERENCES members(id),
  amount_cents  INTEGER NOT NULL CHECK (amount_cents > 0),
  created_at    INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS settlements_group_idx ON settlements (group_id);
`;

let ready: Promise<void> | null = null;

/** Crea las tablas la primera vez que se usa la base de datos (no hace falta ningún paso de migración). */
export function db() {
  ready ??= (async () => {
    if (env.databaseUrl.startsWith('file:')) await client.execute('PRAGMA journal_mode = WAL');
    await client.executeMultiple(SCHEMA);
  })();
  return ready.then(() => client);
}

export type { InStatement };
