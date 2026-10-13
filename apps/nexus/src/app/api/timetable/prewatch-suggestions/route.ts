import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient, searchVideos } from '@neram/database';
import { isStaffRoleAny, resolveStaffRole } from '@/lib/staff-capabilities';
import {
  libraryCandidate,
  mergeSuggestions,
  rankRecordings,
  recordingCandidate,
  isPlayableRecording,
  tokenize,
  type PrewatchCandidate,
  type RecordingRow,
} from '@/lib/prewatch-suggest';

/**
 * GET /api/timetable/prewatch-suggestions
 *
 * Videos a teacher can ask students to watch before a class: Library videos and
 * past Nexus class recordings from ANY classroom. Staff only.
 *
 *   ?q=Human on Streets      what the class is called, or what the teacher typed
 *   &course_topic_id=        the course topic picked in Add Class, if any
 *   &classroom_ids=a,b       the classrooms being scheduled (a small tie-break)
 *   &exclude=library_video:<id>,class_recording:<id>   already picked
 *   &exclude_class_id=       the class being edited, never offered to itself
 *
 * Returns { suggestions, recordings, library }: up to 3 best picks for the
 * "Suggested for this class" strip, and longer lists for the picker. With no
 * words and no topic, the picker still gets something to browse: the most
 * recent recordings and the Library's own default order.
 */

const RECORDING_LIMIT = 300;
const LIST_LIMIT = 20;
const SUGGESTION_LIMIT = 3;

export async function GET(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient() as any;

    const { data: user } = await supabase
      .from('users')
      .select('id, user_type, staff_role, can_teach')
      .eq('ms_oid', msUser.oid)
      .maybeSingle();
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    if (!isStaffRoleAny(resolveStaffRole(user))) {
      return NextResponse.json({ error: 'Only staff can attach videos to a class' }, { status: 403 });
    }

    const params = request.nextUrl.searchParams;
    const q = (params.get('q') || '').trim().slice(0, 200);
    const courseTopicId = params.get('course_topic_id') || null;
    const classroomIds = (params.get('classroom_ids') || '').split(',').map((s) => s.trim()).filter(Boolean);
    const exclude = (params.get('exclude') || '').split(',').map((s) => s.trim()).filter(Boolean);
    const excludeClassId = params.get('exclude_class_id') || null;
    const today = new Date().toISOString().slice(0, 10);

    let topicTitle: string | null = null;
    if (courseTopicId) {
      const { data: topic } = await supabase
        .from('nexus_course_topics')
        .select('title')
        .eq('id', courseTopicId)
        .maybeSingle();
      topicTitle = topic?.title ?? null;
    }

    const tokens = tokenize(q).length ? tokenize(q) : tokenize(topicTitle);

    const [recordingRows, library] = await Promise.all([
      loadRecordings(supabase, today, excludeClassId),
      loadLibrary(q, topicTitle),
    ]);

    const ctx = { tokens, courseTopicId, classroomIds, today };
    const browsing = !tokens.length && !courseTopicId;
    const recordings: PrewatchCandidate[] = browsing
      ? recordingRows.filter(isPlayableRecording).map((r) => recordingCandidate(r))
      : rankRecordings(ctx, recordingRows);

    const notPicked = (c: PrewatchCandidate) => !exclude.includes(c.key);
    const suggestions = browsing
      ? []
      : mergeSuggestions(recordings, library, { limit: SUGGESTION_LIMIT, exclude });

    return NextResponse.json(
      {
        suggestions,
        recordings: recordings.filter(notPicked).slice(0, LIST_LIMIT),
        library: library.filter(notPicked).slice(0, LIST_LIMIT),
      },
      { headers: { 'Cache-Control': 'private, max-age=60' } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load suggestions';
    if (/Missing or invalid Authorization/.test(message)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[prewatch-suggestions] error:', message);
    return NextResponse.json({ error: 'Could not load videos right now' }, { status: 500 });
  }
}

/**
 * Past classes with a recording, newest first, across every classroom, with
 * their classroom name and tag labels for scoring. Dozens of rows today, so
 * they are scored in memory rather than in SQL.
 */
async function loadRecordings(supabase: any, today: string, excludeClassId: string | null): Promise<RecordingRow[]> {
  let query = supabase
    .from('nexus_scheduled_classes')
    .select(
      'id, title, description, scheduled_date, classroom_id, course_topic_id, recording_url, youtube_url, recording_duration_minutes, library_video_id, classroom:nexus_classrooms(name)',
    )
    .or('recording_url.not.is.null,youtube_url.not.is.null')
    .neq('status', 'cancelled')
    .eq('publish_state', 'published')
    .lte('scheduled_date', today)
    .order('scheduled_date', { ascending: false })
    .limit(RECORDING_LIMIT);
  if (excludeClassId) query = query.neq('id', excludeClassId);
  const { data, error } = await query;
  if (error) throw error;
  const rows = data || [];

  const tagsByClass = new Map<string, string[]>();
  if (rows.length) {
    const { data: tagRows } = await supabase
      .from('nexus_class_tags')
      .select('scheduled_class_id, tag:nexus_qb_tags(label)')
      .in('scheduled_class_id', rows.map((r: any) => r.id));
    for (const t of tagRows || []) {
      if (!t.tag?.label) continue;
      const list = tagsByClass.get(t.scheduled_class_id) || [];
      list.push(t.tag.label);
      tagsByClass.set(t.scheduled_class_id, list);
    }
  }

  return rows.map((r: any) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    scheduled_date: r.scheduled_date,
    classroom_id: r.classroom_id,
    classroom_name: r.classroom?.name ?? null,
    course_topic_id: r.course_topic_id,
    recording_url: r.recording_url,
    youtube_url: r.youtube_url,
    recording_duration_minutes: r.recording_duration_minutes,
    library_video_id: r.library_video_id,
    tags: tagsByClass.get(r.id) || [],
  }));
}

/**
 * Library matches from the library_search RPC. Falls back to the topic's own
 * title when the class title finds nothing. A Library failure must not take the
 * past classes down with it, so it degrades to an empty list.
 */
async function loadLibrary(q: string, topicTitle: string | null): Promise<PrewatchCandidate[]> {
  try {
    let { videos } = await searchVideos({ query: q || topicTitle || undefined, limit: LIST_LIMIT });
    if (!videos.length && q && topicTitle) {
      ({ videos } = await searchVideos({ query: topicTitle, limit: LIST_LIMIT }));
    }
    return videos.map(libraryCandidate);
  } catch (err) {
    console.error('[prewatch-suggestions] library search failed:', err instanceof Error ? err.message : err);
    return [];
  }
}
