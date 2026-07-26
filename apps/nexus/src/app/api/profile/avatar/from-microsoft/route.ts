export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { pullMicrosoftPhoto } from '@/lib/photo-ms-sync';

/**
 * POST /api/profile/avatar/from-microsoft  (student, self only)
 *
 * "Use my Microsoft photo". A student who already set a picture on
 * myaccount.microsoft.com should not have to find and upload it again to get
 * into Nexus, since the two are meant to be the same photo anyway.
 *
 * The pulled photo lands on 'pending', which does not block, so this unblocks a
 * student in one tap while still putting the face in front of a teacher.
 */
export async function POST(req: NextRequest) {
  try {
    const msUser = await verifyMsToken(req.headers.get('Authorization'));

    // An impersonation token carries the STUDENT's oid, so without this a
    // teacher in "View as Student" could set the student's photo from here. The
    // audited staff path is POST /api/photo-review/upload.
    if (msUser.impersonatorUserId) {
      return NextResponse.json(
        {
          error: 'impersonation_not_allowed',
          message: 'You cannot change a photo while viewing as a student.',
        },
        { status: 403 },
      );
    }

    const supabase = getSupabaseAdminClient() as any;
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('ms_oid', msUser.oid)
      .maybeSingle();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const result = await pullMicrosoftPhoto(user.id);

    if (result.status === 'pulled') {
      return NextResponse.json({ success: true, status: result.status });
    }

    // Everything else is a dead end the student needs explained, not a silent
    // no-op that leaves them staring at the same blocker.
    const message =
      result.status === 'no_photo' || result.status === 'no_account'
        ? 'There is no photo on your Microsoft account yet. Take or choose one here instead.'
        : result.status === 'unchanged'
          ? 'Your Microsoft photo is already the one we have.'
          : result.status === 'in_review'
            ? 'Your photo is already waiting for your teacher to look at it.'
            : 'We could not read your Microsoft photo. Take or choose one here instead.';

    return NextResponse.json({ success: false, status: result.status, message }, { status: 200 });
  } catch (error: any) {
    const message = error?.message || 'Could not use your Microsoft photo';
    return NextResponse.json(
      { error: message },
      { status: message.includes('Authorization') ? 401 : 500 },
    );
  }
}
