import { describe, it, expect } from 'vitest';
import { pickDefaultRunId, resolveTestPageTab, type RunPlacement } from './test-page-tabs';

describe('resolveTestPageTab', () => {
  it('opens on Questions by default, the way a form opens on its questions', () => {
    expect(resolveTestPageTab(null)).toBe('questions');
    expect(resolveTestPageTab('')).toBe('questions');
    expect(resolveTestPageTab('nonsense')).toBe('questions');
  });

  it('keeps every old link working', () => {
    // The Conducted tab and teacher notifications still link ?tab=results.
    expect(resolveTestPageTab('results')).toBe('students');
    expect(resolveTestPageTab('overview')).toBe('questions');
  });

  it('opens the new tabs by name', () => {
    expect(resolveTestPageTab('students')).toBe('students');
    expect(resolveTestPageTab('settings')).toBe('settings');
    expect(resolveTestPageTab('questions')).toBe('questions');
  });
});

describe('pickDefaultRunId', () => {
  const run = (id: string, context_type: string, from: string | null): RunPlacement => ({
    id,
    context_type,
    available_from: from,
    available_until: null,
  });

  it('prefers the run named in the URL', () => {
    expect(pickDefaultRunId([run('exam-1', 'exam', '2026-08-18T08:30:00Z')], 'from-url')).toBe('from-url');
  });

  it('picks the most recent run that has a roster', () => {
    const placements = [
      run('class-old', 'class_test', '2026-08-10T08:30:00Z'),
      run('exam-new', 'exam', '2026-08-18T08:30:00Z'),
    ];
    expect(pickDefaultRunId(placements)).toBe('exam-new');
  });

  it('never picks an always-open practice pool, which has nobody to chase', () => {
    const placements = [
      run('practice', 'student_practice', '2026-09-01T00:00:00Z'),
      run('class', 'class_test', '2026-08-10T08:30:00Z'),
    ];
    expect(pickDefaultRunId(placements)).toBe('class');
  });

  it('falls back to every attempt of all time when no run has a roster', () => {
    expect(pickDefaultRunId([run('practice', 'student_practice', null)])).toBe('');
    expect(pickDefaultRunId([])).toBe('');
  });
});
