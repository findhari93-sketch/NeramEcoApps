import { describe, it, expect } from 'vitest';
import {
  ASSIGNMENT_MODES,
  assignmentTypeForMode,
  defaultEvaluationForMode,
  modeSwitchBlockedReason,
  modeWantsQuestions,
  resolveAssignmentMode,
  type AssignmentMode,
} from './assignment-mode';

describe('resolveAssignmentMode', () => {
  it('reads a drawing as a drawing whatever the question count says', () => {
    // Nothing should ever attach questions to a drawing, but if something did,
    // the drawing pipeline still owns the submission and must win.
    expect(resolveAssignmentMode('drawing', 0)).toBe('drawing');
    expect(resolveAssignmentMode('drawing', 4)).toBe('drawing');
  });

  it('splits document assignments on whether a paper is attached', () => {
    expect(resolveAssignmentMode('document', 0)).toBe('upload');
    expect(resolveAssignmentMode('document', 1)).toBe('questions');
    expect(resolveAssignmentMode('document', 20)).toBe('questions');
  });

  it('moves from upload to questions the moment the first question exists', () => {
    // This is the whole reason the mode is derived: adding a question is the
    // only action needed, with nothing else to keep in step.
    expect(resolveAssignmentMode('document', 0)).toBe('upload');
    expect(resolveAssignmentMode('document', 0 + 1)).toBe('questions');
  });

  it('treats a negative count as no questions rather than throwing', () => {
    expect(resolveAssignmentMode('document', -1)).toBe('upload');
  });
});

describe('assignmentTypeForMode', () => {
  it('round-trips every mode back through resolveAssignmentMode', () => {
    const counts: Record<AssignmentMode, number> = { questions: 3, upload: 0, drawing: 0 };
    for (const { mode } of ASSIGNMENT_MODES) {
      expect(resolveAssignmentMode(assignmentTypeForMode(mode), counts[mode])).toBe(mode);
    }
  });

  it('maps both written modes onto one stored type', () => {
    expect(assignmentTypeForMode('questions')).toBe('document');
    expect(assignmentTypeForMode('upload')).toBe('document');
    expect(assignmentTypeForMode('drawing')).toBe('drawing');
  });
});

describe('modeWantsQuestions', () => {
  it('is true only for the answering mode', () => {
    expect(modeWantsQuestions('questions')).toBe(true);
    expect(modeWantsQuestions('upload')).toBe(false);
    expect(modeWantsQuestions('drawing')).toBe(false);
  });
});

describe('modeSwitchBlockedReason', () => {
  it('allows staying put', () => {
    for (const { mode } of ASSIGNMENT_MODES) {
      expect(modeSwitchBlockedReason(mode, mode)).toBeNull();
    }
  });

  it('lets the two written modes swap freely', () => {
    expect(modeSwitchBlockedReason('upload', 'questions')).toBeNull();
    expect(modeSwitchBlockedReason('questions', 'upload')).toBeNull();
  });

  it('refuses to cross the drawing boundary in either direction', () => {
    // A drawing's work lives in drawing_submissions, not assignment
    // submissions. Swapping the type would strand anything already handed in.
    expect(modeSwitchBlockedReason('drawing', 'questions')).toMatch(/drawing task/i);
    expect(modeSwitchBlockedReason('drawing', 'upload')).toMatch(/drawing task/i);
    expect(modeSwitchBlockedReason('questions', 'drawing')).toMatch(/cannot become a drawing/i);
    expect(modeSwitchBlockedReason('upload', 'drawing')).toMatch(/cannot become a drawing/i);
  });

  it('always explains itself rather than just saying no', () => {
    const reason = modeSwitchBlockedReason('drawing', 'upload');
    expect(reason).toBeTruthy();
    // The old failure mode was a control that vanished with no explanation.
    expect(reason!.length).toBeGreaterThan(40);
  });
});

describe('defaultEvaluationForMode', () => {
  it('starts drawings on stars and written work on marks', () => {
    expect(defaultEvaluationForMode('drawing')).toBe('stars');
    expect(defaultEvaluationForMode('questions')).toBe('marks');
    expect(defaultEvaluationForMode('upload')).toBe('marks');
  });
});

describe('ASSIGNMENT_MODES', () => {
  it('lists every mode exactly once, answering first', () => {
    expect(ASSIGNMENT_MODES.map((m) => m.mode)).toEqual(['questions', 'upload', 'drawing']);
  });

  it('gives each mode copy that says what happens', () => {
    for (const m of ASSIGNMENT_MODES) {
      expect(m.title.trim()).not.toBe('');
      expect(m.blurb.trim()).not.toBe('');
    }
    // The discoverability fix depends on this word being on the first screen.
    expect(ASSIGNMENT_MODES[0].blurb.toLowerCase()).toContain('multiple choice');
  });
});
