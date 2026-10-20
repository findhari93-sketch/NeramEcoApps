/**
 * Payment method switches and watcher settings (site_settings 'payment_methods'
 * and 'payment_watchers', Admin > Settings > Payment details). Instant UPI
 * starts switched off and in shadow mode: the watchers and the matcher run,
 * staff see what WOULD have been confirmed, nothing moves until the founder
 * flips both switches after the ₹1 live test.
 */
export interface UpiAutoSettings {
  enabled: boolean;
  /** Match and report, never fulfil. */
  shadowMode: boolean;
  /** How long an Instant UPI order waits for the bank alert. */
  orderMinutes: number;
  /** Above this, a matched credit waits for staff instead of enrolling at once. */
  instantCapPaise: number;
  /** Above this, a single-channel credit (SMS only, or Google Pay only) waits for staff. */
  twoChannelAbovePaise: number;
  /** No heartbeat for this long hides Instant UPI and rings the staff bell. */
  silentAfterMinutes: number;
}

export interface PaymentMethodsSettings {
  upiAuto: UpiAutoSettings;
  upiProof: { enabled: boolean };
  bankProof: { enabled: boolean };
  razorpay: { enabled: boolean; feePercent: number };
}

export const DEFAULT_PAYMENT_METHODS: PaymentMethodsSettings = {
  upiAuto: { enabled: false, shadowMode: true, orderMinutes: 30, instantCapPaise: 5000000, twoChannelAbovePaise: 3000000, silentAfterMinutes: 10 },
  upiProof: { enabled: true },
  bankProof: { enabled: true },
  razorpay: { enabled: false, feePercent: 2.36 },
};

const bool = (v: unknown, def: boolean) => (typeof v === 'boolean' ? v : def);
const clampInt = (v: unknown, def: number, min: number, max: number) => {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, n));
};
const positive = (v: unknown, def: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : def;
};

/** The stored shape uses the seeded snake_case keys (upi_auto, upi_proof, ...). */
export function parsePaymentMethods(raw: unknown): PaymentMethodsSettings {
  const v = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>;
  const ua = v.upi_auto || v.upiAuto || {};
  const up = v.upi_proof || v.upiProof || {};
  const bp = v.bank_proof || v.bankProof || {};
  const rz = v.razorpay || {};
  const d = DEFAULT_PAYMENT_METHODS;
  return {
    upiAuto: {
      enabled: bool(ua.enabled, d.upiAuto.enabled),
      shadowMode: bool(ua.shadowMode, d.upiAuto.shadowMode),
      orderMinutes: clampInt(ua.orderMinutes, d.upiAuto.orderMinutes, 5, 120),
      instantCapPaise: positive(ua.instantCapPaise, d.upiAuto.instantCapPaise),
      twoChannelAbovePaise: positive(ua.twoChannelAbovePaise, d.upiAuto.twoChannelAbovePaise),
      silentAfterMinutes: clampInt(ua.silentAfterMinutes, d.upiAuto.silentAfterMinutes, 2, 120),
    },
    upiProof: { enabled: bool(up.enabled, d.upiProof.enabled) },
    bankProof: { enabled: bool(bp.enabled, d.bankProof.enabled) },
    razorpay: {
      enabled: bool(rz.enabled, d.razorpay.enabled),
      feePercent: (() => {
        const n = Number(rz.feePercent);
        return Number.isFinite(n) && n >= 0 ? Math.min(10, n) : d.razorpay.feePercent;
      })(),
    },
  };
}

export function paymentMethodsToStored(m: PaymentMethodsSettings) {
  return { upi_auto: m.upiAuto, upi_proof: m.upiProof, bank_proof: m.bankProof, razorpay: m.razorpay };
}

export interface PaymentWatchersSettings {
  /** Keywords matched inside the SMS sender id, e.g. KVBUPI; the two-letter route prefix changes by circle. */
  smsSenderKeywords: string[];
  /** Mail domains credit alerts come from. */
  emailFromDomains: string[];
  /** Watcher device ids that have a secret in PAYMENT_WATCHER_SECRETS. */
  deviceIds: string[];
  /** Last four digits of the receiving account; null skips the check. */
  accountTail: string | null;
}

const strings = (v: unknown, map: (s: string) => string) =>
  Array.isArray(v) ? v.filter((s) => typeof s === 'string').map((s) => map(s.trim())).filter(Boolean) : [];

export function parsePaymentWatchers(raw: unknown): PaymentWatchersSettings {
  const v = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>;
  const keywords = strings(v.smsSenderIds ?? v.smsSenderKeywords, (s) => s.toUpperCase());
  const domains = strings(v.emailFromDomains, (s) => s.toLowerCase());
  const tail = typeof v.accountTail === 'string' && /^\d{4}$/.test(v.accountTail.trim()) ? v.accountTail.trim() : null;
  return {
    smsSenderKeywords: keywords.length ? keywords : ['KVB'],
    emailFromDomains: domains.length ? domains : ['kvb.bank.in'],
    deviceIds: strings(v.deviceIds, (s) => s),
    accountTail: tail,
  };
}

export const PAYMENT_METHODS_KEY = 'payment_methods';
export const PAYMENT_WATCHERS_KEY = 'payment_watchers';

async function readSetting(client: any, key: string): Promise<unknown> {
  const { data, error } = await client.from('site_settings').select('value').eq('key', key).maybeSingle();
  if (error) throw error;
  return data?.value;
}

export async function getPaymentMethods(client: any): Promise<PaymentMethodsSettings> {
  try {
    return parsePaymentMethods(await readSetting(client, PAYMENT_METHODS_KEY));
  } catch (err: any) {
    console.warn('[payment-methods] using the default:', err?.message);
    return DEFAULT_PAYMENT_METHODS;
  }
}

export async function savePaymentMethods(client: any, m: PaymentMethodsSettings, updatedBy?: string | null): Promise<void> {
  const { error } = await client
    .from('site_settings')
    .upsert({ key: PAYMENT_METHODS_KEY, value: paymentMethodsToStored(parsePaymentMethods(paymentMethodsToStored(m))), updated_at: new Date().toISOString(), updated_by: updatedBy || null });
  if (error) throw error;
}

export async function getPaymentWatchers(client: any): Promise<PaymentWatchersSettings> {
  try {
    return parsePaymentWatchers(await readSetting(client, PAYMENT_WATCHERS_KEY));
  } catch (err: any) {
    console.warn('[payment-watchers] using the default:', err?.message);
    return parsePaymentWatchers(undefined);
  }
}

export async function savePaymentWatchers(client: any, w: PaymentWatchersSettings, updatedBy?: string | null): Promise<void> {
  const clean = parsePaymentWatchers({ smsSenderIds: w.smsSenderKeywords, emailFromDomains: w.emailFromDomains, deviceIds: w.deviceIds, accountTail: w.accountTail });
  const { error } = await client
    .from('site_settings')
    .upsert({ key: PAYMENT_WATCHERS_KEY, value: { smsSenderIds: clean.smsSenderKeywords, emailFromDomains: clean.emailFromDomains, deviceIds: clean.deviceIds, accountTail: clean.accountTail }, updated_at: new Date().toISOString(), updated_by: updatedBy || null });
  if (error) throw error;
}
