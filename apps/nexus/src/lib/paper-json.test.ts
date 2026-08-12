import { describe, it, expect } from 'vitest';
import type { NexusQBOriginalPaper, NexusQBQuestion } from '@neram/database';
import {
  SCHEMA_NAME,
  SCHEMA_VERSION,
  diffPaperQuestions,
  paperJSONFilename,
  parsePaperJSON,
  toPaperJSON,
  type PaperExportInput,
} from './paper-json';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const paper = {
  id: 'paper-1',
  exam_type: 'JEE_PAPER_2',
  year: 2005,
  session: null,
  shift: null,
  pdf_url: null,
  total_questions: 3,
  total_marks: null,
  duration_minutes: 180,
  uploaded_by: null,
  created_at: '2026-03-22T13:07:00.000Z',
  upload_status: 'complete',
  questions_parsed: 3,
  questions_answer_keyed: 3,
  questions_complete: 3,
  study_file_id: null,
  is_student_visible: false,
} as unknown as NexusQBOriginalPaper;

function question(over: Partial<NexusQBQuestion> = {}): NexusQBQuestion {
  return {
    id: 'q-mcq',
    question_text: 'What is the vanishing point of a two point perspective?',
    question_text_hi: null,
    question_image_url:
      'https://db.neramclasses.com/storage/v1/object/public/uploads/nexus/question-bank/u1/questions/1.png',
    question_format: 'MCQ',
    options: [
      { id: 'a', text: 'On the horizon' },
      { id: 'b', text: 'Above the horizon' },
      { id: 'c', text: 'Below the horizon' },
      { id: 'd', text: 'Anywhere' },
    ],
    correct_answer: 'a',
    answer_tolerance: null,
    explanation_brief: 'Both vanishing points sit on the eye level.',
    explanation_detailed: 'In a two point perspective the horizon is the eye level, so...',
    explanation_brief_hi: null,
    explanation_detailed_hi: null,
    solution_image_url:
      'https://zdnypksjqnhtiblwdaic.supabase.co/storage/v1/object/public/uploads/nexus/question-bank/u1/solutions/1.png',
    solution_video_url: 'https://youtu.be/abc123',
    difficulty: 'MEDIUM',
    exam_relevance: 'BOTH',
    categories: ['aptitude'],
    topic_id: null,
    sub_topic: 'perspective',
    origin: 'pyq',
    repeat_group_id: null,
    original_paper_id: 'paper-1',
    original_paper_page: null,
    display_order: 1,
    section: 'aptitude',
    section_order: 3,
    status: 'active',
    nta_question_id: 'NTA-1',
    is_active: true,
    marks_correct: null,
    marks_negative: null,
    needs_image: true,
    created_by: null,
    created_at: '2026-03-22T13:07:00.000Z',
    updated_at: '2026-03-22T13:07:00.000Z',
    confidence_tier: null,
    answer_source: null,
    figure_type: null,
    recall_thread_id: null,
    drawing_marks: null,
    design_principle_tested: null,
    colour_constraint: null,
    objects_to_include: null,
    drawing_focus_points: null,
    drawing_reference_image_url: null,
    choice_group_id: null,
    choice_group_pick: null,
    ...over,
  } as NexusQBQuestion;
}

const drawing = question({
  id: 'q-drawing',
  question_format: 'DRAWING_PROMPT',
  question_text: 'Compose a street view with two shops and a tree.',
  question_image_url: null,
  solution_image_url: null,
  options: null,
  correct_answer: null,
  section: 'drawing',
  section_order: 4,
  categories: ['drawing'],
  drawing_marks: 50,
  design_principle_tested: 'balance',
  colour_constraint: 'maximum 4 colours',
  objects_to_include: [{ name: 'shop', count: 2 }, { name: 'tree' }],
  drawing_focus_points: [{ text: 'horizon line is correct', weight: 2 }],
  needs_image: null,
});

const numerical = question({
  id: 'q-num',
  question_format: 'NUMERICAL',
  question_text: 'How many edges does a cuboid have?',
  options: null,
  correct_answer: '12',
  answer_tolerance: 0,
  section: 'math_numerical',
  section_order: 2,
  categories: ['mathematics'],
  question_image_url: null,
  solution_image_url: null,
  marks_correct: 4,
  marks_negative: 1,
});

function exportInput(over: Partial<PaperExportInput> = {}): PaperExportInput {
  return {
    paper,
    questions: [question(), drawing, numerical],
    questionNumbers: { 'q-mcq': 1, 'q-drawing': 3, 'q-num': 2 },
    tagsByQuestion: { 'q-mcq': ['jee_paper_2', 'perspective'], 'q-drawing': ['street_view'] },
    marking: { source: 'scheme', scheme: { objective: [4, 1], drawing: [50, 0] } },
    ...over,
  };
}

// ---------------------------------------------------------------------------

describe('toPaperJSON', () => {
  it('stamps the schema and version', () => {
    const doc = toPaperJSON(exportInput());
    expect(doc.schema).toBe(SCHEMA_NAME);
    expect(doc.version).toBe(SCHEMA_VERSION);
  });

  it('groups questions into sections in the order a candidate sits them', () => {
    const doc = toPaperJSON(exportInput());
    expect(doc.sections.map((s) => s.section_key)).toEqual([
      'math_numerical',
      'aptitude',
      'drawing',
    ]);
  });

  it('carries the paper identity and its duration', () => {
    const doc = toPaperJSON(exportInput());
    expect(doc.paper).toMatchObject({ exam_type: 'JEE_PAPER_2', year: 2005, duration_minutes: 180 });
  });

  it('carries the explanations and the solution video', () => {
    const doc = toPaperJSON(exportInput());
    const q = doc.sections.find((s) => s.section_key === 'aptitude')!.questions[0];
    expect(q.solution?.explanation_brief).toBe('Both vanishing points sit on the eye level.');
    expect(q.solution?.video_url).toBe('https://youtu.be/abc123');
  });

  it('emits the drawing block only on a drawing', () => {
    const doc = toPaperJSON(exportInput());
    const draw = doc.sections.find((s) => s.section_key === 'drawing')!.questions[0];
    const mcq = doc.sections.find((s) => s.section_key === 'aptitude')!.questions[0];
    expect(draw.drawing).toMatchObject({ design_principle: 'balance', marks: 50 });
    expect(mcq.drawing).toBeUndefined();
  });

  it('never emits an answer for a self-assessed format', () => {
    const doc = toPaperJSON(exportInput());
    const draw = doc.sections.find((s) => s.section_key === 'drawing')!.questions[0];
    expect(draw.correct_answer).toBeUndefined();
  });
});

describe('image URLs', () => {
  it('exports the stored URL verbatim, including a legacy supabase.co host', () => {
    const doc = toPaperJSON(exportInput());
    const q = doc.sections.find((s) => s.section_key === 'aptitude')!.questions[0];
    expect(q.images?.solution).toBe(
      'https://zdnypksjqnhtiblwdaic.supabase.co/storage/v1/object/public/uploads/nexus/question-bank/u1/solutions/1.png',
    );
    expect(q.images?.question).toContain('db.neramclasses.com');
  });

  it('survives a round trip without being rewritten', () => {
    const doc = toPaperJSON(exportInput());
    const back = parsePaperJSON(doc);
    const q = back.questions.find((x) => x.question_number === 1)!;
    expect(q.solution_image_url).toBe(
      'https://zdnypksjqnhtiblwdaic.supabase.co/storage/v1/object/public/uploads/nexus/question-bank/u1/solutions/1.png',
    );
  });

  it('keeps a data: URI for the writer to upload', () => {
    const doc = toPaperJSON(exportInput());
    doc.sections[1].questions[0].images = { question: 'data:image/png;base64,AAAA' };
    const back = parsePaperJSON(doc);
    expect(back.questions.find((q) => q.question_number === 1)!.question_image_url).toBe(
      'data:image/png;base64,AAAA',
    );
  });
});

describe('round trip', () => {
  it('preserves every question and its number', () => {
    const back = parsePaperJSON(toPaperJSON(exportInput()));
    expect(back.valid).toBe(true);
    expect(back.errors).toEqual([]);
    expect(back.questions.map((q) => q.question_number).sort()).toEqual([1, 2, 3]);
  });

  it('preserves the MCQ answer as the positional id the bank stores', () => {
    const back = parsePaperJSON(toPaperJSON(exportInput()));
    expect(back.questions.find((q) => q.question_number === 1)!.correct_answer).toBe('a');
  });

  it('preserves a numerical answer and its tolerance', () => {
    const back = parsePaperJSON(toPaperJSON(exportInput()));
    const q = back.questions.find((x) => x.question_number === 2)!;
    expect(q.correct_answer).toBe('12');
    expect(q.answer_tolerance).toBe(0);
  });

  it('preserves the drawing setup', () => {
    const back = parsePaperJSON(toPaperJSON(exportInput()));
    const q = back.questions.find((x) => x.question_number === 3)!;
    expect(q.objects_to_include).toEqual([{ name: 'shop', count: 2 }, { name: 'tree' }]);
    expect(q.drawing_focus_points).toEqual([{ text: 'horizon line is correct', weight: 2 }]);
    expect(q.colour_constraint).toBe('maximum 4 colours');
  });

  it('preserves the registry tags', () => {
    const back = parsePaperJSON(toPaperJSON(exportInput()));
    expect(back.questions.find((q) => q.question_number === 1)!.tag_slugs).toEqual([
      'jee_paper_2',
      'perspective',
    ]);
  });

  it('preserves needs_image, and leaves it unmentioned when nobody has looked', () => {
    const back = parsePaperJSON(toPaperJSON(exportInput()));
    expect(back.questions.find((q) => q.question_number === 1)!.needs_image).toBe(true);
    // The drawing's needs_image is NULL in the bank, which means "nobody has
    // decided". Exporting that as an explicit null would turn a re-upload into
    // a decision the file never made.
    expect('needs_image' in back.questions.find((q) => q.question_number === 3)!).toBe(false);
  });

  it('preserves the paper identity and duration', () => {
    const back = parsePaperJSON(toPaperJSON(exportInput()));
    expect(back.paper).toMatchObject({ exam_type: 'JEE_PAPER_2', year: 2005, duration_minutes: 180 });
  });
});

describe('marks', () => {
  it('round-trips a stated per-question mark', () => {
    const back = parsePaperJSON(toPaperJSON(exportInput()));
    const q = back.questions.find((x) => x.question_number === 2)!;
    expect(q.marks_correct).toBe(4);
    expect(q.marks_negative).toBe(1);
  });

  it('leaves an unstated mark unmentioned so the scheme still applies', () => {
    const doc = toPaperJSON(exportInput());
    const exported = doc.sections.find((s) => s.section_key === 'aptitude')!.questions[0];
    expect('marks_correct' in exported).toBe(false);

    const back = parsePaperJSON(doc);
    expect('marks_correct' in back.questions.find((q) => q.question_number === 1)!).toBe(false);
  });

  it('reads a mark edited into the file by hand', () => {
    const doc = toPaperJSON(exportInput());
    doc.sections[1].questions[0].marks_correct = 2;
    const back = parsePaperJSON(doc);
    expect(back.questions.find((q) => q.question_number === 1)!.marks_correct).toBe(2);
  });
});

describe('choice groups', () => {
  it('exports a key and a pick, and reads them back', () => {
    const input = exportInput({
      questions: [
        question({ id: 'q-mcq', choice_group_id: 'grp-1', choice_group_pick: 1 }),
        question({ id: 'q-alt', choice_group_id: 'grp-1', choice_group_pick: 1 }),
      ],
      questionNumbers: { 'q-mcq': 91, 'q-alt': 92 },
    });
    const back = parsePaperJSON(toPaperJSON(input));
    const keys = back.questions.map((q) => q.choice_group_key);
    expect(keys[0]).toBe(keys[1]);
    expect(back.questions[0].choice_group_pick).toBe(1);
  });

  it('keeps distinct groups distinct', () => {
    const input = exportInput({
      questions: [
        question({ id: 'a', choice_group_id: 'grp-1' }),
        question({ id: 'b', choice_group_id: 'grp-2' }),
      ],
      questionNumbers: { a: 91, b: 92 },
    });
    const back = parsePaperJSON(toPaperJSON(input));
    expect(back.questions[0].choice_group_key).not.toBe(back.questions[1].choice_group_key);
  });
});

describe('v1 files still import', () => {
  const v1 = {
    schema_version: '1.0',
    paper: { exam_name: 'JEE Main 2005 Paper 2', total_questions: 2 },
    sections: [
      {
        name: 'Aptitude',
        section_key: 'aptitude',
        question_count: 2,
        questions: [
          {
            question_number: 1,
            question_text: 'Pick the odd one out.',
            question_format: 'MCQ',
            question_image: 'https://example.com/fig1.png',
            options: [
              { label: 'A', text: 'Cube' },
              { label: 'B', text: 'Sphere' },
              { label: 'C', text: 'Cone' },
              { label: 'D', text: 'Square' },
            ],
            correct_answer: 'D',
            explanation_brief: 'A square is 2D.',
            solution_video_url: 'https://youtu.be/v1',
          },
          {
            question_number: 2,
            question_text: 'Draw a still life.',
            question_format: 'DRAWING_PROMPT',
            drawing_objects: ['bottle', 'bowl'],
            drawing_color_constraint: 'monochrome',
            drawing_design_principle: 'rhythm',
            drawing_sub_type: '2d_composition',
          },
        ],
      },
    ],
  };

  it('parses without error', () => {
    const back = parsePaperJSON(v1);
    expect(back.valid).toBe(true);
    expect(back.questions).toHaveLength(2);
  });

  it('resolves a labelled answer to its positional id', () => {
    const back = parsePaperJSON(v1);
    expect(back.questions[0].correct_answer).toBe('d');
  });

  it('reads the flat explanation and video fields', () => {
    const back = parsePaperJSON(v1);
    expect(back.questions[0].explanation_brief).toBe('A square is 2D.');
    expect(back.questions[0].solution_video_url).toBe('https://youtu.be/v1');
  });

  it('reads the flat question_image into the figure slot', () => {
    const back = parsePaperJSON(v1);
    expect(back.questions[0].question_image_url).toBe('https://example.com/fig1.png');
  });

  it('normalises string drawing objects into named objects', () => {
    const back = parsePaperJSON(v1);
    expect(back.questions[1].objects_to_include).toEqual([{ name: 'bottle' }, { name: 'bowl' }]);
  });

  it('rescues drawing_sub_type as a registry tag instead of dropping it', () => {
    const back = parsePaperJSON(v1);
    expect(back.questions[1].tag_slugs).toContain('2d_composition');
  });

  it('says the file does not identify its paper rather than failing', () => {
    const back = parsePaperJSON(v1);
    expect(back.paper).toBeNull();
    expect(back.warnings.join(' ')).toContain('does not say which paper');
  });

  it('moves a drawing out of the aptitude section its heading claimed', () => {
    const back = parsePaperJSON(v1);
    expect(back.questions[1].section).toBe('drawing');
  });
});

describe('patch semantics', () => {
  // The reason every optional field is tri-state. A hand-written file that
  // corrects one explanation must not null out everything it left out.
  const patch = {
    schema: SCHEMA_NAME,
    version: SCHEMA_VERSION,
    paper: { exam_type: 'JEE_PAPER_2', year: 2005 },
    sections: [
      {
        name: 'Aptitude',
        section_key: 'aptitude',
        question_count: 1,
        questions: [{ question_number: 1, solution: { explanation_brief: 'Fixed.' } }],
      },
    ],
  };

  it('mentions only the field the file carried', () => {
    const q = parsePaperJSON(patch).questions[0];
    expect(q.explanation_brief).toBe('Fixed.');
    expect(Object.keys(q).sort()).toEqual(['explanation_brief', 'question_number']);
  });

  it('leaves images, answers and tags entirely unmentioned', () => {
    const q = parsePaperJSON(patch).questions[0];
    expect('question_image_url' in q).toBe(false);
    expect('solution_image_url' in q).toBe(false);
    expect('correct_answer' in q).toBe(false);
    expect('tag_slugs' in q).toBe(false);
    expect('options' in q).toBe(false);
  });

  it('distinguishes an explicit null from an omission', () => {
    const doc = JSON.parse(JSON.stringify(patch));
    doc.sections[0].questions[0].solution.video_url = null;
    const q = parsePaperJSON(doc).questions[0];
    expect('solution_video_url' in q).toBe(true);
    expect(q.solution_video_url).toBeNull();
  });

  it('does not clear drawing columns on a question that is not a drawing', () => {
    const back = parsePaperJSON(toPaperJSON(exportInput()));
    const mcq = back.questions.find((q) => q.question_number === 1)!;
    expect('drawing_marks' in mcq).toBe(false);
    expect('colour_constraint' in mcq).toBe(false);
  });

  it('still carries a full export in full', () => {
    const q = parsePaperJSON(toPaperJSON(exportInput())).questions.find(
      (x) => x.question_number === 1,
    )!;
    expect(q.question_text).toContain('vanishing point');
    expect(q.options).toHaveLength(4);
    expect(q.explanation_brief).toBeTruthy();
    expect(q.tag_slugs).toHaveLength(2);
  });
});

describe('tolerance', () => {
  it('keeps a contentless question for the writer to judge', () => {
    // Not skipped here on purpose: with no text and no figure this is either a
    // broken new question or a valid patch, and only the writer knows which.
    const doc = toPaperJSON(exportInput());
    doc.sections[1].questions.push({
      question_number: 99,
      question_format: 'MCQ',
      question_text: '',
    });
    const back = parsePaperJSON(doc);
    expect(back.valid).toBe(true);
    expect(back.questions).toHaveLength(4);
    expect(back.skipped).toEqual([]);
  });

  it('keeps the first of two rows claiming the same number', () => {
    const doc = toPaperJSON(exportInput());
    doc.sections[1].questions.push({
      question_number: 1,
      question_format: 'MCQ',
      question_text: 'A duplicate.',
    });
    const back = parsePaperJSON(doc);
    expect(back.questions.find((q) => q.question_number === 1)!.question_text).toContain(
      'vanishing point',
    );
    expect(back.skipped[0].reason).toContain('duplicate');
  });

  it('warns when the declared total does not match', () => {
    const doc = toPaperJSON(exportInput());
    doc.paper.total_questions = 92;
    expect(parsePaperJSON(doc).warnings.join(' ')).toContain('92 questions and the file has 3');
  });

  it('rejects a document that is not an object', () => {
    expect(parsePaperJSON('nope').valid).toBe(false);
  });

  it('rejects a document with no sections', () => {
    const back = parsePaperJSON({ schema: SCHEMA_NAME, version: 2, paper: paper });
    expect(back.valid).toBe(false);
    expect(back.errors.join(' ')).toContain('sections');
  });

  it('warns about a version it cannot fully read', () => {
    const doc = { ...toPaperJSON(exportInput()), version: 99 };
    expect(parsePaperJSON(doc).warnings.join(' ')).toContain('version 99');
  });
});

describe('diffPaperQuestions', () => {
  const current = () => parsePaperJSON(toPaperJSON(exportInput())).questions;

  it('ignores an explicit null the bank stores but the file omits', () => {
    // bulkCreateDraftQuestions writes `image_url: opt.image_url || null`, so a
    // real MCQ row carries image_url: null on every option, while the export
    // drops nulls to keep the file readable. Comparing those two raw would
    // report every MCQ on the paper as changed by a re-upload that changed
    // nothing. Same reasoning as `same()` in qb-paper-io.ts; keep them in step.
    const stored = parsePaperJSON(toPaperJSON(exportInput())).questions.map((q) =>
      q.question_number === 1
        ? {
            ...q,
            options: q.options?.map((o) => ({ ...o, image_url: null, text_hi: null })),
          }
        : q,
    );
    const incoming = parsePaperJSON(toPaperJSON(exportInput())).questions;

    const diff = diffPaperQuestions(stored as never, incoming);
    expect(diff.updated).toEqual([]);
    expect(diff.unchanged).toHaveLength(3);
  });

  it('reports nothing changed for an untouched round trip', () => {
    const diff = diffPaperQuestions(current(), current());
    expect(diff.updated).toEqual([]);
    expect(diff.created).toEqual([]);
    expect(diff.untouched).toEqual([]);
    expect(diff.unchanged).toHaveLength(3);
  });

  it('names the one field a patch changes', () => {
    const doc = toPaperJSON(exportInput());
    doc.sections[1].questions[0].solution!.explanation_brief = 'Rewritten.';
    const diff = diffPaperQuestions(current(), parsePaperJSON(doc).questions);
    expect(diff.updated).toEqual([{ question_number: 1, fields: ['explanation_brief'] }]);
    expect(diff.unchanged).toHaveLength(2);
  });

  it('counts a question the file adds as created', () => {
    const doc = toPaperJSON(exportInput());
    doc.sections[1].questions.push({
      question_number: 47,
      question_format: 'MCQ',
      question_text: 'A brand new question.',
    });
    const diff = diffPaperQuestions(current(), parsePaperJSON(doc).questions);
    expect(diff.created).toEqual([47]);
  });

  it('counts questions the file leaves out as untouched, never as deleted', () => {
    const doc = toPaperJSON(exportInput());
    doc.sections = [doc.sections[1]];
    const diff = diffPaperQuestions(current(), parsePaperJSON(doc).questions);
    expect(diff.untouched.sort()).toEqual([2, 3]);
    expect(diff.created).toEqual([]);
  });

  it('does not report a change for a field the file never mentions', () => {
    const patch = parsePaperJSON({
      schema: SCHEMA_NAME,
      version: SCHEMA_VERSION,
      paper: { exam_type: 'JEE_PAPER_2', year: 2005 },
      sections: [
        {
          name: 'Aptitude',
          section_key: 'aptitude',
          question_count: 1,
          questions: [{ question_number: 1, marks_correct: 3 }],
        },
      ],
    }).questions;
    const diff = diffPaperQuestions(current(), patch);
    expect(diff.updated).toEqual([{ question_number: 1, fields: ['marks_correct'] }]);
  });
});

describe('paperJSONFilename', () => {
  it('names a plain paper', () => {
    expect(paperJSONFilename({ exam_type: 'JEE_PAPER_2', year: 2005 })).toBe('jee_paper_2_2005.json');
  });

  it('includes the session and shift when there is one', () => {
    expect(
      paperJSONFilename({ exam_type: 'NATA', year: 2025, session: 'Session 1', shift: 'forenoon' }),
    ).toBe('nata_2025_session_1_forenoon.json');
  });
});
