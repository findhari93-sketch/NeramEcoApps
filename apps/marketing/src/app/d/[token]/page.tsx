/**
 * /d/<token> — what the WhatsApp "Join" button opens.
 *
 * Inside the join window (15 minutes before to the end) a confirmed demo goes
 * straight to Teams. Any other time it shows the booking: time, calendar
 * buttons, the drawing share and a way back to book again.
 *
 * Per token, so not static and never cached. The token is the only key; a
 * wrong one shows "link not found", nothing else.
 */

import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getDemoRequestByToken, isJoinOpen } from '@neram/database';
import { loadDemoSettings, toPublicDemoRequest } from '@/lib/demo-request';
import DemoLinkView from '@/components/demo-class/DemoLinkView';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Your demo class | Neram Classes',
  robots: { index: false, follow: false, nocache: true },
  referrer: 'no-referrer',
};

export default async function DemoLinkPage({ params }: { params: { token: string } }) {
  const r = await getDemoRequestByToken(params.token).catch(() => null);
  if (
    r &&
    r.status === 'approved' &&
    r.scheduled_start &&
    r.teams_join_url &&
    isJoinOpen(new Date(r.scheduled_start), r.scheduled_minutes, new Date())
  ) {
    redirect(r.teams_join_url);
  }
  const settings = await loadDemoSettings();
  return (
    <DemoLinkView
      request={r ? toPublicDemoRequest(r, settings) : null}
      settings={{ schedule: settings.schedule, drawingWhatsApp: settings.drawingWhatsApp, callbackPromise: settings.callbackPromise }}
    />
  );
}
