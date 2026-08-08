// @ts-nocheck — nexus_test_placements + nexus_tests.is_repository/created_from are not
// yet in the generated Supabase types. Regenerate after 20260713190000 is applied.
import { getSupabaseAdminClient, TypedSupabaseClient } from '../../client';
import { countRowsByKey } from '../../utils/paged-rows';
import { storeContentSummary, type NexusTestSourceFilters } from './test-provenance';
import { recordCatchupTestAttempt } from './catchup-journey';
import { gradeQBAnswerStrict, normaliseQuestionFormat } from './question-bank';
import {
  applyTestOptionMap,
  buildTestOptionMaps,
  originalToDisplayedId,
  pickTestDraw,
  testDrawSeed,
  translateDrawnAnswers,
} from './question-draw';
import { NEXUS_TEACHER_TEST_KINDS } from '../../types';
import type {
  NexusPlacementContext,
  NexusTestKind,
  NexusTestPlacement,
  NexusComposedQuestion,
  NexusComposedQuestionWithAnswer,
  NexusTestGradeResult,
  NexusOverviewTest,
  NexusTestOverviewGroup,
  NexusTestOverviewGroupKey,
  NexusLibraryTest,
  NexusTestFolderScope,
} from '../../types';

const TESTS = 'nexus_tests';
const TEST_QUESTIONS = 'nexus_test_questions';
const ATTEMPTS = 'nexus_test_attempts';
const PLACEMENTS = 'nexus_test_placements';
const DRAWS = 'nexus_test_draws';

export type TimerType = 'none' | 'full' | 'per_question';

function testTypeFromTimer(timer: TimerType | undefined): string {
  switch (timer) {
    case 'full':
      return 'timed';
    case 'per_question':
      return 'per_question_timer';
    default:
      return 'untimed';
  }
}

export interface ComposeTestInput {
  title: string;
  description?: string | null;
  questionIds: string[];
  /**
   * What this test IS. Required, with no default, so every call site has to
   * decide rather than inheriting someone else's answer. It drives grouping on
   * both hubs and, for the two gated kinds, whether the generic student test
   * list is allowed to show the test at all.
   */
  testKind: NexusTestKind;
  /** Per-question marks (aligned with questionIds) or a single value for all. Defaults to 1. */
  marks?: number[] | number;
  /**
   * Per-question negative marks, same shape as `marks`. Defaults to 0.
   *
   * The column has existed since the table was created but nothing ever wrote
   * to it, so every paper in the database is unpenalised. It matters for the
   * exam-faithful import: a JEE Paper 2 mock that does not deduct for a wrong
   * answer is not the exam, and the whole point of importing the real paper is
   * that sitting it feels like sitting the real one.
   */
  negativeMarks?: number[] | number;
  timerType?: TimerType;
  durationMinutes?: number | null;
  perQuestionSeconds?: number | null;
  passingMarks?: number | null;
  shuffle?: boolean;
  isPublished?: boolean;
  isRepository?: boolean;
  createdFrom?: string | null;
  createdBy?: string | null;
  createdByStudent?: string | null;
  classroomId?: string | null;
  /** Where this test is filed in the library. null means Unfiled. */
  folderId?: string | null;
  /**
   * How many of the test's questions one sitting is served. Omit to serve all
   * of them, which is what every test did before pools existed. Setting it
   * below the question count turns the test into a pool: each attempt draws its
   * own window, so a retry is mostly questions the student has not seen.
   */
  questionsToServe?: number | null;
  /**
   * What the author had filtered when they pressed Create. Stored verbatim, never
   * derived: a null here means "nobody recorded this", which is a different and
   * stronger statement than "they had no filters set". See
   * test-provenance.ts and migration 20260824090000.
   */
  sourceFilters?: NexusTestSourceFilters | null;
}

/**
 * Create a test as a composition of bank questions (references, not copies).
 * Shared by the student custom-test builder and the teacher repository builder.
 */
export async function composeTest(
  input: ComposeTestInput,
  client?: TypedSupabaseClient,
): Promise<{ id: string }> {
  const supabase = client || getSupabaseAdminClient();
  const ids = [...new Set(input.questionIds)];
  if (ids.length === 0) throw new Error('A test needs at least one question');

  // Validate all questions exist and are active in the bank.
  const { data: existing, error: qErr } = await supabase
    .from('nexus_qb_questions')
    .select('id')
    .in('id', ids)
    .eq('is_active', true);
  if (qErr) throw qErr;
  const valid = new Set((existing || []).map((q: any) => q.id));
  const invalid = ids.filter((id) => !valid.has(id));
  if (invalid.length > 0) throw new Error(`Invalid or inactive question ids: ${invalid.join(', ')}`);

  const marksFor = (i: number): number => {
    if (Array.isArray(input.marks)) return Number(input.marks[i]) || 1;
    if (typeof input.marks === 'number') return input.marks;
    return 1;
  };
  // Zero by default, which is what every existing caller gets and what every
  // existing row already holds. A negative value is normalised to its
  // magnitude: the column is the size of the penalty, and storing -1 here would
  // make a wrong answer ADD a mark at grading time.
  const negativeFor = (i: number): number => {
    const raw = Array.isArray(input.negativeMarks) ? input.negativeMarks[i] : input.negativeMarks;
    const n = Number(raw);
    return Number.isFinite(n) ? Math.abs(n) : 0;
  };
  const totalMarks = ids.reduce((sum, _id, i) => sum + marksFor(i), 0);

  const { data: test, error: testErr } = await supabase
    .from(TESTS)
    .insert({
      classroom_id: input.classroomId ?? null,
      title: input.title.trim(),
      description: input.description ?? null,
      test_type: testTypeFromTimer(input.timerType),
      duration_minutes: input.timerType === 'full' ? input.durationMinutes ?? null : null,
      per_question_seconds: input.timerType === 'per_question' ? input.perQuestionSeconds ?? null : null,
      total_marks: totalMarks,
      passing_marks: input.passingMarks ?? null,
      is_published: input.isPublished ?? true,
      is_active: true,
      is_repository: input.isRepository ?? false,
      test_kind: input.testKind,
      created_from: input.createdFrom ?? null,
      shuffle_questions: input.shuffle ?? false,
      is_custom: !input.isRepository,
      created_by: input.createdBy ?? null,
      created_by_student: input.createdByStudent ?? null,
      folder_id: input.folderId ?? null,
      // Clamped rather than trusted: a serve count above the question count is
      // the same as serving everything, and storing it that way would make the
      // teacher's "40 of 20" read back as a pool it is not.
      questions_to_serve:
        typeof input.questionsToServe === 'number' && input.questionsToServe > 0
          ? Math.min(Math.floor(input.questionsToServe), ids.length)
          : null,
      source_filters: input.sourceFilters ?? null,
    })
    .select('id')
    .single();
  if (testErr) throw testErr;

  const rows = ids.map((qId, i) => ({
    test_id: test.id,
    qb_question_id: qId,
    sort_order: i,
    marks: marksFor(i),
    negative_marks: negativeFor(i),
  }));
  const { error: tqErr } = await supabase.from(TEST_QUESTIONS).insert(rows);
  if (tqErr) throw tqErr;

  // Describe the paper now that its questions exist. Best-effort on purpose:
  // storeContentSummary swallows its own failure, because a paper the author
  // successfully built must never fail to be created just because a description
  // could not be written for it. The column is nullable and recomputable
  // exactly so this can be the trade.
  await storeContentSummary(test.id, client);

  return { id: test.id };
}

/**
 * Which hub group a stored kind belongs in.
 *
 * 'content_gate' never reaches here: those tests are filed by their placement
 * context instead, because one kind covers four different homes.
 *
 * hasClassroom is the legacy fallback. A pre-taxonomy row with a classroom_id and
 * no placement is a classroom test, and the column default preserves that.
 */
function groupKeyForKind(kind: NexusTestKind, hasClassroom: boolean): NexusTestOverviewGroupKey {
  switch (kind) {
    case 'class_prep':
      return 'class_prep';
    case 'catchup_class':
      return 'catchup';
    case 'practice_pool':
      return 'practice_pool';
    case 'weekly':
      return 'weekly';
    case 'mock':
      return 'mock';
    case 'full':
      return 'full';
    case 'chapter':
      return 'chapter';
    case 'student_custom':
      // A student's own paper is not staff work. It lands in the drafts bucket
      // rather than pretending a teacher set it.
      return 'practice';
    case 'classroom_assigned':
      return hasClassroom ? 'classroom' : 'practice';
    default:
      return 'practice';
  }
}

/** List repository tests (optionally by author), newest first. */
export async function listRepositoryTests(
  opts?: { createdBy?: string },
  client?: TypedSupabaseClient,
): Promise<any[]> {
  const supabase = client || getSupabaseAdminClient();
  let query = supabase
    .from(TESTS)
    .select('id, title, description, test_type, total_marks, passing_marks, is_published, created_from, created_at')
    .eq('is_repository', true)
    .eq('is_active', true)
    .order('created_at', { ascending: false });
  if (opts?.createdBy) query = query.eq('created_by', opts.createdBy);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export interface NexusPlacementLabel {
  label: string;
  /** study_file only: the file id, for the deep link back into Study Materials. */
  file_id?: string | null;
}

/**
 * Human labels for a batch of placements, keyed `${context_type}:${context_id}`.
 *
 * context_id is polymorphic with no FK, so every context type needs its own
 * lookup. Batched per type rather than per row: a library page showing 50 tests
 * would otherwise fire 50 round trips to render one column.
 *
 * NOTE: listTestsGroupedByContext below resolves the same labels inline, because
 * it additionally needs each study file's folder to build its sub-groups. If you
 * change a label's wording, change it in both places.
 */
export async function resolvePlacementLabels(
  placements: Array<{ context_type: string; context_id: string }>,
  client?: TypedSupabaseClient,
): Promise<Map<string, NexusPlacementLabel>> {
  const supabase = client || getSupabaseAdminClient();
  const out = new Map<string, NexusPlacementLabel>();
  if (placements.length === 0) return out;

  const idsFor = (ctx: string) => [
    ...new Set(placements.filter((p) => p.context_type === ctx).map((p) => p.context_id)),
  ];
  const set = (ctx: string, id: string, value: NexusPlacementLabel) => out.set(`${ctx}:${id}`, value);

  const fileIds = idsFor('study_file');
  if (fileIds.length > 0) {
    const { data } = await supabase.from('nexus_study_files').select('id, title').in('id', fileIds);
    for (const f of data || []) set('study_file', f.id, { label: f.title || 'Chapter', file_id: f.id });
  }

  const classroomIds = [...new Set([...idsFor('classroom_assignment'), ...idsFor('student_practice')])];
  if (classroomIds.length > 0) {
    const { data } = await supabase.from('nexus_classrooms').select('id, name').in('id', classroomIds);
    for (const c of data || []) {
      set('classroom_assignment', c.id, { label: c.name || 'Classroom' });
      set('student_practice', c.id, { label: c.name || 'Classroom' });
    }
  }

  // Both of these point context_id at a scheduled class, so they share a lookup.
  const classIds = [...new Set([...idsFor('class_prep_test'), ...idsFor('catchup_class')])];
  if (classIds.length > 0) {
    const { data } = await supabase
      .from('nexus_scheduled_classes')
      .select('id, title, scheduled_date')
      .in('id', classIds);
    for (const c of data || []) {
      const day = c.scheduled_date
        ? new Date(`${String(c.scheduled_date).slice(0, 10)}T00:00:00+05:30`).toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'short',
            timeZone: 'Asia/Kolkata',
          })
        : null;
      const label = [c.title || 'Class', day].filter(Boolean).join(', ');
      set('class_prep_test', c.id, { label });
      set('catchup_class', c.id, { label });
    }
  }

  // The three section contexts all read "{parent} · {section}".
  const sectionSources: Array<{ ctx: string; table: string; parentCol: string; parentTable: string }> = [
    { ctx: 'foundation_section', table: 'nexus_foundation_sections', parentCol: 'chapter_id', parentTable: 'nexus_foundation_chapters' },
    { ctx: 'module_item', table: 'nexus_module_item_sections', parentCol: 'module_item_id', parentTable: 'nexus_module_items' },
    { ctx: 'class_recap_section', table: 'nexus_class_recap_sections', parentCol: 'recap_id', parentTable: 'nexus_class_recaps' },
  ];
  for (const src of sectionSources) {
    const ids = idsFor(src.ctx);
    if (ids.length === 0) continue;
    const { data: secs } = await supabase
      .from(src.table)
      .select(`id, title, ${src.parentCol}`)
      .in('id', ids);
    const parentIds = [...new Set((secs || []).map((s: any) => s[src.parentCol]).filter(Boolean))];
    const parentMap = new Map<string, string>();
    if (parentIds.length > 0) {
      const { data: parents } = await supabase.from(src.parentTable).select('id, title').in('id', parentIds);
      for (const p of parents || []) parentMap.set(p.id, p.title);
    }
    for (const s of secs || []) {
      const parent = (s as any)[src.parentCol] ? parentMap.get((s as any)[src.parentCol]) : null;
      set(src.ctx, s.id, { label: parent ? `${parent} · ${s.title}` : s.title });
    }
  }

  return out;
}

export interface LibraryTestFilter {
  scope: NexusTestFolderScope;
  /** Required when scope is 'student'. */
  ownerId?: string | null;
  /**
   * undefined = every folder, null = Unfiled only, a string = that folder.
   * Independent of `search`: a picker searching the whole library simply omits it.
   */
  folderId?: string | null;
  search?: string;
  kinds?: NexusTestKind[];
  /** Teachers see their own drafts; a picker for students should not. */
  includeUnpublished?: boolean;
  limit?: number;
  offset?: number;
}

/**
 * The test library listing: what the hub's Library tab and every picker read.
 *
 * Scope splits staff work from a student's own papers on created_by_student,
 * which composeTest already stamps, so a teacher browsing the shared library
 * never trips over 200 student practice sets.
 */
export async function listLibraryTests(
  filter: LibraryTestFilter,
  client?: TypedSupabaseClient,
): Promise<{ tests: NexusLibraryTest[]; total: number }> {
  const supabase = client || getSupabaseAdminClient();
  if (filter.scope === 'student' && !filter.ownerId) throw new Error('A student library needs an ownerId');

  const limit = Math.min(Math.max(filter.limit ?? 50, 1), 200);
  const offset = Math.max(filter.offset ?? 0, 0);

  let query = supabase
    .from(TESTS)
    .select(
      'id, title, description, folder_id, test_kind, test_type, total_marks, passing_marks, is_published, created_by, created_by_student, created_at, classroom_id',
      { count: 'exact' },
    )
    .eq('is_active', true);

  query =
    filter.scope === 'student'
      ? query.eq('created_by_student', filter.ownerId)
      : query.is('created_by_student', null);

  if (filter.folderId !== undefined) {
    query = filter.folderId === null ? query.is('folder_id', null) : query.eq('folder_id', filter.folderId);
  }
  if (filter.search && filter.search.trim()) {
    // Escape the PostgREST wildcards so a title search for "50%" does not
    // quietly become "match anything".
    const term = filter.search.trim().replace(/[%_]/g, (m) => `\\${m}`);
    query = query.ilike('title', `%${term}%`);
  }
  if (filter.kinds && filter.kinds.length > 0) query = query.in('test_kind', filter.kinds);
  if (!filter.includeUnpublished) query = query.eq('is_published', true);

  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw error;

  const rows = data || [];
  if (rows.length === 0) return { tests: [], total: count || 0 };
  const testIds = rows.map((t: any) => t.id);

  // Paged to exhaustion, never `.range(0, 100000)`: PostgREST caps a response at
  // 1000 rows regardless of the range asked for, so the old one-shot read tallied
  // a page and called it a count. See utils/paged-rows.ts.
  const [qCount, aCount, { data: placementRows }] = await Promise.all([
    countRowsByKey(() => supabase.from(TEST_QUESTIONS).select('test_id').in('test_id', testIds), 'test_id'),
    countRowsByKey(() => supabase.from(ATTEMPTS).select('test_id').in('test_id', testIds), 'test_id'),
    supabase
      .from(PLACEMENTS)
      .select('test_id, context_type, context_id, sort_order')
      .in('test_id', testIds)
      .eq('is_active', true)
      .order('sort_order', { ascending: true }),
  ]);

  const labels = await resolvePlacementLabels(placementRows || [], supabase);
  const placementsByTest = new Map<string, NexusLibraryTest['placements']>();
  for (const p of placementRows || []) {
    const entry = {
      context_type: p.context_type as NexusPlacementContext,
      context_label: labels.get(`${p.context_type}:${p.context_id}`)?.label ?? null,
    };
    placementsByTest.set(p.test_id, [...(placementsByTest.get(p.test_id) || []), entry]);
  }

  const tests: NexusLibraryTest[] = rows.map((t: any) => ({
    id: t.id,
    title: t.title || 'Untitled test',
    description: t.description ?? null,
    folder_id: t.folder_id ?? null,
    test_kind: (t.test_kind as NexusTestKind) ?? 'classroom_assigned',
    test_type: t.test_type || 'untimed',
    total_marks: t.total_marks ?? null,
    passing_marks: t.passing_marks ?? null,
    is_published: !!t.is_published,
    created_by: t.created_by ?? null,
    created_by_student: t.created_by_student ?? null,
    created_at: t.created_at,
    question_count: qCount.get(t.id) || 0,
    attempt_count: aCount.get(t.id) || 0,
    placements: placementsByTest.get(t.id) || [],
  }));

  return { tests, total: count || 0 };
}

/**
 * Every active test, categorized by where it is placed / what it is linked to, for the
 * teacher "Tests" hub. Resolves study_file placements to their chapter (file) + folder name
 * (app-level batched join, context_id is polymorphic with no FK) and classroom names, so the
 * flat undifferentiated test list becomes legible groups: Study chapters, Recaps, Foundation,
 * Modules, Classroom, Practice/Drafts.
 */
export async function listTestsGroupedByContext(
  client?: TypedSupabaseClient,
): Promise<NexusTestOverviewGroup[]> {
  const supabase = client || getSupabaseAdminClient();

  // 1. All active tests (repository + legacy classroom-scoped).
  const { data: tests, error: tErr } = await supabase
    .from(TESTS)
    .select('id, title, test_type, total_marks, is_published, is_repository, test_kind, created_from, created_at, classroom_id')
    .eq('is_active', true)
    .order('created_at', { ascending: false });
  if (tErr) throw tErr;
  const testList = tests || [];
  if (testList.length === 0) return [];
  const testIds = testList.map((t: any) => t.id);

  // 2. Primary active placement per test (lowest sort_order wins).
  const { data: placements } = await supabase
    .from(PLACEMENTS)
    .select('test_id, context_type, context_id, sort_order')
    .in('test_id', testIds)
    .eq('is_active', true)
    .order('sort_order', { ascending: true });
  const placementByTest = new Map<string, any>();
  for (const p of placements || []) {
    if (!placementByTest.has(p.test_id)) placementByTest.set(p.test_id, p);
  }

  // 3. Question + attempt counts. Read to exhaustion rather than in one 100k
  // range: PostgREST truncates at 1000 rows and reports no error, which turned
  // this hub's counts into a tally of whichever page happened to arrive.
  const qCount = await countRowsByKey(
    () => supabase.from(TEST_QUESTIONS).select('test_id').in('test_id', testIds),
    'test_id',
  );
  const aCount = await countRowsByKey(
    () => supabase.from(ATTEMPTS).select('test_id').in('test_id', testIds),
    'test_id',
  );

  // 4. Resolve context names. study_file -> file title + folder; classroom_assignment / legacy -> name.
  const studyFileIds = [
    ...new Set((placements || []).filter((p: any) => p.context_type === 'study_file').map((p: any) => p.context_id)),
  ];
  const fileMap = new Map<string, { title: string; folder_id: string }>();
  const folderNameMap = new Map<string, string>();
  if (studyFileIds.length > 0) {
    const { data: files } = await supabase
      .from('nexus_study_files')
      .select('id, title, folder_id')
      .in('id', studyFileIds);
    for (const f of files || []) fileMap.set(f.id, { title: f.title, folder_id: f.folder_id });
    const folderIds = [...new Set((files || []).map((f: any) => f.folder_id).filter(Boolean))];
    if (folderIds.length > 0) {
      const { data: folders } = await supabase.from('nexus_study_folders').select('id, name').in('id', folderIds);
      for (const fo of folders || []) folderNameMap.set(fo.id, fo.name);
    }
  }
  const classroomIds = new Set<string>();
  for (const p of placements || []) {
    if (p.context_type === 'classroom_assignment' || p.context_type === 'student_practice') {
      classroomIds.add(p.context_id);
    }
  }
  for (const t of testList) if (t.classroom_id) classroomIds.add(t.classroom_id);
  const classroomNameMap = new Map<string, string>();
  if (classroomIds.size > 0) {
    const { data: crs } = await supabase.from('nexus_classrooms').select('id, name').in('id', [...classroomIds]);
    for (const c of crs || []) classroomNameMap.set(c.id, c.name);
  }

  // class_prep_test, class_test and catchup_class all point context_id at a
  // scheduled class, so all three label as "{title}, {date}". Before test_kind
  // these contexts matched no branch and were silently filed as generic
  // classroom tests.
  const CLASS_SCOPED_CONTEXTS = new Set(['class_prep_test', 'class_test', 'catchup_class']);
  const classCtxIds = [
    ...new Set(
      (placements || [])
        .filter((p: any) => CLASS_SCOPED_CONTEXTS.has(p.context_type))
        .map((p: any) => p.context_id),
    ),
  ];
  const classLabelMap = new Map<string, string>();
  if (classCtxIds.length > 0) {
    const { data: rows } = await supabase
      .from('nexus_scheduled_classes')
      .select('id, title, scheduled_date')
      .in('id', classCtxIds);
    for (const c of rows || []) {
      const day = c.scheduled_date
        ? new Date(`${String(c.scheduled_date).slice(0, 10)}T00:00:00+05:30`).toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'short',
            timeZone: 'Asia/Kolkata',
          })
        : null;
      classLabelMap.set(c.id, [c.title || 'Class', day].filter(Boolean).join(', '));
    }
  }

  // Section names for the remaining contexts. context_id is the SECTION id in all
  // three (the backfill placed per quiz-question section_id): foundation_section ->
  // nexus_foundation_sections, module_item -> nexus_module_item_sections,
  // class_recap_section -> nexus_class_recap_sections. Labels read "{parent} · {section}".
  const ctxIds = (ctx: string) => [
    ...new Set((placements || []).filter((p: any) => p.context_type === ctx).map((p: any) => p.context_id)),
  ];
  const sectionLabelMap = new Map<string, string>();
  const foundationSecIds = ctxIds('foundation_section');
  if (foundationSecIds.length > 0) {
    const { data: secs } = await supabase
      .from('nexus_foundation_sections')
      .select('id, title, chapter_id')
      .in('id', foundationSecIds);
    const chapterIds = [...new Set((secs || []).map((s: any) => s.chapter_id).filter(Boolean))];
    const chapterMap = new Map<string, string>();
    if (chapterIds.length > 0) {
      const { data: chs } = await supabase.from('nexus_foundation_chapters').select('id, title').in('id', chapterIds);
      for (const c of chs || []) chapterMap.set(c.id, c.title);
    }
    for (const s of secs || []) {
      const parent = s.chapter_id ? chapterMap.get(s.chapter_id) : null;
      sectionLabelMap.set(s.id, parent ? `${parent} · ${s.title}` : s.title);
    }
  }
  const moduleSecIds = ctxIds('module_item');
  if (moduleSecIds.length > 0) {
    const { data: secs } = await supabase
      .from('nexus_module_item_sections')
      .select('id, title, module_item_id')
      .in('id', moduleSecIds);
    const itemIds = [...new Set((secs || []).map((s: any) => s.module_item_id).filter(Boolean))];
    const itemMap = new Map<string, string>();
    if (itemIds.length > 0) {
      const { data: items } = await supabase.from('nexus_module_items').select('id, title').in('id', itemIds);
      for (const i of items || []) itemMap.set(i.id, i.title);
    }
    for (const s of secs || []) {
      const parent = s.module_item_id ? itemMap.get(s.module_item_id) : null;
      sectionLabelMap.set(s.id, parent ? `${parent} · ${s.title}` : s.title);
    }
  }
  const recapSecIds = ctxIds('class_recap_section');
  if (recapSecIds.length > 0) {
    const { data: secs } = await supabase
      .from('nexus_class_recap_sections')
      .select('id, title, recap_id')
      .in('id', recapSecIds);
    const recapIds = [...new Set((secs || []).map((s: any) => s.recap_id).filter(Boolean))];
    const recapMap = new Map<string, string>();
    if (recapIds.length > 0) {
      const { data: recaps } = await supabase
        .from('nexus_class_recaps')
        .select('id, title, scheduled_class_id')
        .in('id', recapIds);
      // A recap's stored title is a snapshot taken when its row was created, so
      // a class renamed since then would label its questions with the old Teams
      // meeting subject. Same rule as withClassTitles in class-recaps.ts.
      const classIds = [
        ...new Set((recaps || []).map((r: any) => r.scheduled_class_id).filter(Boolean)),
      ];
      const classTitles = new Map<string, string>();
      if (classIds.length > 0) {
        const { data: classes } = await supabase
          .from('nexus_scheduled_classes')
          .select('id, title')
          .in('id', classIds);
        for (const c of classes || []) if (c.title) classTitles.set(c.id, c.title);
      }
      for (const r of recaps || []) {
        recapMap.set(r.id, (r.scheduled_class_id && classTitles.get(r.scheduled_class_id)) || r.title);
      }
    }
    for (const s of secs || []) {
      const parent = s.recap_id ? recapMap.get(s.recap_id) : null;
      sectionLabelMap.set(s.id, parent ? `${parent} · ${s.title}` : s.title);
    }
  }

  // 5. Group each test by its STORED kind, then use the placement only to
  //    resolve a human label.
  //
  //    Grouping used to be inferred from the placement context, which had two
  //    silent failures: catchup_class and student_practice matched no branch, so
  //    every catch-up test and every teacher-offered practice pool was labelled a
  //    "Classroom test". nexus_tests.test_kind answers the question directly.
  //
  //    The four content contexts still route through the placement, because their
  //    kind is one value ('content_gate') covering four different homes, and a
  //    teacher needs to know which.
  const GROUP_ORDER: { key: NexusTestOverviewGroupKey; label: string }[] = [
    { key: 'class_prep', label: 'Before class' },
    { key: 'class_test', label: 'After class' },
    { key: 'study_materials', label: 'Study Materials' },
    { key: 'class_recaps', label: 'Class Recaps' },
    { key: 'foundation', label: 'Foundation' },
    { key: 'modules', label: 'Modules' },
    { key: 'classroom', label: 'Classroom tests' },
    { key: 'catchup', label: 'Catch-up class tests' },
    { key: 'weekly', label: 'Weekly tests' },
    { key: 'chapter', label: 'Chapter tests' },
    { key: 'mock', label: 'Model tests' },
    { key: 'full', label: 'Full tests' },
    { key: 'practice_pool', label: 'Practice pool' },
    { key: 'practice', label: 'Practice / Drafts' },
  ];
  const flat = new Map<NexusTestOverviewGroupKey, NexusOverviewTest[]>();
  // study_materials sub-grouped by folder id.
  const studySub = new Map<string, { label: string; tests: NexusOverviewTest[] }>();

  for (const t of testList) {
    const p = placementByTest.get(t.id);
    const base: NexusOverviewTest = {
      id: t.id,
      title: t.title || 'Untitled test',
      test_type: t.test_type || 'untimed',
      total_marks: t.total_marks ?? null,
      is_published: !!t.is_published,
      created_from: t.created_from ?? null,
      created_at: t.created_at,
      question_count: qCount.get(t.id) || 0,
      attempt_count: aCount.get(t.id) || 0,
      test_kind: (t.test_kind as NexusTestKind) ?? 'classroom_assigned',
      context_type: (p?.context_type as NexusPlacementContext) ?? null,
      context_label: null,
      file_id: null,
    };

    const ctx = p?.context_type as NexusPlacementContext | undefined;

    // A content mirror is filed by WHERE it lives, because 'content_gate' covers
    // four different homes and the teacher needs to know which one.
    if (ctx === 'study_file') {
      const f = fileMap.get(p.context_id);
      base.context_label = f?.title || 'Chapter';
      base.file_id = p.context_id;
      const folderKey = f?.folder_id || 'other';
      const folderLabel = (f && folderNameMap.get(f.folder_id)) || 'Study Materials';
      if (!studySub.has(folderKey)) studySub.set(folderKey, { label: folderLabel, tests: [] });
      studySub.get(folderKey)!.tests.push(base);
      continue;
    }
    if (ctx === 'class_recap_section') {
      base.context_label = sectionLabelMap.get(p.context_id) || null;
      pushFlat(flat, 'class_recaps', base);
      continue;
    }
    if (ctx === 'foundation_section') {
      base.context_label = sectionLabelMap.get(p.context_id) || null;
      pushFlat(flat, 'foundation', base);
      continue;
    }
    if (ctx === 'module_item') {
      base.context_label = sectionLabelMap.get(p.context_id) || null;
      pushFlat(flat, 'modules', base);
      continue;
    }

    // A class test files by its CONTEXT rather than its kind, the way the four
    // content contexts do. Its kind is deliberately the ordinary
    // 'classroom_assigned' so the normal take engine serves it, which means the
    // kind alone cannot tell it apart from a plain classroom test.
    if (ctx === 'class_test') {
      base.context_label = classLabelMap.get(p.context_id) || 'A class';
      pushFlat(flat, 'class_test', base);
      continue;
    }

    // Everything else groups on the stored kind.
    if (ctx === 'class_prep_test') {
      base.context_label = classLabelMap.get(p.context_id) || 'A class';
    } else if (ctx === 'catchup_class') {
      base.context_label = classLabelMap.get(p.context_id) || 'A class';
    } else if (ctx === 'classroom_assignment' || ctx === 'student_practice') {
      base.context_label = classroomNameMap.get(p.context_id) || 'Classroom';
    } else if (t.classroom_id) {
      base.context_label = classroomNameMap.get(t.classroom_id) || 'Classroom';
    }

    pushFlat(flat, groupKeyForKind(base.test_kind, !!t.classroom_id), base);
  }

  const groups: NexusTestOverviewGroup[] = [];
  for (const g of GROUP_ORDER) {
    if (g.key === 'study_materials') {
      if (studySub.size === 0) continue;
      const subgroups = [...studySub.values()]
        .sort((a, b) => a.label.localeCompare(b.label))
        .map((s) => ({ key: s.label, label: s.label, tests: s.tests }));
      const count = subgroups.reduce((n, s) => n + s.tests.length, 0);
      groups.push({ key: g.key, label: g.label, count, subgroups, tests: subgroups.flatMap((s) => s.tests) });
    } else {
      const tests = flat.get(g.key) || [];
      if (tests.length === 0) continue;
      groups.push({ key: g.key, label: g.label, count: tests.length, tests });
    }
  }
  return groups;
}

function pushFlat(
  map: Map<NexusTestOverviewGroupKey, NexusOverviewTest[]>,
  key: NexusTestOverviewGroupKey,
  test: NexusOverviewTest,
): void {
  if (!map.has(key)) map.set(key, []);
  map.get(key)!.push(test);
}

/**
 * Load a test's questions resolving both bank (qb_question_id) and legacy
 * verified (question_id) references. withAnswers=true includes the correct answer.
 */
export async function getComposedTestQuestions(
  testId: string,
  withAnswers: boolean,
  client?: TypedSupabaseClient,
): Promise<NexusComposedQuestionWithAnswer[]> {
  const supabase = client || getSupabaseAdminClient();
  const { data: tqs, error } = await supabase
    .from(TEST_QUESTIONS)
    .select('id, qb_question_id, question_id, marks, sort_order')
    .eq('test_id', testId)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  const list = tqs || [];
  if (list.length === 0) return [];

  const qbIds = list.filter((t: any) => t.qb_question_id).map((t: any) => t.qb_question_id);
  const vIds = list.filter((t: any) => !t.qb_question_id && t.question_id).map((t: any) => t.question_id);

  const qbMap = new Map<string, any>();
  if (qbIds.length > 0) {
    const { data } = await supabase
      .from('nexus_qb_questions')
      // answer_tolerance is load-bearing for NUMERICAL. Without it the grader
      // fell back to an exact compare, so a question keyed 3.1416 with a 0.01
      // tolerance marked 3.14 wrong and the tolerance was silently ignored.
      //
      // The explanations are the reason a student sits a practice test at all.
      // They were missing from this select while the review UI rendered them,
      // so every attempt in the product showed a blank explanation.
      .select(
        'id, question_text, question_image_url, question_format, options, correct_answer, answer_tolerance, explanation_brief, explanation_detailed',
      )
      .in('id', qbIds);
    for (const q of data || []) qbMap.set(q.id, q);
  }
  const vMap = new Map<string, any>();
  if (vIds.length > 0) {
    const { data } = await supabase
      .from('nexus_verified_questions')
      .select('id, question_text, question_image_url, question_type, options, correct_answer, explanation')
      .in('id', vIds);
    for (const q of data || []) vMap.set(q.id, q);
  }

  return list.map((tq: any) => {
    const src = tq.qb_question_id ? qbMap.get(tq.qb_question_id) : vMap.get(tq.question_id);
    const questionId = tq.qb_question_id || tq.question_id;
    const out: any = {
      test_question_id: tq.id,
      question_id: questionId,
      question_text: src?.question_text ?? null,
      question_image_url: src?.question_image_url ?? null,
      // Normalised here so every consumer sees one vocabulary. Legacy verified
      // questions carry a lowercase question_type, and the take page needs a
      // reliable value to decide between option cards and a numeric input.
      question_format: normaliseQuestionFormat(src?.question_format || src?.question_type),
      options: src?.options ?? null,
      marks: Number(tq.marks) || 1,
      sort_order: tq.sort_order ?? 0,
    };
    if (withAnswers) {
      out.correct_answer = src?.correct_answer ?? null;
      // Answer key material. Only ever attached on the grading path, never in a
      // student payload: the tolerance narrows the search space for a guesser.
      out.answer_tolerance = src?.answer_tolerance ?? null;
      // Legacy verified questions carry a single `explanation`; bank questions
      // carry a brief/detailed pair. Normalised here so the review payload has
      // one vocabulary whichever table the question came from.
      out.explanation_brief = src?.explanation_brief ?? src?.explanation ?? null;
      out.explanation_detailed = src?.explanation_detailed ?? null;
    }
    return out;
  });
}

/* ─────────────────────────── PER-ATTEMPT DRAWS ──────────────────────────── */

export interface NexusTestDraw {
  attempt_number: number;
  /** Exactly the questions served, in the order served. */
  question_ids: string[];
  /** { questionId: original option ids in displayed order }. */
  option_maps: Record<string, string[]>;
}

/**
 * The next attempt number this student would sit.
 *
 * Needed by surfaces that serve a paper before an attempt row exists (a study
 * chapter test is fetched on a GET and only writes an attempt when the answers
 * arrive), so the draw can be pinned to the sitting the student is about to
 * take rather than to the one they last finished.
 */
export async function nextAttemptNumber(
  testId: string,
  studentId: string,
  client?: TypedSupabaseClient,
): Promise<number> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from(ATTEMPTS)
    .select('attempt_number, status')
    .eq('test_id', testId)
    .eq('student_id', studentId)
    .order('attempt_number', { ascending: false })
    .limit(1);
  if (error) throw error;
  const latest = (data || [])[0];
  if (!latest) return 1;
  // An attempt still open IS the sitting in progress, so it keeps its number.
  // Anything else has been submitted or abandoned and the next go is a new one.
  return latest.status === 'in_progress'
    ? Number(latest.attempt_number) || 1
    : (Number(latest.attempt_number) || 0) + 1;
}

export async function getTestDraw(
  testId: string,
  studentId: string,
  attemptNumber: number,
  client?: TypedSupabaseClient,
): Promise<NexusTestDraw | null> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from(DRAWS)
    .select('attempt_number, question_ids, option_maps')
    .eq('test_id', testId)
    .eq('student_id', studentId)
    .eq('attempt_number', attemptNumber)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    attempt_number: Number(data.attempt_number) || attemptNumber,
    question_ids: (data.question_ids as string[]) || [],
    option_maps: (data.option_maps as Record<string, string[]>) || {},
  };
}

/**
 * The draw for one sitting, computed and stored the first time it is asked for.
 *
 * Returns null when the test is not a pool, which leaves every existing test on
 * exactly the path it was on before draws existed.
 *
 * Storing rather than recomputing is the point. The pick is deterministic on
 * (student, test, attempt number), but the pool it picks FROM is not: a teacher
 * who edits the paper between a student opening it and submitting it would
 * otherwise change the questions under them mid-attempt, and the grade would be
 * computed against a paper they never saw.
 */
export async function ensureTestDraw(
  input: {
    testId: string;
    studentId: string;
    attemptNumber: number;
    questions: NexusComposedQuestion[];
    /** From nexus_tests.questions_to_serve. null or >= the pool size means no draw. */
    serve: number | null | undefined;
  },
  client?: TypedSupabaseClient,
): Promise<NexusTestDraw | null> {
  const serve = Number(input.serve);
  if (!Number.isFinite(serve) || serve <= 0 || serve >= input.questions.length) return null;

  const existing = await getTestDraw(input.testId, input.studentId, input.attemptNumber, client);
  if (existing) return existing;

  const supabase = client || getSupabaseAdminClient();
  const seed = testDrawSeed(input.studentId, input.testId);
  const questionIds = pickTestDraw(
    input.questions.map((q) => q.question_id),
    serve,
    input.attemptNumber,
    seed,
  );
  const drawn = input.questions.filter((q) => questionIds.includes(q.question_id));
  const optionMaps = buildTestOptionMaps(drawn, input.attemptNumber, seed);

  const { error } = await supabase.from(DRAWS).insert({
    test_id: input.testId,
    student_id: input.studentId,
    attempt_number: input.attemptNumber,
    question_ids: questionIds,
    option_maps: optionMaps,
  });

  if (error) {
    // Two tabs opened the same paper at once. The pick is deterministic, so the
    // row that won is the one this call would have written; read it back rather
    // than failing a student who did nothing wrong.
    if ((error as any).code === '23505') {
      const raced = await getTestDraw(input.testId, input.studentId, input.attemptNumber, supabase);
      if (raced) return raced;
    }
    throw error;
  }

  return { attempt_number: input.attemptNumber, question_ids: questionIds, option_maps: optionMaps };
}

/**
 * Attach the attempt row to its draw, once the attempt exists.
 *
 * Best-effort by design: the draw is found by (test, student, attempt number)
 * on every read, and attempt_id is only there so an attempt can be traced back
 * to the paper it was sat under. Failing the submit over a reporting column
 * would be the wrong trade.
 */
async function stampDrawWithAttempt(
  testId: string,
  studentId: string,
  attemptNumber: number,
  attemptId: string,
  supabase: TypedSupabaseClient,
): Promise<void> {
  const { error } = await supabase
    .from(DRAWS)
    .update({ attempt_id: attemptId })
    .eq('test_id', testId)
    .eq('student_id', studentId)
    .eq('attempt_number', attemptNumber)
    .is('attempt_id', null);
  if (error) console.error('Could not attach the attempt to its draw:', error.message);
}

/**
 * Cut a composed paper down to one draw: the drawn questions, in the drawn
 * order, with their options permuted and relabelled.
 *
 * A drawn id the test no longer holds is skipped rather than served empty,
 * which is what happens when a teacher removes a question mid-attempt.
 */
export function applyTestDraw<T extends NexusComposedQuestion>(questions: T[], draw: NexusTestDraw | null): T[] {
  if (!draw) return questions;
  const byId = new Map(questions.map((q) => [q.question_id, q]));
  const out: T[] = [];
  draw.question_ids.forEach((id, index) => {
    const q = byId.get(id);
    if (!q) return;
    out.push({ ...applyTestOptionMap(q, draw.option_maps?.[id]), sort_order: index });
  });
  return out;
}

/**
 * A test's questions as one student should see them for their next sitting:
 * drawn, permuted and answer-free.
 *
 * For surfaces that hand over a whole paper at once and grade it in a single
 * later call. The timed take page goes through startOrResumeAttempt instead,
 * which returns the same paper alongside the attempt row.
 */
export async function getServedTestQuestions(
  testId: string,
  studentId: string,
  client?: TypedSupabaseClient,
): Promise<NexusComposedQuestion[]> {
  const supabase = client || getSupabaseAdminClient();
  const [meta, questions] = await Promise.all([
    getTestMeta(testId, supabase),
    getComposedTestQuestions(testId, false, supabase),
  ]);
  if (!meta || questions.length === 0) return questions;

  const attemptNumber = await nextAttemptNumber(testId, studentId, supabase);
  const draw = await ensureTestDraw(
    { testId, studentId, attemptNumber, questions, serve: meta.questions_to_serve },
    supabase,
  );
  return applyTestDraw(questions, draw);
}

/** Test metadata (student-safe fields). */
export async function getTestMeta(testId: string, client?: TypedSupabaseClient): Promise<any | null> {
  const supabase = client || getSupabaseAdminClient();
  const { data } = await supabase
    .from(TESTS)
    // test_kind and folder_id were missing while the test detail page read both:
    // it seeds its type dropdown from test_kind, so every test read back as
    // 'classroom_assigned' no matter what had been stored.
    .select('id, title, description, test_type, duration_minutes, per_question_seconds, total_marks, passing_marks, is_published, is_active, shuffle_questions, is_repository, created_from, test_kind, folder_id, questions_to_serve, created_at')
    .eq('id', testId)
    .maybeSingle();
  return data || null;
}

/** Whitelisted staff edits on a test row (title/description/publish state/pass marks). */
export interface UpdateTestMetaInput {
  title?: string;
  description?: string | null;
  isPublished?: boolean;
  passingMarks?: number | null;
  /**
   * Only the teacher-chosen labels are settable here. The gated kinds and the
   * content mirrors are owned by the routes that create them, and relabelling
   * one through this path would take it out of the flow that enforces its rules.
   */
  testKind?: NexusTestKind;
}

export async function updateTestMeta(
  testId: string,
  updates: UpdateTestMetaInput,
  client?: TypedSupabaseClient,
): Promise<any | null> {
  const supabase = client || getSupabaseAdminClient();
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof updates.title === 'string' && updates.title.trim()) patch.title = updates.title.trim();
  if (updates.description !== undefined) patch.description = updates.description;
  if (typeof updates.isPublished === 'boolean') patch.is_published = updates.isPublished;
  if (updates.passingMarks !== undefined) patch.passing_marks = updates.passingMarks;
  if (updates.testKind && NEXUS_TEACHER_TEST_KINDS.some((k) => k.value === updates.testKind)) {
    patch.test_kind = updates.testKind;
  }
  const { data, error } = await supabase.from(TESTS).update(patch).eq('id', testId).select('*').maybeSingle();
  if (error) throw error;
  return data || null;
}

/**
 * The patch that marks a test deleted.
 *
 * `is_active = false` is the delete; the other two columns are the receipt.
 * Without them a teacher who clears forty student papers leaves no trace of who
 * did it or when, and "put that back" has nothing to select on: every test that
 * was never activated looks identical to one deleted a minute ago.
 */
function deletePatch(deletedBy?: string | null): Record<string, unknown> {
  return { is_active: false, deleted_at: new Date().toISOString(), deleted_by: deletedBy ?? null };
}

/** Soft-delete a test: deactivates the row AND its placements (frees single-test contexts). */
export async function softDeleteTest(
  testId: string,
  deletedBy?: string | null,
  client?: TypedSupabaseClient,
): Promise<void> {
  const supabase = client || getSupabaseAdminClient();
  const { error } = await supabase.from(TESTS).update(deletePatch(deletedBy)).eq('id', testId);
  if (error) throw error;
  const { error: pErr } = await supabase.from(PLACEMENTS).update({ is_active: false }).eq('test_id', testId);
  if (pErr) throw pErr;
}

/**
 * Soft-delete many tests at once, in two statements rather than two per test.
 *
 * Soft on purpose, and it matters more here than for a single delete: every
 * child of nexus_tests is ON DELETE CASCADE, so a hard bulk delete would take
 * nexus_test_attempts with it and destroy the score history of everyone who had
 * sat those papers. Flipping is_active hides them from the library and from
 * students while leaving that history intact and recoverable.
 *
 * Returns the ids actually deactivated, which is how the caller distinguishes
 * "deleted 39" from "38 of the 39 ids you sent still exist".
 */
export async function softDeleteTests(
  testIds: string[],
  deletedBy?: string | null,
  client?: TypedSupabaseClient,
): Promise<string[]> {
  const ids = [...new Set(testIds.filter((id) => typeof id === 'string' && id))];
  if (ids.length === 0) return [];

  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from(TESTS)
    .update(deletePatch(deletedBy))
    .in('id', ids)
    .select('id');
  if (error) throw error;

  const deleted = (data || []).map((r: any) => r.id as string);
  if (deleted.length === 0) return [];

  // Placements go too, so a deleted test stops occupying the single-test slot on
  // a class or a lesson and the teacher can put another one there.
  const { error: pErr } = await supabase
    .from(PLACEMENTS)
    .update({ is_active: false })
    .in('test_id', deleted);
  if (pErr) throw pErr;

  return deleted;
}

export async function countTestAttempts(testId: string, client?: TypedSupabaseClient): Promise<number> {
  const supabase = client || getSupabaseAdminClient();
  const { count, error } = await supabase
    .from(ATTEMPTS)
    .select('id', { count: 'exact', head: true })
    .eq('test_id', testId);
  if (error) throw error;
  return count || 0;
}

// ============================================
// PLACEMENTS
// ============================================

export interface CreatePlacementInput {
  testId: string;
  contextType: NexusPlacementContext;
  contextId: string;
  passingPct?: number | null;
  minQuestionsToPass?: number | null;
  sortOrder?: number;
  isVisible?: boolean;
  availableFrom?: string | null;
  availableUntil?: string | null;
  gating?: Record<string, unknown>;
  createdBy?: string | null;
}

export async function createPlacement(
  input: CreatePlacementInput,
  client?: TypedSupabaseClient,
): Promise<NexusTestPlacement> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from(PLACEMENTS)
    .insert({
      test_id: input.testId,
      context_type: input.contextType,
      context_id: input.contextId,
      passing_pct: input.passingPct ?? null,
      min_questions_to_pass: input.minQuestionsToPass ?? null,
      sort_order: input.sortOrder ?? 0,
      is_visible: input.isVisible ?? true,
      available_from: input.availableFrom ?? null,
      available_until: input.availableUntil ?? null,
      gating: input.gating ?? {},
      created_by: input.createdBy ?? null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as NexusTestPlacement;
}

/** Resolve the active placement(s) for a context. Single-test contexts return at most one. */
export async function getPlacementsByContext(
  contextType: NexusPlacementContext,
  contextId: string,
  client?: TypedSupabaseClient,
): Promise<NexusTestPlacement[]> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from(PLACEMENTS)
    .select('*')
    .eq('context_type', contextType)
    .eq('context_id', contextId)
    .eq('is_active', true)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return (data || []) as NexusTestPlacement[];
}

export async function getPlacementById(
  placementId: string,
  client?: TypedSupabaseClient,
): Promise<NexusTestPlacement | null> {
  const supabase = client || getSupabaseAdminClient();
  const { data } = await supabase.from(PLACEMENTS).select('*').eq('id', placementId).maybeSingle();
  return (data as NexusTestPlacement) || null;
}

export async function listPlacementsForTest(
  testId: string,
  client?: TypedSupabaseClient,
): Promise<NexusTestPlacement[]> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from(PLACEMENTS)
    .select('*')
    .eq('test_id', testId)
    .eq('is_active', true)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []) as NexusTestPlacement[];
}

export async function deletePlacement(placementId: string, client?: TypedSupabaseClient): Promise<void> {
  const supabase = client || getSupabaseAdminClient();
  // Soft-delete so the single-test partial-unique index frees up and history is kept.
  const { error } = await supabase.from(PLACEMENTS).update({ is_active: false }).eq('id', placementId);
  if (error) throw error;
}

// ============================================
// UNIFIED ONE-SHOT GRADER
// ============================================

/**
 * The pass mark for one attempt, resolved in ONE place.
 *
 * The placement wins, then the test's own passing_marks, then "no bar at all".
 * Exported because the class prep gate has to answer the same question, and if
 * the two ever disagreed a student would see "Passed, 82%" on the result screen
 * next to a Join button that is still locked, which reads as the app being broken
 * rather than as a rule.
 *
 * Prefer the placement. A repository test can be the prep for two classes at two
 * different bars, and updateTestMeta can change passing_marks without touching
 * either placement.
 *
 * Returns null when nothing sets a bar, which the callers must read as "passed",
 * not as "failed".
 */
export function resolvePassingPct(
  placement: { passing_pct?: number | null } | null | undefined,
  testMeta: { passing_marks?: number | null } | null | undefined,
  totalMarks: number,
): number | null {
  if (placement?.passing_pct != null) return Number(placement.passing_pct);
  if (testMeta?.passing_marks != null && totalMarks > 0) {
    return Math.round((Number(testMeta.passing_marks) / totalMarks) * 100);
  }
  return null;
}

// ============================================
// ATTEMPT LIFECYCLE + GRADING
// ============================================
//
// One grading core, one attempt lifecycle, for every surface.
//
// This used to be split in the worst possible way: the correct grader
// (numerical tolerance, non-gradable questions excluded from the denominator,
// placement side-effects) could only grade in one shot, while the route that
// owned the real attempt lifecycle (resume, autosave, timers) carried its own
// naive string-equality grader and refused a second submission outright. So the
// engine students actually used was the one that graded wrong, and "attempt a
// test as many times as you like" was impossible by construction.
//
// Everything below shares gradeComposedAnswers and dispatchPlacementSideEffect.

/** How long after the clock runs out an attempt is still resumable. */
const TIMED_GRACE_MS = 30 * 1000;
const PER_QUESTION_GRACE_MS = 60 * 1000;

export interface NexusAttemptRow {
  id: string;
  test_id: string;
  student_id: string;
  placement_id: string | null;
  attempt_number: number;
  status: string;
  /** 'official' counts towards the record; 'revision' is practice after completion. */
  mode?: 'official' | 'revision';
  answers: Record<string, string>;
  started_at: string | null;
  submitted_at: string | null;
  time_spent_seconds: number | null;
  score: number | null;
  total_marks: number | null;
  percentage: number | null;
}

/**
 * Grade answers against a composed paper. Pure: no reads, no writes.
 *
 * A question the machine cannot mark (a drawing prompt that slipped into a
 * paper) is excluded from the denominator rather than marked wrong, so one
 * stray prompt cannot make a paper unpassable, and it is never awarded marks.
 */
export function gradeComposedAnswers(
  questions: Array<NexusComposedQuestion & { correct_answer?: string | null }>,
  answers: Record<string, string>,
  passingPct: number | null,
): Omit<NexusTestGradeResult, 'attempt_id'> {
  let score = 0;
  let totalMarks = 0;

  const review = questions.map((q) => {
    const marks = Number(q.marks) || 1;
    const selected = answers?.[q.question_id] ?? null;
    const verdict = gradeQBAnswerStrict(
      q.question_format,
      selected,
      q.correct_answer,
      (q as any).answer_tolerance,
    );
    const gradable = verdict !== null;
    if (gradable) totalMarks += marks;

    const isCorrect = verdict === true;
    if (isCorrect) score += marks;
    return {
      question_id: q.question_id,
      correct_answer: q.correct_answer ?? null,
      selected,
      is_correct: isCorrect,
      is_gradable: gradable,
      marks_awarded: isCorrect ? marks : 0,
    };
  });

  const percentage = totalMarks > 0 ? Math.round((score / totalMarks) * 10000) / 100 : 0;
  return {
    score,
    total_marks: totalMarks,
    percentage: Math.max(0, percentage),
    passed: passingPct == null ? true : percentage >= passingPct,
    passing_pct: passingPct,
    review,
  };
}

/**
 * Fire the side-effect that belongs to the placement's context.
 *
 * Deliberately NOT nested inside a passed check. A catch-up class test has a
 * side-effect on failure too (it re-locks itself until the student goes back
 * through the recording), and class prep has to move test_attempts and
 * test_best_pct on a fail, because the rule there is retry until you pass.
 */
async function dispatchPlacementSideEffect(
  placement: NexusTestPlacement | null,
  args: {
    studentId: string;
    attemptId: string;
    percentage: number;
    passed: boolean;
    mode?: 'official' | 'revision';
  },
  supabase: TypedSupabaseClient,
): Promise<void> {
  if (!placement) return;

  if (placement.context_type === 'study_file' && args.passed) {
    if (args.mode === 'revision') {
      // Practice on a chapter the student already finished. Routed to a function
      // that does not name best_score_pct at all, so the official record is
      // physically unreachable from this path rather than merely untouched.
      await supabase.rpc('nexus_study_record_revision', {
        p_user: args.studentId,
        p_file: placement.context_id,
        p_score: args.percentage,
        p_attempt: args.attemptId,
      });
    } else {
      // The study-material completion (best-score upsert on
      // nexus_study_file_reads). best_attempt_id has no FK, so a
      // nexus_test_attempts id is accepted. Since 20260820090100 this only
      // completes the chapter outright when there is no servable video track, or
      // when one has already been watched through.
      await supabase.rpc('nexus_study_mark_completed', {
        p_user: args.studentId,
        p_file: placement.context_id,
        p_score: args.percentage,
        p_attempt: args.attemptId,
      });
    }
  } else if (placement.context_type === 'catchup_class') {
    await recordCatchupTestAttempt(
      {
        studentId: args.studentId,
        scheduledClassId: placement.context_id,
        passed: args.passed,
        percentage: args.percentage,
      },
      supabase,
    );
  } else if (placement.context_type === 'class_prep_test') {
    // Imported lazily: class-prep imports composeTest/createPlacement from this
    // module, so a top-level import here would close the cycle.
    const { recomputeClassPrep } = await import('./class-prep');
    await recomputeClassPrep(args.studentId, placement.context_id, supabase);
  } else if (placement.context_type === 'qb_paper') {
    // Nothing to do, and written out rather than left to fall through the end of
    // the chain, so the next person adding a context can see this one was
    // considered rather than forgotten.
    //
    // The attempt row IS the record here. Everything the paper's three faces
    // report is derived from nexus_test_attempts on the read (see
    // summariseAttempts in qb-papers.ts), so there is no denormalised counter to
    // keep in step and no second place for the two to disagree.
  }
}

/** Whether an in-progress attempt has run past its clock and should be retired. */
function attemptIsStale(
  attempt: { started_at: string | null },
  test: { test_type?: string; duration_minutes?: number | null; per_question_seconds?: number | null },
  questionCount: number,
): boolean {
  if (!attempt.started_at) return false;
  const startedAt = new Date(attempt.started_at).getTime();
  if (Number.isNaN(startedAt)) return false;

  if (test.test_type === 'timed' && test.duration_minutes) {
    return Date.now() > startedAt + test.duration_minutes * 60 * 1000 + TIMED_GRACE_MS;
  }
  if (test.test_type === 'per_question_timer' && test.per_question_seconds) {
    const allowed = test.per_question_seconds * questionCount * 1000;
    return Date.now() > startedAt + allowed + PER_QUESTION_GRACE_MS;
  }
  return false;
}

/** How many attempts this student has already SUBMITTED for a test. */
export async function countStudentAttempts(
  testId: string,
  studentId: string,
  client?: TypedSupabaseClient,
): Promise<number> {
  const supabase = client || getSupabaseAdminClient();
  const { count, error } = await supabase
    .from(ATTEMPTS)
    .select('id', { count: 'exact', head: true })
    .eq('test_id', testId)
    .eq('student_id', studentId)
    .eq('status', 'submitted');
  if (error) throw error;
  return count || 0;
}

export interface StartAttemptResult {
  attempt: NexusAttemptRow;
  resumed: boolean;
  /** Submitted attempts before this one. */
  previous_attempts: number;
  best_percentage: number | null;
  /**
   * The paper this sitting was served, when the test is a pool. null means the
   * caller should serve the whole composed test, which is what every
   * non-pool test does.
   */
  draw: NexusTestDraw | null;
}

/**
 * Start a new attempt, or resume the one already open.
 *
 * A previously SUBMITTED attempt no longer blocks anything: it simply raises
 * attempt_number. Unlimited retakes are the default everywhere, and a placement
 * that wants a one-shot assessment sets gating.attempt_limit.
 */
export async function startOrResumeAttempt(
  input: {
    testId: string;
    studentId: string;
    placementId?: string | null;
    /** 'revision' is practice after completion and never touches the record. */
    mode?: 'official' | 'revision';
  },
  client?: TypedSupabaseClient,
): Promise<StartAttemptResult> {
  const supabase = client || getSupabaseAdminClient();

  const [meta, questions, placement] = await Promise.all([
    getTestMeta(input.testId, supabase),
    getComposedTestQuestions(input.testId, false, supabase),
    input.placementId ? getPlacementById(input.placementId, supabase) : Promise.resolve(null),
  ]);
  if (!meta) throw new Error('TEST_NOT_FOUND');
  if (questions.length === 0) throw new Error('TEST_HAS_NO_QUESTIONS');
  if (placement && placement.test_id !== input.testId) throw new Error('PLACEMENT_TEST_MISMATCH');

  const { data: history, error: histErr } = await supabase
    .from(ATTEMPTS)
    .select(
      'id, test_id, student_id, placement_id, attempt_number, status, mode, answers, started_at, submitted_at, time_spent_seconds, score, total_marks, percentage',
    )
    .eq('test_id', input.testId)
    .eq('student_id', input.studentId)
    .order('attempt_number', { ascending: false });
  if (histErr) throw histErr;
  const rows = (history || []) as NexusAttemptRow[];

  const submitted = rows.filter((r) => r.status === 'submitted');
  const best = submitted.reduce<number | null>(
    (acc, r) =>
      r.percentage == null ? acc : acc == null ? Number(r.percentage) : Math.max(acc, Number(r.percentage)),
    null,
  );

  const limit = Number((placement?.gating as any)?.attempt_limit);
  if (Number.isFinite(limit) && limit > 0 && submitted.length >= limit) {
    throw new Error('ATTEMPT_LIMIT_REACHED');
  }

  const mode = input.mode ?? 'official';

  /** The paper for one sitting. Idempotent, so resuming re-reads rather than re-draws. */
  const drawFor = (attemptNumber: number) =>
    ensureTestDraw(
      { testId: input.testId, studentId: input.studentId, attemptNumber, questions, serve: meta.questions_to_serve },
      supabase,
    );

  // The clock belongs to the paper the student is sitting, not to the pool it
  // was drawn from. A per-question timer measured against 40 pooled questions
  // would give a 20-question sitting twice the time it is meant to have.
  const serve = Number(meta.questions_to_serve);
  const servedCount =
    Number.isFinite(serve) && serve > 0 ? Math.min(serve, questions.length) : questions.length;

  const open = rows.find((r) => r.status === 'in_progress');
  if (open) {
    // A stale attempt in the OTHER mode must not be resumed into this one.
    // uq_test_attempt_one_in_progress is (test_id, student_id) and deliberately
    // knows nothing about mode, because widening it would allow two open
    // attempts and reopen the two-tab race it exists to stop. So the mismatch is
    // resolved here instead: without this, a student with a forgotten official
    // attempt who starts a revision would resume the official one, and passing
    // it would overwrite their real best score with a practice result.
    const sameMode = (open.mode ?? 'official') === mode;
    if (sameMode && !attemptIsStale(open, meta, servedCount)) {
      return {
        attempt: open,
        resumed: true,
        previous_attempts: submitted.length,
        best_percentage: best,
        draw: await drawFor(Number(open.attempt_number) || 1),
      };
    }
    // The clock ran out while they were away. Retire it so a fresh attempt can
    // start; before the CHECK was widened this write failed and the dead attempt
    // blocked every retry.
    await supabase
      .from(ATTEMPTS)
      .update({ status: 'abandoned', submitted_at: new Date().toISOString() })
      .eq('id', open.id);
  }

  const nextNumber = rows.reduce((max, r) => Math.max(max, Number(r.attempt_number) || 0), 0) + 1;

  const { data: created, error } = await supabase
    .from(ATTEMPTS)
    .insert({
      test_id: input.testId,
      student_id: input.studentId,
      placement_id: placement?.id ?? null,
      attempt_number: nextNumber,
      // Decided when the attempt STARTS and never re-derived. "Anything after
      // completed_at is revision" would misfile the common case here: a student
      // can pass the chapter test before finishing the video, so their official
      // attempt predates completion.
      mode,
      status: 'in_progress',
      answers: {},
      started_at: new Date().toISOString(),
    })
    .select('*')
    .single();

  if (error) {
    // Two tabs opened the same paper at once. The partial unique index picked a
    // winner; adopt it rather than handing back an error the student cannot act on.
    if ((error as any).code === '23505') {
      const { data: raced } = await supabase
        .from(ATTEMPTS)
        .select('*')
        .eq('test_id', input.testId)
        .eq('student_id', input.studentId)
        .eq('status', 'in_progress')
        .maybeSingle();
      if (raced) {
        const racedNumber = Number((raced as NexusAttemptRow).attempt_number) || 1;
        const racedDraw = await drawFor(racedNumber);
        if (racedDraw) {
          await stampDrawWithAttempt(input.testId, input.studentId, racedNumber, raced.id, supabase);
        }
        return {
          attempt: raced as NexusAttemptRow,
          resumed: true,
          previous_attempts: submitted.length,
          best_percentage: best,
          draw: racedDraw,
        };
      }
    }
    throw error;
  }

  // After the insert, so the draw can name the attempt it belongs to. Drawing
  // first would be wrong in the opposite direction: a draw for an attempt that
  // failed to insert would be adopted by the NEXT sitting under the same number.
  const draw = await drawFor(nextNumber);
  if (draw) await stampDrawWithAttempt(input.testId, input.studentId, nextNumber, created.id, supabase);

  return {
    attempt: created as NexusAttemptRow,
    resumed: false,
    previous_attempts: submitted.length,
    best_percentage: best,
    draw,
  };
}

/** Autosave. Ownership is enforced in the filter, so a stray id updates nothing. */
export async function saveAttemptAnswers(
  attemptId: string,
  studentId: string,
  answers: Record<string, string>,
  client?: TypedSupabaseClient,
): Promise<void> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from(ATTEMPTS)
    .update({ answers: answers || {} })
    .eq('id', attemptId)
    .eq('student_id', studentId)
    .eq('status', 'in_progress')
    .select('id');
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('ATTEMPT_NOT_OPEN');
}

/**
 * Submit an open attempt: grade it, record the result, fire the placement's
 * side-effect. The single write path for every surface.
 */
export async function submitAttempt(
  input: { attemptId: string; studentId: string; answers?: Record<string, string> },
  client?: TypedSupabaseClient,
): Promise<
  NexusTestGradeResult & { test_id: string; attempt_number: number; draw: NexusTestDraw | null }
> {
  const supabase = client || getSupabaseAdminClient();

  const { data: attempt, error: aErr } = await supabase
    .from(ATTEMPTS)
    .select('*')
    .eq('id', input.attemptId)
    .eq('student_id', input.studentId)
    .maybeSingle();
  if (aErr) throw aErr;
  if (!attempt) throw new Error('ATTEMPT_NOT_FOUND');
  if (attempt.status !== 'in_progress') throw new Error('ATTEMPT_ALREADY_SUBMITTED');

  const attemptNumber = Number(attempt.attempt_number) || 1;
  const [meta, composed, placement, draw] = await Promise.all([
    getTestMeta(attempt.test_id, supabase),
    getComposedTestQuestions(attempt.test_id, true, supabase),
    attempt.placement_id ? getPlacementById(attempt.placement_id, supabase) : Promise.resolve(null),
    getTestDraw(attempt.test_id, attempt.student_id, attemptNumber, supabase),
  ]);
  if (!meta) throw new Error('TEST_NOT_FOUND');
  if (composed.length === 0) throw new Error('TEST_HAS_NO_QUESTIONS');

  // Grade the paper the student was actually served, not the pool it came from.
  // Both halves matter: scoring 20 answers out of a 40-question denominator
  // caps everyone at 50%, and reading a permuted answer without translating it
  // marks a correct choice wrong.
  const questions = applyTestDraw(composed, draw);
  if (questions.length === 0) throw new Error('TEST_HAS_NO_QUESTIONS');

  const submitted = input.answers || (attempt.answers as Record<string, string>) || {};
  const answers = draw
    ? translateDrawnAnswers(submitted, draw.question_ids, draw.option_maps)
    : submitted;
  const totalPossible = questions.reduce((sum, q) => sum + (Number(q.marks) || 1), 0);
  const graded = gradeComposedAnswers(questions, answers, resolvePassingPct(placement, meta, totalPossible));

  // Grading ran in the question's own lettering; the student only ever saw the
  // permuted one. Handing back an untranslated review would highlight a
  // different option than they clicked and name a different one as correct.
  if (draw) {
    graded.review = graded.review.map((r) => ({
      ...r,
      selected: originalToDisplayedId(r.selected, draw.option_maps?.[r.question_id]),
      correct_answer: originalToDisplayedId(r.correct_answer, draw.option_maps?.[r.question_id]),
    }));
  }

  const startedAt = new Date(attempt.started_at || Date.now()).getTime();
  const timeSpent = Math.max(0, Math.round((Date.now() - startedAt) / 1000));

  const { error: uErr } = await supabase
    .from(ATTEMPTS)
    .update({
      // The raw submission, in the lettering the student clicked. Storing the
      // translated form would make the answers row unreadable without also
      // fetching the draw, and would disagree with every autosave before it.
      answers: submitted,
      status: 'submitted',
      submitted_at: new Date().toISOString(),
      time_spent_seconds: timeSpent,
      score: graded.score,
      total_marks: graded.total_marks,
      percentage: graded.percentage,
    })
    .eq('id', attempt.id)
    .eq('status', 'in_progress');
  if (uErr) throw uErr;

  await dispatchPlacementSideEffect(
    placement,
    {
      studentId: input.studentId,
      attemptId: attempt.id,
      percentage: graded.percentage,
      passed: graded.passed,
      // Read off the attempt, not off the request. The mode was fixed when the
      // attempt started; letting a submit body claim it would make "practice
      // never counts" a client-side promise.
      mode: (attempt.mode as 'official' | 'revision') ?? 'official',
    },
    supabase,
  );

  return {
    attempt_id: attempt.id,
    test_id: attempt.test_id,
    attempt_number: attemptNumber,
    // Handed back so a caller enriching the review with stems and options
    // permutes them the same way the paper was, rather than re-reading the
    // bank and pairing displayed answers with original lettering.
    draw,
    ...graded,
  };
}

/** Mark an open attempt abandoned. Called on page unload via sendBeacon. */
export async function abandonAttempt(
  attemptId: string,
  studentId: string,
  client?: TypedSupabaseClient,
): Promise<void> {
  const supabase = client || getSupabaseAdminClient();
  const { error } = await supabase
    .from(ATTEMPTS)
    .update({ status: 'abandoned', submitted_at: new Date().toISOString() })
    .eq('id', attemptId)
    .eq('student_id', studentId)
    .eq('status', 'in_progress');
  if (error) throw error;
}

/**
 * Grade a whole paper in one call, for surfaces that submit everything at once
 * (class prep, catch-up, a study chapter quiz) rather than running a timed
 * session. A thin wrapper over start plus submit, so those callers get the same
 * grading, the same attempt numbering and the same side-effects as the timed
 * take page. answers is keyed by the underlying question id.
 */
export async function gradeTestOneShot(
  input: {
    testId: string;
    studentId: string;
    answers: Record<string, string>;
    placementId?: string | null;
    /** Practice on an already-completed chapter. Kept out of the record. */
    mode?: 'official' | 'revision';
  },
  client?: TypedSupabaseClient,
): Promise<NexusTestGradeResult> {
  const supabase = client || getSupabaseAdminClient();
  const { attempt } = await startOrResumeAttempt(
    {
      testId: input.testId,
      studentId: input.studentId,
      placementId: input.placementId,
      mode: input.mode,
    },
    supabase,
  );
  return submitAttempt(
    { attemptId: attempt.id, studentId: input.studentId, answers: input.answers || {} },
    supabase,
  );
}
