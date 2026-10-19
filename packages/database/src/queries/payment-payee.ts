/**
 * Where students pay: site_settings 'payment_payee' (Admin > Settings >
 * Payment details), always complete because blanks fall back to the default.
 */
import { DEFAULT_PAYMENT_PAYEE, parsePaymentPayee, type PaymentPayee } from '../utils/student-pay';

export const PAYMENT_PAYEE_KEY = 'payment_payee';

export async function getPaymentPayee(client: any): Promise<PaymentPayee> {
  try {
    const { data, error } = await client.from('site_settings').select('value').eq('key', PAYMENT_PAYEE_KEY).maybeSingle();
    if (error) throw error;
    return parsePaymentPayee(data?.value);
  } catch (err: any) {
    console.warn('[payment-payee] using the default:', err?.message);
    return DEFAULT_PAYMENT_PAYEE;
  }
}

export async function savePaymentPayee(client: any, payee: PaymentPayee, updatedBy?: string | null): Promise<void> {
  const { error } = await client.from('site_settings').upsert({
    key: PAYMENT_PAYEE_KEY,
    value: payee,
    updated_at: new Date().toISOString(),
    updated_by: updatedBy || null,
  });
  if (error) throw error;
}
