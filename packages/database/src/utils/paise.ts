/**
 * Money in the payments tables is integer paise, so ₹25,000.37 is 2500037 and
 * no float ever drifts a rupee. These are the only conversions allowed.
 */
import { money } from './fee-plan';

/** Rupees (number or text) to whole paise. Blanks, garbage and negatives are 0. */
export function toPaise(value: unknown): number {
  const n = money(value);
  if (n === null || !Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n * 100);
}

export function fromPaise(paise: number): number {
  return Math.round(paise) / 100;
}

/** "₹25,000" or "₹25,000.37": Indian grouping, paise shown only when present. */
export function formatPaise(paise: number): string {
  const whole = Math.max(0, Math.round(paise));
  const rupees = Math.floor(whole / 100);
  const rem = whole % 100;
  return `₹${rupees.toLocaleString('en-IN')}${rem ? `.${String(rem).padStart(2, '0')}` : ''}`;
}

/** An instant-UPI amount is base rupees plus a 1 to 99 paise tag. */
export function splitPaise(paise: number): { basePaise: number; tag: number } {
  const whole = Math.round(paise);
  const tag = whole % 100;
  return { basePaise: whole - tag, tag };
}
