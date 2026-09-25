import { describe, it, expect } from 'vitest';
import {
  DRAFT_MAX_AGE_MS,
  DRAFT_VERSION,
  activeQuestions,
  canEnterStep,
  deserialiseDraft,
  draftReducer,
  draftShedLevels,
  emptyDraft,
  estimatedMinutes,
  inferTestKind,
  isPublishable,
  isResumable,
  nextStep,
  parseSourceKind,
  placementRequests,
  prevStep,
  requestedStepFromUrl,
  resolveStep,
  SOURCE_KINDS,
  clampQuestionsToServe,
  sittingsBeforeRepeat,
  totalMarks,
  type DraftQuestion,
  type TestDraft,
} from './test-wizard-draft';

const NOW = Date.parse('2026-08-08T10:00:00.000Z');

function draft(patch: Partial<TestDraft> = {}): TestDraft {
  return { ...emptyDraft('d1', new Date(NOW).toISOString()), ...patch };
}

function question(patch: Partial<DraftQuestion> = {}): DraftQuestion {
  return {
    key: 'q1',
    bank_question_id: null,
    question_text: 'In two-point perspective, vertical edges remain',
    question_format: 'MCQ',
    options: [
      { id: 'a', text: 'Parallel' },
      { id: 'b', text: 'Converging' },
    ],
    correct_answer: 'a',
    explanation: null,
    source_quote: null,
    image_ref: null,
    difficulty: 'MEDIUM',
    exam_relevance: 'BOTH',
    tag_ids: [],
    tag_slugs: [],
    new_tag_slugs: [],
    marks: 1,
    negative_marks: 0,
    action: 'create',
    existing_question_id: null,
    candidates: [],
    ...patch,
  };
}

/**
 * The convergence is the design. Four source branches, one review screen. If a
 * branch can reach step 3 carrying a shape the others do not, step 3 has to
 * grow a conditional, and that is how four near-copies came to exist in the
 * first place.
 */
describe('source branches converge', () => {
  const branches = ['ai', 'json', 'bank', 'pyq'] as const;

  it.each(branches)('%s ends up in draft.questions via one action', (source) => {
    let d = draftReducer(draft(), { type: 'pickSource', source });
    d = draftReducer(d, {
      type: 'questionsReady',
      questions: [question({ key: `${source}-1` })],
    });
    expect(d.questions).toHaveLength(1);
    expect(d.questions[0].key).toBe(`${source}-1`);
  });

  it('changing source discards the previous branch, keeping it would mix two provenances', () => {
    let d = draftReducer(draft(), { type: 'pickSource', source: 'ai' });
    d = draftReducer(d, { type: 'questionsReady', questions: [question()] });
    d = draftReducer(d, { type: 'pickSource', source: 'bank' });
    expect(d.questions).toEqual([]);
  });

  it('re-picking the SAME source keeps the work', () => {
    let d = draftReducer(draft(), { type: 'pickSource', source: 'ai' });
    d = draftReducer(d, { type: 'questionsReady', questions: [question()] });
    d = draftReducer(d, { type: 'pickSource', source: 'ai' });
    expect(d.questions).toHaveLength(1);
  });

  it('does not move the step itself, the URL owns that', () => {
    // When both the reducer and the URL owned the step, picking a source and
    // then pressing browser Back landed on an empty review screen, because the
    // reducer still believed it was past step 2.
    const d = draftReducer(draft(), { type: 'pickSource', source: 'ai' });
    expect(d.step).toBe('source');
    expect(d.source).toBe('ai');
  });
});

describe('questionsReady title handling', () => {
  it('fills a blank title from the reply', () => {
    const d = draftReducer(draft(), {
      type: 'questionsReady',
      questions: [question()],
      title: 'History of Architecture',
    });
    expect(d.title).toBe('History of Architecture');
  });

  it('never overwrites a title the teacher typed', () => {
    let d = draftReducer(draft(), { type: 'setTitle', title: 'Week 32' });
    d = draftReducer(d, { type: 'questionsReady', questions: [question()], title: 'Whatever AI said' });
    expect(d.title).toBe('Week 32');
  });
});

describe('a verified previous-year paper skips review', () => {
  it('faithful mode sets skipReview', () => {
    const d = draftReducer(draft({ source: 'pyq' }), {
      type: 'patchPyq',
      patch: { paperId: 'p1', mode: 'faithful' },
    });
    expect(d.skipReview).toBe(true);
    expect(nextStep({ ...d, step: 'generate' })).toBe('place');
  });

  it('questions-only mode is editable raw material, so it does not skip', () => {
    const d = draftReducer(draft({ source: 'pyq' }), {
      type: 'patchPyq',
      patch: { paperId: 'p1', mode: 'questions_only' },
    });
    expect(d.skipReview).toBe(false);
    expect(nextStep({ ...d, step: 'generate' })).toBe('review');
  });

  it('back from place returns to generate when review was skipped', () => {
    const d = draft({ step: 'place', skipReview: true, source: 'pyq' });
    expect(prevStep(d)).toBe('generate');
  });
});

describe('step reachability', () => {
  it('review is unreachable on a fresh draft, so ?step=review cannot paint an empty screen', () => {
    expect(canEnterStep(draft(), 'review')).toBe(false);
    expect(resolveStep(draft(), 'review')).toBe('source');
  });

  it('picking a source alone does not make review reachable', () => {
    // The bug this pins: with only `source !== null` required, a teacher who
    // picked "Generate with AI" and pressed Back saw "0 questions · 0 marks".
    expect(canEnterStep(draft({ source: 'ai' }), 'review')).toBe(false);
    expect(canEnterStep(draft({ source: 'ai', questions: [question()] }), 'review')).toBe(true);
  });

  it('a blank test can reach review with no questions, that is the point of it', () => {
    expect(canEnterStep(draft({ source: 'blank' }), 'review')).toBe(true);
  });

  it('place needs questions', () => {
    expect(canEnterStep(draft({ source: 'ai' }), 'place')).toBe(false);
    expect(canEnterStep(draft({ source: 'ai', questions: [question()] }), 'place')).toBe(true);
  });

  it('no step in the url is always step 1, which is what makes Back work', () => {
    const d = draft({ source: 'ai', questions: [question()] });
    expect(resolveStep(d, null)).toBe('source');
  });

  it('a stale url lands on the furthest reachable step, not back at step 1', () => {
    const d = draft({ source: 'ai', questions: [question()] });
    expect(resolveStep(d, 'nonsense')).toBe('place');
  });

  it('honours a legal request', () => {
    const d = draft({ source: 'ai', questions: [question()] });
    expect(resolveStep(d, 'generate')).toBe('generate');
  });

  /**
   * A deep link arrives with an EMPTY draft. Resolving the step against
   * `draft.source` alone decided generate was unreachable, fell back to step 1
   * and rewrote the URL, which silently broke every link into a branch. The
   * hook seeds `source` from `?src=` before calling this, so the fix is that
   * resolveStep sees a source on the first render.
   */
  it('a deep link into a branch resolves on the first render', () => {
    const seeded = draft({ source: 'bank' });
    expect(resolveStep(seeded, 'generate')).toBe('generate');
    // Without the seed, which is the bug this pins.
    expect(resolveStep(draft(), 'generate')).toBe('source');
  });
});

describe('a bare ?src= deep link opens that branch', () => {
  it('reads src without step as the branch panel, not the source picker', () => {
    // /teacher/tests/new?src=json is what the study material "Build a new test"
    // button and the old import URL send. It used to land on step 1.
    expect(requestedStepFromUrl(null, 'json')).toBe('generate');
    expect(requestedStepFromUrl(null, 'bank')).toBe('generate');
    expect(requestedStepFromUrl(null, 'blank')).toBe('review');
  });

  it('keeps the plain entry URL as step 1, so browser Back still reaches it', () => {
    expect(requestedStepFromUrl(null, null)).toBeNull();
    expect(resolveStep(draft({ source: 'json' }), requestedStepFromUrl(null, null))).toBe('source');
  });

  it('never overrides an explicit step', () => {
    expect(requestedStepFromUrl('place', 'json')).toBe('place');
    expect(requestedStepFromUrl('source', 'json')).toBe('source');
  });

  it('resolves to the JSON panel on a fresh draft seeded from the URL', () => {
    expect(resolveStep(draft({ source: 'json' }), requestedStepFromUrl(null, 'json'))).toBe('generate');
  });
});

describe('parseSourceKind', () => {
  it('accepts every real branch', () => {
    for (const k of SOURCE_KINDS) expect(parseSourceKind(k)).toBe(k);
  });

  it('refuses anything else, since ?src= is a string a typo chooses', () => {
    expect(parseSourceKind('nonsense')).toBeNull();
    expect(parseSourceKind('')).toBeNull();
    expect(parseSourceKind(null)).toBeNull();
  });
});

describe('derived facts', () => {
  it('a skipped row is a decision, not a deletion, but it is not in the test', () => {
    const d = draft({ questions: [question({ key: 'a' }), question({ key: 'b', action: 'skip' })] });
    expect(d.questions).toHaveLength(2);
    expect(activeQuestions(d)).toHaveLength(1);
    expect(totalMarks(d)).toBe(1);
  });

  it('totals marks per question, not per row count', () => {
    const d = draft({ questions: [question({ key: 'a', marks: 4 }), question({ key: 'b', marks: 4 })] });
    expect(totalMarks(d)).toBe(8);
  });

  it('a drawing question dominates the time estimate', () => {
    const mcqOnly = draft({ questions: [question()] });
    const withDrawing = draft({
      questions: [question(), question({ key: 'd', question_format: 'DRAWING_PROMPT' })],
    });
    expect(estimatedMinutes(withDrawing)).toBeGreaterThan(estimatedMinutes(mcqOnly) + 5);
  });

  it('is not publishable without a title', () => {
    expect(isPublishable(draft({ questions: [question()] }))).toBe(false);
    expect(isPublishable(draft({ title: 'Week 32', questions: [question()] }))).toBe(true);
  });

  it('is not publishable with only skipped questions', () => {
    const d = draft({ title: 'Week 32', questions: [question({ action: 'skip' })] });
    expect(isPublishable(d)).toBe(false);
  });

  it('a faithful paper is publishable with no draft questions of its own', () => {
    const d = draft({ title: 'JEE 2019', skipReview: true, pyq: { paperId: 'p1', mode: 'faithful', blueprint: null } });
    expect(isPublishable(d)).toBe(true);
  });
});

/**
 * The routing table. A class test placed through the generic route gets no
 * due_at and no `required` flag, and the catch-up reader treats a missing
 * `required` as true, so it silently becomes required forever. That bug is the
 * reason this mapping is a tested pure function rather than inline fetch calls.
 */
describe('placementRequests routing', () => {
  it('sends a class test through the timetable route, never the generic one', () => {
    const d = draft({
      placements: [{ kind: 'class_test', classId: 'c1', label: 'Perspective', dueAt: '2026-08-15T18:00:00Z' }],
    });
    const reqs = placementRequests(d);
    expect(reqs).toHaveLength(1);
    expect(reqs[0].via).toBe('class-test');
    expect(reqs[0].body.due_at).toBe('2026-08-15T18:00:00Z');
    expect(reqs[0].body.required).toBe(true);
  });

  it('weekly and mock ride on classroom_assignment with a scheduled start', () => {
    const d = draft({
      placements: [{ kind: 'weekly', classroomId: 'r1', label: 'Week 32', availableFrom: '2026-08-15T18:00:00Z' }],
    });
    const [req] = placementRequests(d);
    expect(req.via).toBe('placements');
    expect(req.body.context_type).toBe('classroom_assignment');
    expect(req.body.available_from).toBe('2026-08-15T18:00:00Z');
  });

  it('a chapter is a study_file placement', () => {
    const d = draft({ placements: [{ kind: 'chapter', fileId: 'f1', label: 'Ch.1' }] });
    const [req] = placementRequests(d);
    expect(req.body.context_type).toBe('study_file');
    expect(req.body.context_id).toBe('f1');
  });

  it('a capped attempt count travels in gating, since no column holds it', () => {
    const d = draft({
      rules: { ...draft().rules, attempts: 1 },
      placements: [{ kind: 'chapter', fileId: 'f1', label: 'Ch.1' }],
    });
    // attempt_limit, not a new key: startOrResumeAttempt already reads this one
    // and throws ATTEMPT_LIMIT_REACHED, so the cap on screen is real.
    expect(placementRequests(d)[0].body.gating).toEqual({ attempt_limit: 1 });
  });

  it('unlimited attempts send no cap at all', () => {
    const d = draft({ placements: [{ kind: 'chapter', fileId: 'f1', label: 'Ch.1' }] });
    expect(placementRequests(d)[0].body.gating).toEqual({});
  });
});

describe('inferTestKind, the kind comes from where it lives', () => {
  it('a faithful paper is a full mock whatever else is ticked', () => {
    const d = draft({
      pyq: { paperId: 'p1', mode: 'faithful', blueprint: null },
      placements: [{ kind: 'chapter', fileId: 'f1', label: 'Ch.1' }],
    });
    expect(inferTestKind(d)).toBe('full');
  });

  it('a class test outranks a mock shelf listing', () => {
    const d = draft({
      placements: [
        { kind: 'mock', classroomId: 'r1', label: 'Mocks', availableFrom: null },
        { kind: 'class_test', classId: 'c1', label: 'Perspective', dueAt: null },
      ],
    });
    expect(inferTestKind(d)).toBe('classroom_assigned');
  });

  it('a chapter placement makes it a chapter test', () => {
    expect(inferTestKind(draft({ placements: [{ kind: 'chapter', fileId: 'f1', label: 'Ch.1' }] }))).toBe('chapter');
  });
});

describe('persistence', () => {
  it('sheds the raw paste first, then candidates, and never the questions', () => {
    const d = draft({
      json: { raw: '{"questions":[]}', fileName: 'x.json', fileSize: 10 },
      questions: [question({ candidates: [{ id: 'x', question_text: 'dup', similarity: 0.9 }] })],
    });
    const levels = draftShedLevels(d);
    expect(levels[0].json.raw).not.toBe('');
    expect(levels[1].json.raw).toBe('');
    expect(levels[1].questions[0].candidates).toHaveLength(1);
    expect(levels[2].questions[0].candidates).toHaveLength(0);
    for (const level of levels) expect(level.questions).toHaveLength(1);
  });

  it('round-trips a draft', () => {
    const d = draft({ title: 'Week 32', questions: [question()] });
    expect(deserialiseDraft(JSON.stringify(d), NOW)).toEqual(d);
  });

  it('discards a draft from an older version', () => {
    const d = { ...draft(), v: DRAFT_VERSION - 1 };
    expect(deserialiseDraft(JSON.stringify(d), NOW)).toBeNull();
  });

  it('discards a stale draft rather than letting last week be published by accident', () => {
    const d = draft();
    expect(deserialiseDraft(JSON.stringify(d), NOW + DRAFT_MAX_AGE_MS + 1)).toBeNull();
    expect(deserialiseDraft(JSON.stringify(d), NOW + DRAFT_MAX_AGE_MS - 1)).not.toBeNull();
  });

  it('survives garbage without throwing', () => {
    expect(deserialiseDraft('not json', NOW)).toBeNull();
    expect(deserialiseDraft('null', NOW)).toBeNull();
    expect(deserialiseDraft('{"v":1}', NOW)).toBeNull();
    expect(deserialiseDraft(null, NOW)).toBeNull();
  });

  it('only offers to resume work that actually exists', () => {
    expect(isResumable(draft())).toBe(false);
    expect(isResumable(draft({ questions: [question()] }))).toBe(true);
    expect(isResumable(draft({ bank: { selectedIds: ['a'], matchedCount: 1 } }))).toBe(true);
  });
});

describe('each student gets a random subset', () => {
  const many = (n: number) => Array.from({ length: n }, (_, i) => question({ key: `q${i}` }));

  it('defaults to every question', () => {
    expect(draft().rules.questionsToServe).toBeNull();
  });

  it('stores a subset through patchRules', () => {
    const next = draftReducer(draft({ questions: many(150) }), { type: 'patchRules', patch: { questionsToServe: 50 } });
    expect(next.rules.questionsToServe).toBe(50);
    expect(next.rules.shuffle).toBe(true);
  });

  it('clamps to the questions the draft holds, and serving them all is null', () => {
    const d = draft({ questions: many(40) });
    expect(draftReducer(d, { type: 'patchRules', patch: { questionsToServe: 80 } }).rules.questionsToServe).toBeNull();
    expect(draftReducer(d, { type: 'patchRules', patch: { questionsToServe: 40 } }).rules.questionsToServe).toBeNull();
    expect(draftReducer(d, { type: 'patchRules', patch: { questionsToServe: 2 } }).rules.questionsToServe).toBe(5);
    expect(draftReducer(d, { type: 'patchRules', patch: { questionsToServe: null } }).rules.questionsToServe).toBeNull();
  });

  it('counts only the questions that will be in the test', () => {
    const d = draft({ questions: [...many(12), question({ key: 'skip1', action: 'skip' })] });
    expect(draftReducer(d, { type: 'patchRules', patch: { questionsToServe: 12 } }).rules.questionsToServe).toBeNull();
    expect(draftReducer(d, { type: 'patchRules', patch: { questionsToServe: 10 } }).rules.questionsToServe).toBe(10);
  });

  it('offers no subset below ten questions', () => {
    expect(clampQuestionsToServe(5, 9)).toBeNull();
    expect(clampQuestionsToServe(5, 10)).toBe(5);
  });

  it('reads garbage as every question', () => {
    expect(clampQuestionsToServe('abc', 100)).toBeNull();
    expect(clampQuestionsToServe(-4, 100)).toBeNull();
    expect(clampQuestionsToServe(undefined, 100)).toBeNull();
    expect(clampQuestionsToServe(12.7, 100)).toBe(12);
  });

  it('leaves other rules alone', () => {
    const d = draft({ questions: many(30), rules: { ...draft().rules, questionsToServe: 10 } });
    const next = draftReducer(d, { type: 'patchRules', patch: { passPct: 70 } });
    expect(next.rules.questionsToServe).toBe(10);
    expect(next.rules.passPct).toBe(70);
  });

  it('counts the sittings before a question repeats the way the draw does', () => {
    expect(sittingsBeforeRepeat(150, 50)).toBe(3);
    expect(sittingsBeforeRepeat(40, 15)).toBe(2);
    expect(sittingsBeforeRepeat(40, null)).toBe(1);
    expect(sittingsBeforeRepeat(40, 40)).toBe(1);
  });

  it('resumes a draft saved before the field existed, reading it as every question', () => {
    const d = draft({ title: 'Old', questions: [question()] });
    const { questionsToServe: _drop, ...oldRules } = d.rules;
    const stored = JSON.stringify({ ...d, rules: oldRules });
    const resumed = deserialiseDraft(stored, NOW);
    expect(resumed).not.toBeNull();
    expect(resumed!.rules.questionsToServe).toBeNull();
    expect(resumed!.rules.passPct).toBe(d.rules.passPct);
  });
});
