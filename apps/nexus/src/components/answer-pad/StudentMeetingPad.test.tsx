import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PadClientError } from '@/lib/pad/client/pad-fetch';
import type { PadHost } from '@/lib/pad/client/pad-host';
import StudentMeetingPad from './StudentMeetingPad';

/**
 * How a student gets from the meeting panel to the pad: the live session for
 * this meeting, a wait while the teacher has not started, or the room code
 * where Teams gives no meeting id. The pad itself is replaced by a stub.
 */

const mocks = vi.hoisted(() => ({ padFetch: vi.fn() }));

vi.mock('@/lib/pad/client/pad-fetch', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/pad/client/pad-fetch')>()),
  padFetch: mocks.padFetch,
}));

vi.mock('./StudentPad', () => ({
  default: ({ sessionId }: { sessionId: string }) => <div>{`Pad for ${sessionId}`}</div>,
}));

function makeHost(meetingId: string | null): PadHost & { resume: () => void } {
  const handlers = new Set<() => void>();
  return {
    kind: 'test',
    meeting: meetingId ? { meetingId, chatId: null, channelId: null } : null,
    frame: 'sidePanel',
    theme: 'light',
    getToken: async () => 'token',
    onResume: (handler) => {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
    onThemeChange: () => () => undefined,
    resume: () => handlers.forEach((handler) => handler()),
  };
}

const typeCode = (value: string) => fireEvent.change(screen.getByLabelText('Room code'), { target: { value } });
const joinButton = () => screen.getByRole('button', { name: 'Join class' }) as HTMLButtonElement;

beforeEach(() => {
  mocks.padFetch.mockReset();
});

describe('StudentMeetingPad', () => {
  it('waits while the teacher has not started, then opens the pad for this meeting', async () => {
    const host = makeHost('meeting-1');
    mocks.padFetch.mockResolvedValueOnce({ sessionId: null }).mockResolvedValueOnce({ sessionId: 's1' });
    render(<StudentMeetingPad host={host} />);

    expect(await screen.findByText('Waiting for your teacher')).toBeTruthy();
    expect(mocks.padFetch).toHaveBeenCalledWith(host, '/api/pad/join', { method: 'POST', body: { meetingId: 'meeting-1' } });

    // Teams bringing the panel back checks again straight away.
    act(() => host.resume());
    expect(await screen.findByText('Pad for s1')).toBeTruthy();
  });

  it('uses pop-up wording while the compact pad waits', async () => {
    mocks.padFetch.mockResolvedValue({ sessionId: null });
    render(<StudentMeetingPad host={makeHost('meeting-1')} compact />);
    expect(await screen.findByText('Your question appears here as soon as your teacher asks.')).toBeTruthy();
    expect(screen.queryByText(/Keep this panel open/)).toBeNull();
  });

  it('keeps waiting through a dropped connection', async () => {
    mocks.padFetch.mockRejectedValue(new PadClientError(0, 'OFFLINE', 'No connection'));
    render(<StudentMeetingPad host={makeHost('meeting-1')} />);
    expect(await screen.findByText('Waiting for your teacher')).toBeTruthy();
  });

  it('explains when the student is not on the class list', async () => {
    mocks.padFetch.mockRejectedValue(new PadClientError(403, 'NOT_ENROLLED', 'NOT_ENROLLED'));
    render(<StudentMeetingPad host={makeHost('meeting-1')} />);
    expect(await screen.findByText(/not on the class list for this class/)).toBeTruthy();
  });

  it('asks for the room code where Teams gives no meeting id, taking digits only', async () => {
    const host = makeHost(null);
    mocks.padFetch.mockResolvedValue({ sessionId: 's2' });
    render(<StudentMeetingPad host={host} />);

    expect(joinButton().disabled).toBe(true);
    typeCode('48a2 9-13');
    expect((screen.getByLabelText('Room code') as HTMLInputElement).value).toBe('482913');
    expect(joinButton().disabled).toBe(false);

    fireEvent.click(joinButton());
    expect(await screen.findByText('Pad for s2')).toBeTruthy();
    expect(mocks.padFetch).toHaveBeenCalledTimes(1);
    expect(mocks.padFetch).toHaveBeenCalledWith(host, '/api/pad/join', { method: 'POST', body: { code: '482913' } });
  });

  it('says why a room code did not work', async () => {
    mocks.padFetch
      .mockRejectedValueOnce(new PadClientError(404, 'ROOM_CODE_INVALID', 'ROOM_CODE_INVALID'))
      .mockRejectedValueOnce(new PadClientError(429, 'RATE_LIMITED', 'RATE_LIMITED'));
    render(<StudentMeetingPad host={makeHost(null)} />);

    typeCode('000000');
    fireEvent.click(joinButton());
    expect(await screen.findByText("That code doesn't match a live class. Check the six digits on your teacher's screen.")).toBeTruthy();

    fireEvent.click(joinButton());
    expect(await screen.findByText('Too many tries. Wait a minute, then try again.')).toBeTruthy();
  });

  it('lets a waiting student use a room code instead, and go back to waiting', async () => {
    mocks.padFetch.mockResolvedValue({ sessionId: null });
    render(<StudentMeetingPad host={makeHost('meeting-1')} />);

    fireEvent.click(await screen.findByRole('button', { name: 'I have a room code' }));
    expect(screen.getByLabelText('Room code')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Back to waiting for my teacher' }));
    expect(await screen.findByText('Waiting for your teacher')).toBeTruthy();
  });
});
