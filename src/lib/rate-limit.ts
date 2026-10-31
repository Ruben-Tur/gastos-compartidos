import { env } from './env.ts';

/**
 * Límite de peticiones por IP en memoria (ventana fija). Suficiente para un único proceso Node;
 * con varias instancias habría que llevarlo a un almacén compartido (Redis, la propia base de datos…).
 */
const buckets = new Map<string, { count: number; resetAt: number }>();
let lastSweep = Date.now();

export interface RateRule {
  name: string;
  limit: number;
  windowMs: number;
}

export const RULES = {
  /** Crear grupos: lo más fácil de automatizar para llenar la base de datos. */
  createGroup: { name: 'create', limit: 10, windowMs: 60 * 60 * 1000 },
  /** Cualquier otro envío de formulario (gastos, personas, pagos). */
  write: { name: 'write', limit: 120, windowMs: 10 * 60 * 1000 },
} satisfies Record<string, RateRule>;

/** Devuelve 0 si la petición entra en el límite, o los segundos que hay que esperar si no. */
export function hit(rule: RateRule, ip: string, now = Date.now()): number {
  if (now - lastSweep > 60_000) {
    for (const [key, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(key);
    lastSweep = now;
  }
  const key = `${rule.name}:${ip}`;
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + rule.windowMs });
    return 0;
  }
  bucket.count += 1;
  return bucket.count > rule.limit ? Math.ceil((bucket.resetAt - now) / 1000) : 0;
}

/**
 * IP del visitante. Detrás de un proxy, clientAddress puede salir de X-Forwarded-For, que el cliente
 * puede falsear; si la plataforma da una cabecera fiable (TRUSTED_IP_HEADER), se usa esa.
 */
export function clientIp(request: Request, clientAddress: string | undefined): string {
  const trusted = env.trustedIpHeader && request.headers.get(env.trustedIpHeader)?.trim();
  return trusted || clientAddress || 'desconocida';
}
