import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken, extractBearerToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { canRunSession } from '@/lib/staff-capabilities';
import { resolveTranscript } from '@/lib/transcript-resolver';
import { findRecordingForClass } from '@/lib/recording-locator';
import { resolveSuggestedTags, type RegistryTag } from '@/lib/tag-resolver';
import { generateClassSummary, type ClassImageInput } from '@/lib/class-summary-ai';

/**
 * POST /api/timetable/[classId]/summarize  (staff)
 *
 * Read the class transcript (and any drawings attached to the class) and return
 * a wrap-up draft: a real title, a short brief, a detailed paragraph, a
 * point-by-point list, and the tags it should carry. Nothing is saved: the
 * teacher reviews and edits, then Save (the wrap-up PATCH) commits it. This
 * mirrors the class-recap generator.
 *
 * Two things are done here that the teacher used to have to do by hand:
 *
 *   1. The recording is located if it has not been synced yet, because the
 *      SharePoint item behind it is how the transcript is read (see
 *      lib/transcript-resolver). Without this, a class nobody pressed Sync on
 *      looks exactly like a class with no transcript.
 *   2. Tags are resolved against the registry by slug, shape and alias rather
 *      than by exact label equality, and the registry is shown to the model in
 *      the first place, so it picks existing tags instead of inventing near
 *      duplicates. See lib/tag-resolver.
 *
 * The transcript ladder itself lives in lib/transcript-resolver, shared with the
 * recap generator so the two cannot answer "is there a transcript" differently.
 *
 * If nothing resolves and there are no images, returns { needs_manual: true }
 * with a message naming the actual blocker, so the UI reveals the paste box
 * instead of erroring.
 */

interface Ctx {
  params: { classId: string };
}

const CLASS_COLS = [
  'id',
  'classroom_id',
  'teacher_id',
  'title',
  'transcript_url',
  'recording_url',
  'teams_meeting_id',
  'online_meeting_id',
  'teams_meeting_join_url',
  'teams_meeting_url',
  'organizer_ms_oid',
  'organizer_email',
  'scheduled_date',
  'start_time',
].join(', ');
const MAX_IMAGES = 4;

/** What to tell the teacher when the ladder came back empty. */
function manualMessage(hasRecording: boolean, sharepointError?: string): string {
  if (!hasRecording) {
    return 'No recording found for this class yet, so there is no transcript to read. Teams usually publishes it within an hour. Paste the transcript, upload the .vtt, or attach a class drawing to generate now.';
  }
  if (sharepointError === 'NO_ACCESS') {
    return 'The recording exists but could not be opened, so the transcript could not be read. Paste the transcript or upload the .vtt from Teams.';
  }
  if (sharepointError === 'VIDEO_NOT_FOUND') {
    return 'The recording link did not resolve. Re-sync the recording, or paste the transcript instead.';
  }
  return 'Teams has not published a transcript for this class yet. It usually appears a few minutes after the recording. Paste the transcript text, upload the .vtt, or attach a class drawing, then try again.';
}

async function resolveAccess(supabase: any, msOid: string, classId: string) {
  const { data: user } = await supabase
    .from('users')
    .select('id, user_type, staff_role, can_teach')
    .eq('ms_oid', msOid)
    .single();
  if (!user) return { error: NextResponse.json({ error: 'User not found' }, { status: 404 }) };

  const { data: cls } = await supabase
    .from('nexus_scheduled_classes')
    .select(CLASS_COLS)
    .eq('id', classId)
    .single();
  if (!cls) return { error: NextResponse.json({ error: 'Class not found' }, { status: 404 }) };

  const { data: enrollment } = await supabase
    .from('nexus_enrollments')
    .select('role')
    .eq('user_id', user.id)
    .eq('classroom_id', cls.classroom_id)
    .eq('is_active', true)
    .maybeSingle();

  // Internal staff may act on any class; an external teacher only on the
  // classes they are the tutor of. See canRunSession.
  const canEdit = canRunSession(user, cls.teacher_id);
  if (!canEdit) {
    return { error: NextResponse.json({ error: 'Only staff can summarize a class' }, { status: 403 }) };
  }
  return { cls };
}

/** Fetch attached class drawings and convert to base64 parts for the model. */
async function loadClassImages(supabase: any, classId: string): Promise<ClassImageInput[]> {
  const { data } = await supabase
    .from('nexus_class_images')
    .select('url')
    .eq('scheduled_class_id', classId)
    .order('sort_order', { ascending: true })
    .limit(MAX_IMAGES);

  const rows = (data || []) as Array<{ url: string }>;
  const out: ClassImageInput[] = [];
  for (const row of rows) {
    try {
      const res = await fetch(row.url);
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      const ct = res.headers.get('content-type') || 'image/jpeg';
      out.push({ base64: buf.toString('base64'), mimeType: ct.startsWith('image/') ? ct : 'image/jpeg' });
    } catch {
      // one unreachable image should not sink the whole request
    }
  }
  return out;
}

export async function POST(request: NextRequest, { params }: Ctx) {
  // Outside the main try: a bad token is a 401, not the 500 that the catch-all
  // was turning every missing Authorization header into.
  let msUser: Awaited<ReturnType<typeof verifyMsToken>>;
  try {
    msUser = await verifyMsToken(request.headers.get('Authorization'));
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const msToken = extractBearerToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient() as any;
    const body = await request.json().catch(() => ({}));

    const access = await resolveAccess(supabase, msUser.oid, params.classId);
    if ('error' in access) return access.error;
    const cls = access.cls;

    // --- Make sure we know where the recording is ---
    // Only when the teacher has not supplied a transcript themselves, so a paste
    // never pays for a Graph lookup it does not need.
    const suppliedTranscript = !!body.transcript_text || !!body.vtt_content;
    let recordingUrl: string | null = cls.recording_url ?? null;
    if (!recordingUrl && !suppliedTranscript) {
      try {
        recordingUrl = await findRecordingForClass(supabase, cls);
        if (recordingUrl) {
          await supabase
            .from('nexus_scheduled_classes')
            .update({ recording_url: recordingUrl, recording_fetched_at: new Date().toISOString() })
            .eq('id', params.classId);
        }
      } catch (err) {
        console.error('[summarize] recording lookup failed:', err);
      }
    }

    // --- Resolve a transcript through the shared ladder ---
    // Pasted text, then an uploaded .vtt, then a cached URL, then the SharePoint
    // recording app-only, then the Teams artifact API. See lib/transcript-resolver.
    const { entries: transcript, source, sharepointError, meetingFailure } = await resolveTranscript({
      cls: { ...cls, id: params.classId, recording_url: recordingUrl },
      msToken,
      transcriptText: body.transcript_text,
      vttContent: body.vtt_content,
      supabase,
    });

    // --- Load class drawings (a drawing class can be summarized from these alone) ---
    const images = await loadClassImages(supabase, params.classId);

    if (transcript.length === 0 && images.length === 0) {
      // Logged, not returned: "the tenant never granted the Teams access policy"
      // is for us to act on, not something to put in front of a teacher.
      if (meetingFailure) {
        console.warn(`[summarize] class ${params.classId} meeting lookup: ${meetingFailure}`);
      }
      return NextResponse.json({
        needs_manual: true,
        message: manualMessage(!!recordingUrl, sharepointError),
      });
    }

    // --- The tag registry, both to prompt with and to match against ---
    const { data: registryRows } = await supabase
      .from('nexus_qb_tags')
      .select('id, slug, label, group_type, color, aliases')
      .in('group_type', ['subject', 'theme'])
      .eq('is_active', true)
      .order('group_type', { ascending: true })
      .order('sort_order', { ascending: true });
    const registry = (registryRows || []) as RegistryTag[];

    // --- Generate ---
    const summary = await generateClassSummary({
      transcript,
      images,
      fallbackTitle: cls.title || 'Untitled class',
      tags: registry,
    });

    const { matched, unmatched } = resolveSuggestedTags({
      registry,
      tagSlugs: summary.tag_slugs,
      newTags: summary.new_tags,
    });

    return NextResponse.json({
      summary: {
        suggested_title: summary.suggested_title,
        short_description: summary.short_description,
        detailed_description: summary.detailed_description,
        bullets: summary.bullets,
      },
      // Tags that already exist: the panel ticks these on without a tap.
      auto_tag_ids: matched.map((t) => t.id),
      // The registry rows behind them, so the panel can render a chip for a tag
      // it did not have when the page loaded.
      tags: matched.map((t) => ({
        id: t.id,
        slug: t.slug,
        label: t.label,
        group_type: t.group_type,
        color: t.color ?? null,
      })),
      // Genuinely new ideas. Created only if the teacher taps one.
      suggested_tags: unmatched,
      used: { transcript: transcript.length > 0, images: images.length, source },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to summarize the class';
    console.error('Class summarize error:', message);
    if (message.includes('GEMINI_API_KEY')) {
      return NextResponse.json({ error: 'AI is not configured on this environment.' }, { status: 503 });
    }
    if (
      message.includes('429') ||
      message.includes('Too Many Requests') ||
      message.includes('quota') ||
      message.includes('RESOURCE_EXHAUSTED')
    ) {
      return NextResponse.json({ error: 'AI is busy right now. Try again shortly.' }, { status: 429 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
