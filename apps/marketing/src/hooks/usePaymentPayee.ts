'use client';

import { useEffect, useState } from 'react';
import { DEFAULT_PAYMENT_PAYEE, type PaymentPayee } from '@neram/database/student-pay';

/**
 * Where students pay by UPI or bank transfer (Admin > Settings > Payment
 * details). Starts on the built-in default so nothing flashes empty.
 */
export function usePaymentPayee(): PaymentPayee {
  const [payee, setPayee] = useState<PaymentPayee>(DEFAULT_PAYMENT_PAYEE);
  useEffect(() => {
    let alive = true;
    fetch('/api/payment/payee')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => alive && d?.payee && setPayee(d.payee))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return payee;
}
