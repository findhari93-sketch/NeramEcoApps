import { describe, expect, it } from 'vitest';
import {
  buildCorrectionReport,
  correctionRowErrors,
  installmentChip,
  newCorrectionRow,
  planLabel,
  shortIstDate,
  statusBanner,
  type RecordCheckPage,
} from './check-details-view';

const TODAY = '2026-10-16';
// 10:00 IST on 16 Oct 2026.
const NOW = new Date('2026-10-16T04:30:00Z');
const DASHES = /—|–|--/;

const page = (status: string, extra: Partial<RecordCheckPage> = {}): RecordCheckPage => ({
  check: { id: 'c1', status, sentAt: null, openedAt: null, confirmedAt: '2026-10-16T05:00:00Z' },
  fees: null,
  ...extra,
});

describe('copy', () => {
  it('names the plan in words', () => {
    expect(planLabel('full')).toBe('Paid in full');
    expect(planLabel('installment')).toBe('Two installments');
    expect(planLabel(null)).toBe('Not set yet');
  });

  it('dates a confirmation in India, without the year', () => {
    expect(shortIstDate('2026-10-15T20:00:00Z')).toBe('16 Oct');
    expect(shortIstDate(null)).toBe('');
  });

  it('says where the check has got to', () => {
    expect(statusBanner(page('confirmed'))?.text).toBe('Thanks, you confirmed on 16 Oct.');
    expect(statusBanner(page('correction_reported'))?.text).toBe(
      'Sent to the office. We will tell you when it is checked.',
    );
    expect(statusBanner(page('changed'))?.text).toBe('The office updated your fees. Please check them again.');
    expect(statusBanner(page('sent'))).toBeNull();
    expect(statusBanner({ check: null, fees: null })).toBeNull();
  });

  it('explains a rejected report with the office note', () => {
    const fees = { lastAnswer: { status: 'rejected', note: 'No payment on 3 Oct.', at: null }, openReport: null } as any;
    const banner = statusBanner(page('sent', { fees }));
    expect(banner?.text).toBe(
      'The office checked what you reported and kept your fees as they are. Their note: "No payment on 3 Oct."',
    );
    expect(banner?.text).not.toMatch(DASHES);
  });
});

describe('installmentChip', () => {
  const inst = (dueDate: string, settled = false, waived = false) => ({ dueDate, settled, waived });
  it('labels every state in words', () => {
    expect(installmentChip(inst('2026-10-01', true), NOW)).toEqual({ label: 'Paid', tone: 'success' });
    expect(installmentChip(inst('2026-10-16'), NOW)).toEqual({ label: 'Due today', tone: 'warning' });
    expect(installmentChip(inst('2026-10-17'), NOW).label).toBe('Due in 1 day');
    expect(installmentChip(inst('2026-10-19'), NOW).label).toBe('Due in 3 days');
    expect(installmentChip(inst('2026-11-20'), NOW)).toEqual({ label: 'Not paid yet', tone: 'info' });
    expect(installmentChip(inst('2026-10-10'), NOW)).toEqual({ label: 'Overdue', tone: 'error' });
    expect(installmentChip(inst('2026-10-10', false, true), NOW).label).toBe('Not needed');
  });
});

describe('the Something is wrong form', () => {
  it('shows no errors on an untouched row and specific ones on a half-filled row', () => {
    expect(correctionRowErrors(newCorrectionRow('a'), TODAY)).toEqual({});
    expect(correctionRowErrors({ key: 'a', amount: '5000', paidOn: '', method: 'cash' }, TODAY)).toEqual({
      paidOn: 'Choose the day you paid.',
    });
    expect(correctionRowErrors({ key: 'a', amount: '0', paidOn: '2026-10-01', method: 'cash' }, TODAY)).toEqual({
      amount: 'Enter the amount you paid.',
    });
    expect(correctionRowErrors({ key: 'a', amount: '10', paidOn: '2026-10-20', method: 'cash' }, TODAY)).toEqual({
      paidOn: 'This date is in the future.',
    });
  });

  it('needs a note', () => {
    expect(buildCorrectionReport({ rows: [], reference: '', note: '  ' }, TODAY)).toEqual({
      ok: false,
      error: 'Tell us what is wrong.',
    });
  });

  it('drops blank rows and puts the reference on the first payment', () => {
    const result = buildCorrectionReport(
      {
        rows: [
          { key: 'a', amount: '15,000', paidOn: '2026-10-02', method: 'upi_direct' },
          newCorrectionRow('b'),
          { key: 'c', amount: '5000', paidOn: '2026-10-05', method: 'cash' },
        ],
        reference: 'UPI 4421',
        note: 'I paid twice, not once.',
      },
      TODAY,
    );
    expect(result).toEqual({
      ok: true,
      body: {
        items: [
          { amount: 15000, paidOn: '2026-10-02', method: 'upi_direct', reference: 'UPI 4421' },
          { amount: 5000, paidOn: '2026-10-05', method: 'cash', reference: null },
        ],
        note: 'I paid twice, not once.',
      },
    });
  });

  it('keeps a reference given without a payment row in the note', () => {
    const result = buildCorrectionReport({ rows: [], reference: 'Receipt 12', note: 'Discount is missing.' }, TODAY);
    expect(result).toEqual({ ok: true, body: { items: [], note: 'Discount is missing. (Reference: Receipt 12)' } });
  });

  it('refuses a half-filled payment row', () => {
    const result = buildCorrectionReport(
      { rows: [{ key: 'a', amount: '5000', paidOn: '', method: 'cash' }], reference: '', note: 'x' },
      TODAY,
    );
    expect(result.ok).toBe(false);
  });
});
