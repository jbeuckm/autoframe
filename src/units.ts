export type Unit = 'in' | 'mm';
export const MM_PER_IN = 25.4;

/** Parses "5", "3.75", "3 3/4", "3-3/4" or "1/4" (in the given unit) to mm; NaN if unreadable. */
export function parseLength(text: string, unit: Unit): number {
  const s = text.trim().replace(/["”]|in$|mm$/g, '').trim();
  const m = s.match(/^(\d+(?:\.\d+)?)?(?:[\s-]+)?(?:(\d+)\s*\/\s*(\d+))?$/);
  if (!s || !m || (!m[1] && !m[2])) return NaN;
  let v = m[1] ? parseFloat(m[1]) : 0;
  if (m[2]) {
    if (+m[3] === 0) return NaN;
    v += +m[2] / +m[3];
  }
  return unit === 'in' ? v * MM_PER_IN : v;
}

/** mm -> display text, inches as a fraction to 1/16 when exact enough. */
export function formatLength(mm: number, unit: Unit): string {
  if (unit === 'mm') return `${+mm.toFixed(2)}`;
  const inches = mm / MM_PER_IN;
  const sixteenths = Math.round(inches * 16);
  if (Math.abs(sixteenths / 16 - inches) > 0.0002) return `${+inches.toFixed(3)}`;
  const whole = Math.floor(sixteenths / 16);
  let num = sixteenths % 16;
  let den = 16;
  while (num && num % 2 === 0) { num /= 2; den /= 2; }
  if (!num) return `${whole}`;
  return whole ? `${whole} ${num}/${den}` : `${num}/${den}`;
}
