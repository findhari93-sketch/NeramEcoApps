import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

const swr = vi.fn();
vi.mock('@/lib/nexus-swr', () => ({ useAuthSWR: (...a: unknown[]) => swr(...a) }));
vi.mock('@/hooks/useNexusAuth', () => ({ useNexusAuthContext: () => ({ getToken: async () => 't' }) }));
vi.mock('@/components/students/StudentStageFactsProvider', () => ({ useStudentStageFacts: () => ({ factsFor: () => null, ready: true }) }));
// See FlipThrough.test.tsx for why this renders an aria-label rather than text content.
vi.mock('@/components/students/StudentStageAvatar', () => ({ default: ({ name }: { name?: string | null }) => <div aria-label={name ? `Avatar for ${name}` : 'Avatar'} /> }));

import ClassRhythmList from './ClassRhythmList';

const student = (id: string, name: string, quietDays: number | null, count = 0) => ({
  userId: id, name, avatarUrl: null, msOid: null, dormant: false,
  week: [count > 0, count > 1, false, false, false, false, false], count, run: 0, lastPracticeDate: quietDays === null ? null : '2026-09-01', quietDays,
});

describe('ClassRhythmList', () => {
  it('sorts the quiet ones first and shows the goal row', () => {
    swr.mockReturnValue({ data: { goal: 3, students: [student('a', 'Asha', 0, 2), student('b', 'Bala', null), student('c', 'Charu', 9)] }, isLoading: false, mutate: vi.fn() });
    render(<ClassRhythmList classroomId="c1" />);
    const names = screen.getAllByTestId('rhythm-row-name').map((n) => n.textContent);
    expect(names).toEqual(['Bala', 'Charu', 'Asha']);
    expect(screen.getByText('Weekly goal: 3 days')).toBeTruthy();
    expect(screen.getByText('No sketches in 8 weeks')).toBeTruthy();
    expect(screen.getByText('Quiet 9 days')).toBeTruthy();
  });
});
