import type { APIRoute } from 'astro';

// Solo la portada es pública. Las páginas de grupo (/g/…) son privadas: además de no listarse aquí
// ni en el sitemap, llevan noindex en la cabecera X-Robots-Tag y en la etiqueta meta.
export const GET: APIRoute = ({ site, url }) =>
  new Response(`User-agent: *\nDisallow: /g/\n\nSitemap: ${new URL('/sitemap.xml', site ?? url).href}\n`, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
