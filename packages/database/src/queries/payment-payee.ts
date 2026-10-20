/**
 * Where students pay: site_settings 'payment_payee' (Admin > Settings >
 * Payment details), always complete because blanks fall back to the default.
 * Also the official QR images ('payment_qr_codes') and how long a new
 * enrolment link stays open ('enrolment_link_days').
 */
import {
  DEFAULT_PAYMENT_PAYEE,
  parsePaymentPayee,
  parsePaymentQrCodes,
  parseEnrolmentLinkDays,
  DEFAULT_ENROLMENT_LINK_DAYS,
  type PaymentPayee,
  type PaymentQrCode,
} from '../utils/student-pay';

export const PAYMENT_PAYEE_KEY = 'payment_payee';
export const PAYMENT_QR_CODES_KEY = 'payment_qr_codes';
export const ENROLMENT_LINK_DAYS_KEY = 'enrolment_link_days';

async function readSetting(client: any, key: string): Promise<unknown> {
  const { data, error } = await client.from('site_settings').select('value').eq('key', key).maybeSingle();
  if (error) throw error;
  return data?.value;
}

async function writeSetting(client: any, key: string, value: unknown, updatedBy?: string | null): Promise<void> {
  const { error } = await client.from('site_settings').upsert({ key, value, updated_at: new Date().toISOString(), updated_by: updatedBy || null });
  if (error) throw error;
}

export async function getPaymentPayee(client: any): Promise<PaymentPayee> {
  try {
    return parsePaymentPayee(await readSetting(client, PAYMENT_PAYEE_KEY));
  } catch (err: any) {
    console.warn('[payment-payee] using the default:', err?.message);
    return DEFAULT_PAYMENT_PAYEE;
  }
}

export async function savePaymentPayee(client: any, payee: PaymentPayee, updatedBy?: string | null): Promise<void> {
  await writeSetting(client, PAYMENT_PAYEE_KEY, payee, updatedBy);
}

/** The official QR images staff uploaded, one per exact amount. Empty when none or unreadable. */
export async function getPaymentQrCodes(client: any): Promise<PaymentQrCode[]> {
  try {
    return parsePaymentQrCodes(await readSetting(client, PAYMENT_QR_CODES_KEY));
  } catch (err: any) {
    console.warn('[payment-qr-codes] none:', err?.message);
    return [];
  }
}

export async function savePaymentQrCodes(client: any, list: PaymentQrCode[], updatedBy?: string | null): Promise<void> {
  await writeSetting(client, PAYMENT_QR_CODES_KEY, parsePaymentQrCodes(list), updatedBy);
}

/** How long a new enrolment link stays open, in days (default 14). */
export async function getEnrolmentLinkDays(client: any): Promise<number> {
  try {
    return parseEnrolmentLinkDays(await readSetting(client, ENROLMENT_LINK_DAYS_KEY));
  } catch (err: any) {
    console.warn('[enrolment-link-days] using the default:', err?.message);
    return DEFAULT_ENROLMENT_LINK_DAYS;
  }
}

export async function saveEnrolmentLinkDays(client: any, days: number, updatedBy?: string | null): Promise<void> {
  await writeSetting(client, ENROLMENT_LINK_DAYS_KEY, { days: parseEnrolmentLinkDays({ days }) }, updatedBy);
}
