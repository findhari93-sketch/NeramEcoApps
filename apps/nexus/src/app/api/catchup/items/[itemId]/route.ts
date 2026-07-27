import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient, recomputeCatchupItemCompletion } from '@neram/database';
import { canUser } from '@/lib/staff-capabilities';

/**
 * POST /api/catchup/items/[itemId]
 * body { action: 'excuse' | 'restore' | 'reset_test', note? }
 *
 * The three things a teacher needs to do to a single backlog item.
 *
 * `excuse` is the important one. A student who covered a topic elsewhere, or
 * joined so late that the earliest classes are not worth chasing, should not be
 * carrying them. An excused item leaves the backlog AND the pace denominator, so
 * waiving work can never make someone look further behind.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { itemId: string } },
) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient() as any;

    const { data: staff } = await supabase
      .from('users')
      .select('id, user_type, staff_role, can_teach')
      .eq('ms_oid', msUser.oid)
      .maybeSingle();
    if (!staff || !canUser(staff, 'coord.attendance.view')) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const { data: item } = await supabase
      .from('nexus_class_absences')
      .select('id, student_id, scheduled_class_id, journey_id, excused_at')
      .eq('id', params.itemId)
      .maybeSingle();
    if (!item) return NextResponse.json({ error: 'Item not found' }, { status: 404 });

    switch (body.action) {
      case 'excuse': {
        await supabase
          .from('nexus_class_absences')
          .update({
            excused_at: new Date().toISOString(),
            excused_by: staff.id,
            excuse_note: typeof body.note === 'string' ? body.note.trim() || null : null,
          })
          .eq('id', item.id);
        break;
      }

      case 'restore': {
        await supabase
          .from('nexus_class_absences')
          .update({ excused_at: null, excused_by: null, excuse_note: null })
          .eq('id', item.id);
        break;
      }

      case 'reset_test': {
        // For a student genuinely stuck: wipe the pass and re-open the test
        // without making them sit through the recording again. Requires the
        // capability that already governs publishing recaps.
        if (!canUser(staff, 'teach.recap.publish')) {
          return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
        }
        await supabase
          .from('nexus_class_absences')
          .update({
            test_passed_at: null,
            test_unlocked_at: new Date().toISOString(),
            caught_up_at: null,
          })
          .eq('id', item.id);
        break;
      }

      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }

    // Excusing the last outstanding item can complete the class, and restoring
    // one can un-complete it, so the derived state is recomputed either way.
    await recomputeCatchupItemCompletion(item.student_id, item.scheduled_class_id, supabase);

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update the item';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
