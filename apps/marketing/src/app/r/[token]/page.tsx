/**
 * /r/<token>: the review link a past student opens from WhatsApp.
 *
 * A shell and nothing more: no database work on the server. The client component
 * validates the token, so a wrong token costs one small JSON call, not a render.
 *
 * Per-token content, so not statically generated and never indexed. No
 * generateStaticParams: the tokens are unknowable and the marketing app sits close
 * to Vercel's file cap.
 */

import type { Metadata, Viewport } from 'next';
import ReviewRequestFlow from '@/components/review-request/ReviewRequestFlow';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Share your Neram story | Neram Classes',
  robots: { index: false, follow: false, nocache: true },
  referrer: 'no-referrer',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function ReviewRequestPage({ params }: { params: { token: string } }) {
  return <ReviewRequestFlow token={params.token} />;
}
