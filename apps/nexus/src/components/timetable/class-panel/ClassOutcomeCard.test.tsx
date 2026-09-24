import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SWRConfig } from 'swr';
import ClassOutcomeCard from './ClassOutcomeCard';
import { emptyFollowupTally, type FollowupTally } from '@/lib/class-followup';

/**
 * The drawer's "How this class went" card. What matters:
 *  - it reads the class's real numbers (the old row said "Attended 0" in Month
 *    view because its figure came from a fan-out Month never ran),
 *  - the four corners are the founder's four cases and each opens its students,
 *  - it says so, rather than inventing numbers, when attendance was never synced.
 */

function payload(tally: Partial<FollowupTally>, over: Record<string, unknown> = {}) {
  const t = { ...emptyFollowupTally(), ...tally };
  const missed = t.needs_call + t.catching_up + t.caught_up + t.caught_up_silent + t.waiting_on_us + t.late_joiner + t.excused;
  return {
    class: { id: 'c1', title: 'Basic 3D Shape', measured: true, attendance_synced_at: '2026-09-15T15:00:00Z', has_meeting: true, teams_meeting_id: 'm' },
    summary: { rosterSize: 36, present: t.attended + t.partly },
    followup: { tally: t, missed, oldestOpenDays: 9, medianDaysToCatchUp: 2, saidComing: 25 },
    work: [],
    students: [],
    ...over,
  };
}

let body: unknown = null;

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, status: 200, json: async () => body }) as unknown as Response),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
});

function renderCard(onOpen = vi.fn()) {
  render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <ClassOutcomeCard classId="c1" classroomId="room" getToken={async () => 't'} onOpen={onOpen} />
    </SWRConfig>,
  );
  return onOpen;
}

describe('ClassOutcomeCard', () => {
  it('reports who came from the class itself, never a default of 0', async () => {
    body = payload({ attended: 17, partly: 3, catching_up: 10, needs_call: 5, caught_up: 1 });
    renderCard();
    expect(await screen.findByText('20 came, 16 missed')).toBeTruthy();
    expect(screen.getByText('25 were expected after RSVPs and leave')).toBeTruthy();
  });

  it('puts the missed students in the four corners and opens each one', async () => {
    body = payload({ attended: 20, catching_up: 10, needs_call: 5, caught_up: 1 });
    const onOpen = renderCard();
    const call = await screen.findByRole('button', { name: /5 students: Said nothing, not caught up/ });
    fireEvent.click(call);
    expect(onOpen).toHaveBeenCalledWith({ tab: 'missed', filter: 'needs_call' });

    fireEvent.click(screen.getByRole('button', { name: /10 students: Told us why, still catching up/ }));
    expect(onOpen).toHaveBeenLastCalledWith({ tab: 'missed', filter: 'catching_up' });
    // An empty corner is not a button: there is nobody to show.
    expect(screen.queryByRole('button', { name: /Caught up, never said why/ })).toBeNull();
  });

  it('lists the states that sit on neither axis as their own way in', async () => {
    body = payload({ attended: 18, partly: 2, waiting_on_us: 3, late_joiner: 1 });
    const onOpen = renderCard();
    fireEvent.click(await screen.findByRole('button', { name: '3 waiting on the recap' }));
    expect(onOpen).toHaveBeenCalledWith({ tab: 'missed', filter: 'waiting_on_us' });
    fireEvent.click(screen.getByRole('button', { name: '2 came late or left early' }));
    expect(onOpen).toHaveBeenLastCalledWith({ tab: 'attended', filter: 'partly' });
  });

  it('shows the homework, and who among those who came has not handed it in', async () => {
    body = payload(
      { attended: 20, catching_up: 2 },
      {
        work: [
          { id: 'hw', title: 'Line practice', timing: 'homework', expected: 22, handedIn: 14, late: 1, missingCame: 6, missingCaughtUp: 0, missingCatchingUp: 2 },
        ],
      },
    );
    const onOpen = renderCard();
    expect(await screen.findByText('Homework: Line practice')).toBeTruthy();
    expect(screen.getByText('14/22')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /6 who came have not handed it in/ }));
    expect(onOpen).toHaveBeenCalledWith({ tab: 'attended', filter: 'not_handed_in' });
    expect(screen.getByText('2 students still catching up owe it too.')).toBeTruthy();
  });

  it('says attendance is not synced instead of calling the whole roster absent', async () => {
    body = payload({ unmeasured: 30 }, { class: { id: 'c1', measured: false } });
    renderCard();
    expect(await screen.findByText(/has not been synced from Teams yet/)).toBeTruthy();
  });

  it('opens the whole panel from View all', async () => {
    body = payload({ attended: 20 });
    const onOpen = renderCard();
    fireEvent.click(await screen.findByRole('button', { name: /View all/ }));
    expect(onOpen).toHaveBeenCalledWith();
  });
});
