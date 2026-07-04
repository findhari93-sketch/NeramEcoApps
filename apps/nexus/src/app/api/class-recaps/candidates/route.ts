import { NextRequest, NextResponse } from 'next/server';
import { verifyTeacher } from '@/lib/verify-teacher';
import { getSupabaseAdminClient } from '@neram/database';

/**
 * GET /api/class-recaps/candidates?classroomId=...
 * Recorded classes for a classroom that can be turned into a recap, annotated
 * with any existing recap (id + status). Used by the teacher "New recap" list.
 */
export async function GET(request: NextRequest) {
  try {
    await verifyTeacher(request.headers.get('Authorization'));
    const classroomId = new URL(request.url).searchParams.get('classroomId');
    if (!classroomId) {
      return NextResponse.json({ error: 'Missing classroomId' }, { status: 400 });
    }
    const supabase = getSupabaseAdminClient() as any;

    const { data: classes, error } = await supabase
      .from('nexus_scheduled_classes')
      .select('id, title, scheduled_date, start_time, recording_url, transcript_url')
      .eq('classroom_id', classroomId)
      .not('recording_url', 'is', null)
      .order('scheduled_date', { ascending: false })
      .limit(50);
    if (error) throw error;

    const ids = (classes || []).map((c: any) => c.id);
    const recapByClass = new Map<string, { id: string; status: string }>();
    if (ids.length) {
      const { data: recaps } = await supabase
        .from('nexus_class_recaps')
        .select('id, scheduled_class_id, status')
        .in('scheduled_class_id', ids);
      for (const r of recaps || []) {
        recapByClass.set(r.scheduled_class_id, { id: r.id, status: r.status });
      }
    }

    const candidates = (classes || []).map((c: any) => ({
      scheduled_class_id: c.id,
      title: c.title,
      scheduled_date: c.scheduled_date,
      start_time: c.start_time,
      has_transcript: !!c.transcript_url,
      recap: recapByClass.get(c.id) || null,
    }));

    return NextResponse.json({ candidates });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load candidates';
    const status = message === 'Not authorized' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
