import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken, extractBearerToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { resolveTranscript } from '@/lib/transcript-resolver';
import { buildVideoMetaPrompt, type AllowedTag } from '@/lib/class-video-meta-schema';
import { resolveClassStaffAccess } from '@/lib/class-staff-access';
import { VIDEO_META_CLASS_COLS, type VideoMetaClass } from '@/lib/class-video-meta-cols';
import type { TranscriptEntry } from '@neram/database';

/**
 * POST /api/timetable/[classId]/video-meta/prompt  (staff)
 *
 * Assemble the single block the teacher copies into ChatGPT, Gemini or Claude.
 * Everything the model needs is inlined: the class facts, the Teams transcript,
 * and the canonical tag list with aliases. The teacher taps Copy once, runs it,
 * and pastes the JSON back.
 *
 * POST rather than GET because the body can carry a pasted transcript or an
 * uploaded .vtt, which is the fallback when Teams has nothing, and because
 * resolving live from Graph caches transcript_url back onto the class.
 *
 * No server-side AI runs here. That is deliberate: there is one shared
 * GEMINI_API_KEY across recaps, drawing feedback and class summaries, and
 * exhausting it 429s every one of them. A copy-paste bridge costs nothing and
 * cannot be rate limited.
 */

interface Ctx {
  params: { classId: string };
}

/** Transcript entries to the "[mm:ss] text" form the prompt asks for. */
function formatTranscript(entries: TranscriptEntry[]): string {
  return entries
    .map((e) => {
      const mm = Math.floor(e.start / 60);
      const ss = Math.floor(e.start % 60);
      return `[${mm}:${ss.toString().padStart(2, '0')}] ${e.text}`;
    })
    .join('\n');
}

const TRANSCRIPT_NOTES: Record<string, string> = {
  NO_ACCESS: 'The recording exists but this account cannot open it, so the transcript could not be read.',
  VIDEO_NOT_FOUND: 'The recording link did not resolve, so there is no transcript to read.',
  NO_TRANSCRIPT: 'Teams did not produce a transcript for this class.',
};

export async function POST(request: NextRequest, { params }: Ctx) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const msToken = extractBearerToken(request.headers.get('Authorization'));
    const body = await request.json().catch(() => ({}));
    const supabase = getSupabaseAdminClient() as any;

    const access = await resolveClassStaffAccess<VideoMetaClass>(
      supabase, msUser.oid, params.classId, VIDEO_META_CLASS_COLS,
    );
    if ('error' in access) return access.error;
    if (!access.canEdit) {
      return NextResponse.json({ error: 'Only staff can prepare a recording' }, { status: 403 });
    }
    const cls = access.cls;

    // The shared ladder: pasted text, uploaded .vtt, cached URL, live Graph
    // (cached back), then the SharePoint recording. See lib/transcript-resolver.
    const { entries, source, sharepointError } = await resolveTranscript({
      cls: { ...cls, id: params.classId },
      msToken,
      transcriptText: body.transcript_text,
      vttContent: body.vtt_content,
      supabase,
    });

    const [registryRes, tagsRes, tutorRes] = await Promise.all([
      supabase
        .from('nexus_qb_tags')
        .select('slug, label, group_type, aliases')
        .in('group_type', ['subject', 'theme'])
        .eq('is_active', true)
        .order('group_type', { ascending: true })
        .order('sort_order', { ascending: true }),
      supabase
        .from('nexus_class_tags')
        .select('tag:nexus_qb_tags(slug)')
        .eq('scheduled_class_id', params.classId),
      cls.teacher_id
        ? supabase.from('users').select('name').eq('id', cls.teacher_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    const tags = (registryRes?.data || []) as AllowedTag[];
    const currentTagSlugs = (tagsRes?.data || [])
      .map((r: any) => r.tag?.slug)
      .filter(Boolean) as string[];

    const prompt = buildVideoMetaPrompt({
      cls,
      tutorName: tutorRes?.data?.name || null,
      transcript: entries.length ? formatTranscript(entries) : null,
      transcriptNote: sharepointError ? TRANSCRIPT_NOTES[sharepointError] : null,
      tags,
      currentTagSlugs,
    });

    return NextResponse.json({
      prompt,
      transcript: {
        found: entries.length > 0,
        source,
        // Segment count, not the text: the panel only needs to say whether the
        // prompt is working from a real transcript or from the class notes.
        segments: entries.length,
        error: sharepointError || null,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to build the prompt';
    console.error('Video meta prompt error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
