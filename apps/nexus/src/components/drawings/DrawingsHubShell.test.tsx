import { fireEvent, render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveFlags } from '@/lib/feature-flags';

const push = vi.fn();
let flags: Record<string, boolean> = {};

vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('@/hooks/useNexusAuth', () => ({
  useNexusAuthContext: () => ({ featureFlags: flags, getToken: async () => 't' }),
}));

import DrawingsHubShell from './DrawingsHubShell';

const allOn = () => ({ ...resolveFlags({}), 'staff.inspiration': true, 'student.inspiration': true });

describe('DrawingsHubShell', () => {
  beforeEach(() => {
    push.mockClear();
    flags = allOn();
  });

  it('shows a teacher the three tabs of the hub', () => {
    render(<DrawingsHubShell role="teacher" active="flip" onSelect={vi.fn()}>body</DrawingsHubShell>);
    for (const label of ['Flip through', 'Class rhythm', 'Inspiration']) {
      expect(screen.getByRole('tab', { name: label })).toBeTruthy();
    }
  });

  it('is titled Drawings, which is the whole point of the merge', () => {
    render(<DrawingsHubShell role="student" active="mine" onSelect={vi.fn()}>body</DrawingsHubShell>);
    expect(screen.getByRole('heading', { name: 'Drawings' })).toBeTruthy();
  });

  it('reports an in-page tab to the page instead of navigating', () => {
    const onSelect = vi.fn();
    render(<DrawingsHubShell role="teacher" active="flip" onSelect={onSelect}>body</DrawingsHubShell>);
    fireEvent.click(screen.getByRole('tab', { name: 'Class rhythm' }));
    expect(onSelect).toHaveBeenCalledWith('rhythm');
    expect(push).not.toHaveBeenCalled();
  });

  it('navigates for a tab that owns its own route, and does not report it', () => {
    const onSelect = vi.fn();
    render(<DrawingsHubShell role="teacher" active="flip" onSelect={onSelect}>body</DrawingsHubShell>);
    fireEvent.click(screen.getByRole('tab', { name: 'Inspiration' }));
    expect(push).toHaveBeenCalledWith('/teacher/inspiration');
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('hides the Inspiration tab when its feature is off', () => {
    // Offering a tab whose page answers "unavailable" is worse than no tab.
    flags = { ...allOn(), 'staff.inspiration': false };
    render(<DrawingsHubShell role="teacher" active="flip" onSelect={vi.fn()}>body</DrawingsHubShell>);
    expect(screen.queryByRole('tab', { name: 'Inspiration' })).toBeNull();
    expect(screen.getByRole('tab', { name: 'Flip through' })).toBeTruthy();
  });

  it('falls back to the first tab when a flag hides the one the URL is on', () => {
    flags = { ...allOn(), 'staff.inspiration': false };
    render(<DrawingsHubShell role="teacher" active="inspiration" onSelect={vi.fn()}>body</DrawingsHubShell>);
    expect(screen.getByRole('tab', { name: 'Flip through' }).getAttribute('aria-selected')).toBe('true');
  });

  it('carries the count of sketches still to flip through on its own tab only', () => {
    render(
      <DrawingsHubShell role="teacher" active="flip" countFor={(k) => (k === 'flip' ? 7 : undefined)} onSelect={vi.fn()}>
        body
      </DrawingsHubShell>,
    );
    expect(screen.getByRole('tab', { name: 'Flip through (7)' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Class rhythm' })).toBeTruthy();
  });

  it('draws no bar at all when only one tab survives the flags', () => {
    // A single tab is not a choice, and a one-tab bar is just a wasted row on a
    // 375px screen.
    flags = { ...allOn(), 'student.inspiration': false };
    render(<DrawingsHubShell role="student" active="mine" onSelect={vi.fn()}>body</DrawingsHubShell>);
    expect(screen.queryByRole('tab')).toBeNull();
    expect(screen.getByText('body')).toBeTruthy();
  });

  it('goes back to the hub when an in-page tab is tapped from Inspiration', () => {
    // Inspiration is a separate route, so it cannot render Flip through itself.
    // Without this the tab would light up and nothing at all would happen.
    const onSelect = vi.fn();
    render(<DrawingsHubShell role="teacher" active="inspiration" onSelect={onSelect}>body</DrawingsHubShell>);
    fireEvent.click(screen.getByRole('tab', { name: 'Class rhythm' }));
    expect(push).toHaveBeenCalledWith('/teacher/sketchbook?view=rhythm');
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('sends a student from Inspiration back to the first tab of the hub', () => {
    render(<DrawingsHubShell role="student" active="inspiration" onSelect={vi.fn()}>body</DrawingsHubShell>);
    fireEvent.click(screen.getByRole('tab', { name: 'My sketchbook' }));
    expect(push).toHaveBeenCalledWith('/student/sketchbook');
  });

  it('renders whatever the active tab put inside it', () => {
    render(<DrawingsHubShell role="teacher" active="rhythm" onSelect={vi.fn()}><p>the rhythm list</p></DrawingsHubShell>);
    expect(screen.getByText('the rhythm list')).toBeTruthy();
  });
});
