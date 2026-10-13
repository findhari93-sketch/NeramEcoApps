/**
 * Server side of "watch before class": validating what a teacher picked,
 * attaching it to classes, and reading it back with progress.
 *
 * The one place that reads the library_video and class_recording rows of
 * nexus_class_resources. Every other reader of that table filters these kinds
 * out (NOT_PREWATCH_KINDS), so reference material and these videos never mix.
 *
 * Authorisation is the caller's job (resolveClassStaffAccess on the TARGET
 * class). Nothing here takes a source id from a student: a student reaches a
 * past class's recording only through an attachment row on a class they are
 * enrolled in.
 */
import { getNexusSetting, loadClassroomRoster } from '@neram/database';
import { FEATURE_FLAGS_KEY, PREWATCH_FEATURE, isFeatureEnabled, resolveFlags } from './feature-flags';
import { MAX_RESOURCES_PER_CLASS, NOT_PREWATCH_KINDS, PREWATCH_KINDS, youtubeThumb } from './class-resources';
import {
  PREWATCH_MAX,
  formatClassDate,
  libraryTitle,
  pickKey,
  pickOfRow,
  prewatchState,
  type PrewatchItem,
  type PrewatchKind,
  type PrewatchPick,
  type PrewatchState,
} from './prewatch';
import { isPlayableRecording } from './prewatch-suggest';
import { extractYouTubeId } from './youtube';
import { classShareLinks } from './class-share-links';

type Db = any;

/** A refusal the route turns into a 400 with this message. */
export class PrewatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PrewatchError';
  }
}

/** Is the feature on? Off when the setting cannot be read: a student flag. */
export async function isPrewatchEnabled(): Promise<boolean> {
  try {
    const setting = await getNexusSetting(FEATURE_FLAGS_KEY);
    return isFeatureEnabled(PREWATCH_FEATURE, resolveFlags((setting?.value as Record<string, boolean>) || {}));
  } catch {
    return false;
  }
}

/** Columns every prewatch read needs. */
export const PREWATCH_COLS =
  'id, scheduled_class_id, kind, title, note, thumb_url, duration_seconds, library_video_id, source_class_id, sort_order, created_at';

/** The snapshot stored on an attachment row, before the class id is known. */
export interface PrewatchTemplate {
  kind: PrewatchKind;
  library_video_id: string | null;
  source_class_id: string | null;
  title: string;
  thumb_url: string | null;
  duration_seconds: number | null;
}

/**
 * Check every pick and snapshot what a card needs.
 *
 * Refuses, with a message a teacher can act on: more than PREWATCH_MAX, a
 * Library video that is gone or unpublished, a past class that was cancelled,
 * is still a draft, or has no recording a student could play. Returns the
 * templates in the order picked.
 */
export async function resolvePrewatchPicks(supabase: Db, picks: PrewatchPick[]): Promise<PrewatchTemplate[]> {
  if (picks.length > PREWATCH_MAX) {
    throw new PrewatchError(`A class can ask students to watch up to ${PREWATCH_MAX} videos.`);
  }
  if (!picks.length) return [];

  const libraryIds = picks.filter((p) => p.kind === 'library_video').map((p) => p.id);
  const classIds = picks.filter((p) => p.kind === 'class_recording').map((p) => p.id);

  const [libraryRes, classRes] = await Promise.all([
    libraryIds.length
      ? supabase
          .from('library_videos')
          .select('id, youtube_video_id, approved_title, suggested_title, original_title, youtube_thumbnail_url, youtube_thumbnail_hq_url, duration_seconds, is_published')
          .in('id', libraryIds)
      : Promise.resolve({ data: [], error: null }),
    classIds.length
      ? supabase
          .from('nexus_scheduled_classes')
          .select('id, title, scheduled_date, status, publish_state, recording_url, youtube_url, recording_duration_minutes')
          .in('id', classIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (libraryRes.error) throw libraryRes.error;
  if (classRes.error) throw classRes.error;

  const library = new Map<string, any>((libraryRes.data || []).map((v: any) => [v.id, v]));
  const classes = new Map<string, any>((classRes.data || []).map((c: any) => [c.id, c]));

  return picks.map((pick) => {
    if (pick.kind === 'library_video') {
      const v = library.get(pick.id);
      if (!v || v.is_published !== true) {
        throw new PrewatchError('One of the Library videos is no longer available. Remove it and try again.');
      }
      return {
        kind: 'library_video',
        library_video_id: v.id,
        source_class_id: null,
        title: libraryTitle(v),
        thumb_url: v.youtube_thumbnail_hq_url || v.youtube_thumbnail_url || (v.youtube_video_id ? youtubeThumb(v.youtube_video_id) : null),
        duration_seconds: v.duration_seconds ?? null,
      } satisfies PrewatchTemplate;
    }

    const c = classes.get(pick.id);
    if (!c || c.status === 'cancelled' || c.publish_state === 'draft' || !isPlayableRecording(c)) {
      throw new PrewatchError('One of the past classes has no recording students can play. Remove it and try again.');
    }
    const ytId = extractYouTubeId(c.youtube_url);
    const date = formatClassDate(c.scheduled_date);
    const name = (c.title || 'Class recording').trim();
    return {
      kind: 'class_recording',
      library_video_id: null,
      source_class_id: c.id,
      title: date ? `Class on ${date}: ${name}` : name,
      thumb_url: ytId ? youtubeThumb(ytId) : null,
      duration_seconds: c.recording_duration_minutes ? c.recording_duration_minutes * 60 : null,
    } satisfies PrewatchTemplate;
  });
}

/**
 * Attach the same videos to every class just created (each classroom, each
 * recurring date) in one insert. A past class is never attached to itself.
 */
export async function insertPrewatchForClasses(
  supabase: Db,
  classIds: string[],
  templates: PrewatchTemplate[],
  userId: string | null,
): Promise<number> {
  if (!classIds.length || !templates.length) return 0;
  const rows = classIds.flatMap((classId) =>
    templates
      .filter((t) => t.source_class_id !== classId)
      .map((t, index) => ({ ...t, scheduled_class_id: classId, sort_order: index, created_by: userId })),
  );
  // Chunked so a long term of weekly classes stays well inside a request.
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase.from('nexus_class_resources').insert(rows.slice(i, i + 500));
    if (error) throw error;
  }
  return rows.length;
}

/** The stored prewatch rows on one class, in order. */
async function loadRows(supabase: Db, classId: string): Promise<any[]> {
  const { data, error } = await supabase
    .from('nexus_class_resources')
    .select(PREWATCH_COLS)
    .eq('scheduled_class_id', classId)
    .in('kind', PREWATCH_KINDS as unknown as string[])
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

/**
 * Make one class's list exactly `picks`, in that order.
 *
 * Kept rows keep their id (so links already posted to Teams keep working);
 * removed rows are deleted; new ones are inserted. The shared 20-row ceiling of
 * the resources table still holds with reference material counted in.
 */
export async function reconcilePrewatch(
  supabase: Db,
  classId: string,
  picks: PrewatchPick[],
  userId: string | null,
): Promise<void> {
  if (picks.length > PREWATCH_MAX) {
    throw new PrewatchError(`A class can ask students to watch up to ${PREWATCH_MAX} videos.`);
  }
  if (picks.some((p) => p.kind === 'class_recording' && p.id === classId)) {
    throw new PrewatchError('A class cannot ask students to watch its own recording before it.');
  }

  const existing = await loadRows(supabase, classId);
  const byKey = new Map<string, any>();
  for (const row of existing) {
    const pick = pickOfRow(row);
    if (pick) byKey.set(pickKey(pick), row);
  }
  const wanted = new Set(picks.map(pickKey));

  const added = picks.filter((p) => !byKey.has(pickKey(p)));
  const templates = await resolvePrewatchPicks(supabase, added);

  const { count: referenceCount } = await supabase
    .from('nexus_class_resources')
    .select('id', { count: 'exact', head: true })
    .eq('scheduled_class_id', classId)
    .not('kind', 'in', NOT_PREWATCH_KINDS);
  if ((referenceCount ?? 0) + picks.length > MAX_RESOURCES_PER_CLASS) {
    throw new PrewatchError(`A class can hold ${MAX_RESOURCES_PER_CLASS} attachments in all. Remove some reference material first.`);
  }

  const removedIds = existing.filter((row) => {
    const pick = pickOfRow(row);
    return !pick || !wanted.has(pickKey(pick));
  }).map((row) => row.id);
  if (removedIds.length) {
    const { error } = await supabase.from('nexus_class_resources').delete().in('id', removedIds).eq('scheduled_class_id', classId);
    if (error) throw error;
  }

  const templateByKey = new Map(templates.map((t) => [
    pickKey({ kind: t.kind, id: (t.library_video_id || t.source_class_id) as string }),
    t,
  ]));
  const inserts: any[] = [];
  const updates: Array<{ id: string; sort_order: number }> = [];
  picks.forEach((pick, index) => {
    const key = pickKey(pick);
    const kept = byKey.get(key);
    if (kept) {
      if (kept.sort_order !== index) updates.push({ id: kept.id, sort_order: index });
    } else {
      const t = templateByKey.get(key);
      if (t) inserts.push({ ...t, scheduled_class_id: classId, sort_order: index, created_by: userId });
    }
  });

  if (inserts.length) {
    const { error } = await supabase.from('nexus_class_resources').insert(inserts);
    if (error) throw error;
  }
  await Promise.all(
    updates.map((u) =>
      supabase.from('nexus_class_resources').update({ sort_order: u.sort_order }).eq('id', u.id).eq('scheduled_class_id', classId),
    ),
  );
}

/** One student's progress rows for a set of videos, keyed by pick key. */
async function loadViews(
  supabase: Db,
  studentIds: string[],
  libraryIds: string[],
  classIds: string[],
): Promise<Array<{ student_id: string; key: string; watched_seconds: number; completed_at: string | null }>> {
  if (!studentIds.length || (!libraryIds.length && !classIds.length)) return [];
  const cols = 'student_id, library_video_id, source_class_id, watched_seconds, completed_at';
  const [lib, cls] = await Promise.all([
    libraryIds.length
      ? supabase.from('nexus_class_video_views').select(cols).in('student_id', studentIds).in('library_video_id', libraryIds)
      : Promise.resolve({ data: [], error: null }),
    classIds.length
      ? supabase.from('nexus_class_video_views').select(cols).in('student_id', studentIds).in('source_class_id', classIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (lib.error) throw lib.error;
  if (cls.error) throw cls.error;
  return [...(lib.data || []), ...(cls.data || [])].map((v: any) => ({
    student_id: v.student_id,
    key: v.library_video_id
      ? pickKey({ kind: 'library_video', id: v.library_video_id })
      : pickKey({ kind: 'class_recording', id: v.source_class_id }),
    watched_seconds: v.watched_seconds ?? 0,
    completed_at: v.completed_at ?? null,
  }));
}

/** "JEE B.Arch Session 1, 3 Oct 2026" for each past class attached. */
async function loadSourceLabels(supabase: Db, classIds: string[]): Promise<Map<string, string>> {
  const labels = new Map<string, string>();
  if (!classIds.length) return labels;
  const { data } = await supabase
    .from('nexus_scheduled_classes')
    .select('id, scheduled_date, classroom:nexus_classrooms(name)')
    .in('id', classIds);
  for (const c of data || []) {
    labels.set(c.id, [c.classroom?.name, formatClassDate(c.scheduled_date)].filter(Boolean).join(', '));
  }
  return labels;
}

export interface PrewatchStudentRow {
  student_id: string;
  name: string | null;
  avatar_url: string | null;
  /** Per attached video, keyed by attachment id. */
  states: Record<string, PrewatchState>;
}

/**
 * The videos on one class, in order.
 *
 * - `studentId`: each item carries that student's own `state`.
 * - `classroomId` (staff): each item carries a `summary` over the classroom's
 *   tracked roster (dormant students excluded, the shared roster rule), and
 *   `detail: true` also returns one row per student for the "who watched" list.
 */
export async function loadPrewatch(
  supabase: Db,
  classId: string,
  opts: { studentId?: string; classroomId?: string; detail?: boolean } = {},
): Promise<{ items: PrewatchItem[]; students?: PrewatchStudentRow[]; total?: number; dormant?: number }> {
  const rows = await loadRows(supabase, classId);
  if (!rows.length) return { items: [] };

  const libraryIds = rows.filter((r) => r.library_video_id).map((r) => r.library_video_id);
  const classIds = rows.filter((r) => r.source_class_id).map((r) => r.source_class_id);
  const labels = await loadSourceLabels(supabase, classIds);

  const items: PrewatchItem[] = rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    title: r.title,
    note: r.note ?? null,
    thumb_url: r.thumb_url ?? null,
    duration_seconds: r.duration_seconds ?? null,
    library_video_id: r.library_video_id ?? null,
    source_class_id: r.source_class_id ?? null,
    source_label: r.kind === 'library_video' ? 'Library' : labels.get(r.source_class_id) || null,
    sort_order: r.sort_order ?? 0,
  }));
  const keyOf = (item: PrewatchItem) => pickKey(pickOfRow(item) as PrewatchPick);

  if (opts.studentId) {
    const views = await loadViews(supabase, [opts.studentId], libraryIds, classIds);
    const byKey = new Map(views.map((v) => [v.key, v]));
    for (const item of items) item.state = prewatchState(byKey.get(keyOf(item)), item.duration_seconds);
    return { items };
  }

  if (!opts.classroomId) return { items };

  const roster = await loadClassroomRoster(opts.classroomId, { client: supabase });
  const studentIds = roster.ids;
  const views = await loadViews(supabase, studentIds, libraryIds, classIds);
  const byStudentKey = new Map(views.map((v) => [`${v.student_id}|${v.key}`, v]));

  for (const item of items) {
    const key = keyOf(item);
    let watched = 0;
    let started = 0;
    for (const sid of studentIds) {
      const state = prewatchState(byStudentKey.get(`${sid}|${key}`), item.duration_seconds);
      if (state === 'watched') watched += 1;
      else if (state === 'started') started += 1;
    }
    item.summary = { watched, started, total: studentIds.length };
  }

  const result: { items: PrewatchItem[]; students?: PrewatchStudentRow[]; total: number; dormant: number } = {
    items,
    total: studentIds.length,
    dormant: roster.dormantIds.length,
  };
  if (opts.detail) {
    const tracked = new Set(studentIds);
    result.students = roster.members
      .filter((m: any) => tracked.has(m.user_id))
      .map((m: any) => ({
        student_id: m.user_id,
        name: m.user?.name ?? null,
        avatar_url: m.user?.avatar_url ?? null,
        states: Object.fromEntries(
          items.map((item) => [item.id, prewatchState(byStudentKey.get(`${m.user_id}|${keyOf(item)}`), item.duration_seconds)]),
        ),
      }));
  }
  return result;
}

/** One attachment on one class, or null when it is not a prewatch row there. */
export async function loadPrewatchRow(supabase: Db, classId: string, resourceId: string): Promise<any | null> {
  const { data } = await supabase
    .from('nexus_class_resources')
    .select(PREWATCH_COLS)
    .eq('id', resourceId)
    .eq('scheduled_class_id', classId)
    .in('kind', PREWATCH_KINDS as unknown as string[])
    .maybeSingle();
  return data ?? null;
}

/** Absolute links for the Teams post and the share message. */
export function prewatchLinks(
  base: string,
  classId: string,
  items: Array<Pick<PrewatchItem, 'id' | 'title' | 'duration_seconds'>>,
): Array<{ title: string; url: string; durationSeconds: number | null }> {
  const links = classShareLinks(base);
  return items.map((i) => ({
    title: i.title,
    url: links.prewatch(classId, i.id),
    durationSeconds: i.duration_seconds ?? null,
  }));
}
