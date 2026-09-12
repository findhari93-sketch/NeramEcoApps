import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

const swr = vi.fn();
vi.mock('@/lib/nexus-swr', () => ({ useAuthSWR: (...args: unknown[]) => swr(...args) }));
vi.mock('@/hooks/useNexusAuth', () => ({ useNexusAuthContext: () => ({ isFeatureEnabled: (id: string) => id === 'student.sketchbook' }) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

import SketchbookHomeCard from './SketchbookHomeCard';

describe('SketchbookHomeCard', () => {
  it('invites a student with no sketches', () => {
    swr.mockReturnValue({ data: { rhythm: { week: { days: Array(7).fill(false), count: 0, goal: 3, met: false, start: '2026-09-07' }, run: 0, bestRun: 0, totalDays: 0, lastPracticeDate: null, quietDays: null } }, isLoading: false });
    render(<SketchbookHomeCard />);
    expect(screen.getByText('Draw something today')).toBeTruthy();
    expect(screen.getByRole('link', { name: /open sketchbook/i }).getAttribute('href')).toBe('/student/sketchbook');
  });
  it('shows the week when there is a rhythm', () => {
    swr.mockReturnValue({ data: { rhythm: { week: { days: [true, true, false, false, false, false, false], count: 2, goal: 3, met: false, start: '2026-09-07' }, run: 1, bestRun: 1, totalDays: 5, lastPracticeDate: '2026-09-08', quietDays: 1 } }, isLoading: false });
    render(<SketchbookHomeCard />);
    expect(screen.getByText('2 of 3 days this week.')).toBeTruthy();
  });
});
