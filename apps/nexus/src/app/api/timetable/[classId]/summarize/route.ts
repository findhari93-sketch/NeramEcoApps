import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken, extractBearerToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { canRunSession } from '@/lib/staff-capabilities';
import { resolveTranscript } from '@/lib/transcript-resolver';
import { generateClassSummary, type ClassImageInput } from '@/lib/class-summary-ai';

/**
 * POST /api/timetable/[classId]/summarize  (staff)
 *
 * Read the class transcript (and any drawings attached to the class) and return
 * a wrap-up draft: a real title, a short brief, a detailed paragraph, a
 * point-by-point list, and suggested subject/theme tags matched against the
 * registry. Nothing is saved: the teacher reviews and edits, then Save (the
 * wrap-up PATCH) commits it. This mirrors the class-recap generator.
 *
 * The transcript ladder itself lives in lib/transcript-resolver, shared with the
 * recap generator so the two cannot answer "is there a transcript" differently.
 *
 * If none resolve and there are no images, returns { needs_manual: true } so the
 * UI reveals the paste box instead of erroring.
 */

interface Ctx {
  params: { classId: string };
}

const CLASS_COLS = 'id, classroom_id, teacher_id, title, transcript_url, recording_url, teams_meeting_id';
const MAX_IMAGES = 4;

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
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const msToken = extractBearerToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient() as any;
    const body = await request.json().catch(() => ({}));

    const access = await resolveAccess(supabase, msUser.oid, params.classId);
    if ('error' in access) return access.error;
    const cls = access.cls;

    // --- Resolve a transcript through the shared ladder ---
    // Pasted text, then an uploaded .vtt, then a cached URL, then live from
    // Graph (cached back), then the SharePoint recording. See lib/transcript-resolver.
    const { entries: transcript } = await resolveTranscript({
      cls: { ...cls, id: params.classId },
      msToken,
      transcriptText: body.transcript_text,
      vttContent: body.vtt_content,
      supabase,
    });

    // --- Load class drawings (a drawing class can be summarized from these alone) ---
    const images = await loadClassImages(supabase, params.classId);

    if (transcript.length === 0 && images.length === 0) {
      return NextResponse.json({
        needs_manual: true,
        message:
          'No transcript found yet. Paste the transcript text (or upload the .vtt from Teams), or attach a class drawing, then try again.',
      });
    }

    // --- Generate ---
    const summary = await generateClassSummary({
      transcript,
      images,
      fallbackTitle: cls.title || 'Untitled class',
    });

    // --- Match suggested tags against the shared registry ---
    const { data: registry } = await supabase
      .from('nexus_qb_tags')
      .select('id, slug, label, group_type')
      .in('group_type', ['subject', 'theme'])
      .eq('is_active', true);

    const byKey = new Map<string, { id: string; group_type: string }>();
    for (const t of (registry || []) as Array<{ id: string; slug: string; label: string; group_type: string }>) {
      byKey.set(t.label.toLowerCase(), { id: t.id, group_type: t.group_type });
      byKey.set(t.slug.toLowerCase(), { id: t.id, group_type: t.group_type });
    }

    const suggested_tags = summary.suggested_tags.map((t) => {
      const match = byKey.get(t.label.toLowerCase());
      return {
        label: t.label,
        group_type: match?.group_type || t.group_type,
        existing_tag_id: match?.id || null,
      };
    });

    return NextResponse.json({
      summary: {
        suggested_title: summary.suggested_title,
        short_description: summary.short_description,
        detailed_description: summary.detailed_description,
        bullets: summary.bullets,
      },
      suggested_tags,
      used: { transcript: transcript.length > 0, images: images.length },
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
