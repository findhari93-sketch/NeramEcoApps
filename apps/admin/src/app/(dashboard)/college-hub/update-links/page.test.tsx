/**
 * Render tests for Update links: the list, the create dialog and its ready
 * screen, the ?college_id shortcut, and the WhatsApp source line in Content reviews.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import UpdateLinksPage from './page';
import ContentReviewsPage from '../content-reviews/page';

vi.mock('@neram/auth', () => ({
  useMicrosoftAuth: () => ({ user: { name: 'Test Staff', email: 'staff@neramclasses.com' } }),
}));

const COLLEGE = { id: '0b6f9a8e-1c2d-4e5f-8a9b-0c1d2e3f4a5b', name: 'Papni School of Architecture', slug: 'papni', state_slug: 'tamil-nadu', city: 'Madurai' };

const LINK = {
  id: '11111111-2222-4333-8444-555555555555',
  college_id: COLLEGE.id,
  sections: ['profile', 'fees'],
  recipient_name: 'Dr Kumar',
  recipient_phone: '919876543210',
  note: null,
  created_by: 'Hari',
  created_at: '2026-10-14T00:00:00Z',
  expires_at: '2026-10-28T00:00:00Z',
  revoked_at: null,
  revoked_by: null,
  first_opened_at: '2026-10-14T05:00:00Z',
  last_opened_at: '2026-10-14T05:00:00Z',
  open_count: 2,
  submitted_at: '2026-10-14T06:00:00Z',
  submit_count: 1,
  status: 'submitted',
  college: COLLEGE,
  pending_reviews: 2,
};

const CREATED = {
  link: { ...LINK, id: 'new' },
  url: 'https://neramclasses.com/college-update/tok',
  message: 'Hello Dr Kumar, this is Neram Classes. ...',
  whatsapp_url: 'https://wa.me/919876543210?text=Hello',
};

let calls: { url: string; init?: RequestInit }[] = [];

beforeEach(() => {
  calls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      const path = new URL(url, 'http://localhost').pathname;
      let body: unknown = {};
      let status = 200;
      if (path === '/api/college-hub/update-links') {
        if (init?.method === 'POST') {
          body = CREATED;
          status = 201;
        } else body = { data: [LINK], ...(url.includes('college_id=') ? { college: COLLEGE } : {}) };
      } else if (path === '/api/college-hub/content-reviews') {
        body = {
          pending_count: 1,
          data: [
            {
              id: 's1',
              college_id: COLLEGE.id,
              section: 'fees',
              section_label: 'Fees',
              payload: {},
              previous: {},
              status: 'pending',
              submitted_by_name: 'Dr Kumar',
              submitted_at: '2026-10-14T06:00:00Z',
              reviewed_at: null,
              reviewed_by: null,
              review_note: null,
              source: 'link',
              submitter_role: 'Principal',
              submitter_phone: '919876543210',
              update_link_id: LINK.id,
              college: COLLEGE,
              diff: [],
            },
          ],
        };
      }
      return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
});

describe('Update links page', () => {
  it('lists links with status, sections and a reviews link', async () => {
    render(<UpdateLinksPage />);
    expect(await screen.findByText('Papni School of Architecture')).toBeTruthy();
    expect(screen.getByText('+91 98765 43210')).toBeTruthy();
    expect(screen.getByText('About and contacts')).toBeTruthy();
    expect(screen.getAllByText('Submitted').length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: '2 to review' }).getAttribute('href')).toBe('/college-hub/content-reviews');
    expect(screen.getByText('Submitted (1)')).toBeTruthy();
    expect(screen.getByText(/We only keep a fingerprint/)).toBeTruthy();
  });

  it('creates a link and shows the ready message with WhatsApp', async () => {
    render(<UpdateLinksPage />);
    await screen.findByText('Papni School of Architecture');
    fireEvent.click(screen.getByRole('button', { name: 'Create link' }));
    const dialog = await screen.findByRole('dialog');
    // Facilities is off by default, the other five are on.
    expect((within(dialog).getByLabelText('Campus and facilities') as HTMLInputElement).checked).toBe(false);
    expect((within(dialog).getByLabelText('Fees') as HTMLInputElement).checked).toBe(true);
    expect((within(dialog).getByLabelText('14 days') as HTMLInputElement).checked).toBe(true);

    // No college chosen: nothing is sent.
    fireEvent.click(within(dialog).getByRole('button', { name: 'Make link' }));
    expect(await within(dialog).findByText('Choose a college.')).toBeTruthy();
    expect(calls.some((c) => c.init?.method === 'POST')).toBe(false);

    fireEvent.change(within(dialog).getByLabelText('Their WhatsApp number (optional)'), { target: { value: '12345' } });
    expect(within(dialog).getByText('Enter a 10 digit Indian mobile number.')).toBeTruthy();
  });

  it('opens the dialog for ?college_id and posts the new link', async () => {
    window.history.replaceState(null, '', `/college-hub/update-links?college_id=${COLLEGE.id}`);
    render(<UpdateLinksPage />);
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect((within(dialog).getByLabelText('Contact name') as HTMLInputElement).value).toBe('Dr Kumar'));
    expect((within(dialog).getByRole('combobox') as HTMLInputElement).value).toBe(COLLEGE.name);
    expect(window.location.search).toBe('');

    fireEvent.click(within(dialog).getByRole('button', { name: 'Make link' }));
    expect(await within(dialog).findByText(/Nothing is sent until you press send in WhatsApp/)).toBeTruthy();
    const post = calls.find((c) => c.init?.method === 'POST');
    const sent = JSON.parse(String(post?.init?.body));
    expect(sent).toMatchObject({
      college_id: COLLEGE.id,
      recipient_name: 'Dr Kumar',
      recipient_phone: '+91 98765 43210',
      sections: ['profile', 'fees', 'admissions', 'location', 'photos'],
      expires_in_days: 14,
      replace_link_id: null,
    });
    const wa = within(dialog).getByRole('link', { name: 'Open in WhatsApp' });
    expect(wa.getAttribute('href')).toBe(CREATED.whatsapp_url);
    expect(wa.getAttribute('target')).toBe('_blank');
    expect(within(dialog).getByDisplayValue(CREATED.url)).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Copy message' })).toBeTruthy();
  });

  it('Make a new link prefills and replaces the old link', async () => {
    render(<UpdateLinksPage />);
    await screen.findByText('Papni School of Architecture');
    fireEvent.click(screen.getByRole('button', { name: /Actions for the link/ }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Make a new link' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/old link stops working/)).toBeTruthy();
    expect((within(dialog).getByLabelText('Admissions') as HTMLInputElement).checked).toBe(false);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Make link' }));
    await within(dialog).findByText(/Nothing is sent/);
    const sent = JSON.parse(String(calls.find((c) => c.init?.method === 'POST')?.init?.body));
    expect(sent).toMatchObject({ replace_link_id: LINK.id, sections: ['profile', 'fees'] });
  });
});

describe('Content reviews from a link', () => {
  it('says it came from a WhatsApp link with a call button', async () => {
    render(<ContentReviewsPage />);
    expect(await screen.findByText('From a WhatsApp link: Dr Kumar, Principal')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Call +91 98765 43210' }).getAttribute('href')).toBe('tel:+919876543210');
  });
});
