/**
 * Student-pays enrolment links: the offer a student chooses from, the amount
 * they owe today, the reference they must quote, and the UPI deep link / QR.
 * Pure and client-safe, used by the Admin drawer, the Admin verify route and
 * Marketing's enrol checkout alike.
 *
 * The money is always the SERVER's: the offer is snapshotted onto the link when
 * staff make it, and every amount here is computed from that snapshot. Nothing
 * a student's browser sends ever sets what they owe.
 */
import { formatRupees, money } from './fee-plan';

export type StudentPayScheme = 'full' | 'installment';
export type StudentPayMethod = 'upi_direct' | 'bank_transfer';

/** The fee_structures columns an offer is built from. */
export interface FeeStructureOfferInput {
  fee_amount: number | string | null;
  single_payment_discount?: number | string | null;
  installment_1_amount?: number | string | null;
  installment_2_amount?: number | string | null;
}

export interface StudentPayOffer {
  /** The list fee before anything comes off. */
  listFee: number;
  /** A one-off discount staff added for this student (comes off both plans). */
  extraDiscount: number;
  /** Paying in full, today. */
  fullAmount: number;
  /** What the two installments add up to. */
  installmentTotal: number;
  installment1: number | null;
  installment2: number | null;
  /** installmentTotal - fullAmount: what paying in full saves. */
  savings: number;
  allowsInstallments: boolean;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Staff adjustments for one student, on top of the fee structure preset:
 * the quoted fee, the pay-in-full price, what the two installments add up to
 * (defaults to the quoted fee, can be lowered to close a deal) and the first
 * installment. Anything left out comes from the structure.
 */
export interface OfferOverrides {
  quotedFee?: number | string | null;
  fullAmount?: number | string | null;
  installmentTotal?: number | string | null;
  installment1?: number | string | null;
}

const given = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  return money(v);
};

/**
 * The two ways to pay a fee structure. Installment 1 is the structure's own
 * figure; installment 2 is whatever is left, so the parts always add up even
 * after an extra discount (which comes off the second part). With overrides,
 * the given figures win and the rest is derived the same way.
 */
export function buildStudentPayOffer(fs: FeeStructureOfferInput, extraDiscountRaw?: number | string | null, overrides?: OfferOverrides | null): StudentPayOffer {
  const ov = overrides || {};
  const listFee = Math.max(0, given(ov.quotedFee) ?? money(fs.fee_amount) ?? 0);
  const single = Math.max(0, money(fs.single_payment_discount) ?? 0);
  const extraDiscount = Math.min(listFee, Math.max(0, money(extraDiscountRaw) ?? 0));

  const installmentTotal = round2(given(ov.installmentTotal) ?? listFee - extraDiscount);
  const fullAmount = round2(given(ov.fullAmount) ?? Math.max(0, listFee - single - extraDiscount));

  const i1Raw = given(ov.installment1) ?? money(fs.installment_1_amount);
  let installment1: number | null = i1Raw && i1Raw > 0 ? round2(i1Raw) : null;
  let installment2: number | null = installment1 !== null ? round2(installmentTotal - installment1) : null;
  if (installment1 === null || installment2 === null || installment2 <= 0.01) {
    installment1 = null;
    installment2 = null;
  }

  const allowsInstallments = installment1 !== null;
  return {
    listFee,
    extraDiscount,
    fullAmount,
    installmentTotal: allowsInstallments ? installmentTotal : fullAmount,
    installment1,
    installment2,
    savings: allowsInstallments ? round2(installmentTotal - fullAmount) : 0,
    allowsInstallments,
  };
}

const whole = (n: number | null) => n === null || Math.abs(n - Math.round(n)) < 1e-9;

/**
 * What is wrong with an offer staff are about to put on a link. Empty when it
 * is fine. The order that must hold: pay in full <= installments total <= quoted.
 */
export function validateOfferOverrides(offer: StudentPayOffer): string[] {
  const errors: string[] = [];
  if (!(offer.fullAmount > 0)) errors.push('Pay in full must be more than ₹0.');
  if (![offer.listFee, offer.fullAmount, offer.installmentTotal, offer.installment1, offer.installment2].every(whole)) errors.push('Use whole rupees.');
  if (offer.fullAmount > offer.listFee) errors.push('Pay in full cannot be more than the quoted fee.');
  if (offer.installmentTotal > offer.listFee) errors.push('The installments total cannot be more than the quoted fee.');
  if (offer.allowsInstallments && offer.fullAmount > offer.installmentTotal) errors.push('Pay in full cannot cost more than the two installments.');
  if (offer.allowsInstallments && offer.installment1 !== null && (offer.installment1 <= 0 || offer.installment1 >= offer.installmentTotal)) {
    errors.push('The first installment must be between ₹1 and the installments total.');
  }
  return errors;
}

// ─── link validity (site_settings 'enrolment_link_days') ─────────────────────

export const DEFAULT_ENROLMENT_LINK_DAYS = 14;

/** How long a new enrolment link stays open: {days} from settings, 1 to 60, else 14. */
export function parseEnrolmentLinkDays(raw: unknown): number {
  const days = Number((raw as any)?.days);
  return Number.isInteger(days) && days >= 1 && days <= 60 ? days : DEFAULT_ENROLMENT_LINK_DAYS;
}

/** The offer as stored on a link row (offer_* columns). */
export interface LinkOfferColumns {
  total_fee?: number | string | null;
  discount_amount?: number | string | null;
  offer_full_amount: number | string | null;
  offer_installment_1: number | string | null;
  offer_installment_2: number | string | null;
}

/**
 * The columns a link stores so that offerFromLink() gives this offer back later.
 * The create route writes these; the student page, the verify route and the
 * emails all read the link, never the fee structure again.
 */
export function offerSnapshotColumns(offer: StudentPayOffer, balanceDueDays: number) {
  return {
    total_fee: offer.listFee,
    discount_amount: offer.extraDiscount,
    final_fee: offer.fullAmount,
    offer_full_amount: offer.fullAmount,
    offer_installment_1: offer.allowsInstallments ? offer.installment1 : null,
    offer_installment_2: offer.allowsInstallments ? offer.installment2 : null,
    offer_balance_due_days: balanceDueDays,
  };
}

/** Read the snapshot back off a link. */
export function offerFromLink(link: LinkOfferColumns): StudentPayOffer {
  const listFee = money(link.total_fee) ?? 0;
  const extraDiscount = money(link.discount_amount) ?? 0;
  const fullAmount = money(link.offer_full_amount) ?? Math.max(0, listFee - extraDiscount);
  const i1 = money(link.offer_installment_1);
  const i2 = money(link.offer_installment_2);
  const allowsInstallments = Boolean(i1 && i1 > 0 && i2 && i2 > 0);
  const installmentTotal = allowsInstallments ? round2((i1 as number) + (i2 as number)) : fullAmount;
  return {
    listFee,
    extraDiscount,
    fullAmount,
    installmentTotal,
    installment1: allowsInstallments ? (i1 as number) : null,
    installment2: allowsInstallments ? (i2 as number) : null,
    savings: allowsInstallments ? round2(installmentTotal - fullAmount) : 0,
    allowsInstallments,
  };
}

/** What the student pays today for the plan they chose. Null when that plan is not offered. */
export function amountDueToday(offer: StudentPayOffer, scheme: StudentPayScheme): number | null {
  if (scheme === 'full') return offer.fullAmount > 0 ? offer.fullAmount : null;
  return offer.allowsInstallments ? offer.installment1 : null;
}

/**
 * The transaction reference, cleaned. UPI and IMPS give a 12-digit UTR; NEFT
 * and RTGS give 16 to 22 letters and digits (e.g. KKBKH26291123456).
 * Returns null when it cannot be a real reference.
 */
export function normaliseTransactionRef(raw: unknown, method: StudentPayMethod): string | null {
  if (typeof raw !== 'string') return null;
  const cleaned = raw.replace(/[\s-]/g, '').toUpperCase();
  if (method === 'upi_direct') return /^\d{12}$/.test(cleaned) ? cleaned : null;
  return /^[A-Z0-9]{12,22}$/.test(cleaned) ? cleaned : null;
}

/** The note a student types or the QR carries, so staff can match the credit: "NRM 4F2A9C". */
export function paymentReference(linkId: string): string {
  return `NRM ${linkId.replace(/-/g, '').slice(0, 6).toUpperCase()}`;
}

/**
 * upi://pay deep link (also the QR payload). `pa` keeps its '@' readable
 * because several UPI apps fail on %40; everything else is encoded.
 */
export function buildUpiUri(input: { vpa: string; payeeName: string; amount: number; note?: string | null }): string {
  const enc = (v: string) => encodeURIComponent(v);
  const parts = [
    `pa=${enc(input.vpa.trim()).replace(/%40/g, '@')}`,
    `pn=${enc(input.payeeName.trim())}`,
    `am=${input.amount.toFixed(2)}`,
    'cu=INR',
  ];
  if (input.note) parts.push(`tn=${enc(input.note.slice(0, 50))}`);
  return `upi://pay?${parts.join('&')}`;
}

// ─── where students pay (site_settings 'payment_payee') ──────────────────────

export interface PaymentPayee {
  upiId: string;
  payeeName: string;
  gpayNumber: string | null;
  bank: {
    accountName: string;
    accountNumber: string;
    ifsc: string;
    bankName: string;
    branch: string;
  };
  /** "September 2027": shown in the "pay in full" benefits. */
  accessUntilLabel: string;
  /** Where students send a payment screenshot on WhatsApp. Null hides that option. */
  whatsappNumber: string | null;
}

export const DEFAULT_PAYMENT_PAYEE: PaymentPayee = {
  upiId: 'neramclassroom-1@okhdfcbank',
  payeeName: 'Manoharan Trust',
  gpayNumber: '8807437399',
  bank: {
    accountName: 'Manoharan Trust',
    accountNumber: '1928135000001183',
    ifsc: 'KVBL0001928',
    bankName: 'Karur Vysya Bank',
    branch: 'Pudukkottai',
  },
  accessUntilLabel: 'September 2027',
  whatsappNumber: null,
};

// ─── official QR codes (site_settings 'payment_qr_codes') ─────────────────────

/** A QR image the bank or GPay issued for one exact amount (or any amount when amountPaise is null). */
export interface PaymentQrCode {
  amountPaise: number | null;
  url: string;
  label: string | null;
}

export function parsePaymentQrCodes(raw: unknown): PaymentQrCode[] {
  if (!Array.isArray(raw)) return [];
  const out: PaymentQrCode[] = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const url = typeof (row as any).url === 'string' ? (row as any).url.trim() : '';
    // Only https image links: this URL is rendered and opened on the student's page.
    if (!url || !/^https:\/\/[^\s"'<>]+$/i.test(url)) continue;
    const amt = Number((row as any).amountPaise);
    out.push({
      amountPaise: Number.isFinite(amt) && amt > 0 ? Math.round(amt) : null,
      url,
      label: typeof (row as any).label === 'string' && (row as any).label.trim() ? (row as any).label.trim() : null,
    });
  }
  return out;
}

/** The official QR for exactly this amount, or null (the page then draws its own). */
export function officialQrFor(list: PaymentQrCode[], amountPaise: number): PaymentQrCode | null {
  return list.find((q) => q.amountPaise !== null && q.amountPaise === amountPaise) || null;
}

const text = (v: unknown, fallback: string, max = 120) =>
  typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : fallback;

/** A stored payee value, with every missing or blank field taken from the default. */
export function parsePaymentPayee(raw: unknown): PaymentPayee {
  const v = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>;
  const b = (v.bank && typeof v.bank === 'object' ? v.bank : {}) as Record<string, unknown>;
  const d = DEFAULT_PAYMENT_PAYEE;
  return {
    upiId: text(v.upiId, d.upiId, 80),
    payeeName: text(v.payeeName, d.payeeName),
    gpayNumber: v.gpayNumber === null ? null : text(v.gpayNumber, d.gpayNumber || '', 20) || null,
    bank: {
      accountName: text(b.accountName, d.bank.accountName),
      accountNumber: text(b.accountNumber, d.bank.accountNumber, 34),
      ifsc: text(b.ifsc, d.bank.ifsc, 11).toUpperCase(),
      bankName: text(b.bankName, d.bank.bankName),
      branch: text(b.branch, d.bank.branch),
    },
    accessUntilLabel: text(v.accessUntilLabel, d.accessUntilLabel, 40),
    whatsappNumber: typeof v.whatsappNumber === 'string' && v.whatsappNumber.trim() ? v.whatsappNumber.trim().slice(0, 20) : null,
  };
}

export type PaymentPayeeErrors = Partial<Record<'upiId' | 'ifsc' | 'accountNumber' | 'whatsappNumber', string>>;

/** Problems with a payee staff are about to save. Empty when it is fine. */
export function validatePaymentPayee(p: PaymentPayee): PaymentPayeeErrors {
  const errors: PaymentPayeeErrors = {};
  if (!/^[a-zA-Z0-9._-]{2,256}@[a-zA-Z][a-zA-Z0-9.-]{1,63}$/.test(p.upiId)) errors.upiId = 'Enter a UPI ID like name@bank.';
  if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(p.bank.ifsc)) errors.ifsc = 'An IFSC has 11 characters, like KVBL0001928.';
  if (!/^\d{9,18}$/.test(p.bank.accountNumber)) errors.accountNumber = 'Enter the account number, digits only.';
  if (p.whatsappNumber && !/^\+?[\d\s-]{10,16}$/.test(p.whatsappNumber)) errors.whatsappNumber = 'Enter the WhatsApp number with the country code, like +91 88074 37399.';
  return errors;
}

/** Digits only, with the country code, for a wa.me link. */
export function whatsappDigits(number: string | null | undefined): string | null {
  if (!number) return null;
  const digits = number.replace(/\D/g, '');
  if (digits.length < 10) return null;
  return digits.length === 10 ? `91${digits}` : digits;
}

/** "₹25,000 today" style lines for the drawer, emails and WhatsApp. */
export function offerLines(offer: StudentPayOffer, balanceDueLabel?: string | null): string[] {
  const lines = [`Pay in full: ${formatRupees(offer.fullAmount)}${offer.savings > 0 ? ` (save ${formatRupees(offer.savings)})` : ''}`];
  if (offer.allowsInstallments && offer.installment1 !== null && offer.installment2 !== null) {
    lines.push(
      `Or two installments: ${formatRupees(offer.installment1)} now, ${formatRupees(offer.installment2)}${balanceDueLabel ? ` by ${balanceDueLabel}` : ' later'}`,
    );
  }
  return lines;
}
