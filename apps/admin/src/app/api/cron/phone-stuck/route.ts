export const dynamic = 'force-dynamic';
export const maxDuration = 30;

import { NextResponse } from 'next/server';
import { claimStuckPhoneAttemptsForAlert, createAdminClient, createAdminNotification } from '@neram/database';
import { sendStaffPush } from '@neram/database/staff-push';
import { isAuthorizedCron } from '@/lib/marketing-ai/guard';
import { diagnosePerson, groupAttemptsByPerson, stuckAlertText } from '@/lib/phone-attempts-view';

/**
 * GET /api/cron/phone-stuck (Vercel Cron, every 15 minutes). Fails closed
 * without CRON_SECRET.
 *
 * Someone who asked for a phone OTP and made no progress for 10 minutes, and
 * has verified no number, is stuck. Each such person gets one bell entry
 * (with why: likely a bug, SMS problem, student stopped) and the run sends
 * one phone push. A person is alerted once per episode: their next Send OTP
 * starts a new one (record_phone_attempt clears alerted_at).
 */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const sb: any = createAdminClient();
  try {
    const claimed = await claimStuckPhoneAttemptsForAlert({ hours: 24 }, sb);
    const people = groupAttemptsByPerson(claimed);

    let bell = 0;
    const lines: Array<{ title: string; body: string; userId: string | null }> = [];
    for (const person of people) {
      const user = person.attempts[0]?.user ?? null;
      const text = stuckAlertText({ name: user?.name || user?.email || null, attempts: person.attempts });
      const d = diagnosePerson(person.attempts);
      lines.push({ ...text, userId: person.userId });
      try {
        await createAdminNotification(
          {
            event_type: 'phone_stuck',
            title: text.title,
            message: text.body,
            metadata: {
              user_id: person.userId,
              anonymous_id: person.userId ? null : person.attempts[0]?.anonymous_id ?? null,
              phone: d.attempt?.phone ?? person.attempts[0]?.phone ?? null,
              kind: d.kind,
              reason: d.reason,
            },
          },
          sb,
        );
        bell += 1;
      } catch (e: any) {
        console.error('[phone-stuck] bell entry failed:', e?.message || e);
      }
    }

    let push = null;
    if (lines.length === 1) {
      push = await sendStaffPush(sb, { title: lines[0].title, body: lines[0].body, url: '/phone-sign-in', tag: 'phone-stuck' });
    } else if (lines.length > 1) {
      push = await sendStaffPush(sb, {
        title: `${lines.length} people stuck at phone sign-in`,
        body: lines.slice(0, 3).map((l) => l.body).join(' '),
        url: '/phone-sign-in',
        tag: 'phone-stuck',
      });
    }

    return NextResponse.json({
      success: true,
      numbers: claimed.length,
      people: people.length,
      bell,
      push: push ? { devices: push.devices, sent: push.sent } : null,
    });
  } catch (error: any) {
    console.error('[phone-stuck] failed:', error?.message || error);
    return NextResponse.json({ error: 'phone-stuck alert failed' }, { status: 500 });
  }
}
