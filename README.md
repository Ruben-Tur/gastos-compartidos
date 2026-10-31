# Cuentas claras · Gastos compartidos

Web para repartir los gastos de un viaje, una cena o un piso compartido y calcular el mínimo de transferencias para quedar en paz.

## Características

- **Grupos sin cuenta.** Se crea un grupo con un nombre y sus personas, y se comparte con un enlace privado. El identificador del grupo son 144 bits aleatorios (`crypto.randomBytes`) en base64url: no es correlativo ni se puede adivinar, y no hay ningún listado de grupos.
- **Gastos** con concepto, importe, fecha, quién pagó y entre quién se reparte. Se pueden añadir, editar y borrar. Tres formas de repartir:
  - **A partes iguales** entre las personas marcadas.
  - **Por porcentajes**, que tienen que sumar exactamente 100 % (hasta dos decimales).
  - **Por importes**, que tienen que sumar exactamente el total del gasto.

  El servidor valida que el reparto cuadra y, si no, dice cuánto falta o sobra. En el navegador, una vista previa muestra en vivo lo que le toca a cada uno.
- **Saldos al momento:** lo que ha pagado cada persona menos lo que le corresponde. Positivo, le deben; negativo, debe.
- **«Para quedar en paz»:** el plan con el mínimo número de transferencias para dejar todos los saldos a cero (ver [El cálculo del mínimo](#el-cálculo-del-mínimo-de-transferencias)).
- **Marcar como pagado:** registra la transferencia y los saldos se actualizan. Los pagos registrados se pueden deshacer.
- **Personas:** añadir, cambiar el nombre y quitar (solo a quien aún no aparece en ningún gasto ni pago).
- **Céntimos enteros en todas partes.** Los importes se guardan como `INTEGER` de céntimos y los porcentajes como puntos básicos (1 % = 100). Nunca se suman decimales en coma flotante. Se muestran en formato español: `1.284,60 €`.
- **Funciona sin JavaScript:** todo son formularios HTML que se procesan en el servidor. El cambio de columnas según el modo de reparto es CSS (`:has`). El JavaScript solo añade la vista previa del reparto, el botón «Copiar» del enlace, la confirmación al borrar y la lista «Tus grupos en este navegador» de la portada (guardada en `localStorage`).
- Tema claro y oscuro según el sistema, diseño adaptable (móvil, tablet y escritorio) y accesible con teclado y lector de pantalla.

### Repartos y céntimos sobrantes

Cuando un importe no se divide exacto, los céntimos que sobran se reparten **siempre igual** (mismo gasto, mismo reparto):

- **A partes iguales:** el céntimo de más va a los primeros participantes, en el orden de las personas del grupo. 10,00 € entre 3 → 3,34 + 3,33 + 3,33.
- **Por porcentajes:** método del mayor resto. Cada uno recibe su parte redondeada hacia abajo y los céntimos que faltan van a quien perdió más al redondear; a igualdad, al primero del grupo.

En los dos casos la suma de las partes es exactamente el total.

### El cálculo del mínimo de transferencias

Cada transferencia puede dejar a cero, como mucho, a una persona más (la última, a dos). Por eso, si las *n* personas con saldo se pueden separar en *k* subgrupos que suman cero cada uno, bastan *n − k* transferencias, y no se puede hacer con menos. El problema se reduce a encontrar el **mayor número de subgrupos disjuntos que suman cero**, que es NP-difícil en general (contiene al problema de la partición). Así que:

- **Hasta 20 personas con saldo distinto de cero: resultado exacto.** Programación dinámica sobre máscaras de bits, O(2ⁿ · n): para cada subconjunto se calcula su suma y el mayor número de subgrupos a cero que se pueden cerrar añadiendo sus personas una a una. Con 20 personas son ~1 millón de estados (unos milisegundos). Dentro de cada subgrupo, el que más debe paga al que más tiene que cobrar.
- **Con más de 20 personas con saldo: aproximación voraz** (el que más debe paga al que más tiene que cobrar, sobre todo el grupo). Usa como mucho *n − 1* transferencias, pero no siempre el mínimo. La página lo indica cuando pasa.

El código está en `src/lib/settle.ts` y las pruebas lo comparan con una búsqueda por fuerza bruta independiente.

## Tecnologías

| Capa | Tecnología |
|---|---|
| Frontend y servidor | [Astro](https://astro.build) con renderizado en servidor y el adaptador de Node |
| Lenguaje | TypeScript |
| Base de datos | SQLite (libSQL) con [@libsql/client](https://github.com/tursodatabase/libsql-client-ts) y consultas SQL parametrizadas |
| Estilos | CSS propio con variables, sin framework. Fuente Inter autoalojada (`@fontsource-variable/inter`) |
| Pruebas | `node:test`, el ejecutor de pruebas que trae Node (sin dependencias) |

## Requisitos

- Node.js 22.18 o superior (los scripts `.ts` se ejecutan directamente con Node).

## Instalación

```bash
git clone https://github.com/Ruben-Tur/gastos-compartidos.git
cd gastos-compartidos
npm install
cp .env.example .env        # opcional; en Windows: copy .env.example .env
npm run db:seed             # crea el grupo de ejemplo «Viaje a Lisboa» y muestra su enlace
npm run dev                 # http://localhost:4322
```

Las tablas se crean solas la primera vez que se usa la base de datos (`data/gastos.db`); no hay ningún paso de migración.

### Variables de entorno

Todas están documentadas en `.env.example` y ninguna es obligatoria en local.

| Variable | Descripción |
|---|---|
| `DATABASE_URL` | Ruta de la base de datos (por defecto, `file:./data/gastos.db`) |
| `DATABASE_AUTH_TOKEN` | Solo si se usa una base de datos libSQL remota (p. ej. Turso) |
| `SITE_URL` | URL pública (con `https` en producción). Se lee al compilar: enlace canónico, Open Graph, sitemap y dominio de confianza detrás de un proxy |
| `TRUSTED_IP_HEADER` | Opcional, solo detrás de un proxy: cabecera fiable con la IP del visitante, para el límite de peticiones |

### Windows: «Una directiva de Control de aplicaciones bloqueó este archivo»

Si `npm run dev` falla con `Cannot find native binding` y ese mensaje (error 4551), es el **Control inteligente de aplicaciones** de Windows bloqueando el compilador nativo de Astro. Ejecuta:

```bash
npm run fix:compiler
```

Instala la versión WebAssembly del compilador en `node_modules` sin modificar `package.json`. Hay que repetirlo después de cada `npm install` en ese equipo.

## Uso

1. En la portada, escribe el nombre del grupo y las personas (una por línea) y pulsa **Crear grupo**.
2. Guarda o comparte el enlace de la página del grupo: es la única forma de volver a entrar.
3. **Añadir gasto:** concepto, importe (`12,50` o `1.284,60`), fecha, quién pagó y cómo se reparte.
4. En la página del grupo verás los **saldos** y el plan **«Para quedar en paz»**. Cuando alguien haga una transferencia, pulsa **Marcar como pagado**.

### Scripts

| Comando | Descripción |
|---|---|
| `npm run dev` | Servidor de desarrollo en el puerto 4322 |
| `npm run build` | Compilación para producción |
| `npm start` | Arranca la versión compilada (`PORT` y `HOST` eligen puerto e interfaz) |
| `npm run check` | Comprobación de tipos |
| `npm test` | Pruebas de la lógica de dinero |
| `npm run db:seed` | Crea el grupo de ejemplo «Viaje a Lisboa» (si ya existe, solo muestra su enlace) |
| `npm run fix:compiler` | Solo Windows: compilador de Astro en WebAssembly (ver arriba) |

## Seguridad y privacidad

- **Datos que se guardan:** el nombre del grupo, los nombres de sus personas tal y como se escriben, los gastos (concepto, importe, fecha, reparto) y los pagos registrados. Nada más: ni cuentas, ni emails, ni IP, ni cookies. Todo en la base de datos SQLite (`data/gastos.db`, fuera de git). El navegador guarda en `localStorage` la lista de grupos visitados, solo en ese navegador.
- **Acceso:** quien tiene el enlace puede ver y editar el grupo. Las páginas de grupo llevan `noindex, nofollow` (meta y cabecera `X-Robots-Tag`), `Cache-Control: no-store`, no están en el sitemap y `robots.txt` las excluye. Con `Referrer-Policy: same-origin` el enlace nunca se envía a otras webs (no se usa `no-referrer` porque los navegadores enviarían `Origin: null` en los formularios y la protección CSRF los rechazaría).
- **CSRF:** `security.checkOrigin` de Astro rechaza los envíos de formularios desde otros orígenes.
- **CSP estricta** sin `unsafe-inline`: Astro calcula el hash de cada script y estilo propio. Sin recursos de terceros (ni CDNs, ni analítica, ni fuentes externas).
- **Validación en servidor** de todos los campos (longitudes, formato de importes y fechas, rangos, que las personas sean del grupo) y salida siempre escapada por Astro. Las consultas SQL son parametrizadas.
- **Límites:** 10 grupos nuevos por hora y 120 envíos de formularios cada 10 minutos por IP (en memoria, para un único proceso); cuerpo de petición de 64 KB como máximo; 30 personas, 1.000 gastos y 500 pagos por grupo; importes entre 0,01 € y 1.000.000,00 €.
- Cabeceras `X-Content-Type-Options`, `X-Frame-Options`, `frame-ancestors 'none'`, `Permissions-Policy`, `Cross-Origin-Opener-Policy` y HSTS en producción con HTTPS. Los errores muestran una página genérica, sin trazas.

## Estructura

```
gastos-compartidos/
├─ public/                    Favicon, icono y imagen para redes sociales
├─ scripts/
│  ├─ seed.ts                 Grupo de ejemplo «Viaje a Lisboa»
│  └─ fix-compiler.mjs        Arreglo del compilador de Astro en Windows
├─ src/
│  ├─ components/             Marca y formulario de gasto (con su vista previa)
│  ├─ db/client.ts            Conexión y esquema SQLite
│  ├─ layouts/Base.astro      Plantilla común (metadatos, cabecera y pie)
│  ├─ lib/
│  │  ├─ money.ts             Céntimos, formato español y lectura de importes y porcentajes
│  │  ├─ split.ts             Repartos a partes iguales, por porcentajes y por importes
│  │  ├─ balances.ts          Saldos de cada persona
│  │  ├─ settle.ts            Mínimo de transferencias (exacto y voraz)
│  │  ├─ groups.ts            Acceso a datos
│  │  ├─ expense-form.ts      Lectura y validación del formulario de gasto
│  │  ├─ validate.ts          Validación de textos, fechas y límites
│  │  ├─ rate-limit.ts        Límite de peticiones por IP
│  │  └─ ids.ts               Identificadores aleatorios de grupo
│  ├─ middleware.ts           Cabeceras de seguridad, límites y noindex de los grupos
│  ├─ pages/                  Portada, grupo, gastos, personas, 404/500, robots, sitemap y llms.txt
│  └─ styles/global.css       Estilos y variables de color
└─ tests/                     Pruebas de la lógica de dinero
```

## Pruebas

```bash
npm test
```

36 pruebas con `node:test` sobre la lógica de dinero (`src/lib`), sin base de datos ni navegador:

- **Importes:** formato español (`1.284,60 €`, signo de los saldos), lectura de `12,5`, `12.5`, `1.284,60`, rechazo de negativos, cero, más de dos decimales y valores fuera de rango.
- **Repartos:** céntimos sobrantes deterministas en partes iguales y por porcentajes (mayor resto), validación de que porcentajes e importes cuadran, y 2.000 casos aleatorios que comprueban que la suma de las partes es siempre el total.
- **Saldos:** suman cero, los pagos registrados los acercan a cero y se detectan repartos inconsistentes.
- **Mínimo de transferencias:** casos donde el voraz falla y el exacto no, 500 casos aleatorios que comprueban que **cualquier plan deja todos los saldos a cero** con *n − 1* transferencias como mucho, 300 casos comparados con una búsqueda por fuerza bruta independiente, y el paso al voraz por encima de 20 personas.

Hecho por [Rubén Tur](https://github.com/Ruben-Tur).
