import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AttendanceFollowUpSheet from './AttendanceFollowUpSheet';
import { formatDateISO } from './date-utils';
import type { ForecastStudent } from '@/lib/class-forecast';
import type { ConfirmationStudent, ConfirmationsResponse } from '@/app/api/timetable/[classId]/confirmations/route';

/**
 * The office's follow-up sheet. What matters:
 *  - it opens on the work: the silent list when there is one;
 *  - the students who often miss are ticked for asking, the regulars are not;
 *  - Call is a real tel: link with a name a screen reader can say;
 *  - Record opens in the row and saves what the office was told.
 */

vi.mock('@/components/students/StudentAvatar', () => ({
  default: ({ userId }: { userId: string }) => <span data-avatar={userId} />,
}));

const swr = vi.hoisted(() => ({ data: undefined as ConfirmationsResponse | undefined, mutate: vi.fn() }));
vi.mock('@/lib/nexus-swr', () => ({
  useAuthSWR: () => ({ data: swr.data, error: undefined, isLoading: false, mutate: swr.mutate }),
}));
vi.mock('@/hooks/useNexusAuth', () => ({
  useNexusAuthContext: () => ({ getToken: async () => 'token' }),
}));

const TODAY = formatDateISO(new Date());

const person = (id: string, over: Partial<ConfirmationStudent> = {}): ConfirmationStudent => ({
  id,
  name: id[0].toUpperCase() + id.slice(1),
  avatar_url: null,
  phone: '9000000000',
  status: 'not_asked',
  reason: null,
  asked_at: null,
  confirmed_at: null,
  confirmed_by_name: null,
  last_called_at: null,
  last_called_by_name: null,
  call_note: null,
  call_count: 0,
  ...over,
});

const response = (students: ConfirmationStudent[]): ConfirmationsResponse => {
  const counts = { coming: 0, not_coming: 0, away: 0, no_reply: 0, not_asked: 0 };
  for (const s of students) counts[s.status] += 1;
  return {
    class: { id: 'c1', title: 'Building materials', scheduled_date: TODAY, start_time: '19:00:00', end_time: '20:30:00' },
    open: true,
    can_record: true,
    can_ask: true,
    students,
    counts,
  };
};

const standing = (id: string, present: number): ForecastStudent => ({
  id,
  name: id,
  avatar_url: null,
  batch_id: null,
  enrolled_at: '2025-01-01T00:00:00Z',
  present,
  counted: 10,
  away: 0,
  standing: 'keeping_up',
});

/** Twenty regulars keep the room's base rate high, so the patchy ones read as patchy. */
const regulars = Array.from({ length: 20 }, (_, i) => standing(`r${i}`, 10));

const show = (students: ConfirmationStudent[], records: ForecastStudent[] = regulars) => {
  swr.data = response(students);
  return render(
    <AttendanceFollowUpSheet
      open
      onClose={() => {}}
      classroomId="room-1"
      classes={[{ id: 'c1', title: 'Building materials', start_time: '19:00:00' }]}
      standingStudents={records}
    />,
  );
};

beforeEach(() => {
  swr.mutate.mockReset();
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ ok: true }) })));
});

describe('AttendanceFollowUpSheet', () => {
  it('opens on No reply when somebody has not answered', () => {
    show([person('dev', { status: 'no_reply', asked_at: new Date().toISOString() }), person('esha')]);
    expect(screen.getByRole('button', { name: /No reply/ }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText('Dev')).toBeTruthy();
    expect(screen.queryByText('Esha')).toBeNull();
  });

  it('ticks the students who often miss and leaves the regulars alone', () => {
    show(
      [person('rare'), person('steady')],
      [...regulars, standing('rare', 1), standing('steady', 10)],
    );
    expect((screen.getByRole('checkbox', { name: 'Ask Rare' }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole('checkbox', { name: 'Ask Steady' }) as HTMLInputElement).checked).toBe(false);
    expect(screen.getByRole('button', { name: /Ask 1 on Teams/ })).toBeTruthy();
  });

  it('calls through a tel: link with a spoken name', () => {
    show([person('dev', { status: 'no_reply', phone: '9876543210' })]);
    const call = screen.getAllByRole('link').find((a) => a.getAttribute('href') === 'tel:9876543210');
    expect(call).toBeTruthy();
  });

  it('records a reason for one class from inside the row', async () => {
    show([person('dev', { status: 'no_reply' })]);
    // jsdom has no width, so this is the phone layout: an icon button.
    fireEvent.click(screen.getByRole('button', { name: 'Record an answer for Dev' }));
    const said = screen.getByRole('group', { name: 'What they said' });
    fireEvent.click(within(said).getByRole('button', { name: /Not coming/ }));
    fireEvent.click(screen.getByRole('radio', { name: 'Family' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    const [url, init] = (fetch as any).mock.calls[0];
    expect(url).toBe('/api/timetable/c1/confirmations');
    expect(JSON.parse(init.body)).toMatchObject({ action: 'record', studentId: 'dev', answer: 'not_coming', reason_code: 'family' });
  });

  it('says so when everyone asked has answered', () => {
    show([person('chitra', { status: 'coming', confirmed_at: new Date().toISOString() })]);
    fireEvent.click(screen.getByRole('button', { name: /No reply/ }));
    expect(screen.getByText('Everyone asked has answered.')).toBeTruthy();
  });
});
