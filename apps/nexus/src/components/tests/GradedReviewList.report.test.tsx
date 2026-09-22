import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { GradedReviewItem } from './GradedReviewList';

/**
 * Reporting a mistake from a test review. Only a student's own review offers
 * it: the teacher's copy of the same list (StudentAttemptSheet) does not.
 */

vi.mock('@/components/video/NeramVideoPlayer', () => ({ default: () => null }));
vi.mock('@/components/tests/ExplanationPanel', () => ({ default: () => null }));
const auth = vi.hoisted(() => ({ getToken: async () => 't' }));
vi.mock('@/hooks/useNexusAuth', () => ({ useNexusAuthContext: () => auth }));

const { default: GradedReviewList } = await import('./GradedReviewList');

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ data: {} }) });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const row = (over: Partial<GradedReviewItem> = {}): GradedReviewItem => ({
  question_id: '11111111-1111-4111-8111-111111111111',
  question_text: 'Which figure completes the series?',
  options: null,
  correct_answer: 'a',
  selected: 'b',
  is_correct: false,
  is_gradable: true,
  explanation: 'Because the pattern rotates.',
  solution_videos: [{ label: null, url: 'https://www.youtube.com/watch?v=U1X9MmLh-ZQ' }],
  ...over,
});

const getToken = async () => 't';

describe('GradedReviewList reports', () => {
  it('offers a report per question on the student review, asking which part', async () => {
    render(<GradedReviewList review={[row()]} getToken={getToken} allowReport testId="test-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Report a mistake' }));
    expect(screen.getByRole('button', { name: 'Video solution' })).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Written solution' })).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Answer key' })).not.toBeNull();
    // One status request for the whole review.
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([url]) => String(url).startsWith('/api/question-bank/report-status'))).toBe(true),
    );
  });

  it('offers nothing on the teacher copy of the review', () => {
    render(<GradedReviewList review={[row()]} getToken={getToken} />);
    expect(screen.queryByRole('button', { name: 'Report a mistake' })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
