import { describe, it, expect } from 'vitest';
import {
  solutionRefFor,
  groupQBReports,
  flaggedParts,
  type QBReportRefQuestion,
  type QBReportRow,
} from './qb-reports';
import {
  QB_REPORT_REASONS_BY_TARGET,
  QB_REPORT_TARGETS,
  qbReportReasonAllowed,
  qbReportLabel,
} from '../../types';

const VIDEO_A = 'https://www.youtube.com/watch?v=U1X9MmLh-ZQ';
const VIDEO_B = 'https://www.youtube.com/watch?v=T9CB0HymAJo';

function question(over: Partial<QBReportRefQuestion> = {}): QBReportRefQuestion {
  return {
    id: 'q31',
    question_text: 'Houses located on which slopes get more sun in winter?',
    question_image_url: null,
    options: [
      { id: 'a', text: 'North' },
      { id: 'b', text: 'South' },
    ],
    correct_answer: 'b',
    explanation_brief: 'South-facing slopes.',
    explanation_detailed: null,
    solution_image_url: 'https://cdn/sol.png',
    solution_video_url: VIDEO_A,
    drawing_parts: null,
    ...over,
  };
}

let seq = 0;
function row(over: Partial<QBReportRow> = {}): QBReportRow {
  seq += 1;
  return {
    id: `r${seq}`,
    question_id: 'q31',
    student_id: `s${seq}`,
    student_name: `Student ${seq}`,
    report_type: 'wrong_working',
    description: null,
    status: 'open',
    resolution_note: null,
    resolved_by: null,
    resolved_at: null,
    created_at: `2026-09-2${Math.min(seq, 9)}T10:00:00Z`,
    updated_at: `2026-09-2${Math.min(seq, 9)}T10:00:00Z`,
    target: 'video',
    part_label: null,
    solution_ref: VIDEO_A,
    video_seconds: null,
    source: 'practice',
    test_id: null,
    notified_at: null,
    ...over,
  };
}

describe('the report vocabulary', () => {
  it('offers only reasons the database accepts, and ends every list with Something else', () => {
    const allowed = new Set([
      'wrong_answer', 'no_correct_option', 'question_error', 'missing_solution', 'unclear_question', 'other',
      'multiple_correct', 'figure_problem', 'wrong_working', 'wrong_final_answer', 'different_question',
      'not_loading', 'unclear_solution',
    ]);
    for (const target of QB_REPORT_TARGETS) {
      const reasons = QB_REPORT_REASONS_BY_TARGET[target];
      expect(reasons.every((r) => allowed.has(r.reason))).toBe(true);
      expect(reasons[reasons.length - 1].reason).toBe('other');
    }
  });

  it('refuses a reason that belongs to a different part of the question', () => {
    expect(qbReportReasonAllowed('video', 'wrong_working')).toBe(true);
    expect(qbReportReasonAllowed('video', 'no_correct_option')).toBe(false);
    expect(qbReportReasonAllowed('answer_key', 'not_loading')).toBe(false);
  });

  it('reads as one line for staff', () => {
    expect(qbReportLabel('video', 'wrong_working')).toBe('Video solution: Mistake in the working');
    expect(qbReportLabel(null, 'wrong_answer')).toBe('Answer key is wrong');
  });
});

describe('solutionRefFor, what the student was looking at', () => {
  it('is the link itself for a video or an image', () => {
    expect(solutionRefFor(question(), 'video')).toBe(VIDEO_A);
    expect(solutionRefFor(question(), 'solution_image')).toBe('https://cdn/sol.png');
  });

  it('is the key for the answer key', () => {
    expect(solutionRefFor(question(), 'answer_key')).toBe('b');
  });

  it('changes when the written solution is edited, and not otherwise', () => {
    const before = solutionRefFor(question(), 'explanation');
    expect(before).toBe(solutionRefFor(question(), 'explanation'));
    expect(solutionRefFor(question({ explanation_brief: 'North-facing slopes.' }), 'explanation')).not.toBe(before);
  });

  it('changes when the question text or an option is edited', () => {
    const before = solutionRefFor(question(), 'question');
    expect(solutionRefFor(question({ options: [{ id: 'a', text: 'East' }, { id: 'b', text: 'South' }] }), 'question')).not.toBe(before);
  });

  it('is null when there is nothing there to be wrong', () => {
    expect(solutionRefFor(question({ solution_video_url: '  ' }), 'video')).toBeNull();
    expect(solutionRefFor(question({ explanation_brief: null }), 'explanation')).toBeNull();
  });

  it('reads the part of a split drawing, not the mirrored question column', () => {
    const q = question({
      solution_video_url: VIDEO_A,
      drawing_parts: {
        mode: 'any_one',
        items: [
          { id: 'a', label: 'A', text: 'Draw a bus stop', solution_video_url: VIDEO_A, solution_image_url: 'https://cdn/a.png' },
          { id: 'b', label: 'B', text: 'Draw a market', solution_video_url: VIDEO_B, solution_image_url: null },
        ],
      },
    });
    expect(solutionRefFor(q, 'video', 'B')).toBe(VIDEO_B);
    expect(solutionRefFor(q, 'solution_image', 'B')).toBeNull();
    expect(solutionRefFor(q, 'solution_image', 'a')).toBe('https://cdn/a.png');
  });
});

describe('groupQBReports', () => {
  it('makes one problem of many students reporting the same video', () => {
    const rows = [
      row({ report_type: 'wrong_working', description: 'Step 3 uses sin instead of cos', video_seconds: 135 }),
      row({ report_type: 'wrong_working' }),
      row({ report_type: 'wrong_final_answer' }),
      row({ target: 'answer_key', report_type: 'wrong_answer', solution_ref: 'b' }),
    ];
    const groups = groupQBReports(rows, new Map([['q31', question()]]));
    expect(groups).toHaveLength(2);

    const video = groups.find((g) => g.target === 'video')!;
    expect(video.students).toBe(3);
    expect(video.reasons).toEqual([
      { reason: 'wrong_working', count: 2 },
      { reason: 'wrong_final_answer', count: 1 },
    ]);
    expect(video.notes).toHaveLength(3);
    expect(video.notes.some((n) => n.note === 'Step 3 uses sin instead of cos' && n.video_seconds === 135)).toBe(true);
    expect(video.changed_since_reported).toBe(false);
    // The bigger problem first.
    expect(groups[0].target).toBe('video');
  });

  it('counts a student once, however many times they reported it', () => {
    const groups = groupQBReports(
      [row({ student_id: 'same' }), row({ student_id: 'same' })],
      new Map([['q31', question()]]),
    );
    expect(groups[0].students).toBe(1);
  });

  it('says the video changed after they reported it', () => {
    const groups = groupQBReports([row(), row()], new Map([['q31', question({ solution_video_url: VIDEO_B })]]));
    expect(groups[0].changed_since_reported).toBe(true);
  });

  it('keeps each part of a split drawing apart', () => {
    const groups = groupQBReports(
      [row({ part_label: 'A' }), row({ part_label: 'B' })],
      new Map([['q31', question()]]),
    );
    expect(groups.map((g) => g.part_label).sort()).toEqual(['A', 'B']);
  });
});

describe('flaggedParts, the warning other students see', () => {
  const questions = new Map([['q31', question()]]);

  it('stays quiet for a single report, which may itself be the mistake', () => {
    expect(flaggedParts([row()], questions).get('q31')).toBeUndefined();
  });

  it('warns once two different students report the same video', () => {
    expect(flaggedParts([row(), row()], questions).get('q31')).toEqual([{ target: 'video', part_label: null }]);
  });

  it('drops the warning once the video has been replaced', () => {
    const replaced = new Map([['q31', question({ solution_video_url: VIDEO_B })]]);
    expect(flaggedParts([row(), row()], replaced).get('q31')).toBeUndefined();
  });

  it('ignores reports that are already closed', () => {
    expect(flaggedParts([row(), row({ status: 'resolved' })], questions).get('q31')).toBeUndefined();
  });
});
