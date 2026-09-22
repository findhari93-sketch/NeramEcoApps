import { describe, it, expect } from 'vitest';
import { sectionVideoProgress, type VideoProgressQuestion } from './paper-video-progress';

function q(id: string, section: VideoProgressQuestion['section']): VideoProgressQuestion {
  return { id, section };
}

describe('sectionVideoProgress', () => {
  it('counts each section on its own, in paper order', () => {
    const questions = [
      q('a1', 'aptitude'),
      q('m1', 'math_mcq'),
      q('m2', 'math_mcq'),
      q('a2', 'aptitude'),
    ];
    const withVideo = new Set(['a1', 'a2', 'm1']);
    const rows = sectionVideoProgress(questions, (x) => withVideo.has(x.id));

    expect(rows).toEqual([
      { key: 'math_mcq', label: 'Mathematics (MCQ)', done: 1, total: 2, missing: 1, complete: false },
      { key: 'aptitude', label: 'Aptitude', done: 2, total: 2, missing: 0, complete: true },
    ]);
  });

  it('puts unsectioned questions last, as a group of their own', () => {
    const rows = sectionVideoProgress(
      [q('u1', null), q('d1', 'drawing'), q('m1', 'math_mcq')],
      () => false,
    );
    expect(rows.map((r) => r.key)).toEqual(['math_mcq', 'drawing', '__none__']);
    expect(rows[2].label).toBe('Unsectioned');
  });

  it('reads the predicate, so unsaved drafts count the moment they are typed', () => {
    const drafted = new Set<string>();
    const questions = [q('a1', 'aptitude')];
    expect(sectionVideoProgress(questions, (x) => drafted.has(x.id))[0].complete).toBe(false);
    drafted.add('a1');
    expect(sectionVideoProgress(questions, (x) => drafted.has(x.id))[0].complete).toBe(true);
  });

  it('never calls an empty paper complete', () => {
    expect(sectionVideoProgress([], () => true)).toEqual([]);
  });
});
