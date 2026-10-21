import { describe, it, expect, vi } from 'vitest';

vi.mock('@neram/database', () => ({ createAdminClient: () => ({}) }));
vi.mock('@neram/database/queries', () => ({ getActiveCenters: async () => [] }));
vi.mock('@/lib/college-hub/queries', () => ({ getCollegeBySlug: async () => null }));

import { parseBookArgs } from '../booking';
import { DEFAULT_VISIT_SLOTS, matchCentre, pickVisitSlot, planCentreVisit, planMessage, planTicket, type CentreRow } from './quick-forms';

const NOW = new Date('2026-10-20T06:00:00Z');
const CENTRES: CentreRow[] = [
  { id: 'c1', name: 'Ashok Nagar', city: 'Chennai', preferred_visit_times: [] },
  { id: 'c2', name: 'Tambaram', city: 'Chennai', preferred_visit_times: ['11:00 AM - 1:00 PM', '4:00 PM - 6:00 PM'] },
  { id: 'c3', name: 'Coimbatore Centre', city: 'Coimbatore', preferred_visit_times: [] },
];

const cardOf = (r: ReturnType<typeof planCentreVisit>) => parseBookArgs((r.ok ? r.card ?? '' : '').replace(/^\[\[book:|\]\]$/g, ''), NOW);

describe('matchCentre', () => {
  it('finds a centre by area or city', () => {
    expect(matchCentre(CENTRES, 'tambaram').centre?.id).toBe('c2');
    expect(matchCentre(CENTRES, 'the Coimbatore one').centre?.id).toBe('c3');
  });

  it('asks when a city has more than one centre, or nothing matches', () => {
    expect(matchCentre(CENTRES, 'Chennai')).toMatchObject({ centre: null, candidates: [CENTRES[0], CENTRES[1]] });
    expect(matchCentre(CENTRES, 'Delhi').centre).toBeNull();
  });
});

describe('pickVisitSlot', () => {
  it('takes the exact slot, or the morning / afternoon one', () => {
    expect(pickVisitSlot(DEFAULT_VISIT_SLOTS, '2:00 PM - 5:00 PM')).toBe('2:00 PM - 5:00 PM');
    expect(pickVisitSlot(DEFAULT_VISIT_SLOTS, 'morning')).toBe('10:00 AM - 12:00 PM');
    expect(pickVisitSlot(DEFAULT_VISIT_SLOTS, 'afternoon')).toBe('2:00 PM - 5:00 PM');
    expect(pickVisitSlot(DEFAULT_VISIT_SLOTS, 'midnight')).toBeNull();
  });
});

describe('planCentreVisit', () => {
  it("prepares a visit with the centre's own slots", () => {
    const r = planCentreVisit({ centre: 'Tambaram', date: 'tomorrow', time: 'afternoon', purpose: 'See the drawing studio' }, CENTRES, false, NOW);
    expect(cardOf(r)).toEqual({
      kind: 'visit',
      date: '2026-10-21',
      window: null,
      draft: {
        fields: {
          centreId: 'c2',
          centreName: 'Tambaram, Chennai',
          slot: '4:00 PM - 6:00 PM',
          slots: '11:00 AM - 1:00 PM|4:00 PM - 6:00 PM',
          purpose: 'See the drawing studio',
        },
      },
    });
    expect(r.ok && (r.data as any).next_step).toMatch(/never in the chat/);
  });

  it('refuses today and dates too far out', () => {
    expect(planCentreVisit({ centre: 'Tambaram', date: 'today' }, CENTRES, true, NOW)).toMatchObject({ ok: false, error: 'date_not_open' });
    expect(planCentreVisit({ centre: 'Tambaram', date: '2027-01-30' }, CENTRES, true, NOW)).toMatchObject({ ok: false, error: 'date_not_open' });
  });

  it('lists the centres when it is not clear which one', () => {
    const r = planCentreVisit({ centre: 'Chennai' }, CENTRES, true, NOW);
    expect(r).toMatchObject({ ok: false, error: 'centre_not_clear', centres: ['Ashok Nagar (Chennai)', 'Tambaram (Chennai)'] });
  });
});

describe('planTicket', () => {
  it('prepares a ticket with a known category, else "other"', () => {
    const r = planTicket({ category: 'payment_issue', subject: 'UPI paid, not showing', description: 'I paid by UPI yesterday but my enrolment still says pending.' });
    expect(r.ok && parseBookArgs((r.card ?? '').slice(7, -2), NOW)).toMatchObject({
      kind: 'ticket',
      draft: { fields: { category: 'payment_issue', subject: 'UPI paid, not showing' } },
    });
    const other = planTicket({ category: 'urgent!!', description: 'The website will not load my application page.' });
    expect(other.ok && (other.data as any).category).toBe('other');
  });

  it('needs the problem described', () => {
    expect(planTicket({ description: 'help' })).toMatchObject({ ok: false, error: 'describe_the_problem' });
  });
});

describe('planMessage', () => {
  it('prepares the message card', () => {
    const r = planMessage({ subject: 'Hostel', message: 'Do you help with hostel near the Chennai centre?' });
    expect(r.ok && parseBookArgs((r.card ?? '').slice(7, -2), NOW)?.draft?.fields).toEqual({
      subject: 'Hostel',
      message: 'Do you help with hostel near the Chennai centre?',
    });
  });

  it('needs at least a sentence', () => {
    expect(planMessage({ message: 'hi' })).toMatchObject({ ok: false, error: 'message_too_short' });
  });
});
