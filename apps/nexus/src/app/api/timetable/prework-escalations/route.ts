import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { isInternalStaff, resolveStaffRole } from '@/lib/staff-capabilities';
import { sendNudge } from '@/lib/nudge-delivery';
import { evaluateChronicPrework } from '@/lib/prework-chronic';

/**
 * The chronic pre-class non-completion queue, and the one action on it.
 *
 * The cron notices; a person decides. Nothing here is automatic, and the cron
 * never calls this route. That split is the same one class-followups states in
 * its own header: a machine may draft a list, it does not message a human.
 *
 * GET  ?classroom={id}  -> open cases for that classroom
 * POST { escalation_id, action: 'notify_parent' | 'dismiss', message?, note? }
 */

/** Staff on this classroom, or internal staff anywhere. */
async function resolveStaff(supabase: any, msOid: string, classroomId: string) {
  const { data: user } = await supabase
    .from('users')
    .select('id, name, email, user_type, staff_role, can_teach')
    .eq('ms_oid', msOid)
    .single();
  if (!user) return { error: NextResponse.json({ error: 'User not found' }, { status: 404 }) };

  if (isInternalStaff(resolveStaffRole(user))) return { user };

  const { data: enrollment } = await supabase
    .from('nexus_enrollments')
    .select('role')
    .eq('user_id', user.id)
    .eq('classroom_id', classroomId)
    .eq('is_active', true)
    .maybeSingle();

  if (!enrollment || enrollment.role !== 'teacher') {
    return { error: NextResponse.json({ error: 'Only staff can contact a parent.' }, { status: 403 }) };
  }
  return { user };
}

export async function GET(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const classroomId = request.nextUrl.searchParams.get('classroom');
    if (!classroomId) {
      return NextResponse.json({ error: 'classroom is required' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient() as any;
    const staff = await resolveStaff(supabase, msUser.oid, classroomId);
    if ('error' in staff) return staff.error;

    const { data: rows } = await supabase
      .from('nexus_prework_escalations')
      .select(
        'id, student_id, missed_count, applicable_count, explained_count, started_claims, ' +
          'window_start, window_end, status, parent_notified_at, flagged_at, ' +
          'student:users!nexus_prework_escalations_student_id_fkey(id, name, email)',
      )
      .eq('classroom_id', classroomId)
      .in('status', ['open', 'notified'])
      .order('flagged_at', { ascending: false })
      .limit(50);

    const escalations = ((rows || []) as any[]).map((r) => {
      const verdict = evaluateChronicPrework({
        misses: r.missed_count,
        applicable: r.applicable_count,
        explained: r.explained_count,
        submitted: Math.max(0, r.applicable_count - r.missed_count),
        startedClaims: r.started_claims,
      });
      return {
        id: r.id,
        student_id: r.student_id,
        student_name: r.student?.name || r.student?.email || 'This student',
        label: verdict.label,
        notes: verdict.notes,
        status: r.status,
        parent_notified_at: r.parent_notified_at,
        window_start: r.window_start,
        window_end: r.window_end,
      };
    });

    return NextResponse.json({ escalations });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load the queue';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const body = await request.json();
    const escalationId = String(body?.escalation_id || '').trim();
    const action = body?.action;

    if (!escalationId || !['notify_parent', 'dismiss'].includes(action)) {
      return NextResponse.json({ error: 'escalation_id and a valid action are required' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient() as any;

    const { data: esc } = await supabase
      .from('nexus_prework_escalations')
      .select(
        'id, student_id, classroom_id, missed_count, applicable_count, status, parent_notified_at, ' +
          'student:users!nexus_prework_escalations_student_id_fkey(id, name)',
      )
      .eq('id', escalationId)
      .maybeSingle();
    if (!esc) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const staff = await resolveStaff(supabase, msUser.oid, esc.classroom_id);
    if ('error' in staff) return staff.error;

    if (action === 'dismiss') {
      await supabase
        .from('nexus_prework_escalations')
        .update({
          status: 'dismissed',
          dismissed_at: new Date().toISOString(),
          dismissed_by: staff.user.id,
          note: typeof body?.note === 'string' ? body.note.trim() || null : null,
        })
        .eq('id', esc.id);
      return NextResponse.json({ ok: true, status: 'dismissed' });
    }

    // Not twice. Combined with the UNIQUE (student_id, classroom_id) on the
    // table, a double click, a retried fetch, or two teachers acting at the same
    // moment cannot produce two messages to the same parent.
    if (esc.parent_notified_at) {
      const days = (Date.now() - Date.parse(esc.parent_notified_at)) / 86_400_000;
      if (days < 14) {
        return NextResponse.json(
          {
            error: `You already told this parent, on ${new Date(esc.parent_notified_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}.`,
          },
          { status: 409 },
        );
      }
    }

    // .select(), never .single(): nexus_parent_links is unique on the PAIR, so a
    // student can legitimately have two linked parents.
    const { data: links } = await supabase
      .from('nexus_parent_links')
      .select('parent_user_id')
      .eq('student_user_id', esc.student_id)
      .eq('is_active', true)
      .not('parent_user_id', 'is', null)
      .not('linked_at', 'is', null);

    const parentIds = ((links || []) as any[]).map((l) => l.parent_user_id).filter(Boolean);

    const stamp = {
      status: 'notified',
      parent_notified_at: new Date().toISOString(),
      parent_notified_by: staff.user.id,
      parent_user_id: parentIds[0] ?? null,
    };

    // No linked parent is today's normal state, not a failure. Record the
    // decision, clear the queue, and say plainly that nothing was sent.
    if (!parentIds.length) {
      await supabase.from('nexus_prework_escalations').update(stamp).eq('id', esc.id);
      return NextResponse.json({
        ok: true,
        delivered: 0,
        queued: true,
        reason: 'no_parent_linked',
        message: 'Saved. No parent account is linked yet, so nothing was sent.',
      });
    }

    const studentName = esc.student?.name || 'your child';
    const firstName = String(studentName).split(' ')[0];
    const teacherName = staff.user.name || 'Neram Classes';

    const plain =
      typeof body?.message === 'string' && body.message.trim()
        ? body.message.trim()
        : `${teacherName} from Neram Classes here. ${firstName} has not finished the work set before class ` +
          `${esc.missed_count} times out of ${esc.applicable_count} in the last four weeks. ` +
          'It is not a penalty and nothing has been withheld. A short nudge at home usually fixes it. ' +
          'Reply to this message if you would like to talk.';

    // sendNudge resolves plain users.id with no user_type filter, so a parent id
    // works. Parents rarely have a Microsoft identity, so in practice this lands
    // on the email backstop, which is the intended channel.
    const { counts } = await sendNudge({
      studentIds: parentIds,
      subject: `About ${studentName}'s pre-class work`,
      plain,
      teamsText: 'A note from Neram Classes',
      eventType: 'prework_parent_alert',
      metadata: { student_id: esc.student_id, classroom_id: esc.classroom_id, escalation_id: esc.id },
    });

    await supabase.from('nexus_prework_escalations').update(stamp).eq('id', esc.id);

    // Deliberately no notification to the student. Their parent being contacted
    // is a conversation, not an alert.
    return NextResponse.json({
      ok: true,
      delivered: parentIds.length,
      counts,
      message: `Sent to ${parentIds.length === 1 ? 'the parent' : `${parentIds.length} parents`}.`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update the case';
    console.error('Prework escalation error:', message);
    return NextResponse.json({ error: 'Could not update that case. Please try again.' }, { status: 500 });
  }
}
