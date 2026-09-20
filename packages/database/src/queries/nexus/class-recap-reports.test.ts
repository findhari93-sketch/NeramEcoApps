import { describe, it, expect } from 'vitest';
import { createFakeDb } from './testing/fake-supabase';
import {
  reportRecapQuestion,
  listReportedQuestionIdsForStudent,
  countOpenReportsByRecap,
  resolveRecapQuestionReport,
} from './class-recap-reports';
import { dropQuestionFromDraw } from './class-recaps';

/**
 * A student saying a checkpoint question is broken.
 *
 * The checkpoint quiz cannot be closed (RecapWatch passes dismissable={false}),
 * so a question with a wrong answer key was a gate they could neither pass nor
 * leave, with no way to tell anybody. Reporting has to do both halves: tell the
 * teacher, and get the student moving.
 */
function seed(over: Record<string, any[]> = {}) {
  return createFakeDb({
    nexus_class_recap_questions: [
      { id: 'q-1', section_id: 'sec-1', question_text: 'Which gateway?', is_active: true },
      { id: 'q-2', section_id: 'sec-1', question_text: 'Which architect?', is_active: true },
    ],
    nexus_class_recap_sections: [{ id: 'sec-1', recap_id: 'recap-1', title: 'Gateways' }],
    nexus_class_recap_question_reports: [],
    nexus_class_recap_draws: [
      {
        id: 'draw-1',
        student_id: 'stu-1',
        section_id: 'sec-1',
        attempt_number: 1,
        question_ids: ['q-1', 'q-2'],
        consumed_at: null,
      },
    ],
    ...over,
  });
}

describe('filing a report', () => {
  it('records the class and checkpoint on the report itself', async () => {
    // Not looked up on read. Saving a checkpoint deactivates its questions and
    // inserts fresh rows, so a report that walked the question back to its
    // class would lose its way the first time a teacher edited it.
    const db = seed();

    const { created, report } = await reportRecapQuestion(
      { questionId: 'q-1', studentId: 'stu-1', reportType: 'wrong_answer' },
      db.client,
    );

    expect(created).toBe(true);
    expect(report).toMatchObject({
      question_id: 'q-1',
      section_id: 'sec-1',
      recap_id: 'recap-1',
      student_id: 'stu-1',
      report_type: 'wrong_answer',
    });
  });

  it('returns nothing for a question that does not exist', async () => {
    const db = seed();

    const out = await reportRecapQuestion(
      { questionId: 'q-nope', studentId: 'stu-1', reportType: 'other' },
      db.client,
    );

    expect(out).toEqual({ created: false, report: null });
    expect(db.tables.nexus_class_recap_question_reports).toHaveLength(0);
  });

  it('trims and caps a long note rather than storing it whole', async () => {
    const db = seed();

    const { report } = await reportRecapQuestion(
      {
        questionId: 'q-1',
        studentId: 'stu-1',
        reportType: 'other',
        description: `   ${'x'.repeat(1500)}   `,
      },
      db.client,
    );

    expect(report!.description).toHaveLength(1000);
  });

  it('stores an empty note as nothing at all', async () => {
    const db = seed();

    const { report } = await reportRecapQuestion(
      { questionId: 'q-1', studentId: 'stu-1', reportType: 'other', description: '   ' },
      db.client,
    );

    expect(report!.description).toBeNull();
  });
});

describe('reading reports back', () => {
  it('remembers what this student reported, across attempts', async () => {
    // Meeting the same unanswerable question on the next attempt would undo the
    // whole point of letting them report it.
    const db = seed({
      nexus_class_recap_question_reports: [
        { id: 'r-1', recap_id: 'recap-1', student_id: 'stu-1', question_id: 'q-1', status: 'open' },
        { id: 'r-2', recap_id: 'recap-1', student_id: 'stu-2', question_id: 'q-2', status: 'open' },
      ],
    });

    const mine = await listReportedQuestionIdsForStudent('recap-1', 'stu-1', db.client);

    expect(mine).toEqual(['q-1']);
  });

  it('counts only open reports for the badge', async () => {
    const db = seed({
      nexus_class_recap_question_reports: [
        { id: 'r-1', recap_id: 'recap-1', student_id: 'stu-1', question_id: 'q-1', status: 'open' },
        { id: 'r-2', recap_id: 'recap-1', student_id: 'stu-2', question_id: 'q-2', status: 'open' },
        { id: 'r-3', recap_id: 'recap-1', student_id: 'stu-3', question_id: 'q-2', status: 'resolved' },
      ],
    });

    const counts = await countOpenReportsByRecap(['recap-1', 'recap-2'], db.client);

    expect(counts).toEqual({ 'recap-1': 2 });
  });

  it('closes a report with who closed it', async () => {
    // The recap tables record this nowhere else: the manual "Publish anyway"
    // path verifies a teacher and then discards the identity, so five recaps
    // went live on 2026-09-18 with no record of who released them.
    const db = seed({
      nexus_class_recap_question_reports: [
        { id: 'r-1', recap_id: 'recap-1', student_id: 'stu-1', question_id: 'q-1', status: 'open' },
      ],
    });

    await resolveRecapQuestionReport(
      { reportId: 'r-1', status: 'resolved', resolvedBy: 'teacher-1', note: 'Fixed the key' },
      db.client,
    );

    expect(db.tables.nexus_class_recap_question_reports[0]).toMatchObject({
      status: 'resolved',
      resolved_by: 'teacher-1',
      resolution_note: 'Fixed the key',
    });
  });
});

describe('taking the question out of the paper', () => {
  it('drops it from the draw, which is what lowers the pass mark', async () => {
    // The grading path scores only draw.question_ids and clamps the pass mark
    // with Math.min(gate.minToPass, totalCount). One fewer served is one fewer
    // needed. Nothing else has to know.
    const db = seed();

    const out = await dropQuestionFromDraw('draw-1', 'q-1', db.client);

    expect(out).toEqual({ remaining: 1, dropped: true });
    expect(db.tables.nexus_class_recap_draws[0].question_ids).toEqual(['q-2']);
  });

  it('refuses to empty the paper', async () => {
    // A checkpoint with nothing left can be neither passed nor failed, and
    // assertUnlocked would hold every later checkpoint behind it forever.
    const db = seed({
      nexus_class_recap_draws: [
        {
          id: 'draw-1',
          student_id: 'stu-1',
          section_id: 'sec-1',
          attempt_number: 1,
          question_ids: ['q-1'],
          consumed_at: null,
        },
      ],
    });

    const out = await dropQuestionFromDraw('draw-1', 'q-1', db.client);

    expect(out).toEqual({ remaining: 1, dropped: false });
    expect(db.tables.nexus_class_recap_draws[0].question_ids).toEqual(['q-1']);
  });

  it('does nothing for a question that was not on this paper', async () => {
    const db = seed();

    const out = await dropQuestionFromDraw('draw-1', 'q-elsewhere', db.client);

    expect(out).toEqual({ remaining: 2, dropped: false });
  });

  it('does nothing for a draw that does not exist', async () => {
    const db = seed();

    const out = await dropQuestionFromDraw('draw-nope', 'q-1', db.client);

    expect(out).toEqual({ remaining: 0, dropped: false });
  });
});
