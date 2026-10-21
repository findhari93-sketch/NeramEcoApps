import { describe, it, expect } from 'vitest';
import { feeLinks, NO_FEES, planExamYear, planFees, planNotifications, planOpenAsk, planSavedColleges, planStatus, planTicket, type FeeFacts } from './plan';

const NOW = new Date('2026-10-20T06:00:00Z');

const FEES: FeeFacts = {
  balance: { amount: 13500, installmentNumber: 2, dueLabel: '5 Nov 2026' },
  pendingClaim: null,
  approvedApplication: { leadId: 'lead-1', number: 'NERAM-2026-0042', fee: 30000 },
  enrolmentLink: { token: 'secret-tok', amount: 25000 },
};

describe('feeLinks / planFees', () => {
  it('gives one button per payment, the in-app fee page for an approved application', () => {
    const links = feeLinks(FEES);
    expect(links.map((l) => [l.label, l.primary ?? false])).toEqual([
      ['Finish your enrolment and pay ₹25,000', true],
      ['Pay the course fee (₹30,000)', false],
      ['Pay ₹13,500 (instalment 2, due 5 Nov 2026)', false],
    ]);
    expect(links[0]).toMatchObject({ external: true, href: expect.stringContaining('/enroll?token=secret-tok') });
    expect(links[1]).toMatchObject({ href: '/payment/lead-1' });
    expect(links[2]).toMatchObject({ external: true, href: expect.stringContaining('/pay-balance') });
  });

  it('never tells the model the enrolment link token', () => {
    expect(JSON.stringify(planFees(FEES).forModel)).not.toContain('secret-tok');
    expect(JSON.stringify(planStatus({ demo: null, callback: null, application: null, fees: FEES }).forModel)).not.toContain('secret-tok');
  });

  it('does not ask for the balance again while their payment waits for our team', () => {
    const r = planFees({ ...NO_FEES, balance: FEES.balance, pendingClaim: { amount: 13500 } });
    expect(r.card).toMatchObject({ kind: 'links', title: 'Nothing to pay right now', links: [] });
    expect(r.forModel).toMatchObject({ owes_now: 'nothing right now', waiting_for_our_team: expect.stringContaining('₹13,500') });
  });
});

describe('planStatus', () => {
  it('shows the application, demo and callback, each with where to go next', () => {
    const r = planStatus({
      application: { leadId: 'l1', number: 'NERAM-1', status: 'submitted' },
      demo: { ref: 'DEM-9', status: 'approved', when: 'Wed 22 Oct, Evening' },
      callback: { when: '2026-10-21 morning' },
      fees: NO_FEES,
    });
    const card = r.card as Extract<NonNullable<typeof r.card>, { kind: 'links' }>;
    expect(card.lines.map((l) => l.label)).toEqual(['Application', 'Demo class', 'Callback']);
    expect(card.lines[0].value).toBe('NERAM-1: submitted, our team is reviewing it');
    expect(card.links.map((l) => l.label)).toEqual(['View my application', 'Manage my demo class']);
  });

  it('a draft application points back to /apply, and an empty account offers a start', () => {
    const draft = planStatus({ application: { leadId: 'l1', number: null, status: 'draft' }, demo: null, callback: null, fees: NO_FEES });
    expect((draft.card as any).links[0]).toMatchObject({ label: 'Finish my application', href: '/apply' });
    const empty = planStatus({ application: null, demo: null, callback: null, fees: NO_FEES });
    expect((empty.card as any).links.map((l: any) => l.label)).toEqual(['Start my application', 'Book a free demo class']);
  });
});

describe('planTicket / planExamYear', () => {
  it('prepares a ticket only once the problem is described', () => {
    expect(planTicket({ description: 'help' }).card).toBeUndefined();
    expect(planTicket({ category: 'payment_issue', description: 'My payment shows pending since yesterday.' }).card).toEqual({
      kind: 'ticket',
      category: 'payment_issue',
      subject: 'My payment shows pending since yesterday.',
      description: 'My payment shows pending since yesterday.',
    });
    expect((planTicket({ category: 'nope', description: 'The app will not open my notes.' }).card as any).category).toBe('other');
  });

  it('offers the coming exam years, refusing a past one', () => {
    expect(planExamYear({ year: 2027 }, null, NOW).card).toMatchObject({ kind: 'exam-year', year: 2027 });
    expect(planExamYear({ year: 2019 }, null, NOW).card).toBeUndefined();
    expect(planExamYear({}, 2028, NOW).card).toMatchObject({ year: 2028 });
  });
});

describe('the read cards', () => {
  it('saved colleges and notifications', () => {
    expect(planSavedColleges([]).card).toMatchObject({ title: 'No saved colleges yet' });
    expect(planSavedColleges([{ name: 'Papni', city: 'Chennai', href: 'x' }]).card).toMatchObject({ title: 'Your saved colleges (1)' });
    const n = planNotifications([
      { title: 'Class moved', message: 'Maths moved to 7 pm', isRead: false, at: '' },
      { title: 'Welcome', message: 'Hi', isRead: true, at: '' },
    ]);
    expect(n.card).toMatchObject({ title: '1 new notification' });
    expect(n.forModel).toMatchObject({ unread: 1 });
  });

  it('hands a calculation to Ask aiArchitek with the question', () => {
    const r = planOpenAsk({ question: 'Which colleges can I get with 120 in NATA?', tool: 'college_predictor' });
    const links = (r.card as any).links;
    expect(links[0]).toMatchObject({ href: '/ask?q=Which%20colleges%20can%20I%20get%20with%20120%20in%20NATA%3F', primary: true });
    expect(links[1]).toMatchObject({ href: '/tools/counseling/college-predictor' });
  });
});
