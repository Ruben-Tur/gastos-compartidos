/**
 * Arreglo para Windows con «Control inteligente de aplicaciones» (Smart App Control) activado.
 *
 * Windows puede bloquear el compilador nativo de Astro (astro.win32-x64-msvc.node, error 4551
 * «Una directiva de Control de aplicaciones bloqueó este archivo») y `astro dev` no arranca.
 * Astro sabe usar en ese caso su versión WebAssembly, pero npm no la instala en equipos x64
 * (el paquete declara cpu "wasm32"). Este script la descarga con `npm pack` y la coloca en
 * node_modules sin tocar package.json, así que no afecta a otros equipos ni al servidor.
 *
 *   npm run fix:compiler
 *
 * Hay que volver a ejecutarlo después de cada `npm install` / `npm ci` en este equipo.
 */
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const bindingDir = path.dirname(require.resolve('@astrojs/compiler-binding/package.json'));
const { version } = JSON.parse(readFileSync(path.join(bindingDir, 'package.json'), 'utf8'));
const target = path.resolve('node_modules/@astrojs/compiler-binding-wasm32-wasi');

// ¿Carga el compilador nativo? Entonces no hace falta nada.
const nativeName = `@astrojs/compiler-binding-${process.platform}-${process.arch}-msvc`;
try {
  require(nativeName);
  console.log('✓ El compilador nativo de Astro carga bien: no hace falta el arreglo.');
  process.exit(0);
} catch (err) {
  console.log(`· El compilador nativo no carga: ${String(err?.message).split('\n')[0]}`);
}

const installed = existsSync(path.join(target, 'package.json'))
  ? JSON.parse(readFileSync(path.join(target, 'package.json'), 'utf8')).version
  : null;
if (installed === version) {
  console.log(`✓ La versión WebAssembly del compilador (${version}) ya está instalada.`);
  process.exit(0);
}

const tmp = mkdtempSync(path.join(tmpdir(), 'astro-wasm-'));
try {
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const tgz = execFileSync(npm, ['pack', `@astrojs/compiler-binding-wasm32-wasi@${version}`, '--silent'], {
    cwd: tmp,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  })
    .trim()
    .split('\n')
    .pop();
  execFileSync('tar', ['-xzf', tgz], { cwd: tmp });
  rmSync(target, { recursive: true, force: true });
  cpSync(path.join(tmp, 'package'), target, { recursive: true });
  require(path.join(target, 'astro.wasi.cjs'));
  console.log(`✓ Compilador de Astro en WebAssembly (${version}) instalado. Ya puedes ejecutar npm run dev.`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
