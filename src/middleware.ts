import { defineMiddleware } from 'astro:middleware';
import { clientIp, hit, RULES } from './lib/rate-limit.ts';

const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  // El enlace de un grupo es su única llave: nunca se envía como Referer a otra web.
  // «same-origin» y no «no-referrer»: con no-referrer los navegadores mandan «Origin: null» en los
  // POST de formularios y la protección CSRF de Astro (checkOrigin) los rechazaría todos.
  'Referrer-Policy': 'same-origin',
  'X-Frame-Options': 'DENY',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
};

/** Las páginas de grupo son privadas: solo las ve quien tiene el enlace. */
function isPrivatePath(pathname: string) {
  return pathname === '/g' || pathname.startsWith('/g/');
}

/** Igual que bodySizeLimit en astro.config.mjs. */
const MAX_BODY_BYTES = 64 * 1024;

function isUrlEncodedForm(request: Request) {
  const type = request.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
  return type === 'application/x-www-form-urlencoded';
}

function plain(status: number, message: string, headers: Record<string, string> = {}) {
  return new Response(message, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', ...headers } });
}

export const onRequest = defineMiddleware(async (context, next) => {
  const { request, url } = context;
  let response: Response;

  if (request.method === 'POST') {
    const ip = clientIp(request, context.clientAddress);
    const wait = (url.pathname === '/' ? hit(RULES.createGroup, ip) : 0) || hit(RULES.write, ip);
    if (wait) {
      response = plain(429, 'Demasiadas peticiones seguidas. Espera un poco y vuelve a intentarlo.', {
        'Retry-After': String(wait),
      });
    } else if (Number(request.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) {
      // Lo mismo corta el adaptador (bodySizeLimit) sin Content-Length; aquí se responde 413 sin leer nada.
      response = plain(413, 'El formulario es demasiado grande.');
    } else if (!isUrlEncodedForm(request)) {
      // Todos los formularios de la web se envían así. Otro tipo (JSON, multipart mal formado…) hacía
      // fallar request.formData() en la página y salía un 500.
      response = plain(415, 'Tipo de envío no admitido.');
    } else {
      response = await next();
    }
  } else {
    response = await next();
  }

  const headers = response.headers;
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    if (!headers.has(name)) headers.set(name, value);
  }
  if (import.meta.env.PROD && url.protocol === 'https:') {
    headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains');
  }
  if (isPrivatePath(url.pathname)) {
    headers.set('X-Robots-Tag', 'noindex, nofollow');
    headers.set('Cache-Control', 'no-store');
  }
  return response;
});
