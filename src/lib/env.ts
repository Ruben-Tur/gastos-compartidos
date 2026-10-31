// Carga .env en process.env (Node >= 21) sin sobrescribir variables ya definidas por el sistema.
// Así funcionan igual `astro dev`, el servidor compilado y el script de datos de ejemplo.
try {
  process.loadEnvFile();
} catch {
  // Sin archivo .env: se usan las variables del entorno y los valores por defecto.
}

export const env = {
  databaseUrl: process.env.DATABASE_URL || 'file:./data/gastos.db',
  databaseAuthToken: process.env.DATABASE_AUTH_TOKEN || undefined,
  // Cabecera con la IP real del visitante que pone el proxy de la plataforma (p. ej. fly-client-ip,
  // cf-connecting-ip o x-real-ip). Solo debe definirse si el proxy la sobrescribe siempre.
  trustedIpHeader: process.env.TRUSTED_IP_HEADER?.trim().toLowerCase() || undefined,
};
