import type { APIRoute } from 'astro';

// Resumen para asistentes y buscadores generativos (formato llms.txt).
export const GET: APIRoute = ({ site, url }) => {
  const home = new URL('/', site ?? url).href;
  const text = `# Cuentas claras

> Web gratuita para repartir los gastos de un viaje, una cena o un piso compartido. Reparte cada gasto a partes iguales, por porcentajes o por importes exactos, muestra el saldo de cada persona y calcula el mínimo número de transferencias para dejar todas las cuentas a cero. No hace falta registrarse: cada grupo se comparte con un enlace privado.

## Qué hace

- Crear un grupo con sus personas, sin cuenta ni contraseña. El enlace del grupo (144 bits aleatorios) es la única forma de entrar.
- Apuntar gastos con concepto, importe, fecha, quién pagó y entre quién se reparte: a partes iguales, por porcentajes (que suman 100 %) o por importes (que suman el total).
- Ver el saldo de cada persona al momento: positivo si le deben, negativo si debe.
- «Para quedar en paz»: el plan con el mínimo de transferencias. Es exacto hasta 20 personas con saldo (programación dinámica sobre subconjuntos que suman cero) y aproximado por encima.
- Marcar cada transferencia como pagada; los saldos se actualizan.

## Detalles

- Importes en euros, guardados como céntimos enteros: los repartos cuadran siempre al céntimo y los céntimos sobrantes se asignan de forma determinista.
- Las páginas de grupo son privadas: no se indexan y no se envían en la cabecera Referer.
- Autor: Rubén Tur (https://github.com/Ruben-Tur).

## Enlaces

- [Inicio y creación de grupos](${home})
`;
  return new Response(text, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
  });
};
