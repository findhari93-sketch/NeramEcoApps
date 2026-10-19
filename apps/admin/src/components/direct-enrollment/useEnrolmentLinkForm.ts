'use client';

import { useCallback, useMemo, useState } from 'react';
import {
  checkEnrolmentPlan,
  defaultBalanceDueDate,
} from '@neram/database/enrolment-link';
import { istToday } from '@neram/database/fee-plan';
import { tenDigitPhone } from '@/lib/phone';

export const COUNTRY_CODES = [
  { code: 'IN', label: 'India', prefix: '+91', length: 10 },
  { code: 'AE', label: 'UAE', prefix: '+971', length: 9 },
  { code: 'SA', label: 'Saudi Arabia', prefix: '+966', length: 9 },
  { code: 'QA', label: 'Qatar', prefix: '+974', length: 8 },
  { code: 'OM', label: 'Oman', prefix: '+968', length: 8 },
] as const;

export const COURSE_OPTIONS = [
  { value: 'nata', label: 'NATA' },
  { value: 'jee_paper2', label: 'JEE Paper 2' },
  { value: 'both', label: 'NATA + JEE Paper 2' },
];

export const PAYMENT_METHOD_OPTIONS = [
  { value: 'upi_direct', label: 'Google Pay or UPI' },
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'cash', label: 'Cash' },
];

export interface EnrolmentLinkPrefill {
  studentName?: string;
  studentPhone?: string;
  studentEmail?: string;
  interestCourse?: string;
  userId?: string;
  demoRegistrationId?: string;
}

/**
 * student_pays: the student picks a plan on the link and pays the trust; staff
 * verify the UTR later. recorded: staff already have the money and record it.
 */
export type EnrolmentPaymentMode = 'student_pays' | 'recorded';

export interface EnrolmentLinkFormValues {
  paymentMode: EnrolmentPaymentMode;
  studentName: string;
  country: string;
  phone: string;
  email: string;
  interestCourse: string;
  learningMode: 'hybrid' | 'online_only';
  feeStructureId: string;
  totalFee: string;
  discount: string;
  scheme: 'full' | 'installment';
  amountPaid: string;
  balanceDueDate: string;
  paymentMethod: string;
  paymentDate: string;
  transactionReference: string;
  paymentProofUrl: string;
  adminNotes: string;
}

/** "+971501234567" to { country: 'AE', phone: '501234567' }; Indian numbers to 10 digits. */
export function splitPhone(full: string | null | undefined): { country: string; phone: string } {
  const raw = (full || '').replace(/[^\d+]/g, '');
  for (const c of COUNTRY_CODES) {
    if (c.code !== 'IN' && raw.startsWith(c.prefix)) return { country: c.code, phone: raw.slice(c.prefix.length) };
  }
  return { country: 'IN', phone: tenDigitPhone(full || '') };
}

function blank(prefill?: EnrolmentLinkPrefill): EnrolmentLinkFormValues {
  const { country, phone } = splitPhone(prefill?.studentPhone);
  return {
    paymentMode: 'student_pays',
    studentName: prefill?.studentName || '',
    country,
    phone,
    email: prefill?.studentEmail || '',
    interestCourse: prefill?.interestCourse && COURSE_OPTIONS.some((c) => c.value === prefill.interestCourse) ? prefill.interestCourse : 'nata',
    learningMode: 'hybrid',
    feeStructureId: '',
    totalFee: '',
    discount: '',
    scheme: 'full',
    amountPaid: '',
    balanceDueDate: '',
    paymentMethod: 'upi_direct',
    paymentDate: istToday(),
    transactionReference: '',
    paymentProofUrl: '',
    adminNotes: '',
  };
}

/** A saved link back into form values, for "Edit details". */
export function valuesFromLink(link: any): EnrolmentLinkFormValues {
  const { country, phone } = splitPhone(link.student_phone);
  const num = (v: unknown) => (v === null || v === undefined || Number(v) === 0 ? '' : String(Number(v)));
  return {
    // Links made before student-pays existed have no mode: they were recorded.
    paymentMode: link.payment_mode === 'student_pays' ? 'student_pays' : 'recorded',
    studentName: link.student_name || '',
    country,
    phone,
    email: link.student_email || '',
    interestCourse: link.interest_course || 'nata',
    learningMode: link.learning_mode === 'online_only' ? 'online_only' : 'hybrid',
    feeStructureId: link.fee_structure_id || '',
    totalFee: num(link.total_fee),
    discount: num(link.discount_amount),
    scheme: link.payment_scheme === 'installment' ? 'installment' : 'full',
    amountPaid: num(link.amount_paid),
    balanceDueDate: link.installment_2_due_date || '',
    paymentMethod: link.payment_method || 'upi_direct',
    paymentDate: link.payment_date || istToday(),
    transactionReference: link.transaction_reference || '',
    paymentProofUrl: link.payment_proof_url || '',
    adminNotes: link.admin_notes || '',
  };
}

export type FieldErrors = Partial<Record<keyof EnrolmentLinkFormValues | 'totalFee' | 'amountPaid' | 'balanceDueDate', string>>;

export function useEnrolmentLinkForm(prefill?: EnrolmentLinkPrefill) {
  const [values, setValues] = useState<EnrolmentLinkFormValues>(() => blank(prefill));
  const [showErrors, setShowErrors] = useState(false);
  const [serverErrors, setServerErrors] = useState<FieldErrors>({});

  const set = useCallback(<K extends keyof EnrolmentLinkFormValues>(key: K, value: EnrolmentLinkFormValues[K]) => {
    setValues((v) => {
      const next = { ...v, [key]: value };
      // Choosing two installments: suggest a due date once, never overwrite one.
      if (key === 'scheme' && value === 'installment') {
        if (!v.balanceDueDate) next.balanceDueDate = defaultBalanceDueDate(v.paymentDate || istToday());
        // Still showing the whole fee as paid: ask for the first installment instead.
        const final = Math.max(0, (Number(v.totalFee) || 0) - (Number(v.discount) || 0));
        if (final > 0 && (Number(v.amountPaid) || 0) >= final) next.amountPaid = '';
      }
      // Paid in full: the amount is the fee, unless staff typed something else.
      if (key === 'scheme' && value === 'full') {
        const final = Math.max(0, (Number(v.totalFee) || 0) - (Number(v.discount) || 0));
        if (final > 0) next.amountPaid = String(final);
      }
      return next;
    });
    setServerErrors((e) => (e[key] ? { ...e, [key]: undefined } : e));
  }, []);

  const reset = useCallback((next?: EnrolmentLinkFormValues) => {
    setValues(next || blank(prefill));
    setShowErrors(false);
    setServerErrors({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill?.studentName, prefill?.studentPhone, prefill?.studentEmail, prefill?.interestCourse]);

  const plan = useMemo(
    () =>
      checkEnrolmentPlan(
        {
          totalFee: values.totalFee,
          discount: values.discount,
          scheme: values.scheme,
          amountPaid: values.amountPaid,
          paymentDate: values.paymentDate || null,
          paymentMethod: values.paymentMethod,
          balanceDueDate: values.balanceDueDate || null,
        },
      ),
    [values],
  );

  const localErrors = useMemo(() => {
    const out: FieldErrors = {};
    if (!values.studentName.trim()) out.studentName = 'Enter the student name.';
    const c = COUNTRY_CODES.find((x) => x.code === values.country) || COUNTRY_CODES[0];
    if (values.phone && values.phone.length !== c.length) out.phone = `Enter ${c.length} digits.`;
    if (values.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) out.email = 'That email does not look right.';
    // Student pays: the offer comes from the fee structure; there is no money to record.
    if (values.paymentMode === 'student_pays') {
      if (!values.feeStructureId) out.feeStructureId = 'Choose the fee structure.';
      return out;
    }
    for (const e of plan.errors) {
      const key = e.field === 'scheme' ? 'scheme' : e.field;
      if (!out[key as keyof FieldErrors]) out[key as keyof FieldErrors] = e.message;
    }
    return out;
  }, [values, plan]);

  const errors: FieldErrors = showErrors ? { ...localErrors, ...stripEmpty(serverErrors) } : stripEmpty(serverErrors);
  const isValid = Object.keys(localErrors).length === 0;

  const fullPhone = useMemo(() => {
    const c = COUNTRY_CODES.find((x) => x.code === values.country) || COUNTRY_CODES[0];
    return values.phone.trim() ? `${c.prefix}${values.phone.trim()}` : '';
  }, [values.country, values.phone]);

  return { values, set, reset, plan, errors, isValid, setShowErrors, setServerErrors, fullPhone };
}

function stripEmpty(e: FieldErrors): FieldErrors {
  const out: FieldErrors = {};
  for (const [k, v] of Object.entries(e)) if (v) out[k as keyof FieldErrors] = v;
  return out;
}
