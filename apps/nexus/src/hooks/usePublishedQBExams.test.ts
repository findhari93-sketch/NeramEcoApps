import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveFlags } from '@/lib/feature-flags';

/**
 * Which exams have a published paper, for the student Question Bank folder.
 * Asked only by a student whose Question Bank is switched on, since nobody else
 * renders the folder.
 */

let auth = {
  tokenReady: true,
  isStudent: true,
  featureFlags: resolveFlags({ 'student.question-bank': true }) as Record<string, boolean>,
};
let swr: { data?: unknown; error?: unknown } = {};
const keys: Array<string | null> = [];

vi.mock('./useNexusAuth', () => ({ useNexusAuthContext: () => auth }));
vi.mock('@/lib/nexus-swr', () => ({
  useAuthSWR: (key: string | null) => {
    keys.push(key);
    return key ? swr : {};
  },
}));

import { usePublishedQBExams } from './usePublishedQBExams';

const read = () => renderHook(() => usePublishedQBExams()).result.current;

describe('usePublishedQBExams', () => {
  beforeEach(() => {
    auth = {
      tokenReady: true,
      isStudent: true,
      featureFlags: resolveFlags({ 'student.question-bank': true }),
    };
    swr = {};
    keys.length = 0;
  });

  it('asks for the published exams and answers in sidebar order', () => {
    swr = { data: { data: { published_exams: ['NATA', 'JEE_PAPER_2'] } } };
    expect(read()).toEqual(['JEE_PAPER_2', 'NATA']);
    expect(keys.at(-1)).toBe('/api/question-bank/published-exams');
  });

  it('drops an exam it does not know', () => {
    swr = { data: { data: { published_exams: ['JEE_PAPER_2', 'SOMETHING_NEW'] } } };
    expect(read()).toEqual(['JEE_PAPER_2']);
  });

  it('is null while the answer is out', () => {
    expect(read()).toBeNull();
  });

  it('reads a failed request as nothing published', () => {
    swr = { error: new Error('500') };
    expect(read()).toEqual([]);
  });

  it('asks nothing while the Question Bank is switched off in Features', () => {
    auth.featureFlags = resolveFlags({ 'student.question-bank': false });
    expect(read()).toBeNull();
    expect(keys.every((k) => k === null)).toBe(true);
  });

  it('asks nothing before the token is ready', () => {
    auth.tokenReady = false;
    read();
    expect(keys.every((k) => k === null)).toBe(true);
  });
});
