import { describe, it, expect } from 'vitest';
import {
  USER360_TABS,
  resolveUser360Tab,
  resolveBackTarget,
  buildTabQuery,
  timelineKindMeta,
  timelineTitle,
  timelineDetailLine,
  sourceAppLabel,
  relativeTime,
  lastActiveText,
  nexusAccessText,
  isOverdue,
  suggestionLabel,
  SECTION_TO_TAB,
  normalizePerson,
} from './user360-view';

const NOW = new Date('2026-09-26T12:00:00Z');

describe('resolveUser360Tab', () => {
  it('uses a valid ?tab=', () => {
    expect(resolveUser360Tab('activity')).toBe('activity');
    expect(resolveUser360Tab('audit', 'callbacks')).toBe('audit');
  });

  it('falls back to the legacy ?section= deep link', () => {
    expect(resolveUser360Tab(null, 'callbacks')).toBe('crm');
    expect(resolveUser360Tab(null, 'payment')).toBe('journey');
    expect(resolveUser360Tab('bogus', 'credentials')).toBe('access');
  });

  it('defaults to Overview', () => {
    expect(resolveUser360Tab(null, null)).toBe('overview');
    expect(resolveUser360Tab('nope', 'nope')).toBe('overview');
  });

  it('maps every legacy section to a real tab', () => {
    for (const tab of Object.values(SECTION_TO_TAB)) {
      expect(USER360_TABS).toContain(tab);
    }
  });

  it('covers every section the notification bell links to', () => {
    for (const s of ['application', 'payment', 'refund', 'scholarship', 'callbacks']) {
      expect(SECTION_TO_TAB[s]).toBeDefined();
    }
  });
});

describe('back target and tab query', () => {
  it('returns to the list the user came from', () => {
    expect(resolveBackTarget('leads')).toEqual({ href: '/leads', label: 'Back to Leads' });
    expect(resolveBackTarget('duplicates').href).toBe('/duplicates');
  });

  it('defaults to the Users list for unknown or missing origins', () => {
    expect(resolveBackTarget(null).href).toBe('/crm');
    expect(resolveBackTarget('https://evil.example').href).toBe('/crm');
  });

  it('keeps a known from and drops an unknown one', () => {
    expect(buildTabQuery('crm', 'leads')).toBe('?tab=crm&from=leads');
    expect(buildTabQuery('crm', 'evil')).toBe('?tab=crm');
    expect(buildTabQuery('overview', null)).toBe('?tab=overview');
  });
});

describe('timeline mapping', () => {
  it('gives every kind the RPC emits a label', () => {
    const kinds = ['event', 'sign_in', 'payment', 'demo', 'change', 'note', 'call', 'message', 'enrollment', 'classification', 'feedback', 'merge', 'account'];
    for (const k of kinds) {
      const meta = timelineKindMeta(k);
      expect(meta.label).not.toBe('Other');
      expect(meta.label.length).toBeGreaterThan(0);
    }
  });

  it('falls back for unknown kinds', () => {
    expect(timelineKindMeta('mystery')).toEqual({ label: 'Other', tone: 'neutral' });
    expect(timelineKindMeta(null).label).toBe('Other');
  });

  it('marks failed payments as errors and refunds as warnings', () => {
    expect(timelineKindMeta('payment', 'Paid').tone).toBe('success');
    expect(timelineKindMeta('payment', 'Payment failed').tone).toBe('error');
    expect(timelineKindMeta('payment', 'Refunded').tone).toBe('warning');
  });

  it('turns funnel event names into sentences but leaves other titles alone', () => {
    expect(timelineTitle('event', 'application_submitted')).toBe('Application submitted');
    expect(timelineTitle('event', 'tool.cutoff_calculator_used')).toBe('Tool cutoff calculator used');
    expect(timelineTitle('note', 'Staff note')).toBe('Staff note');
    expect(timelineTitle('call', '')).toBe('Call');
  });

  it('writes a detail line per kind', () => {
    expect(timelineDetailLine('payment', { amount: 25000, method: 'upi', receipt: 'R-1' })).toBe('₹25,000 · Upi · Receipt R-1');
    expect(timelineDetailLine('change', { field: 'city', from: 'Chennai', to: 'Madurai' })).toBe('Chennai to Madurai');
    expect(timelineDetailLine('change', { from: null, to: { value: true } })).toBe('empty to true');
    expect(timelineDetailLine('note', { note: 'Called, will pay Friday' })).toBe('Called, will pay Friday');
    expect(timelineDetailLine('enrollment', { classroom: 'NATA 2027', reason: 'fee_default' })).toBe('NATA 2027 · Fee default');
    expect(timelineDetailLine('sign_in', { outcome: 'success' })).toBeNull();
    expect(timelineDetailLine('event', { status: 'failed', error: 'E42' })).toBe('Failed · Error E42');
    expect(timelineDetailLine('call', {})).toBeNull();
    expect(timelineDetailLine('payment', null)).toBeNull();
  });

  it('never produces an em dash or double dash in user-visible text', () => {
    const line = timelineDetailLine('merge', { merged_name: 'A', merged_email: 'a@b.c' }) || '';
    expect(line).not.toMatch(/—|--/);
  });

  it('labels source apps', () => {
    expect(sourceAppLabel('marketing')).toBe('Website');
    expect(sourceAppLabel('nexus')).toBe('Nexus');
    expect(sourceAppLabel('some_new_app')).toBe('Some new app');
    expect(sourceAppLabel(null)).toBeNull();
  });
});

describe('dates', () => {
  it('reads relative times', () => {
    expect(relativeTime('2026-09-26T11:59:40Z', NOW)).toBe('just now');
    expect(relativeTime('2026-09-26T11:30:00Z', NOW)).toBe('30 min ago');
    expect(relativeTime('2026-09-26T07:00:00Z', NOW)).toBe('5 h ago');
    expect(relativeTime('2026-09-25T10:00:00Z', NOW)).toBe('yesterday');
    expect(relativeTime('2026-09-16T12:00:00Z', NOW)).toBe('10 days ago');
    expect(relativeTime('2026-06-26T12:00:00Z', NOW)).toBe('3 months ago');
    expect(relativeTime('2024-09-01T12:00:00Z', NOW)).toBe('2 years ago');
    expect(relativeTime('2026-09-28T12:00:00Z', NOW)).toBe('in 2 days');
    expect(relativeTime(null, NOW)).toBeNull();
    expect(relativeTime('not a date', NOW)).toBeNull();
  });

  it('writes last active with the source', () => {
    const labels = { nexus_sign_in: 'Opened Nexus' };
    expect(lastActiveText('2026-09-23T12:00:00Z', 'nexus_sign_in', labels, NOW)).toBe('3 days ago, Opened Nexus');
    expect(lastActiveText('2026-09-23T12:00:00Z', 'brand_new', labels, NOW)).toBe('3 days ago, Brand new');
    expect(lastActiveText('2026-09-23T12:00:00Z', null, labels, NOW)).toBe('3 days ago');
    expect(lastActiveText(null, 'nexus_sign_in', labels, NOW)).toBe('No recorded activity');
  });

  it('flags overdue follow-ups', () => {
    expect(isOverdue('2026-09-25T12:00:00Z', NOW)).toBe(true);
    expect(isOverdue('2026-09-27T12:00:00Z', NOW)).toBe(false);
    expect(isOverdue(null, NOW)).toBe(false);
  });
});

describe('access and suggestions', () => {
  it('explains each Nexus access state', () => {
    expect(nexusAccessText('not_started').label).toBe('Not started');
    expect(nexusAccessText('enrolled').tone).toBe('success');
    expect(nexusAccessText(undefined).label).toBe('No Nexus access');
  });

  it('labels suggestions', () => {
    expect(suggestionLabel('archive_lead')).toBe('Archive this lead');
    expect(suggestionLabel('new_rule')).toBe('New rule');
    expect(suggestionLabel(null)).toBe('Suggestion');
  });
});

describe('normalizePerson', () => {
  it('keeps a lifecycle row', () => {
    expect(normalizePerson({ id: 'a', lifecycle_stage: 'lead' }, { id: 'a', name: 'X' }, 'a')).toEqual({ id: 'a', lifecycle_stage: 'lead' });
  });
  it('falls back to the users row when the 360 person is an empty array (staff)', () => {
    expect(normalizePerson([], { id: 'b', name: 'Staff', user_type: 'admin' }, 'b')).toEqual({ id: 'b', name: 'Staff', user_type: 'admin' });
  });
  it('always has an id', () => {
    expect(normalizePerson(null, null, 'c')).toEqual({ id: 'c' });
  });
});

describe('JSON encoded history values', () => {
  it('unwraps quoted strings and booleans', () => {
    expect(timelineDetailLine('change', { from: '"malayalam"', to: '"tamil"' })).toBe('malayalam to tamil');
    expect(timelineDetailLine('change', { from: 'false', to: '{"value":true}' })).toBe('false to true');
    expect(timelineDetailLine('change', { from: '"x"' })).toBe('x to empty');
  });
});
