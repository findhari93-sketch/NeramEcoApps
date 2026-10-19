import { Suspense } from 'react';
import type { Metadata } from 'next';
import { PageLoader } from '@neram/ui';
import PayBalanceContent from '@/components/pay-balance/PayBalanceContent';

export const metadata: Metadata = {
  title: 'Pay your balance',
  description: 'Pay the rest of your Neram Classes fee by UPI or bank transfer.',
  robots: { index: false, follow: false },
};

// Per-student and signed in: the page shell is static, the data is fetched on the client.
export const revalidate = false;

export default function PayBalancePage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <PayBalanceContent />
    </Suspense>
  );
}
