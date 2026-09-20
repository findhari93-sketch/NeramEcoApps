import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ContributorAvatars from './ContributorAvatars';
import * as facts from '@/components/students/StudentStageFactsProvider';
import { INFO_RING_TESTID } from '@/lib/student-info-ring';

/**
 * Who recalled a paper, as faces.
 *
 * This strip was a stacked AvatarGroup of hand-coloured initials, exempted from
 * the avatar ESLint rules because MUI needs bare children to overlap them. The
 * overlap saved a little width and cost the ring, on the one surface where
 * knowing whose recall you are reading is the entire point.
 *
 * It mixes students with staff, so the two cases below are the whole contract:
 * students wear a ring, staff stay bare rather than being labelled with a study
 * stage they do not have.
 */

vi.mock('@/components/GraphAvatar', () => ({
  default: () => <span data-testid="graph-avatar" />,
}));

function stubStudents(ids: string[]) {
  vi.spyOn(facts, 'useStudentStageFacts').mockReturnValue({
    ready: true,
    factsFor: (id) =>
      id && ids.includes(id)
        ? {
            stage: '12th',
            dormant: false,
            photo: null,
            name: null,
            language: 'tamil',
            limitedEnglish: false,
          }
        : null,
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ContributorAvatars', () => {
  it('rings a student contributor', () => {
    stubStudents(['u1']);
    render(
      <ContributorAvatars
        contributors={[{ user_id: 'u1', display_name: 'Nithya Raman', role: 'student' }]}
      />
    );
    const ring = screen.getByTestId(INFO_RING_TESTID);
    expect(ring.getAttribute('aria-label')).toMatch(/^Class 12:/);
  });

  it('carries the language mark, which is the thing 24px initials could never show', () => {
    stubStudents(['u1']);
    render(
      <ContributorAvatars
        contributors={[{ user_id: 'u1', display_name: 'Nithya Raman', role: 'student' }]}
      />
    );
    expect(screen.getByTestId('language-badge').textContent).toBe('த');
  });

  it('leaves a staff contributor bare rather than inventing a stage for them', () => {
    stubStudents(['u1']);
    render(
      <ContributorAvatars
        contributors={[{ user_id: 'staff1', display_name: 'Hari Babu', role: 'teacher' }]}
      />
    );
    expect(screen.queryByTestId(INFO_RING_TESTID)).toBeNull();
  });

  it('rings the students in a mixed list and no one else', () => {
    stubStudents(['u1', 'u2']);
    render(
      <ContributorAvatars
        contributors={[
          { user_id: 'u1', display_name: 'Nithya Raman', role: 'student' },
          { user_id: 'staff1', display_name: 'Hari Babu', role: 'teacher' },
          { user_id: 'u2', display_name: 'Aarav Sharma', role: 'student' },
        ]}
      />
    );
    expect(screen.getAllByTestId(INFO_RING_TESTID)).toHaveLength(2);
  });

  it('caps the row and counts the rest, so a busy paper stays one line', () => {
    stubStudents(['u1', 'u2', 'u3']);
    render(
      <ContributorAvatars
        max={2}
        contributors={[
          { user_id: 'u1', display_name: 'One Student', role: 'student' },
          { user_id: 'u2', display_name: 'Two Student', role: 'student' },
          { user_id: 'u3', display_name: 'Three Student', role: 'student' },
        ]}
      />
    );
    expect(screen.getAllByTestId(INFO_RING_TESTID)).toHaveLength(2);
    expect(screen.getByText('+1')).toBeTruthy();
  });

  it('names everyone in words when they all fit, because a face is not a name', () => {
    stubStudents(['u1', 'u2']);
    render(
      <ContributorAvatars
        contributors={[
          { user_id: 'u1', display_name: 'Nithya Raman', role: 'student' },
          { user_id: 'u2', display_name: 'Aarav Sharma', role: 'student' },
        ]}
      />
    );
    expect(screen.getByText('Nithya, Aarav')).toBeTruthy();
  });

  it('survives a contributor with no user id, which is what a legacy row looks like', () => {
    stubStudents(['u1']);
    render(
      <ContributorAvatars contributors={[{ display_name: 'Unknown Person', role: 'student' }]} />
    );
    expect(screen.queryByTestId(INFO_RING_TESTID)).toBeNull();
    expect(screen.getByText('Unknown')).toBeTruthy();
  });
});
