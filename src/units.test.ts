import { expect, it } from 'vitest';
import { formatLength, parseLength } from './units';

it('parses inches with fractions', () => {
  expect(parseLength('3 3/4', 'in')).toBeCloseTo(95.25);
  expect(parseLength('3-3/4"', 'in')).toBeCloseTo(95.25);
  expect(parseLength('1/4', 'in')).toBeCloseTo(6.35);
  expect(parseLength('5', 'in')).toBeCloseTo(127);
  expect(parseLength('120', 'mm')).toBe(120);
  expect(parseLength('abc', 'in')).toBeNaN();
  expect(parseLength('1/0', 'in')).toBeNaN();
});

it('formats inches as fractions', () => {
  expect(formatLength(95.25, 'in')).toBe('3 3/4');
  expect(formatLength(6.35, 'in')).toBe('1/4');
  expect(formatLength(127, 'in')).toBe('5');
  expect(formatLength(100, 'in')).toBe('3.937');
  expect(formatLength(95.25, 'mm')).toBe('95.25');
});
