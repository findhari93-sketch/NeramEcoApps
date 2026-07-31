import { NextRequest, NextResponse } from 'next/server';
import { verifyQBAccess } from '@/lib/qb-auth';
import { resolveStaffRole } from '@/lib/staff-capabilities';
import {
  addQuestionTagPairs,
  composeTest,
  createQBQuestion,
  findOrCreateTestFolderPath,
  findOrCreateQBTag,
  getTestFolderById,
  getSupabaseAdminClient,
  updateQBQuestion,
} from '@neram/database';

/**
 * POST /api/question-bank/import/commit   (teacher/admin)
 *
 * Final step of the AI import. Writes the approved tags, the approved
 * questions, and composes the test in one call.
 *
 * Body:
 * {
 *   title, folder_id?, folder_path?: string[],
 *   timer_type?, duration_minutes?, per_question_seconds?, passing_pct?, is_published?,
 *   new_tags?: [{ slug, label }],                  // theme tags the teacher approved
 *   extra_question_ids?: string[],                 // bank questions added alongside the import
 *   questions: [{
 *     action: 'create' | 'reuse' | 'merge' | 'skip',
 *     existing_question_id?,                       // required for reuse and merge
 *     question_text, question_format, options, correct_answer, explanation,
 *     difficulty, exam_relevance, tag_ids?, new_tag_slugs?
 *   }]
 * }
 *
 * Ordering matters: tags first (so a new question can be tagged in the same
 * pass), then questions, then the test. There is no cross-table transaction
 * available through PostgREST, so each step is written to be re-runnable:
 * findOrCreateQBTag is idempotent, and tag writes upsert on their primary key.
 * A failure part way leaves orphan bank questions, which are harmless and
 * searchable, never a half-built test.
 */

type RowAction = 'create' | 'reuse' | 'merge' | 'skip';

interface CommitRow {
  action?: RowAction;
  existing_question_id?: string | null;
  question_text?: string;
  question_format?: 'MCQ' | 'NUMERICAL';
  options?: Array<{ id: string; text: string }> | null;
  correct_answer?: string;
  explanation?: string | null;
  difficulty?: 'EASY' | 'MEDIUM' | 'HARD';
  exam_relevance?: 'JEE' | 'NATA' | 'BOTH';
  tag_ids?: string[];
  new_tag_slugs?: string[];
}

export async function POST(request: NextRequest) {
  try {
    const access = await verifyQBAccess(request.headers.get('Authorization'), null);
    if (!access.ok) return access.response;
    // Gated on the staff tier, not user_type: a manager row is
    // user_type='student' with staff_role='manager'.
    if (resolveStaffRole(access.caller) === null) {
      return NextResponse.json({ error: 'Only staff can import questions' }, { status: 403 });
    }
    const callerId = access.caller.id;

    const body = await request.json();
    const title = typeof body?.title === 'string' ? body.title.trim() : '';
    if (!title) return NextResponse.json({ error: 'title is required' }, { status: 400 });

    const rows: CommitRow[] = Array.isArray(body?.questions) ? body.questions : [];
    const extraIds: string[] = Array.isArray(body?.extra_question_ids)
      ? body.extra_question_ids.filter((id: unknown) => typeof id === 'string')
      : [];
    if (rows.length === 0 && extraIds.length === 0) {
      return NextResponse.json({ error: 'Nothing to import' }, { status: 400 });
    }
    if (rows.length > 200) {
      return NextResponse.json({ error: 'Import at most 200 questions at a time' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient();

    // 1. Approved new tags. Only theme tags: exam and subject are the curated,
    //    is_system vocabulary and an import must not extend them.
    const slugToNewTagId = new Map<string, string>();
    let tagsCreated = 0;
    const approvedTags = Array.isArray(body?.new_tags) ? body.new_tags : [];
    for (const t of approvedTags) {
      const label = typeof t?.label === 'string' ? t.label.trim() : '';
      const slug = typeof t?.slug === 'string' ? t.slug.trim() : '';
      if (!label && !slug) continue;
      const { tag, created } = await findOrCreateQBTag(
        { group_type: 'theme', label: label || slug, slug: slug || undefined, created_by: callerId },
        supabase,
      );
      slugToNewTagId.set(tag.slug, tag.id);
      if (slug && slug !== tag.slug) slugToNewTagId.set(slug, tag.id);
      if (created) tagsCreated += 1;
    }

    // 2. Questions, in the teacher's order. The composed test reads this array,
    //    so a reused question sits exactly where the imported one would have.
    const orderedQuestionIds: string[] = [];
    const tagPairs: Array<{ question_id: string; tag_ids: string[] }> = [];
    let created = 0;
    let reused = 0;
    let merged = 0;
    let skipped = 0;

    for (const row of rows) {
      const action: RowAction = row?.action || 'create';
      if (action === 'skip') {
        skipped += 1;
        continue;
      }

      // Resolve this row's tags: registry ids the wizard already knew, plus any
      // slug that only became real in step 1.
      const tagIds = new Set<string>((row.tag_ids || []).filter(Boolean));
      for (const slug of row.new_tag_slugs || []) {
        const id = slugToNewTagId.get(slug);
        if (id) tagIds.add(id);
      }

      if (action === 'reuse' || action === 'merge') {
        const existingId = row.existing_question_id;
        if (!existingId) {
          skipped += 1;
          continue;
        }

        if (action === 'merge') {
          // Merge FILLS GAPS, it never overwrites. A bank question may already
          // carry a teacher-checked explanation, and silently replacing it with
          // model prose would be a downgrade the teacher never sees. Tags are
          // always additive, which is where most of the value is anyway.
          const { data: existing } = await supabase
            .from('nexus_qb_questions')
            .select('id, explanation_brief')
            .eq('id', existingId)
            .maybeSingle();
          if (existing && !existing.explanation_brief && row.explanation) {
            await updateQBQuestion(existingId, { explanation_brief: row.explanation }, supabase);
          }
          merged += 1;
        } else {
          reused += 1;
        }

        orderedQuestionIds.push(existingId);
        if (tagIds.size > 0) tagPairs.push({ question_id: existingId, tag_ids: [...tagIds] });
        continue;
      }

      // action === 'create'
      const text = (row.question_text || '').trim();
      const answer = (row.correct_answer || '').trim();
      if (!text || !answer) {
        skipped += 1;
        continue;
      }
      const format = row.question_format === 'NUMERICAL' ? 'NUMERICAL' : 'MCQ';
      const question = await createQBQuestion(
        {
          question_text: text,
          question_format: format,
          options: format === 'MCQ' ? row.options ?? null : null,
          correct_answer: answer,
          explanation_brief: row.explanation ?? null,
          difficulty: row.difficulty || 'MEDIUM',
          exam_relevance: row.exam_relevance || 'BOTH',
          // categories[] is the legacy taxonomy. Imports are tag-native, and
          // syncTagsForNewQuestion is deliberately not called here because the
          // model already chose better tags than a category mapping would.
          categories: [],
          origin: 'authored',
          status: 'active',
          created_by: callerId,
        },
        supabase,
      );
      created += 1;
      orderedQuestionIds.push(question.id);
      if (tagIds.size > 0) tagPairs.push({ question_id: question.id, tag_ids: [...tagIds] });
    }

    // Bank questions the teacher added alongside the import, appended at the end.
    for (const id of extraIds) {
      if (!orderedQuestionIds.includes(id)) orderedQuestionIds.push(id);
    }

    if (orderedQuestionIds.length === 0) {
      return NextResponse.json(
        { error: 'Every question was skipped, so there is nothing to build a test from.' },
        { status: 400 },
      );
    }

    // 3. Tags, batched. Additive upsert, so a retry of this whole route is safe.
    let tagsLinked = 0;
    for (let i = 0; i < tagPairs.length; i += 100) {
      const { inserted } = await addQuestionTagPairs(tagPairs.slice(i, i + 100), callerId, supabase);
      tagsLinked += inserted;
    }

    // 4. Folder. An explicit id wins; otherwise materialise the suggested path.
    let folderId: string | null = null;
    if (typeof body?.folder_id === 'string' && body.folder_id) {
      const folder = await getTestFolderById(body.folder_id, supabase);
      if (!folder) return NextResponse.json({ error: 'That folder no longer exists' }, { status: 400 });
      folderId = folder.id;
    } else if (Array.isArray(body?.folder_path) && body.folder_path.length > 0) {
      const folder = await findOrCreateTestFolderPath({ scope: 'staff' }, body.folder_path, callerId, supabase);
      folderId = folder?.id ?? null;
    }

    // 5. The test itself.
    const passingPct = Number(body?.passing_pct);
    const passingMarks =
      Number.isFinite(passingPct) && passingPct > 0
        ? Math.max(1, Math.round((Math.min(passingPct, 100) / 100) * orderedQuestionIds.length))
        : null;

    const { id: testId } = await composeTest(
      {
        title,
        questionIds: orderedQuestionIds,
        testKind: 'classroom_assigned',
        timerType: body?.timer_type,
        durationMinutes: body?.duration_minutes ?? null,
        perQuestionSeconds: body?.per_question_seconds ?? null,
        passingMarks,
        isPublished: body?.is_published ?? false,
        isRepository: true,
        createdFrom: 'ai_import',
        createdBy: callerId,
        folderId,
      },
      supabase,
    );

    return NextResponse.json(
      {
        data: {
          test_id: testId,
          folder_id: folderId,
          question_count: orderedQuestionIds.length,
          created,
          reused,
          merged,
          skipped,
          tags_created: tagsCreated,
          tags_linked: tagsLinked,
        },
      },
      { status: 201 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to import questions';
    console.error('QB import commit error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
