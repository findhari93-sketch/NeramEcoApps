import { describe, expect, it } from 'vitest';
import type { QBAttemptSummary } from '@neram/database';
import {
  firstUnanswered,
  patchAttemptSummary,
  progressOf,
  reconcileCurrent,
  statusOf,
  stepFrom,
  topicCaption,
} from './practice-logic';

const summary = (over: Partial<QBAttemptSummary>): QBAttemptSummary => ({
  total_attempts: 1,
  last_attempt_at: '2026-09-01',
  last_was_correct: true,
  best_result: true,
  ...over,
});

describe('statusOf', () => {
  it('reads the last attempt, as the list icon does', () => {
    expect(statusOf(null)).toBe('unanswered');
    expect(statusOf(summary({ total_attempts: 0 }))).toBe('unanswered');
    expect(statusOf(summary({ last_was_correct: true }))).toBe('right');
    expect(statusOf(summary({ last_was_correct: false, best_result: true }))).toBe('wrong');
  });
});

describe('patchAttemptSummary', () => {
  it('counts the new attempt and keeps the best result', () => {
    expect(patchAttemptSummary(null, false, 't1')).toEqual({
      total_attempts: 1,
      last_attempt_at: 't1',
      last_was_correct: false,
      best_result: false,
    });
    const after = patchAttemptSummary(summary({ total_attempts: 2, best_result: true }), false, 't2');
    expect(after.total_attempts).toBe(3);
    expect(after.last_was_correct).toBe(false);
    expect(after.best_result).toBe(true);
  });
});

describe('progressOf and firstUnanswered', () => {
  const items = [
    { id: 'a', attempt_summary: summary({ last_was_correct: true }) },
    { id: 'b', attempt_summary: summary({ last_was_correct: false }) },
    { id: 'c', attempt_summary: null },
    { id: 'd', attempt_summary: null },
  ];

  it('counts answered and right', () => {
    expect(progressOf(items)).toEqual({ total: 4, answered: 2, right: 1 });
  });

  it('continues at the first unanswered question', () => {
    expect(firstUnanswered(items)).toBe('c');
    expect(firstUnanswered(items.slice(0, 2))).toBeNull();
  });
});

describe('stepFrom', () => {
  const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  it('moves one along and stops at the ends', () => {
    expect(stepFrom(items, 'b', 1)).toBe('c');
    expect(stepFrom(items, 'b', -1)).toBe('a');
    expect(stepFrom(items, 'c', 1)).toBeNull();
    expect(stepFrom(items, 'zzz', 1)).toBeNull();
    expect(stepFrom(items, null, 1)).toBeNull();
  });
});

describe('reconcileCurrent', () => {
  const items = [{ id: 'a' }, { id: 'b' }];
  it('keeps a question still in the list', () => {
    expect(reconcileCurrent(items, 'b', 'panes')).toBe('b');
    expect(reconcileCurrent(items, 'b', 'reader')).toBe('b');
  });
  it('moves the pane to the first question, and closes the reader', () => {
    expect(reconcileCurrent(items, 'gone', 'panes')).toBe('a');
    expect(reconcileCurrent(items, 'gone', 'reader')).toBeNull();
    expect(reconcileCurrent([], 'gone', 'panes')).toBeNull();
  });
});

describe('topicCaption', () => {
  it('prints the specific topic, not the subject', () => {
    expect(topicCaption(['mathematics', 'sets_relations'], { sets_relations: 'Sets & Relations' })).toBe('Sets & Relations');
  });
  it('falls back to the subject, then to a readable slug', () => {
    expect(topicCaption(['mathematics'], { mathematics: 'Mathematics' })).toBe('Mathematics');
    expect(topicCaption(['some_new_topic'])).toBe('Some new topic');
    expect(topicCaption([])).toBeNull();
  });
});
