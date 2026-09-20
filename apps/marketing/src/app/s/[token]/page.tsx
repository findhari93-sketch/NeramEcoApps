/**
 * /s/<token> — the page a student opens from the link their teacher sent.
 *
 * A shell and nothing more: it does no database work and never reads the token on
 * the server. The client component validates it, which keeps this page out of the
 * build's data path and means a wrong token costs one small JSON call rather than a
 * server render.
 *
 * Not statically generated and not revalidated: the content is per token. There is
 * deliberately no generateStaticParams here, both because the tokens are unknowable
 * and because the marketing app is close to Vercel's file cap.
 */

import type { Metadata } from 'next';
import DetailRequestForm from '@/components/detail-request/DetailRequestForm';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Your details | Neram Classes',
  robots: { index: false, follow: false, nocache: true },
  referrer: 'no-referrer',
};

export default function DetailRequestPage({ params }: { params: { token: string } }) {
  return <DetailRequestForm token={params.token} />;
}
