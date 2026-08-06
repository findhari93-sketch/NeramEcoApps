import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import StudentAvatar from './StudentAvatar';
import * as facts from './StudentStageFactsProvider';

/**
 * The two behaviours this component exists for.
 *
 * Falling back, because it gets swapped into lists that mix students with staff
 * and comment threads whose authors may be either. If an unknown id produced a
 * ring, every teacher in a thread would be labelled with a study stage they do
 * not have.
 *
 * Not leaking, because the provider is mounted in the teacher layout alone. On a
 * student screen there is no provider at all, and a leaderboard that quietly told
 * thirty classmates who had paused their studies would be a real harm, not a
 * cosmetic bug.
 */

function stub(map: Record<string, { stage: facts.StudentStageFacts['stage']; dormant: boolean }>) {
  vi.spyOn(facts, 'useStudentStageFacts').mockReturnValue({
    ready: true,
    factsFor: (id) => (id && map[id]) || null,
  });
}

describe('StudentAvatar', () => {
  it('wears the ring for a known student', () => {
    stub({ 's1': { stage: '11th', dormant: false } });
    render(<StudentAvatar userId="s1" name="Nithya Raman" />);
    // StudentStageAvatar labels the wrapper with the stage and its explanation.
    expect(screen.getByLabelText(/Class 11/)).toBeTruthy();
  });

  it('says dormant rather than a stage for a paused student', () => {
    stub({ 's2': { stage: '12th', dormant: true } });
    render(<StudentAvatar userId="s2" name="Paused Person" />);
    expect(screen.getByLabelText(/^Dormant:/)).toBeTruthy();
  });

  it('renders a plain avatar for an id nobody knows, e.g. a teacher in a thread', () => {
    stub({ 's1': { stage: '11th', dormant: false } });
    const { container } = render(<StudentAvatar userId="teacher-1" name="A Teacher" />);
    expect(screen.queryByLabelText(/Class 1[12]|Break Year|Dormant/)).toBeNull();
    expect(container.textContent).toContain('AT');
  });

  it('renders plain with no provider at all, which is every student-facing screen', () => {
    vi.restoreAllMocks();
    const { container } = render(<StudentAvatar userId="s1" name="Someone Else" />);
    expect(screen.queryByLabelText(/Class 1[12]|Break Year|Dormant/)).toBeNull();
    expect(container.textContent).toContain('SE');
  });

  it('reserves the ring’s space when unringed, so a list does not reflow', () => {
    vi.restoreAllMocks();
    const { container } = render(<StudentAvatar userId="nobody" name="X Y" size={40} />);
    const box = container.firstElementChild as HTMLElement;
    // 40 + 8, matching the ringed wrapper in StudentStageAvatar.
    expect(box.style.width || getComputedStyle(box).width).toContain('48');
  });
});
