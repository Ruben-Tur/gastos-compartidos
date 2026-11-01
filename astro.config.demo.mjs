// @ts-check
/**
 * Demo sin servidor: compilación estática para publicarla dentro del portfolio en
 * /demos/gastos-compartidos/. Las páginas están en demo/ y reutilizan los componentes, estilos y la
 * lógica de src/; los datos se guardan en el localStorage del visitante (demo/lib/store.ts).
 *
 *   npm run build:demo   →  demo-dist/  (se copia tal cual a <portfolio>/public/demos/gastos-compartidos/)
 */
import { rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'astro/config';

const BASE = '/demos/gastos-compartidos/';

/** Quita de la salida lo que solo tiene sentido en la web con servidor (la imagen para redes sociales). */
const serverOnlyFiles = ['og.png'];

export default defineConfig({
  srcDir: './demo',
  outDir: './demo-dist',
  base: BASE,
  output: 'static',
  trailingSlash: 'always',
  build: {
    // Cada página en su carpeta (grupo/index.html…): cualquier hosting estático la sirve sin reescrituras.
    format: 'directory',
    // CSS siempre en archivos: la CSP no necesita permitir estilos en línea.
    inlineStylesheets: 'never',
  },
  security: {
    // Sin servidor no hay cabeceras: Astro añade la política como <meta http-equiv="content-security-policy">
    // con 'self' y el hash de cada script y estilo que genera. frame-ancestors no vale en <meta> y
    // upgrade-insecure-requests lo decide el hosting del portfolio, así que no están.
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
      ],
    },
  },
  // No hay Markdown: sin resaltado de código (Shiki usa estilos en línea, incompatibles con la CSP).
  markdown: {
    syntaxHighlight: false,
  },
  server: {
    port: 4324,
  },
  devToolbar: {
    enabled: false,
  },
  integrations: [
    {
      name: 'demo-sin-servidor',
      hooks: {
        'astro:build:done': ({ dir }) => {
          for (const file of serverOnlyFiles) rmSync(fileURLToPath(new URL(file, dir)), { force: true });
        },
      },
    },
  ],
});
