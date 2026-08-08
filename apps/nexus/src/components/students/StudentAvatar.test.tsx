import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import StudentAvatar from './StudentAvatar';
import * as facts from './StudentStageFactsProvider';

/**
 * The real GraphAvatar reads the auth context and fetches /api/graph/photo, so
 * rendering it here would test Microsoft Graph rather than prop wiring. Only one
 * case below passes msOid; every other test renders UserAvatar for real.
 */
vi.mock('@/components/GraphAvatar', () => ({
  default: ({ fallbackSrc }: { fallbackSrc?: string | null }) => (
    // eslint-disable-next-line @next/next/no-img-element -- a stub, never rendered in the app
    <img data-testid="graph-avatar" src={fallbackSrc ?? ''} alt="" />
  ),
}));

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

type Fact = facts.StudentStageFacts;

/** Only the field a case is about needs stating; the rest default to absent. */
function stub(map: Record<string, Partial<Fact> & Pick<Fact, 'stage'>>) {
  vi.spyOn(facts, 'useStudentStageFacts').mockReturnValue({
    ready: true,
    factsFor: (id) =>
      id && map[id] ? { dormant: false, photo: null, name: null, ...map[id] } : null,
  });
}

function photoOf(container: HTMLElement): string | null {
  return container.querySelector('img')?.getAttribute('src') ?? null;
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

  it('passes sx through to a ringed avatar, and the dormant treatment still wins', () => {
    // The catch-up screens are gold throughout and pass bgcolor through this
    // prop. StudentStageAvatar must merge it BEFORE the dormant greyscale, or a
    // caller's colour could quietly undo the "switched off" signal.
    stub({ 's3': { stage: '12th', dormant: true } });
    const { container } = render(
      <StudentAvatar userId="s3" name="Gold Person" sx={{ bgcolor: '#F9A825' }} />
    );
    const avatar = container.querySelector('.MuiAvatar-root') as HTMLElement;
    expect(getComputedStyle(avatar).filter).toContain('grayscale');
  });

  it('reserves the ring’s space when unringed, so a list does not reflow', () => {
    vi.restoreAllMocks();
    const { container } = render(<StudentAvatar userId="nobody" name="X Y" size={40} />);
    const box = container.firstElementChild as HTMLElement;
    // 40 + 8, matching the ringed wrapper in StudentStageAvatar.
    expect(box.style.width || getComputedStyle(box).width).toContain('48');
  });

  /**
   * Resolving the photo and the name from the lookup.
   *
   * The point of these is that a screen holding nothing but a user id draws the
   * real person. Most screens do hold one and never had a reason to fetch a
   * photo URL as well, so before this they showed coloured initials forever
   * unless somebody widened their route.
   */
  describe('filling in what the caller does not have', () => {
    it('takes the photo from the lookup when the caller passes none', () => {
      stub({ 's1': { stage: '12th', photo: 'https://cdn/lookup.jpg' } });
      const { container } = render(<StudentAvatar userId="s1" name="Hari Heera" />);
      expect(photoOf(container)).toBe('https://cdn/lookup.jpg');
    });

    it('lets an explicit src win over the lookup', () => {
      stub({ 's1': { stage: '12th', photo: 'https://cdn/lookup.jpg' } });
      const { container } = render(
        <StudentAvatar userId="s1" name="Hari Heera" src="https://cdn/payload.jpg" />
      );
      expect(photoOf(container)).toBe('https://cdn/payload.jpg');
    });

    it('treats src={null} as “I have no photo”, not “render none”', () => {
      // Dozens of call sites write src={row.avatar_url} off a nullable column.
      // If null suppressed the lookup, the feature would silently do nothing on
      // exactly the rows it exists for.
      stub({ 's1': { stage: '12th', photo: 'https://cdn/lookup.jpg' } });
      const { container } = render(
        <StudentAvatar userId="s1" name="Hari Heera" src={null} />
      );
      expect(photoOf(container)).toBe('https://cdn/lookup.jpg');
    });

    it('takes the name from the lookup when the caller passes none', () => {
      stub({ 's1': { stage: '12th', name: 'Hari Heera' } });
      const { container } = render(<StudentAvatar userId="s1" />);
      expect(container.textContent).toContain('HH');
    });

    it('falls through an empty name, which is how eight catch-up rows pass it', () => {
      // name={student.name || ''}. `??` would leave all eight nameless, because
      // '' is not nullish.
      stub({ 's1': { stage: '12th', name: 'Hari Heera' } });
      const { container } = render(<StudentAvatar userId="s1" name="" />);
      expect(container.textContent).toContain('HH');
    });

    it('keeps a deliberate label like “Unknown student” instead of correcting it', () => {
      stub({ 's1': { stage: '12th', name: 'Hari Heera' } });
      const { container } = render(<StudentAvatar userId="s1" name="Unknown student" />);
      expect(container.textContent).toContain('US');
    });

    it('offers the lookup photo to the Graph path as its fallback', () => {
      // The four msOid call sites pass neither src nor fallbackSrc, so today
      // they show blank initials for the whole window where Graph 404s, which
      // is exactly the pending-approval gap fallbackSrc exists for.
      stub({ 's1': { stage: '12th', photo: 'https://cdn/lookup.jpg' } });
      render(<StudentAvatar userId="s1" name="Hari Heera" msOid="oid-1" />);
      expect(screen.getByTestId('graph-avatar').getAttribute('src')).toBe(
        'https://cdn/lookup.jpg'
      );
    });

    it('gives an unknown id neither a photo nor a name, e.g. a teacher in a thread', () => {
      stub({ 's1': { stage: '12th', photo: 'https://cdn/lookup.jpg', name: 'Hari Heera' } });
      const { container } = render(<StudentAvatar userId="teacher-1" name="A Teacher" />);
      expect(photoOf(container)).toBeNull();
      expect(container.textContent).toContain('AT');
    });
  });
});
