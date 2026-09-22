/**
 * Student reports about a question bank question: which part is wrong (the
 * video, the written solution, the solution image, the answer key, or the
 * question itself), grouped so staff fix one problem once however many
 * students reported it.
 *
 * Only a student watching a video notices that its working is wrong, so this
 * is the only way such a mistake ever reaches a teacher. It lives beside the
 * question, not in the support-ticket inbox: ten students reporting one video
 * is one problem on one question, not ten conversations.
 */
import { getSupabaseAdminClient, TypedSupabaseClient } from '../../client';
import { IN_LIST_CHUNK } from '../../utils/paged-rows';
import { paperTitles } from './qb-papers';
import type {
  NexusQBQuestionReport,
  QBDrawingPart,
  QBReportGroup,
  QBReportOutcome,
  QBReportQueueItem,
  QBReportSource,
  QBReportStatusEntry,
  QBReportTarget,
  QBReportType,
  QBStudentReportItem,
} from '../../types';

const OPEN_STATUSES = ['open', 'in_review'];

const REPORT_COLUMNS =
  'id, question_id, student_id, report_type, description, status, resolution_note, resolved_by, resolved_at, created_at, updated_at, target, part_label, solution_ref, video_seconds, source, test_id, notified_at';

/** The columns solutionRefFor reads. */
const REF_COLUMNS =
  'id, question_text, question_image_url, options, correct_answer, explanation_brief, explanation_detailed, solution_image_url, solution_video_url, drawing_parts';

/** A question as far as "what could a student have seen" goes. */
export interface QBReportRefQuestion {
  id: string;
  question_text?: string | null;
  question_image_url?: string | null;
  options?: unknown;
  correct_answer?: string | null;
  explanation_brief?: string | null;
  explanation_detailed?: string | null;
  solution_image_url?: string | null;
  solution_video_url?: string | null;
  drawing_parts?: unknown;
}

/** A report row with the reporter's name, as the grouped views read it. */
export interface QBReportRow extends NexusQBQuestionReport {
  student_name?: string | null;
  student_avatar_url?: string | null;
}

// ============================================================================
// Pure: what the student saw, and grouping
// ============================================================================

function clean(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/**
 * A short, stable fingerprint of some text. Not for security: only so an edit
 * to a written solution reads as "changed since they reported it". Plain
 * FNV-1a rather than node:crypto, because this package is bundled into the
 * browser too.
 */
function fingerprint(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `t:${hash.toString(16)}:${text.length}`;
}

function partOf(question: QBReportRefQuestion, label: string): QBDrawingPart | null {
  const parts = question.drawing_parts as { items?: QBDrawingPart[] } | null | undefined;
  if (!parts || !Array.isArray(parts.items)) return null;
  const wanted = label.trim().toUpperCase();
  return parts.items.find((p) => String(p?.label ?? '').trim().toUpperCase() === wanted) ?? null;
}

/**
 * What a student reporting this target was looking at: the video or image
 * link, the answer key, or a fingerprint of the written solution or of the
 * question. Written by the server at report time, never taken from the
 * client, and compared with the current value to tell whether the solution
 * has changed since. Null when there is nothing there.
 */
export function solutionRefFor(
  question: QBReportRefQuestion,
  target: QBReportTarget,
  partLabel?: string | null,
): string | null {
  const part = partLabel ? partOf(question, partLabel) : null;
  switch (target) {
    case 'video':
      return clean(part ? part.solution_video_url : question.solution_video_url);
    case 'solution_image':
      return clean(part ? part.solution_image_url : question.solution_image_url);
    case 'answer_key':
      return clean(question.correct_answer);
    case 'explanation': {
      const text = [question.explanation_brief, question.explanation_detailed]
        .map((s) => (s ?? '').trim())
        .filter(Boolean)
        .join('\n');
      return text ? fingerprint(text) : null;
    }
    case 'question': {
      const options = Array.isArray(question.options)
        ? question.options.map((o: any) => `${o?.id ?? ''}=${o?.text ?? ''}`).join('|')
        : '';
      const text = [question.question_text ?? '', question.question_image_url ?? '', options].join('#');
      return text.replace(/#/g, '').trim() ? fingerprint(text) : null;
    }
    default:
      return null;
  }
}

function groupKey(r: { question_id: string; target: QBReportTarget; part_label: string | null }): string {
  return `${r.question_id}|${r.target}|${r.part_label ?? ''}`;
}

/**
 * Reports grouped into problems: one per question, target and part. The group
 * with the most students comes first, then the oldest.
 *
 * "Changed since reported" reads the NEWEST report: if a student reported the
 * replacement video too, the replacement is not a fix.
 */
export function groupQBReports(
  rows: QBReportRow[],
  questionsById: Map<string, QBReportRefQuestion>,
): QBReportGroup[] {
  const groups = new Map<string, QBReportRow[]>();
  for (const r of rows) {
    const key = groupKey(r);
    const list = groups.get(key) ?? [];
    list.push(r);
    groups.set(key, list);
  }

  const out: QBReportGroup[] = [];
  groups.forEach((list) => {
    const sorted = [...list].sort((a, b) => b.created_at.localeCompare(a.created_at));
    const newest = sorted[0];
    const oldest = sorted[sorted.length - 1];
    const open = sorted.some((r) => OPEN_STATUSES.includes(r.status));
    const closedBy = sorted.find((r) => !OPEN_STATUSES.includes(r.status));

    const tally = new Map<QBReportType, number>();
    for (const r of sorted) tally.set(r.report_type, (tally.get(r.report_type) ?? 0) + 1);

    const question = questionsById.get(newest.question_id);
    const current = question ? solutionRefFor(question, newest.target, newest.part_label) : null;

    out.push({
      question_id: newest.question_id,
      target: newest.target,
      part_label: newest.part_label,
      status: open ? 'open' : closedBy!.status,
      students: new Set(sorted.map((r) => r.student_id)).size,
      reasons: Array.from(tally.entries())
        .map(([reason, count]) => ({ reason, count }))
        .sort((a, b) => b.count - a.count),
      notes: sorted.map((r) => ({
        report_id: r.id,
        student_id: r.student_id,
        student_name: r.student_name ?? null,
        student_avatar_url: r.student_avatar_url ?? null,
        reason: r.report_type,
        note: clean(r.description),
        video_seconds: r.video_seconds ?? null,
        created_at: r.created_at,
      })),
      first_reported_at: oldest.created_at,
      last_reported_at: newest.created_at,
      changed_since_reported: newest.solution_ref != null && newest.solution_ref !== current,
      resolution_note: open ? null : closedBy?.resolution_note ?? null,
      resolved_at: open ? null : closedBy?.resolved_at ?? null,
    });
  });

  return out.sort(
    (a, b) => b.students - a.students || a.first_reported_at.localeCompare(b.first_reported_at),
  );
}

/** How many different students must report a solution before others are warned. */
export const QB_REPORT_WARN_THRESHOLD = 2;

/**
 * The parts of each question that other students should be warned about.
 *
 * Two different students, both still open, both about the solution as it is
 * NOW. One report alone never warns anybody (it may itself be the mistake),
 * and a replaced video drops the warning even if nobody pressed Mark fixed.
 * A report with no snapshot (older rows) counts, since it cannot be ruled out.
 */
export function flaggedParts(
  rows: Array<Pick<QBReportRow, 'question_id' | 'student_id' | 'status' | 'target' | 'part_label' | 'solution_ref'>>,
  questionsById: Map<string, QBReportRefQuestion>,
): Map<string, { target: QBReportTarget; part_label: string | null }[]> {
  const students = new Map<string, Set<string>>();
  for (const r of rows) {
    if (!OPEN_STATUSES.includes(r.status)) continue;
    const question = questionsById.get(r.question_id);
    if (!question) continue;
    const current = solutionRefFor(question, r.target, r.part_label);
    if (r.solution_ref != null && r.solution_ref !== current) continue;
    const key = groupKey(r);
    const set = students.get(key) ?? new Set<string>();
    set.add(r.student_id);
    students.set(key, set);
  }

  const out = new Map<string, { target: QBReportTarget; part_label: string | null }[]>();
  students.forEach((set, key) => {
    if (set.size < QB_REPORT_WARN_THRESHOLD) return;
    const [questionId, target, part] = key.split('|');
    const list = out.get(questionId) ?? [];
    list.push({ target: target as QBReportTarget, part_label: part || null });
    out.set(questionId, list);
  });
  return out;
}

// ============================================================================
// Reads and writes
// ============================================================================

function chunks<T>(items: T[], size = IN_LIST_CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function withNames(rows: any[]): QBReportRow[] {
  return (rows || []).map(({ users, ...r }: any) => ({ ...r, student_name: users?.name ?? null, student_avatar_url: users?.avatar_url ?? null }));
}

async function loadRefQuestions<Extra extends string = never>(
  ids: string[],
  client: TypedSupabaseClient,
  extraColumns = '',
): Promise<Map<string, QBReportRefQuestion & Record<Extra, any>>> {
  const out = new Map<string, QBReportRefQuestion & Record<Extra, any>>();
  const unique = Array.from(new Set(ids));
  for (const part of chunks(unique)) {
    const { data, error } = await (client as any)
      .from('nexus_qb_questions')
      .select(extraColumns ? `${REF_COLUMNS}, ${extraColumns}` : REF_COLUMNS)
      .in('id', part);
    if (error) throw error;
    for (const q of data || []) out.set(q.id, q);
  }
  return out;
}

async function loadPaperLabels(paperIds: string[], client: TypedSupabaseClient): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const unique = Array.from(new Set(paperIds.filter(Boolean)));
  for (const part of chunks(unique)) {
    const { data, error } = await (client as any)
      .from('nexus_qb_original_papers')
      .select('id, exam_type, year, session, shift')
      .in('id', part);
    if (error) throw error;
    for (const p of data || []) out.set(p.id, paperTitles(p).title);
  }
  return out;
}

/** Everything the report and resolve routes need about one question and its paper. */
export interface QBReportContext {
  question: QBReportRefQuestion & {
    question_format: string | null;
    original_paper_id: string | null;
    display_order: number | null;
  };
  paper: { id: string; label: string; uploaded_by: string | null } | null;
}

export async function getQBReportContext(
  questionId: string,
  client?: TypedSupabaseClient,
): Promise<QBReportContext | null> {
  const supabase = client || getSupabaseAdminClient();
  const { data: question, error } = await (supabase as any)
    .from('nexus_qb_questions')
    .select(`${REF_COLUMNS}, question_format, original_paper_id, display_order`)
    .eq('id', questionId)
    .maybeSingle();
  if (error) throw error;
  if (!question) return null;

  let paper: QBReportContext['paper'] = null;
  if (question.original_paper_id) {
    const { data: p } = await (supabase as any)
      .from('nexus_qb_original_papers')
      .select('id, exam_type, year, session, shift, uploaded_by')
      .eq('id', question.original_paper_id)
      .maybeSingle();
    if (p) paper = { id: p.id, label: paperTitles(p).title, uploaded_by: p.uploaded_by ?? null };
  }
  return { question, paper };
}

/**
 * Save a student's report. Optional columns are named only when there is a
 * value, so a caller that has none never depends on them.
 */
export async function createQBReport(
  data: {
    question_id: string;
    student_id: string;
    report_type: QBReportType;
    target: QBReportTarget;
    description?: string | null;
    part_label?: string | null;
    solution_ref?: string | null;
    video_seconds?: number | null;
    source?: QBReportSource | null;
    test_id?: string | null;
  },
  client?: TypedSupabaseClient,
): Promise<NexusQBQuestionReport> {
  const supabase = client || getSupabaseAdminClient();
  const row: Record<string, unknown> = {
    question_id: data.question_id,
    student_id: data.student_id,
    report_type: data.report_type,
    target: data.target,
  };
  if (data.description) row.description = data.description;
  if (data.part_label) row.part_label = data.part_label;
  if (data.solution_ref) row.solution_ref = data.solution_ref;
  if (data.video_seconds != null) row.video_seconds = data.video_seconds;
  if (data.source) row.source = data.source;
  if (data.test_id) row.test_id = data.test_id;

  const { data: report, error } = await (supabase as any)
    .from('nexus_qb_question_reports')
    .insert(row)
    .select(REPORT_COLUMNS)
    .single();
  if (error) throw error;
  return report as NexusQBQuestionReport;
}

function onPart(query: any, partLabel: string | null | undefined): any {
  return partLabel ? query.eq('part_label', partLabel) : query.is('part_label', null);
}

/** The student's own open report on this part of the question, if any. */
export async function findOpenQBReport(
  studentId: string,
  questionId: string,
  target: QBReportTarget,
  partLabel: string | null | undefined,
  client?: TypedSupabaseClient,
): Promise<NexusQBQuestionReport | null> {
  const supabase = client || getSupabaseAdminClient();
  const query = (supabase as any)
    .from('nexus_qb_question_reports')
    .select(REPORT_COLUMNS)
    .eq('student_id', studentId)
    .eq('question_id', questionId)
    .eq('target', target)
    .in('status', OPEN_STATUSES);
  const { data, error } = await onPart(query, partLabel).limit(1).maybeSingle();
  if (error) throw error;
  return (data as NexusQBQuestionReport) ?? null;
}

/** How many reports a student has sent since a moment, for the daily limit. */
export async function countQBReportsSince(
  studentId: string,
  sinceIso: string,
  client?: TypedSupabaseClient,
): Promise<number> {
  const supabase = client || getSupabaseAdminClient();
  const { count, error } = await (supabase as any)
    .from('nexus_qb_question_reports')
    .select('id', { count: 'exact', head: true })
    .eq('student_id', studentId)
    .gte('created_at', sinceIso);
  if (error) throw error;
  return count ?? 0;
}

/** Open reports on one part of one question: 0 means the next one is the first. */
export async function countOpenQBReportsOn(
  questionId: string,
  target: QBReportTarget,
  partLabel: string | null | undefined,
  client?: TypedSupabaseClient,
): Promise<number> {
  const supabase = client || getSupabaseAdminClient();
  const query = (supabase as any)
    .from('nexus_qb_question_reports')
    .select('id', { count: 'exact', head: true })
    .eq('question_id', questionId)
    .eq('target', target)
    .in('status', OPEN_STATUSES);
  const { count, error } = await onPart(query, partLabel);
  if (error) throw error;
  return count ?? 0;
}

/**
 * For each question: the viewer's own open reports, and the parts other
 * students should be warned about. Every requested id gets an entry.
 */
export async function getQBReportStatus(
  questionIds: string[],
  viewerId: string,
  client?: TypedSupabaseClient,
): Promise<Record<string, QBReportStatusEntry>> {
  const supabase = client || getSupabaseAdminClient();
  const out: Record<string, QBReportStatusEntry> = {};
  for (const id of questionIds) out[id] = { mine: [], flagged: [] };
  if (questionIds.length === 0) return out;

  const rows: QBReportRow[] = [];
  for (const part of chunks(Array.from(new Set(questionIds)))) {
    const { data, error } = await (supabase as any)
      .from('nexus_qb_question_reports')
      .select('question_id, student_id, status, report_type, target, part_label, solution_ref')
      .in('question_id', part)
      .in('status', OPEN_STATUSES);
    if (error) throw error;
    rows.push(...(data || []));
  }
  if (rows.length === 0) return out;

  for (const r of rows) {
    if (r.student_id === viewerId && out[r.question_id]) {
      out[r.question_id].mine.push({ target: r.target, part_label: r.part_label, report_type: r.report_type });
    }
  }

  const questions = await loadRefQuestions(rows.map((r) => r.question_id), supabase);
  flaggedParts(rows, questions).forEach((parts, questionId) => {
    if (out[questionId]) out[questionId].flagged = parts;
  });
  return out;
}

/** Open problems on a paper's questions, keyed by question id. */
export async function getPaperQBReports(
  paperId: string,
  client?: TypedSupabaseClient,
): Promise<Record<string, QBReportGroup[]>> {
  const supabase = client || getSupabaseAdminClient();
  const { data: questions, error } = await (supabase as any)
    .from('nexus_qb_questions')
    .select(REF_COLUMNS)
    .eq('original_paper_id', paperId);
  if (error) throw error;
  const byId = new Map<string, QBReportRefQuestion>((questions || []).map((q: any) => [q.id, q]));
  if (byId.size === 0) return {};

  const rows: QBReportRow[] = [];
  for (const part of chunks(Array.from(byId.keys()))) {
    const { data, error: reportError } = await (supabase as any)
      .from('nexus_qb_question_reports')
      .select(`${REPORT_COLUMNS}, users!nexus_qb_question_reports_student_id_fkey(name, avatar_url)`)
      .in('question_id', part)
      .in('status', OPEN_STATUSES);
    if (reportError) throw reportError;
    rows.push(...withNames(data || []));
  }

  const out: Record<string, QBReportGroup[]> = {};
  for (const group of groupQBReports(rows, byId)) {
    (out[group.question_id] ??= []).push(group);
  }
  return out;
}

export type QBReportQueueFilter = 'open' | 'resolved' | 'dismissed';

/** How many closed reports the queue shows. Open ones are always all shown. */
const CLOSED_QUEUE_LIMIT = 500;

/**
 * The question bank's Reports queue: problems with where they live, plus how
 * many problems sit in each state for the stat cards.
 */
export async function getQBReportQueue(
  filter: QBReportQueueFilter,
  client?: TypedSupabaseClient,
): Promise<{ items: QBReportQueueItem[]; counts: Record<QBReportQueueFilter, number> }> {
  const supabase = client || getSupabaseAdminClient();

  // The table is small (three rows on production after six months), so the
  // counts are read whole rather than through an RPC.
  const { data: all, error: countError } = await (supabase as any)
    .from('nexus_qb_question_reports')
    .select('question_id, target, part_label, status');
  if (countError) throw countError;
  const buckets: Record<QBReportQueueFilter, Set<string>> = {
    open: new Set(),
    resolved: new Set(),
    dismissed: new Set(),
  };
  for (const r of all || []) {
    const bucket: QBReportQueueFilter = OPEN_STATUSES.includes(r.status) ? 'open' : r.status;
    buckets[bucket]?.add(groupKey(r));
  }
  const counts = { open: buckets.open.size, resolved: buckets.resolved.size, dismissed: buckets.dismissed.size };

  let query = (supabase as any)
    .from('nexus_qb_question_reports')
    .select(`${REPORT_COLUMNS}, users!nexus_qb_question_reports_student_id_fkey(name, avatar_url)`)
    .order('created_at', { ascending: false });
  query = filter === 'open' ? query.in('status', OPEN_STATUSES) : query.eq('status', filter).limit(CLOSED_QUEUE_LIMIT);
  const { data, error } = await query;
  if (error) throw error;
  const rows = withNames(data || []);
  if (rows.length === 0) return { items: [], counts };

  const questions = await loadRefQuestions<'original_paper_id' | 'display_order'>(
    rows.map((r) => r.question_id),
    supabase,
    'original_paper_id, display_order',
  );
  const papers = await loadPaperLabels(
    Array.from(questions.values()).map((q) => q.original_paper_id as string),
    supabase,
  );

  const items = groupQBReports(rows, questions).map((group) => {
    const q = questions.get(group.question_id);
    return {
      ...group,
      question_text: q?.question_text ?? null,
      paper_id: q?.original_paper_id ?? null,
      paper_label: q?.original_paper_id ? papers.get(q.original_paper_id) ?? null : null,
      question_number: q?.display_order ?? null,
    };
  });
  if (filter !== 'open') items.sort((a, b) => (b.resolved_at ?? '').localeCompare(a.resolved_at ?? ''));
  return { items, counts };
}

/**
 * Close every open report on one part of one question at once, and say who
 * reported it so each of them can be told. Returns nothing to do when the
 * group was already closed (a second press, or two teachers at once).
 */
export async function resolveQBReportGroup(
  questionId: string,
  target: QBReportTarget,
  partLabel: string | null | undefined,
  input: { outcome: QBReportOutcome; note?: string | null; resolvedBy: string },
  client?: TypedSupabaseClient,
): Promise<{ reportIds: string[]; studentIds: string[] }> {
  const supabase = client || getSupabaseAdminClient();
  const now = new Date().toISOString();
  const query = (supabase as any)
    .from('nexus_qb_question_reports')
    .update({
      status: input.outcome === 'fixed' ? 'resolved' : 'dismissed',
      resolution_note: clean(input.note) ?? null,
      resolved_by: input.resolvedBy,
      resolved_at: now,
      updated_at: now,
    })
    .eq('question_id', questionId)
    .eq('target', target)
    .in('status', OPEN_STATUSES);
  const { data, error } = await onPart(query, partLabel).select('id, student_id');
  if (error) throw error;
  const rows = (data || []) as { id: string; student_id: string }[];
  return {
    reportIds: rows.map((r) => r.id),
    studentIds: Array.from(new Set(rows.map((r) => r.student_id))),
  };
}

/** Stamp the reports whose students have been told the outcome. */
export async function markQBReportsNotified(reportIds: string[], client?: TypedSupabaseClient): Promise<void> {
  if (reportIds.length === 0) return;
  const supabase = client || getSupabaseAdminClient();
  const now = new Date().toISOString();
  for (const part of chunks(reportIds)) {
    const { error } = await (supabase as any)
      .from('nexus_qb_question_reports')
      .update({ notified_at: now })
      .in('id', part);
    if (error) throw error;
  }
}

/** Close one report by id (the older per-report action). Returns the row, or null if it is gone. */
export async function resolveQBReport(
  reportId: string,
  input: { status: 'in_review' | 'resolved' | 'dismissed'; resolution_note?: string | null; resolved_by: string },
  client?: TypedSupabaseClient,
): Promise<NexusQBQuestionReport | null> {
  const supabase = client || getSupabaseAdminClient();
  const now = new Date().toISOString();
  const closing = input.status !== 'in_review';
  const { data, error } = await (supabase as any)
    .from('nexus_qb_question_reports')
    .update({
      status: input.status,
      resolution_note: clean(input.resolution_note) ?? null,
      resolved_by: closing ? input.resolved_by : null,
      resolved_at: closing ? now : null,
      updated_at: now,
    })
    .eq('id', reportId)
    .select(REPORT_COLUMNS)
    .maybeSingle();
  if (error) throw error;
  return (data as NexusQBQuestionReport) ?? null;
}

/** Questions with at least one open report: the Question Bank badge. */
export async function getOpenQBReportQuestionCount(client?: TypedSupabaseClient): Promise<number> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await (supabase as any)
    .from('nexus_qb_question_reports')
    .select('question_id')
    .in('status', OPEN_STATUSES);
  if (error) throw error;
  return new Set((data || []).map((r: { question_id: string }) => r.question_id)).size;
}

/** A student's own reports, newest first, with the paper and number to recognise them by. */
export async function getStudentQBReports(
  studentId: string,
  client?: TypedSupabaseClient,
): Promise<QBStudentReportItem[]> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await (supabase as any)
    .from('nexus_qb_question_reports')
    .select(REPORT_COLUMNS)
    .eq('student_id', studentId)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw error;
  const rows = (data || []) as NexusQBQuestionReport[];
  if (rows.length === 0) return [];

  const questions = new Map<string, { question_text: string | null; original_paper_id: string | null; display_order: number | null }>();
  for (const part of chunks(Array.from(new Set(rows.map((r) => r.question_id))))) {
    const { data: qs, error: qError } = await (supabase as any)
      .from('nexus_qb_questions')
      .select('id, question_text, original_paper_id, display_order')
      .in('id', part);
    if (qError) throw qError;
    for (const q of qs || []) questions.set(q.id, q);
  }
  const papers = await loadPaperLabels(
    Array.from(questions.values()).map((q) => q.original_paper_id as string),
    supabase,
  );

  return rows.map((r) => {
    const q = questions.get(r.question_id);
    return {
      ...r,
      question_text: q?.question_text ?? null,
      paper_label: q?.original_paper_id ? papers.get(q.original_paper_id) ?? null : null,
      question_number: q?.display_order ?? null,
    };
  });
}
