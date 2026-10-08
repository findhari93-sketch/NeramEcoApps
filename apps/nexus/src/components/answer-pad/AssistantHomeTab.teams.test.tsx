import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AssistantHomeTab from './AssistantHomeTab';

/**
 * Inside Teams. A Teams Activity click opens the tab on the notification it was
 * about (context.page.subPageId); opened directly, the tab lists recent ones.
 * Before 2026-10-07 every click opened the same generic home.
 */

const teams = vi.hoisted(() => ({ subPageId: undefined as string | undefined }));

vi.mock('@microsoft/teams-js', () => ({
  app: {
    initialize: () => Promise.resolve(),
    getContext: () => Promise.resolve({ app: { theme: 'default' }, page: { id: 'nexusAssignments', subPageId: teams.subPageId } }),
    registerOnThemeChangeHandler: () => {},
    notifySuccess: () => Promise.resolve(),
  },
  authentication: { getAuthToken: () => Promise.resolve('sso-token') },
}));

const ID = '7f1c2a9e-3b4d-4c5e-8f60-1a2b3c4d5e6f';
const NO_DASHES = /[–—]|--/;

const detail = {
  id: ID,
  event_type: 'catchup_digest',
  title: 'Catch-up: new reasons and completions',
  message: '3 students explained why they missed a class, and 1 student finished their catch-up.',
  created_at: '2026-10-07T03:30:00Z',
  items: [
    { kind: 'reason', studentName: 'Asha Bavi', classTitle: 'Coordinate Geometry', scheduledDate: '2026-10-06', reasonLabel: 'Unwell', reasonNote: 'had fever' },
    { kind: 'completed', studentName: 'Ravi K', classTitle: 'History of Architecture', scheduledDate: '2026-10-03', reasonLabel: null, reasonNote: null },
  ],
  more: 2,
  href: '/teacher/catch-up?view=calendar&month=2026-10&class=c1',
};

let fetchMock: ReturnType<typeof vi.fn<[string], Promise<Response>>>;

beforeEach(() => {
  teams.subPageId = undefined;
  fetchMock = vi.fn(async (url: string) => {
    if (url === `/api/notifications/${ID}`) return new Response(JSON.stringify(detail), { status: 200 });
    if (url.startsWith('/api/notifications?')) {
      return new Response(
        JSON.stringify({
          notifications: [{ id: ID, title: detail.title, message: detail.message, created_at: detail.created_at, is_read: false }],
        }),
        { status: 200 },
      );
    }
    return new Response('{}', { status: 404 });
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AssistantHomeTab inside Teams', () => {
  it('opens on the clicked notification, with who, why and a link to the exact page', async () => {
    teams.subPageId = ID;
    const { container } = render(<AssistantHomeTab />);

    expect(await screen.findByRole('heading', { level: 1, name: detail.title })).toBeTruthy();
    expect(screen.getByText('Asha Bavi')).toBeTruthy();
    expect(screen.getByText('Unwell')).toBeTruthy();
    expect(screen.getByText(/had fever/)).toBeTruthy();
    expect(screen.getByText('Ravi K')).toBeTruthy();
    expect(screen.getByText(/And 2 more/)).toBeTruthy();

    const open = screen.getByRole('link', { name: /Open in Nexus/ });
    expect(open.getAttribute('href')).toBe(detail.href);
    expect(open.getAttribute('target')).toBe('_blank');
    expect(open.getAttribute('rel')).toContain('noopener');

    expect(fetchMock).toHaveBeenCalledWith(`/api/notifications/${ID}`, expect.objectContaining({
      headers: { Authorization: 'Bearer sso-token' },
    }));
    expect(container.textContent).not.toMatch(NO_DASHES);
  });

  it('goes back to the list of recent notifications', async () => {
    teams.subPageId = ID;
    render(<AssistantHomeTab />);
    fireEvent.click(await screen.findByRole('button', { name: 'All notifications' }));
    expect(await screen.findByRole('heading', { name: 'Recent notifications' })).toBeTruthy();
  });

  it('opened directly, lists recent notifications and opens one on tap', async () => {
    render(<AssistantHomeTab />);
    const row = await screen.findByRole('button', { name: new RegExp(`New\\. ${detail.title}`) });
    expect(screen.queryByRole('navigation', { name: 'Open in Nexus' })).toBeNull();
    fireEvent.click(row);
    expect(await screen.findByRole('link', { name: /Open in Nexus/ })).toBeTruthy();
  });

  it('says so when the notification cannot be loaded, and still offers the way back', async () => {
    teams.subPageId = ID;
    fetchMock.mockImplementation(async () => new Response('{}', { status: 404 }));
    render(<AssistantHomeTab />);
    expect((await screen.findByRole('alert')).textContent).toMatch(/Could not load this notification/);
    expect(screen.getByRole('button', { name: 'All notifications' })).toBeTruthy();
  });

  it('shows the list error with a retry', async () => {
    fetchMock.mockImplementation(async () => new Response('{}', { status: 500 }));
    render(<AssistantHomeTab />);
    expect((await screen.findByRole('alert')).textContent).toMatch(/Could not load your notifications/);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy());
  });
});
