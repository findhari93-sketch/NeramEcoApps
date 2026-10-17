/**
 * Parsing what the Application and fees form and Collections send. Pure, so a
 * stray key never reaches a column write and numbers arrive as numbers.
 */
import { getRequestAdminId } from './request-admin';
import type { FeePlanInput, PaymentLineInput } from '@neram/database/fee-plan';

export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function num(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(String(value).replace(/[,\s₹]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function str(value: unknown, max = 200): string | null {
  if (typeof value !== 'string') return null;
  const t = value.trim();
  return t ? t.slice(0, max) : null;
}

export function parsePlan(raw: any): FeePlanInput {
  return {
    assignedFee: num(raw?.assignedFee),
    discount: num(raw?.discount) ?? 0,
    // Anything else is passed through so validatePlan reports it next to the field.
    scheme: raw?.scheme,
    installment1Amount: num(raw?.installment1Amount),
    installment2Amount: num(raw?.installment2Amount),
    installment2DueDate: str(raw?.installment2DueDate, 10),
  };
}

export function parseLine(raw: any): PaymentLineInput {
  const inst = num(raw?.installmentNumber);
  return {
    key: str(raw?.key, 64) || '',
    amount: num(raw?.amount) as number,
    paidOn: str(raw?.paidOn, 10) || '',
    method: str(raw?.method, 32) || '',
    reference: str(raw?.reference, 100),
    installmentNumber: inst === 1 || inst === 2 ? inst : null,
  };
}

export function parseLines(raw: unknown): PaymentLineInput[] {
  return Array.isArray(raw) ? raw.slice(0, 20).map(parseLine) : [];
}

/**
 * The acting admin: the verified caller stamped by middleware. A body adminId is
 * read only when no header was stamped (middleware in report mode).
 */
export function actingAdminId(request: Request, body?: any): string | null {
  const verified = getRequestAdminId(request);
  if (verified) return verified;
  const fromBody = body?.adminId;
  return typeof fromBody === 'string' && UUID_REGEX.test(fromBody) ? fromBody : null;
}
