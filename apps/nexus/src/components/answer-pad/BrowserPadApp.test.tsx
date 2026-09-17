import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PadClientError } from '@/lib/pad/client/pad-fetch';
import BrowserPadApp from './BrowserPadApp';

/**
 * The room code page outside Teams: sign in, find the class by its code, and
 * show the same pad as the meeting panel. Nexus sign-in and the pad are stubs.
 */

const mocks = vi.hoisted(() => ({
  padFetch: vi.fn(),
  auth: { tokenReady: true, getToken: vi.fn() },
}));

vi.mock('@/hooks/useNexusAuth', () => ({ useNexusAuthContext: () => mocks.auth }));

vi.mock('@/lib/pad/client/pad-fetch', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/pad/client/pad-fetch')>()),
  padFetch: mocks.padFetch,
}));

vi.mock('./StudentPad', () => ({
  default: ({ sessionId }: { sessionId: string }) => <div>{`Pad for ${sessionId}`}</div>,
}));

type Handler = (body: Record<string, unknown> | undefined) => unknown;
let handlers: Record<string, Handler>;

const bodiesFor = (path: string) =>
  mocks.padFetch.mock.calls.filter(([, calledPath]) => calledPath === path).map(([, , options]) => (options as { body?: unknown })?.body);

beforeEach(() => {
  mocks.auth.tokenReady = true;
  mocks.auth.getToken.mockReset().mockResolvedValue('nexus-token');
  handlers = {
    '/api/pad/me': () => ({ role: 'student', name: 'Asha' }),
    '/api/pad/join': () => ({ sessionId: 's1' }),
  };
  mocks.padFetch.mockReset().mockImplementation(async (_host: unknown, path: string, options?: { body?: Record<string, unknown> }) => {
    const handler = handlers[path];
    if (!handler) throw new Error(`No handler for ${path}`);
    return handler(options?.body);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('BrowserPadApp', () => {
  it('waits for sign-in to settle before asking anything', () => {
    mocks.auth.tokenReady = false;
    render(<BrowserPadApp code="482913" />);
    expect(screen.getByText('Opening the Answer Pad.')).toBeTruthy();
    expect(mocks.auth.getToken).not.toHaveBeenCalled();
  });

  it('asks a signed-out student to sign in, and brings them back to the same code', async () => {
    mocks.auth.getToken.mockResolvedValue(null);
    render(<BrowserPadApp code="482913" />);

    expect(await screen.findByText('Sign in with your Neram Microsoft account to join your class.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Sign in' }).getAttribute('href')).toBe('/login?next=%2Fpad%2Fr%2F482913');
    expect(mocks.padFetch).not.toHaveBeenCalled();
  });

  it('joins straight away from a room code link', async () => {
    render(<BrowserPadApp code="482913" />);
    expect(await screen.findByText('Pad for s1')).toBeTruthy();
    expect(bodiesFor('/api/pad/join')).toEqual([{ code: '482913' }]);
  });

  it('asks for the code on /pad, and keeps the class in the address so a reload rejoins', async () => {
    const replaceState = vi.spyOn(window.history, 'replaceState');
    handlers['/api/pad/join'] = () => ({ sessionId: 's2' });
    render(<BrowserPadApp />);

    fireEvent.change(await screen.findByLabelText('Room code'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Join class' }));

    expect(await screen.findByText('Pad for s2')).toBeTruthy();
    expect(replaceState).toHaveBeenCalledWith(null, '', '/pad/r/123456');
  });

  it('explains a code that matches no class, with the code ready to correct', async () => {
    handlers['/api/pad/join'] = () => {
      throw new PadClientError(404, 'ROOM_CODE_INVALID', 'ROOM_CODE_INVALID');
    };
    render(<BrowserPadApp code="482913" />);

    expect(await screen.findByText("That code doesn't match a live class. Check the six digits on your teacher's screen.")).toBeTruthy();
    expect((screen.getByLabelText('Room code') as HTMLInputElement).value).toBe('482913');
  });

  it('sends teachers to Teams instead of a student pad', async () => {
    handlers['/api/pad/me'] = () => ({ role: 'staff', name: 'Teacher' });
    render(<BrowserPadApp code="482913" />);

    expect(await screen.findByText(/Teachers run the Answer Pad from the class meeting in Teams/)).toBeTruthy();
    await waitFor(() => expect(bodiesFor('/api/pad/join')).toEqual([]));
  });

  it('says when the Answer Pad is switched off for the account', async () => {
    handlers['/api/pad/me'] = () => {
      throw new PadClientError(404, null, 'Not found');
    };
    render(<BrowserPadApp />);
    expect(await screen.findByText("The Answer Pad isn't switched on for your account yet.")).toBeTruthy();
  });
});
