/**
 * Validación de lo que llega de los formularios. Todo se trata como texto no fiable:
 * se normaliza, se limpia de caracteres de control y se comprueba longitud y formato.
 */

/** Límites de recursos: evitan que un grupo (o alguien con malas intenciones) llene la base de datos. */
export const LIMITS = {
  groupName: 60,
  memberName: 30,
  concept: 80,
  membersPerGroup: 30,
  expensesPerGroup: 1000,
  settlementsPerGroup: 500,
} as const;

/** Valor de texto de un campo; si no viene o es un archivo, cadena vacía. */
export function field(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === 'string' ? value : '';
}

/** Texto en una línea: NFC, sin caracteres de control ni invisibles de dirección, espacios colapsados. */
export function cleanText(raw: string): string {
  return raw
    .normalize('NFC')
    .replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export type Checked = { ok: true; value: string } | { ok: false; error: string };

export function requiredText(raw: string, max: number, label: string): Checked {
  const value = cleanText(raw);
  if (!value) return { ok: false, error: `Escribe ${label}.` };
  if ([...value].length > max) return { ok: false, error: `Como mucho ${max} caracteres.` };
  return { ok: true, value };
}

/** Id numérico positivo de un campo oculto o un select. */
export function parseId(raw: string): number | null {
  if (!/^[1-9]\d{0,9}$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) ? id : null;
}

/** Fecha local de hoy en formato YYYY-MM-DD. */
export function today(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/** Fecha YYYY-MM-DD que exista de verdad, entre el año 2000 y un año después de hoy. */
export function parseDate(raw: string): Checked {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim());
  if (!match) return { ok: false, error: 'Elige una fecha válida.' };
  const [, y, m, d] = match.map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    return { ok: false, error: 'Esa fecha no existe.' };
  }
  const max = new Date();
  max.setFullYear(max.getFullYear() + 1);
  if (y < 2000 || date > max) return { ok: false, error: 'La fecha tiene que estar entre el año 2000 y el año que viene.' };
  return { ok: true, value: match[0] };
}

/** Lista de nombres (uno por línea) para crear un grupo: limpios, sin vacíos ni repetidos. */
export function parseMemberNames(raw: string): { ok: true; value: string[] } | { ok: false; error: string } {
  const names = raw.split(/\r?\n|,/).map(cleanText).filter(Boolean);
  if (names.length < 2) return { ok: false, error: 'Escribe al menos dos personas, una por línea.' };
  if (names.length > LIMITS.membersPerGroup) {
    return { ok: false, error: `Como mucho ${LIMITS.membersPerGroup} personas por grupo.` };
  }
  const tooLong = names.find((n) => [...n].length > LIMITS.memberName);
  if (tooLong) return { ok: false, error: `Los nombres pueden tener como mucho ${LIMITS.memberName} caracteres.` };
  const seen = new Set<string>();
  for (const name of names) {
    const key = name.toLocaleLowerCase('es');
    if (seen.has(key)) return { ok: false, error: `«${name}» está repetido: usa nombres distintos (p. ej. «Ana G.» y «Ana M.»).` };
    seen.add(key);
  }
  return { ok: true, value: names };
}
