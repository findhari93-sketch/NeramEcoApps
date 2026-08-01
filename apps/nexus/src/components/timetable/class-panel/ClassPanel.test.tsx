import { render, screen, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import ClassPanel from './ClassPanel';
import type { ClassCardData } from '../ClassCard';

// The self-fetching sections are exercised by their own tests. Here they would
// only add network noise to assertions about the shell.
vi.mock('../ClassPrepRoster', () => ({ default: () => <div data-testid="prep-roster" /> }));
vi.mock('../ClassAssignmentsSection', () => ({ default: () => <div data-testid="assignments" /> }));
vi.mock('../ClassPrepTestSection', () => ({ default: () => <div data-testid="prep-test" /> }));
vi.mock('../ClassResourcesSection', () => ({ default: () => <div data-testid="resources" /> }));
vi.mock('../ClassCaptureView', () => ({ default: () => <div data-testid="capture" /> }));
vi.mock('../WrapUpSection', () => ({ default: () => <div data-testid="wrap-up" /> }));
vi.mock('../MeetingRecap', () => ({ default: () => <div data-testid="recap" /> }));
vi.mock('@/hooks/useNexusAuth', () => ({ useNexusAuthContext: () => ({ featureFlags: {} }) }));

const PAST_DAY = '2020-01-15';
const FUTURE_DAY = '2099-01-15';

function makeClass(over: Partial<ClassCardData> = {}): ClassCardData {
  return {
    id: 'c1',
    title: 'JEE Preparation B.Arch',
    scheduled_date: FUTURE_DAY,
    start_time: '19:00',
    end_time: '20:30',
    status: 'scheduled',
    teams_meeting_url: null,
    teams_meeting_join_url: null,
    teams_meeting_id: null,
    teams_meeting_scope: null,
    recording_url: null,
    batch_id: null,
    topic: null,
    teacher: { id: 't1', name: 'Hari Babu', avatar_url: null },
    batch: null,
    ...over,
  } as ClassCardData;
}

function renderPanel(props: Partial<React.ComponentProps<typeof ClassPanel>> = {}) {
  return render(
    <ClassPanel
      cls={makeClass()}
      open
      onClose={() => {}}
      role="teacher"
      classroomId="room1"
      getToken={async () => 'token'}
      onNotify={() => {}}
      {...props}
    />,
  );
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({}) }) as Response));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ClassPanel shell', () => {
  it('renders nothing as a drawer with no class selected', () => {
    // innerHTML rather than a jest-dom matcher: the app tsconfig does not pull
    // in @testing-library/jest-dom's types, so those fail type-check.
    const { container } = renderPanel({ cls: null });
    expect(container.innerHTML).toBe('');
  });

  it('holds its place as a docked column with no class selected, without a close button', () => {
    // The docked rail is part of the planner layout: removing it would reflow
    // the week list every time a teacher deselects.
    renderPanel({ cls: null, variant: 'docked' });
    expect(screen.getByText('Pick a day to set up its class.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
  });

  it('offers a close button as a drawer and not when docked', () => {
    const onClose = vi.fn();
    const { unmount } = renderPanel({ onClose });
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();
    unmount();

    renderPanel({ variant: 'docked' });
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
  });

  it('keeps the class identified while the tab changes', () => {
    // The header sits outside the tab bodies precisely so a teacher on the
    // After tab still knows which class they are looking at.
    renderPanel({ cls: makeClass({ scheduled_date: PAST_DAY }) });
    expect(screen.getByText('JEE Preparation B.Arch')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Class' }));
    expect(screen.getByText('JEE Preparation B.Arch')).toBeTruthy();
  });

  it('offers one merged attendance button on a past class, not a separate Insights', () => {
    renderPanel({
      cls: makeClass({ scheduled_date: PAST_DAY }),
      onOpenAttendance: () => {},
    });
    expect(screen.getAllByRole('button', { name: 'Attendance and follow-up' })).toHaveLength(1);
    // The buttons this replaced. Their absence is the merge.
    expect(screen.queryByRole('button', { name: /^insights$/i })).toBeNull();
  });

  it('hides the After tab until the class has run', () => {
    const { unmount } = renderPanel();
    expect(screen.queryByRole('tab', { name: 'After' })).toBeNull();
    unmount();

    renderPanel({ cls: makeClass({ scheduled_date: PAST_DAY }) });
    expect(screen.getByRole('tab', { name: 'After' })).toBeTruthy();
  });

  it('draws no tab strip for a cancelled class, which has only one tab', () => {
    renderPanel({ cls: makeClass({ status: 'cancelled', scheduled_date: PAST_DAY }) });
    expect(screen.queryAllByRole('tab')).toHaveLength(0);
    expect(screen.getByText('JEE Preparation B.Arch')).toBeTruthy();
  });

  it('opens the docked rail on Prep, where a teacher is deliberately setting up', () => {
    renderPanel({ variant: 'docked' });
    expect(screen.getByRole('tab', { name: 'Prep' }).getAttribute('aria-selected')).toBe('true');
  });

  it('opens the drawer on Class for an upcoming class', () => {
    renderPanel();
    expect(screen.getByRole('tab', { name: 'Class' }).getAttribute('aria-selected')).toBe('true');
  });

  it('gives a student no Prep tab when nothing was asked of them', () => {
    renderPanel({ role: 'student' });
    expect(screen.queryByRole('tab', { name: 'Prep' })).toBeNull();
  });

  it('gives a student a Prep tab once there is work attached', () => {
    renderPanel({
      role: 'student',
      assignments: [{ id: 'a1', title: 'Plan a house' }],
    });
    expect(screen.getByRole('tab', { name: 'Prep' })).toBeTruthy();
  });

  it('keeps teacher-only management off the student panel', () => {
    renderPanel({ role: 'student', onEdit: () => {}, onReschedule: () => {} });
    expect(screen.queryByRole('button', { name: /reschedule/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /share this class/i })).toBeNull();
    expect(screen.queryByText('Class Info')).toBeNull();
  });
});
