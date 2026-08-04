// @ts-nocheck — nexus_class_recap* and the new nexus_study_file_reads columns
// are absent from the generated Supabase types. Same convention as
// class-recaps.ts and study-videos.ts.
import { getSupabaseAdminClient, TypedSupabaseClient } from '../../client';
import { loadClassroomRoster } from './roster';

/**
 * What a tutor can see about Foundation chapter progress.
 *
 * Three shapes of the same underlying facts, because three different questions
 * get asked: "how is this chapter going", "how is this student doing", and "who
 * is behind overall". They share one row builder so the three can never disagree
 * about what "completed" means.
 *
 * All of them go through loadClassroomRoster, which excludes alumni, dormant and
 * removed students by default. That default is the point: this feature exists
 * because a cohort count of 73 turned out to be 39 graduates and 14 past-batch
 * students, and a report that flatters itself that way is worse than none.
 */

const READS = 'nexus_study_file_reads';
const RECAPS = 'nexus_class_recaps';
const PROGRESS = 'nexus_class_recap_progress';
const FILES = 'nexus_study_files';

export type ChapterStatus = 'not_opened' | 'studying' | 'video_pending' | 'test_pending' | 'completed';

export interface ChapterProgressRow {
  student_id: string;
  name: string | null;
  email: string | null;
  avatar_url: string | null;
  status: ChapterStatus;
  /** Which language satisfied the video half, if it is satisfied. */
  video_language: string | null;
  video_completed_at: string | null;
  test_passed_at: string | null;
  completed_at: string | null;
  best_score_pct: number | null;
  /** Practice after completion. Never mixed into best_score_pct. */
  revision_best_score_pct: number | null;
  /** Reading time on the PDF, which is separate from watching. */
  active_seconds: number;
  /** Real playback across every track of this chapter, not a position. */
  watched_seconds: number;
  /** Refused skip attempts. A signal about intent, not a score. */
  blocked_seeks: number;
  /** Total checkpoint attempts, so a pass at the eighth try is visible. */
  checkpoint_attempts: number;
}

/**
 * The single definition of where a student stands on one chapter.
 *
 * `video_pending` and `test_pending` are the two halves named separately. Before
 * this they both read as "studying", which told a tutor nothing about which
 * nudge to send.
 */
function deriveStatus(
  read: { completed_at?: string | null; test_passed_at?: string | null; video_completed_at?: string | null; opened_at?: string | null } | undefined,
  requiresVideo: boolean,
): ChapterStatus {
  if (!read) return 'not_opened';
  if (read.completed_at) return 'completed';
  if (read.test_passed_at && requiresVideo && !read.video_completed_at) return 'video_pending';
  if (read.video_completed_at && !read.test_passed_at) return 'test_pending';
  return 'studying';
}

/** Watch facts per (student, chapter), summed across that chapter's tracks. */
async function watchFacts(
  supabase: TypedSupabaseClient,
  fileIds: string[],
  studentIds: string[],
): Promise<{
  byPair: Map<string, { watched: number; blocked: number; attempts: number }>;
  requiresVideo: Set<string>;
}> {
  const byPair = new Map<string, { watched: number; blocked: number; attempts: number }>();
  const requiresVideo = new Set<string>();
  if (!fileIds.length || !studentIds.length) return { byPair, requiresVideo };

  const { data: tracks } = await supabase
    .from(RECAPS)
    .select('id, study_file_id, status, readiness')
    .in('study_file_id', fileIds);

  const fileByTrack = new Map<string, string>();
  for (const t of tracks || []) {
    fileByTrack.set(t.id, t.study_file_id);
    if (t.status === 'published' && (t.readiness ?? 'ready') === 'ready') {
      requiresVideo.add(t.study_file_id);
    }
  }
  const trackIds = [...fileByTrack.keys()];
  if (!trackIds.length) return { byPair, requiresVideo };

  const { data: progress } = await supabase
    .from(PROGRESS)
    .select('student_id, recap_id, watched_seconds, blocked_seeks')
    .in('recap_id', trackIds)
    .in('student_id', studentIds);

  for (const p of progress || []) {
    const fileId = fileByTrack.get(p.recap_id);
    if (!fileId) continue;
    const key = `${p.student_id}:${fileId}`;
    const entry = byPair.get(key) || { watched: 0, blocked: 0, attempts: 0 };
    entry.watched += p.watched_seconds || 0;
    entry.blocked += p.blocked_seeks || 0;
    byPair.set(key, entry);
  }

  // Checkpoint attempts are per section, so they have to come back through the
  // section table to be attributed to a chapter.
  const { data: sections } = await supabase
    .from('nexus_class_recap_sections')
    .select('id, recap_id')
    .in('recap_id', trackIds);
  const trackBySection = new Map((sections || []).map((s: any) => [s.id, s.recap_id]));

  if (trackBySection.size) {
    const { data: attempts } = await supabase
      .from('nexus_class_recap_attempts')
      .select('student_id, section_id')
      .in('section_id', [...trackBySection.keys()])
      .in('student_id', studentIds);
    for (const a of attempts || []) {
      const fileId = fileByTrack.get(trackBySection.get(a.section_id) as string);
      if (!fileId) continue;
      const key = `${a.student_id}:${fileId}`;
      const entry = byPair.get(key) || { watched: 0, blocked: 0, attempts: 0 };
      entry.attempts += 1;
      byPair.set(key, entry);
    }
  }

  return { byPair, requiresVideo };
}

async function readsFor(
  supabase: TypedSupabaseClient,
  fileIds: string[],
  studentIds: string[],
): Promise<Map<string, any>> {
  const out = new Map<string, any>();
  if (!fileIds.length || !studentIds.length) return out;
  const { data } = await supabase
    .from(READS)
    .select(
      'user_id, file_id, opened_at, active_seconds, completed_at, test_passed_at, video_completed_at, video_language, best_score_pct, revision_best_score_pct',
    )
    .in('file_id', fileIds)
    .in('user_id', studentIds);
  for (const r of data || []) out.set(`${r.user_id}:${r.file_id}`, r);
  return out;
}

function buildRow(
  student: { id: string; name?: string | null; email?: string | null; avatar_url?: string | null },
  read: any,
  facts: { watched: number; blocked: number; attempts: number } | undefined,
  requiresVideo: boolean,
): ChapterProgressRow {
  return {
    student_id: student.id,
    name: student.name ?? null,
    email: student.email ?? null,
    avatar_url: student.avatar_url ?? null,
    status: deriveStatus(read, requiresVideo),
    video_language: read?.video_language ?? null,
    video_completed_at: read?.video_completed_at ?? null,
    test_passed_at: read?.test_passed_at ?? null,
    completed_at: read?.completed_at ?? null,
    best_score_pct: read?.best_score_pct ?? null,
    revision_best_score_pct: read?.revision_best_score_pct ?? null,
    active_seconds: read?.active_seconds || 0,
    watched_seconds: facts?.watched || 0,
    blocked_seeks: facts?.blocked || 0,
    checkpoint_attempts: facts?.attempts || 0,
  };
}

/** View 1: one chapter, every tracked student in a classroom. */
export async function getChapterReport(
  fileId: string,
  classroomId: string | null,
  client?: TypedSupabaseClient,
): Promise<{ rows: ChapterProgressRow[]; requires_video: boolean }> {
  const supabase = client || getSupabaseAdminClient();
  const roster = await loadClassroomRoster(classroomId, { client: supabase });
  if (!roster.ids.length) return { rows: [], requires_video: false };

  const [reads, facts] = await Promise.all([
    readsFor(supabase, [fileId], roster.ids),
    watchFacts(supabase, [fileId], roster.ids),
  ]);
  const requiresVideo = facts.requiresVideo.has(fileId);

  const rows = roster.members.map((m: any) =>
    buildRow(
      m.user ?? m,
      reads.get(`${(m.user ?? m).id}:${fileId}`),
      facts.byPair.get(`${(m.user ?? m).id}:${fileId}`),
      requiresVideo,
    ),
  );
  return { rows, requires_video: requiresVideo };
}

/** View 2: one student, every chapter in a folder. */
export async function getStudentChapterReport(
  studentId: string,
  folderId: string,
  client?: TypedSupabaseClient,
): Promise<{ chapters: (ChapterProgressRow & { file_id: string; file_title: string })[] }> {
  const supabase = client || getSupabaseAdminClient();

  const { data: files } = await supabase
    .from(FILES)
    .select('id, title, sort_order')
    .eq('folder_id', folderId)
    .eq('is_deleted', false)
    .order('sort_order', { ascending: true });

  const fileIds = (files || []).map((f: any) => f.id);
  if (!fileIds.length) return { chapters: [] };

  const [reads, facts, { data: user }] = await Promise.all([
    readsFor(supabase, fileIds, [studentId]),
    watchFacts(supabase, fileIds, [studentId]),
    supabase.from('users').select('id, name, email, avatar_url').eq('id', studentId).maybeSingle(),
  ]);

  return {
    chapters: (files || []).map((f: any) => ({
      ...buildRow(
        user || { id: studentId },
        reads.get(`${studentId}:${f.id}`),
        facts.byPair.get(`${studentId}:${f.id}`),
        facts.requiresVideo.has(f.id),
      ),
      file_id: f.id,
      file_title: f.title,
    })),
  };
}

/** View 3: every tracked student against every chapter in a folder. */
export async function getFolderMatrixReport(
  folderId: string,
  classroomId: string | null,
  client?: TypedSupabaseClient,
): Promise<{
  chapters: { id: string; title: string }[];
  students: {
    student_id: string;
    name: string | null;
    email: string | null;
    avatar_url: string | null;
    completed_count: number;
    average_score_pct: number | null;
    cells: Record<string, ChapterProgressRow>;
  }[];
}> {
  const supabase = client || getSupabaseAdminClient();

  const [{ data: files }, roster] = await Promise.all([
    supabase
      .from(FILES)
      .select('id, title, sort_order')
      .eq('folder_id', folderId)
      .eq('is_deleted', false)
      .order('sort_order', { ascending: true }),
    loadClassroomRoster(classroomId, { client: supabase }),
  ]);

  const chapters = (files || []).map((f: any) => ({ id: f.id, title: f.title }));
  const fileIds = chapters.map((c) => c.id);
  if (!fileIds.length || !roster.ids.length) return { chapters, students: [] };

  const [reads, facts] = await Promise.all([
    readsFor(supabase, fileIds, roster.ids),
    watchFacts(supabase, fileIds, roster.ids),
  ]);

  const students = roster.members.map((m: any) => {
    const user = m.user ?? m;
    const cells: Record<string, ChapterProgressRow> = {};
    let completed = 0;
    const scores: number[] = [];

    for (const chapter of chapters) {
      const row = buildRow(
        user,
        reads.get(`${user.id}:${chapter.id}`),
        facts.byPair.get(`${user.id}:${chapter.id}`),
        facts.requiresVideo.has(chapter.id),
      );
      cells[chapter.id] = row;
      if (row.status === 'completed') completed += 1;
      if (row.best_score_pct != null) scores.push(Number(row.best_score_pct));
    }

    return {
      student_id: user.id,
      name: user.name ?? null,
      email: user.email ?? null,
      avatar_url: user.avatar_url ?? null,
      completed_count: completed,
      average_score_pct: scores.length
        ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
        : null,
      cells,
    };
  });

  // Furthest behind first: the list is a worklist, not a leaderboard.
  students.sort((a, b) => a.completed_count - b.completed_count);
  return { chapters, students };
}
