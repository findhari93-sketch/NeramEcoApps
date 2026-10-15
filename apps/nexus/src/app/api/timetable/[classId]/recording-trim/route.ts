import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { resolveClassStaffAccess } from '@/lib/class-staff-access';
import { switchRecordingTrim, type TrimRecord } from '@/lib/recording-trim-apply';
import { getDriveItem, TrimGraphError } from '@/lib/recording-trim-graph';
import { requeueTrim } from '@/lib/recording-trim';

/**
 * GET  /api/timetable/[classId]/recording-trim
 * POST /api/timetable/[classId]/recording-trim  { action: 'use_original' | 'use_trimmed' | 'retry' | 'retrim' }
 *
 * What silence trimming did to this class's recording, and the staff switch
 * between the trimmed copy and the original (lib/recording-trim.ts). Staff who
 * can run the class only. Low traffic, staff opening one class at a time, so a
 * plain dynamic route.
 */

interface Ctx {
  params: { classId: string };
}

const CLASS_COLS = 'id, classroom_id, teacher_id';

async function access(request: NextRequest, classId: string) {
  const msUser = await verifyMsToken(request.headers.get('Authorization'));
  const supabase = getSupabaseAdminClient() as any;
  const result = await resolveClassStaffAccess<{ id: string; classroom_id: string; teacher_id: string | null }>(
    supabase,
    msUser.oid,
    classId,
    CLASS_COLS,
  );
  return { supabase, result };
}

export async function GET(request: NextRequest, { params }: Ctx) {
  try {
    const { supabase, result } = await access(request, params.classId);
    if ('error' in result) return result.error;
    if (!result.canEdit) return NextResponse.json({ error: 'Only staff can see this' }, { status: 403 });

    const [{ data: trim, error }, { data: upload }] = await Promise.all([
      supabase
        .from('nexus_recording_trims')
        .select(
          'id, status, reason, removed_seconds, original_duration_seconds, trimmed_duration_seconds, plan, trimmed_url, original_url, applied_at, updated_at',
        )
        .eq('class_id', params.classId)
        .maybeSingle(),
      supabase
        .from('nexus_class_video_uploads')
        .select('status, source_variant, replaced_video_id, youtube_video_id')
        .eq('class_id', params.classId)
        .maybeSingle(),
    ]);
    // No trim table yet (migration not applied): nothing to show.
    if (error) return NextResponse.json({ trim: null });

    return NextResponse.json({
      trim: trim
        ? {
            status: trim.status,
            reason: trim.reason,
            removed_seconds: Number(trim.removed_seconds) || 0,
            original_duration_seconds: Number(trim.original_duration_seconds) || 0,
            trimmed_duration_seconds: Number(trim.trimmed_duration_seconds) || 0,
            cuts: Array.isArray(trim.plan?.cuts) ? trim.plan.cuts : [],
            applied_at: trim.applied_at,
            updated_at: trim.updated_at,
          }
        : null,
      youtube: upload
        ? {
            status: upload.status,
            variant: upload.source_variant ?? 'original',
            replaced_video_id: upload.replaced_video_id ?? null,
          }
        : null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed';
    const status = /token|authoriz/i.test(message) ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: NextRequest, { params }: Ctx) {
  try {
    const { supabase, result } = await access(request, params.classId);
    if ('error' in result) return result.error;
    if (!result.canEdit) return NextResponse.json({ error: 'Only staff can change this' }, { status: 403 });

    const body = await request.json().catch(() => ({}));
    const { data: trim } = await supabase
      .from('nexus_recording_trims')
      .select('*')
      .eq('class_id', params.classId)
      .maybeSingle();
    if (!trim) return NextResponse.json({ error: 'This recording has not been trimmed' }, { status: 404 });

    if (body.action === 'retry') {
      if (!['failed', 'skipped', 'dry_run'].includes(trim.status)) {
        return NextResponse.json({ error: 'Nothing to retry' }, { status: 409 });
      }
      await supabase
        .from('nexus_recording_trims')
        .update({ status: 'queued', attempts: 0, reason: null, source: 'manual', updated_at: new Date().toISOString() })
        .eq('id', trim.id);
      return NextResponse.json({ ok: true, message: 'Queued. It is trimmed in the next evening run.' });
    }

    if (body.action === 'retrim') {
      const outcome = await requeueTrim(supabase, trim);
      if (outcome === 'busy') {
        return NextResponse.json({ error: 'This recording is already being trimmed, or uses the original.' }, { status: 409 });
      }
      return NextResponse.json({ ok: true, message: 'Queued. Students keep the current copy until the new one is ready.' });
    }

    if (body.action === 'use_original') {
      if (trim.previous) {
        return NextResponse.json(
          { error: 'A new trimmed copy is being made. Try again once it is ready.' },
          { status: 409 },
        );
      }
      if (trim.status !== 'applied') return NextResponse.json({ error: 'The original is already in use' }, { status: 409 });
      // Teams deletes recordings when they expire. Once the original is gone,
      // the trimmed copy is the only one left, so it stays (founder, 2026-10-14).
      try {
        await getDriveItem(trim.original_drive_id, trim.original_item_id);
      } catch (err) {
        if (err instanceof TrimGraphError && err.code === 'ITEM_NOT_FOUND') {
          return NextResponse.json(
            { error: 'Teams has removed the original recording, so the trimmed copy has to stay.' },
            { status: 409 },
          );
        }
        throw err;
      }
      await switchRecordingTrim(supabase, trim as TrimRecord, 'revert', result.userId);
      return NextResponse.json({ ok: true, message: 'Students now see the full recording.' });
    }

    if (body.action === 'use_trimmed') {
      if (trim.status !== 'reverted') return NextResponse.json({ error: 'The trimmed copy is already in use' }, { status: 409 });
      await switchRecordingTrim(supabase, trim as TrimRecord, 'apply', result.userId);
      return NextResponse.json({ ok: true, message: 'Students now see the trimmed recording.' });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed';
    console.error('[recording-trim] staff action failed', params.classId, message);
    return NextResponse.json({ error: 'Could not switch the recording. Try again in a minute.' }, { status: 500 });
  }
}
