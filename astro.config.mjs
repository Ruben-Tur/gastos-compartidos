// @ts-check
import { defineConfig } from 'astro/config';
import node from '@astrojs/node';

// La configuración se lee al compilar: carga .env si existe (sin pisar variables ya definidas).
try {
  process.loadEnvFile();
} catch {
  // Sin .env: se usan las variables del sistema.
}

// Dominio público. Defínelo en SITE_URL antes de compilar para producción: se usa para la URL canónica,
// Open Graph y el sitemap, y para saber en qué proxy HTTPS se puede confiar (ver security.allowedDomains).
const site = new URL(process.env.SITE_URL ?? 'http://localhost:4322');

export default defineConfig({
  site: site.origin,
  output: 'server',
  adapter: node({
    mode: 'standalone',
    // Los formularios son pequeños: con 64 KB sobra y se cortan cuerpos enormes enviados a propósito.
    bodySizeLimit: 64 * 1024,
  }),
  security: {
    // Rechaza envíos de formularios POST desde otros orígenes (protección CSRF).
    checkOrigin: true,
    // Detrás de un proxy que termina el HTTPS, acepta X-Forwarded-* solo para el dominio de SITE_URL.
    allowedDomains: site.protocol === 'https:' ? [{ protocol: 'https', hostname: site.hostname }] : [],
    // Content Security Policy: Astro calcula los hashes de cada script y estilo propio,
    // y el navegador bloquea cualquier código inyectado que no coincida.
    csp: {
      algorithm: 'SHA-256',
      directives: [
        "default-src 'self'",
        "img-src 'self' data:",
        "font-src 'self'",
        "connect-src 'self'",
        "form-action 'self'",
        "base-uri 'self'",
        "object-src 'none'",
        "frame-src 'none'",
        "frame-ancestors 'none'",
        'upgrade-insecure-requests',
      ],
    },
  },
  server: {
    port: 4322,
  },
  devToolbar: {
    enabled: false,
  },
});
