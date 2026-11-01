import { SSF } from 'xlsx';
import type { Scalar } from './types';

export function isBlank(value: Scalar | undefined): boolean {
  return value == null || (typeof value === 'string' && value.trim() === '');
}

export function parseNumeric(value: Scalar, unit?: 'km' | 'km/h'): number | null {
  if (isBlank(value)) return null;
  if (typeof value === 'number') {
    if (Number.isFinite(value)) return value;
    throw new Error('Número no finito.');
  }
  if (typeof value !== 'string') throw new Error('Se esperaba un número, no un booleano.');
  let text = value.trim();
  if (unit) text = text.replace(new RegExp('\\s*' + unit.replace('/', '\\/') + '$', 'i'), '').trim();
  if (/^[+-]?\d{1,3}[.,]\d{3}$/.test(text)) throw new Error('Separador ambiguo: elimina separadores de miles o usa una celda numérica.');
  if (!/^[+-]?(?:\d+(?:[.,]\d+)?|[.,]\d+)$/.test(text)) throw new Error('Número o unidad no válidos.');
  const result = Number(text.replace(',', '.'));
  if (!Number.isFinite(result)) throw new Error('Número fuera de rango.');
  return result;
}

export function parsePercentage(value: Scalar): number | null {
  if (isBlank(value)) return null;
  const explicitPercent = typeof value === 'string' && value.trim().endsWith('%');
  const number = parseNumeric(explicitPercent ? String(value).trim().slice(0, -1).trim() : value);
  if (number === null) return null;
  const fraction = explicitPercent ? number / 100 : number;
  if (fraction < 0 || fraction > 1) throw new Error('Porcentaje: usa una fracción entre 0 y 1 o texto con %.');
  return fraction;
}

export function parseDateValue(value: Scalar, date1904 = false): string | null {
  if (isBlank(value)) return null;
  let year: number, month: number, day: number;
  if (typeof value === 'number') {
    if (!Number.isInteger(value) || value < 0 || value > 2958465) throw new Error('Fecha serial no válida.');
    const parsed = SSF.parse_date_code(value, { date1904 });
    if (!parsed) throw new Error('Fecha serial no válida.');
    ({ y: year, m: month, d: day } = parsed);
  } else if (typeof value === 'string') {
    const text = value.trim();
    const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
    const local = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
    if (iso) [, year, month, day] = iso.map(Number);
    else if (local) { day = Number(local[1]); month = Number(local[2]); year = Number(local[3]); }
    else throw new Error('Fecha: usa dd/mm/aaaa o aaaa-mm-dd.');
  } else throw new Error('Tipo de fecha no válido.');
  const check = new Date(Date.UTC(year, month - 1, day));
  if (year < 1900 || year > 9999 || check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) throw new Error('Fecha de calendario no válida.');
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// Cached formula values are display strings in the audited workbook. They are
// read ONLY for comparisons, never fed back into source calculations.
export function cachedNumber(value: Scalar): number | null {
  if (isBlank(value)) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (text.endsWith('%')) {
    const n = Number(text.slice(0, -1).trim().replace(',', '.'));
    return Number.isFinite(n) ? n / 100 : null;
  }
  const stripped = text.replace(/\s*€$/, '').trim().replace(',', '.');
  return /^[+-]?\d+(?:\.\d+)?$/.test(stripped) ? Number(stripped) : null;
}
