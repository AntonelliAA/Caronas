/**
 * Brazilian public holidays, computed. No API call: every moveable holiday
 * derives from Easter, and Easter is a closed-form calculation. That holds for
 * any year, offline, with no key, no build step, and nothing to go stale.
 */

// Deliberately does not import from ./rides, so this file runs directly under
// `node --test` without depending on how the bundler resolves extensionless
// paths.
const pad = (n: number) => String(n).padStart(2, '0');

/** Easter Sunday via the Meeus/Jones/Butcher algorithm (Gregorian calendar). */
export function easter(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const n = h + l - 7 * m + 114;
  return new Date(year, Math.floor(n / 31) - 1, (n % 31) + 1);
}

const FIXOS: [string, string][] = [
  ['01-01', 'Confraternização Universal'],
  ['04-21', 'Tiradentes'],
  ['05-01', 'Dia do Trabalho'],
  ['09-07', 'Independência'],
  // Rio Grande do Sul state holiday. Outside RS, delete this line.
  ['09-20', 'Revolução Farroupilha'],
  ['10-12', 'Nossa Senhora Aparecida'],
  ['11-02', 'Finados'],
  ['11-15', 'Proclamação da República'],
  ['11-20', 'Consciência Negra'],
  ['12-25', 'Natal'],
];

/** Days counted from Easter Sunday. */
const MOVEIS: [number, string][] = [
  [-48, 'Carnaval'],
  [-47, 'Carnaval'],
  [-2, 'Sexta-feira Santa'],
  [60, 'Corpus Christi'],
];

const cache = new Map<number, Map<string, string>>();

/** Map of 'YYYY-MM-DD' → holiday name, for the requested year. */
export function feriados(year: number): Map<string, string> {
  const hit = cache.get(year);
  if (hit) return hit;

  const out = new Map<string, string>();
  for (const [md, nome] of FIXOS) out.set(`${year}-${md}`, nome);

  const pascoa = easter(year);
  for (const [offset, nome] of MOVEIS) {
    const d = new Date(pascoa.getFullYear(), pascoa.getMonth(), pascoa.getDate() + offset);
    out.set(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, nome);
  }

  cache.set(year, out);
  return out;
}
