// @vitest-environment node
/**
 * Integration check for the test library against a real Supabase project.
 *
 * Exercises the query layer the API routes call, end to end: build a folder
 * path, compose a test into it, place it, read it back through the library
 * listing, then move and unfile it. Everything it creates it deletes, so the
 * target database is left exactly as it was found.
 *
 * Skipped unless RUN_DB_INTEGRATION=1 and INTEGRATION_SUPABASE_URL is set, so it
 * never runs in CI or on a machine without a staging target.
 *
 *   set -a; . apps/nexus/.env.local; set +a
 *   INTEGRATION_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
 *   INTEGRATION_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY \
 *   RUN_DB_INTEGRATION=1 npx vitest run apps/nexus/src/lib/__integration__
 *
 * The dedicated INTEGRATION_* names exist because tests/setup.ts pins
 * NEXT_PUBLIC_SUPABASE_URL to a local Supabase for every other test. Reading the
 * real target from names it does not touch, and reassigning them here before the
 * first dynamic import of @neram/database, is what lets this one file out.
 */
import { afterAll, describe, expect, it } from 'vitest';

const ENABLED =
  process.env.RUN_DB_INTEGRATION === '1' &&
  Boolean(process.env.INTEGRATION_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

if (ENABLED) {
  process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.INTEGRATION_SUPABASE_URL as string;
  if (process.env.INTEGRATION_SUPABASE_ANON_KEY) {
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.INTEGRATION_SUPABASE_ANON_KEY;
  }
}

// Marked so a leftover row from a crashed run is obvious and greppable.
const PREFIX = 'ZZ_INTEGRATION_';

const suite = ENABLED ? describe : describe.skip;

suite('test library query layer', () => {
  const created = { folderIds: [] as string[], testIds: [] as string[], questionIds: [] as string[] };

  afterAll(async () => {
    if (!ENABLED) return;
    const { getSupabaseAdminClient } = await import('@neram/database');
    // Cast: nexus_test_folders is not in database.generated.ts until the types
    // are regenerated, which waits for the migration to be on both environments.
    const supabase = getSupabaseAdminClient() as any;
    // Order matters: test_questions cascade from tests, so tests go before the
    // bank questions they reference.
    if (created.testIds.length) await supabase.from('nexus_tests').delete().in('id', created.testIds);
    if (created.questionIds.length)
      await supabase.from('nexus_qb_questions').delete().in('id', created.questionIds);
    if (created.folderIds.length)
      await supabase.from('nexus_test_folders').delete().in('id', created.folderIds);
  });

  it('creates a folder path, files a test into it, and lists it back', async () => {
    const {
      findOrCreateTestFolderPath,
      listTestFolderTree,
      getTestFolderBreadcrumb,
      composeTest,
      listLibraryTests,
      moveTestsToFolder,
      createQBQuestion,
      getSupabaseAdminClient,
    } = await import('@neram/database');
    const supabase = getSupabaseAdminClient();

    // 1. A nested path is materialised in one call, the way the import wizard
    //    turns "Foundation / History of Architecture" into real folders.
    const leaf = await findOrCreateTestFolderPath(
      { scope: 'staff' },
      [`${PREFIX}Foundation`, `${PREFIX}History of Architecture`],
      null,
    );
    expect(leaf).not.toBeNull();
    const crumbs = await getTestFolderBreadcrumb(leaf!.id);
    expect(crumbs.map((c) => c.name)).toEqual([
      `${PREFIX}Foundation`,
      `${PREFIX}History of Architecture`,
    ]);
    created.folderIds.push(leaf!.id, crumbs[0].id);

    // 2. Re-running the same path must reuse, not duplicate. This is what makes
    //    a second import into the same chapter safe.
    const again = await findOrCreateTestFolderPath(
      { scope: 'staff' },
      [`${PREFIX}Foundation`, `${PREFIX}History of Architecture`],
      null,
    );
    expect(again!.id).toBe(leaf!.id);

    // 3. A bank question and a test composed into the folder.
    const question = await createQBQuestion({
      question_text: `${PREFIX}Shahjahanabad is presently known as which city?`,
      question_format: 'MCQ',
      options: [
        { id: 'a', text: 'Agra' },
        { id: 'b', text: 'Old Delhi' },
      ],
      correct_answer: 'b',
      difficulty: 'MEDIUM',
      exam_relevance: 'NATA',
      categories: [],
      status: 'active',
    });
    created.questionIds.push(question.id);

    const { id: testId } = await composeTest({
      title: `${PREFIX}Foundation History of Architecture Book Test`,
      questionIds: [question.id],
      testKind: 'classroom_assigned',
      isRepository: true,
      isPublished: true,
      createdFrom: 'ai_import',
      folderId: leaf!.id,
    });
    created.testIds.push(testId);

    // 4. The listing finds it in its folder, with a real question count.
    const inFolder = await listLibraryTests({
      scope: 'staff',
      folderId: leaf!.id,
      includeUnpublished: true,
    });
    const found = inFolder.tests.find((t) => t.id === testId);
    expect(found).toBeDefined();
    expect(found!.question_count).toBe(1);
    expect(found!.folder_id).toBe(leaf!.id);

    // 5. Search spans every folder, which is the behaviour the pickers rely on.
    const bySearch = await listLibraryTests({
      scope: 'staff',
      search: 'History of Architecture Book Test',
      includeUnpublished: true,
    });
    expect(bySearch.tests.some((t) => t.id === testId)).toBe(true);

    // 6. The tree reports the count on the right folder.
    const tree = await listTestFolderTree({ scope: 'staff' });
    const root = tree.tree.find((f) => f.name === `${PREFIX}Foundation`);
    expect(root).toBeDefined();
    expect(root!.children.find((c) => c.id === leaf!.id)?.test_count).toBe(1);

    // 7. Unfiling leaves the test alive and findable, never deleted.
    await moveTestsToFolder([testId], null);
    const unfiled = await listLibraryTests({ scope: 'staff', folderId: null, includeUnpublished: true });
    expect(unfiled.tests.some((t) => t.id === testId)).toBe(true);

    // 8. A student-scoped read must not see staff work.
    const { data: anyUser } = await supabase.from('users').select('id').limit(1).single();
    if (anyUser) {
      const studentView = await listLibraryTests({
        scope: 'student',
        ownerId: anyUser.id,
        includeUnpublished: true,
      });
      expect(studentView.tests.some((t) => t.id === testId)).toBe(false);
    }
  }, 60000);

  it('labels a placement so the library can show where a test is used', async () => {
    const { composeTest, createPlacement, listLibraryTests, createQBQuestion } = await import(
      '@neram/database'
    );

    const question = await createQBQuestion({
      question_text: `${PREFIX}Which order has a scrolled capital?`,
      question_format: 'MCQ',
      options: [
        { id: 'a', text: 'Doric' },
        { id: 'b', text: 'Ionic' },
      ],
      correct_answer: 'b',
      difficulty: 'EASY',
      exam_relevance: 'NATA',
      categories: [],
      status: 'active',
    });
    created.questionIds.push(question.id);

    const { id: testId } = await composeTest({
      title: `${PREFIX}Placement label probe`,
      questionIds: [question.id],
      testKind: 'classroom_assigned',
      isRepository: true,
      isPublished: true,
    });
    created.testIds.push(testId);

    const { getSupabaseAdminClient } = await import('@neram/database');
    const supabase = getSupabaseAdminClient();
    const { data: classroom } = await supabase.from('nexus_classrooms').select('id, name').limit(1).maybeSingle();
    if (!classroom) return; // nothing to place against on this database

    await createPlacement({
      testId,
      contextType: 'classroom_assignment',
      contextId: classroom.id,
    });

    const listed = await listLibraryTests({ scope: 'staff', search: 'Placement label probe', includeUnpublished: true });
    const found = listed.tests.find((t) => t.id === testId);
    expect(found).toBeDefined();
    expect(found!.placements.length).toBeGreaterThan(0);
    // The label is resolved from the polymorphic context id, which has no FK.
    expect(found!.placements[0].context_label).toBe(classroom.name);
  }, 60000);
});
