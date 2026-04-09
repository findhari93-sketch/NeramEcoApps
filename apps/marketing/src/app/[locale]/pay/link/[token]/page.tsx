import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { createAdminClient, getLeadProfileByPaymentToken } from '@neram/database';
import PaymentLinkContent from './PaymentLinkContent';

export const metadata: Metadata = {
  title: 'Complete Your Payment - Neram Classes',
  robots: { index: false, follow: false },
};

/**
 * Server action to get the full phone number for a token.
 * Called client-side right before sending OTP.
 * The full phone is never in the API response - only passed to Firebase directly.
 */
async function getPhoneForToken(token: string): Promise<string | null> {
  'use server';
  try {
    const client = createAdminClient();
    const lead = await getLeadProfileByPaymentToken(token, client);

    if (!lead) return null;
    if (lead.payment_link_expires_at && new Date(lead.payment_link_expires_at) < new Date()) return null;
    if (lead.status !== 'approved') return null;

    return lead.users?.phone ?? null;
  } catch {
    return null;
  }
}

export default async function PaymentLinkPage({
  params: { locale, token },
}: {
  params: { locale: string; token: string };
}) {
  setRequestLocale(locale);

  // Validate token server-side
  const client = createAdminClient();
  const lead = await getLeadProfileByPaymentToken(token, client);

  let initialError: 'invalid' | 'expired' | 'not_approved' | null = null;
  let maskedPhone: string | null = null;
  let applicationNumber: string | null = null;
  let alreadyLinked = false;

  if (!lead) {
    initialError = 'invalid';
  } else if (lead.payment_link_expires_at && new Date(lead.payment_link_expires_at) < new Date()) {
    initialError = 'expired';
  } else if (lead.status !== 'approved') {
    initialError = 'not_approved';
  } else {
    const phone = lead.users?.phone;
    maskedPhone = phone ? `+91 ****${phone.slice(-5)}` : null;
    applicationNumber = lead.application_number;
    alreadyLinked = !!(lead.users?.firebase_uid);
  }

  return (
    <PaymentLinkContent
      token={token}
      initialError={initialError}
      maskedPhone={maskedPhone}
      applicationNumber={applicationNumber}
      alreadyLinked={alreadyLinked}
      getPhoneForToken={getPhoneForToken}
    />
  );
}
