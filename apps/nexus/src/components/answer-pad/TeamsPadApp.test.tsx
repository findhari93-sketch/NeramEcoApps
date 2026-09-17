import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PadClientError } from '@/lib/pad/client/pad-fetch';
import type { PadHost } from '@/lib/pad/client/pad-host';
import TeamsPadApp, { identifyProblem } from './TeamsPadApp';

/**
 * The one address Teams loads for everyone: it must find the host, ask who
 * this is, and show the console or the pad. The screens themselves are stubs.
 */

const mocks = vi.hoisted(() => ({
  padFetch: vi.fn(),
  readTestHost: vi.fn(),
  connectTeamsHost: vi.fn(),
}));

vi.mock('@/lib/pad/client/pad-fetch', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/pad/client/pad-fetch')>()),
  padFetch: mocks.padFetch,
}));

vi.mock('@/lib/pad/client/pad-host', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/pad/client/pad-host')>()),
  readTestHost: mocks.readTestHost,
  connectTeamsHost: mocks.connectTeamsHost,
}));

vi.mock('./TeacherConsole', () => ({ default: () => <div>Teacher console</div> }));
vi.mock('./StageResults', () => ({ default: () => <div>Class results</div> }));
vi.mock('./StudentMeetingPad', () => ({
  default: ({ compact }: { compact?: boolean }) => <div>{compact ? 'Student pop-up pad' : 'Student pad'}</div>,
}));

const host: PadHost = {
  kind: 'teams',
  meeting: { meetingId: 'meeting-1', chatId: null, channelId: null },
  frame: 'sidePanel',
  theme: 'dark',
  getToken: async () => 'token',
  onResume: () => () => undefined,
  onThemeChange: () => () => undefined,
};

beforeEach(() => {
  mocks.padFetch.mockReset();
  mocks.readTestHost.mockReset().mockReturnValue(null);
  mocks.connectTeamsHost.mockReset().mockResolvedValue(host);
});

describe('TeamsPadApp', () => {
  it('shows staff the console and students the pad, from the same address', async () => {
    mocks.padFetch.mockResolvedValue({ role: 'staff' });
    const { unmount } = render(<TeamsPadApp />);
    expect(await screen.findByText('Teacher console')).toBeTruthy();
    expect(mocks.padFetch).toHaveBeenCalledWith(host, '/api/pad/me');
    unmount();

    mocks.padFetch.mockResolvedValue({ role: 'student' });
    render(<TeamsPadApp />);
    expect(await screen.findByText('Student pad')).toBeTruthy();
  });

  it('gives students the compact pad in the question pop-up, and teachers a pointer back to the panel', async () => {
    mocks.padFetch.mockResolvedValue({ role: 'student' });
    const { unmount } = render(<TeamsPadApp variant="popup" />);
    expect(await screen.findByText('Student pop-up pad')).toBeTruthy();
    unmount();

    mocks.padFetch.mockResolvedValue({ role: 'staff' });
    render(<TeamsPadApp variant="popup" />);
    expect(await screen.findByText(/This pop-up is for students/)).toBeTruthy();
    expect(screen.queryByText('Teacher console')).toBeNull();
  });

  it('shows the class results on the meeting screen, to teachers and students alike', async () => {
    mocks.padFetch.mockResolvedValue({ role: 'staff' });
    const { unmount } = render(<TeamsPadApp variant="stage" />);
    expect(await screen.findByText('Class results')).toBeTruthy();
    expect(screen.queryByText('Teacher console')).toBeNull();
    unmount();

    // Teams' own share button opens the side panel page on the stage.
    mocks.connectTeamsHost.mockResolvedValue({ ...host, frame: 'meetingStage' });
    mocks.padFetch.mockResolvedValue({ role: 'student' });
    render(<TeamsPadApp />);
    expect(await screen.findByText('Class results')).toBeTruthy();
    expect(screen.queryByText('Student pad')).toBeNull();
  });

  it('uses the injected test host without touching Teams', async () => {
    mocks.readTestHost.mockReturnValue({ ...host, kind: 'test' });
    mocks.padFetch.mockResolvedValue({ role: 'student' });
    render(<TeamsPadApp />);
    expect(await screen.findByText('Student pad')).toBeTruthy();
    expect(mocks.connectTeamsHost).not.toHaveBeenCalled();
  });

  it('points to the room code page when it is not running inside Teams', async () => {
    mocks.connectTeamsHost.mockResolvedValue(null);
    render(<TeamsPadApp />);
    expect(await screen.findByText('Open this in a Teams meeting')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Join with a room code' }).getAttribute('href')).toBe('/pad');
    expect(mocks.padFetch).not.toHaveBeenCalled();
  });

  it('says plainly when the Answer Pad is switched off, with no pointless retry', async () => {
    mocks.padFetch.mockRejectedValue(new PadClientError(404, null, 'Not found'));
    render(<TeamsPadApp />);
    expect(await screen.findByText("The Answer Pad isn't switched on for your account yet.")).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });

  it('offers a retry when sign in or the network failed', async () => {
    mocks.padFetch.mockRejectedValueOnce(new PadClientError(0, 'OFFLINE', 'No connection')).mockResolvedValueOnce({ role: 'staff' });
    render(<TeamsPadApp />);

    const retry = await screen.findByRole('button', { name: 'Try again' });
    retry.click();
    expect(await screen.findByText('Teacher console')).toBeTruthy();
  });
});

describe('identifyProblem', () => {
  it('turns each failure into a message and whether trying again can help', () => {
    expect(identifyProblem(new PadClientError(404, null, 'x'))).toEqual({
      message: "The Answer Pad isn't switched on for your account yet.",
      canRetry: false,
    });
    expect(identifyProblem(new PadClientError(401, 'NO_TOKEN', 'x'))).toMatchObject({ canRetry: true });
    expect(identifyProblem(new PadClientError(0, 'OFFLINE', 'x')).message).toBe('No connection. Check your network and try again.');
    expect(identifyProblem(new Error('boom')).message).toBe('The Answer Pad could not load. Please try again.');
  });
});
