/**
 * Render smoke tests for the college partner programme pages: each page loads
 * its data, shows it, and offers its main action, with no crash.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import PlansPage from './plans/page';
import AccountsPage from './accounts/page';
import ContentReviewsPage from './content-reviews/page';
import MapPinsPage from './map-pins/page';
import HubPage from './page';

vi.mock('@neram/auth', () => ({
  useMicrosoftAuth: () => ({ user: { name: 'Test Staff', email: 'staff@neramclasses.com' } }),
}));

const PAPNI = { id: 'c1', name: 'Papni School of Architecture', slug: 'papni-architecture', state_slug: 'tamil-nadu', city: 'Madurai' };

const RESPONSES: Record<string, unknown> = {
  '/api/college-hub/plans': {
    plans: [
      {
        id: 'p1',
        college_id: 'c1',
        tier: 'gold',
        starts_on: '2026-10-01',
        ends_on: '2099-08-31',
        amount: 0,
        status: 'active',
        notes: 'Pilot',
        created_by: 'Hari',
        created_at: '2026-10-01T00:00:00Z',
        revoked_at: null,
        revoked_by: null,
        revoke_reason: null,
        college: PAPNI,
        account_count: 2,
      },
    ],
    counts: { all: 1, active: 1, expiring: 0, ended: 0, revoked: 0 },
    today: '2026-10-15',
  },
  '/api/college-hub/accounts': {
    data: [
      {
        id: 'a1',
        college_id: 'c1',
        name: 'Dr Principal',
        email: 'principal@papni.test',
        phone: null,
        designation: 'Principal',
        role: 'owner',
        is_active: true,
        invited_at: '2026-10-14T00:00:00Z',
        invited_by: 'Hari',
        accepted_at: null,
        last_login_at: null,
        created_at: '2026-10-14T00:00:00Z',
        college_name: PAPNI.name,
        college_slug: PAPNI.slug,
        college_tier: 'gold',
      },
    ],
    requests: [
      {
        id: 'r1',
        college_name: 'Papni',
        college_id: 'c1',
        name: 'Office Admin',
        email: 'office@papni.test',
        phone: '9999999999',
        designation: 'Office',
        message: 'Please give me access',
        created_at: '2026-10-14T00:00:00Z',
        colleges: { name: PAPNI.name, slug: PAPNI.slug },
      },
    ],
  },
  '/api/college-hub/content-reviews': {
    pending_count: 1,
    data: [
      {
        id: 's1',
        college_id: 'c1',
        section: 'photos',
        section_label: 'Photos',
        payload: { hero_image_url: 'https://cdn.test/hero.jpg', gallery_images: ['https://cdn.test/1.jpg'] },
        previous: { hero_image_url: null, gallery_images: [] },
        status: 'pending',
        submitted_by_name: 'Dr Principal',
        submitted_at: '2026-10-14T00:00:00Z',
        reviewed_at: null,
        reviewed_by: null,
        review_note: null,
        college: PAPNI,
        diff: [
          { key: 'hero_image_url', label: 'Cover photo', kind: 'image', before: null, after: 'https://cdn.test/hero.jpg', changed: true },
          { key: 'gallery_images', label: 'Gallery', kind: 'images', before: [], after: ['https://cdn.test/1.jpg'], changed: true },
        ],
      },
    ],
  },
  '/api/college-hub/map-pins': {
    counts: { total: 186, with_pin: 75, suggested: 1, missing: 110 },
    data: [
      {
        id: 'c2',
        name: 'Aayojan School of Architecture',
        city: 'Jaipur',
        state: 'Rajasthan',
        geo_suggested_lat: 26.767043,
        geo_suggested_lng: 75.851265,
        geo_suggested_source: 'nominatim',
        geo_suggested_label: 'Aayojan School of Architecture, Jaipur, Rajasthan',
      },
    ],
  },
  '/api/college-hub/account-requests': { pending_count: 3 },
  '/api/college-hub/colleges': { data: [], total: 186 },
  '/api/college-hub/reviews': { data: [] },
};

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const path = new URL(String(input), 'http://localhost').pathname;
      const body = RESPONSES[path] ?? {};
      return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('college partner pages', () => {
  it('Plans lists plans with counts and opens the Give plan dialog', async () => {
    render(<PlansPage />);
    expect(await screen.findByText(PAPNI.name)).toBeTruthy();
    expect(screen.getByText('Free trial')).toBeTruthy();
    expect(screen.getByText('Active (1)')).toBeTruthy();
    expect(screen.getByText('How to run a college pilot')).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: 'Give plan' })[0]);
    expect(await screen.findByRole('dialog')).toBeTruthy();
    expect(screen.getByText(/Admission season/)).toBeTruthy();
  });

  it('Accounts groups people by college and shows account requests', async () => {
    render(<AccountsPage />);
    expect(await screen.findByText('Dr Principal')).toBeTruthy();
    expect(screen.getByText('Invited, waiting')).toBeTruthy();
    expect(screen.getByText('Account requests (1)')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByDisplayValue('office@papni.test')).toBeTruthy();
  });

  it('Content reviews shows the before and after table with photos', async () => {
    render(<ContentReviewsPage />);
    expect(await screen.findByText('Cover photo')).toBeTruthy();
    expect(screen.getByText('Waiting (1)')).toBeTruthy();
    expect(screen.getAllByRole('img').length).toBeGreaterThanOrEqual(2);
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
    const confirm = await screen.findByRole('dialog');
    expect(confirm.textContent).toContain('Note to the college');
  });

  it('Map pins shows the coverage header and suggestion actions', async () => {
    render(<MapPinsPage />);
    expect(await screen.findByText('75 of 186 colleges have a map pin')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Accept' })).toBeTruthy();
    expect(screen.getByText(/Check on map/)).toBeTruthy();
  });

  it('College Hub index shows waiting badges for content and account requests', async () => {
    render(<HubPage />);
    await waitFor(() => expect(screen.getByLabelText('Accounts, 3 waiting')).toBeTruthy());
    expect(screen.getByLabelText('Content reviews, 1 waiting')).toBeTruthy();
    expect(screen.getByLabelText('Map pins')).toBeTruthy();
  });
});
