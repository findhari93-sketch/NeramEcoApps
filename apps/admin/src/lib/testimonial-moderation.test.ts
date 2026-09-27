import { describe, it, expect } from 'vitest';
import {
  resolveModerationTab,
  resolveSourceFilter,
  apiStatusForTab,
  rowMatchesTab,
  consentSummary,
  actionsForStatus,
  testimonialText,
  ACTION_LABELS,
  API_ACTION,
  MODERATION_TAB_LABELS,
  needsConfirmation,
  publicationLabel,
  actionsForRow,
} from './testimonial-moderation';

describe('tabs and filters', () => {
  it('defaults to the review queue', () => {
    expect(resolveModerationTab(null)).toBe('waiting');
    expect(resolveModerationTab('public')).toBe('public');
    expect(resolveModerationTab('bogus')).toBe('waiting');
  });

  it('reads the source filter', () => {
    expect(resolveSourceFilter('learner')).toBe('learner');
    expect(resolveSourceFilter('staff')).toBe('staff');
    expect(resolveSourceFilter('x')).toBe('all');
  });

  it('asks the API for the right status', () => {
    expect(apiStatusForTab('waiting')).toBe('pending_moderation');
    expect(apiStatusForTab('public')).toBe('published');
    expect(apiStatusForTab('not_public')).toBe('all');
    expect(apiStatusForTab('all')).toBe('all');
  });

  it('puts every non-public status in Not public', () => {
    for (const s of ['private', 'approved', 'rejected', 'withdrawn']) expect(rowMatchesTab(s, 'not_public')).toBe(true);
    expect(rowMatchesTab('published', 'not_public')).toBe(false);
    expect(rowMatchesTab('pending_moderation', 'not_public')).toBe(false);
    expect(rowMatchesTab('pending_moderation', 'waiting')).toBe(true);
    expect(rowMatchesTab('anything', 'all')).toBe(true);
  });
});

describe('consentSummary', () => {
  it('learner who agreed', () => {
    const c = consentSummary({ source: 'learner', consent_given_at: '2026-09-20T10:00:00Z', consent_by: 'self', consent_display_name: 'Priya S.' });
    expect(c.state).toBe('self');
    expect(c.canPublish).toBe(true);
    expect(c.detail).toContain('Priya S.');
    expect(c.detail).toContain('2026');
  });

  it('guardian consent for a minor', () => {
    const c = consentSummary({ source: 'learner', consent_given_at: '2026-09-20T10:00:00Z', consent_by: 'guardian', consent_display_name: 'Arun' });
    expect(c.state).toBe('guardian');
    expect(c.label).toBe('Parent or guardian agreed to publish');
    expect(c.canPublish).toBe(true);
  });

  it('learner without consent can stay private only', () => {
    const c = consentSummary({ source: 'learner', consent_given_at: null, consent_by: null });
    expect(c.state).toBe('none');
    expect(c.canPublish).toBe(false);
    expect(`${c.label}, ${c.detail}`).toBe('No consent to publish, Can stay private only.');
  });

  it('staff entered testimonials can be published', () => {
    const c = consentSummary({ source: 'staff', consent_by: 'staff_recorded', consent_given_at: null });
    expect(c.state).toBe('staff_recorded');
    expect(c.canPublish).toBe(true);
  });

  it('never uses em dashes or double dashes', () => {
    for (const row of [
      { source: 'learner' },
      { source: 'staff' },
      { source: 'learner', consent_given_at: '2026-01-01T00:00:00Z', consent_by: 'self' },
    ]) {
      const c = consentSummary(row);
      expect(`${c.label} ${c.detail}`).not.toMatch(/—|--/);
    }
  });
});

describe('actionsForStatus', () => {
  it('offers the queue actions for a waiting testimonial', () => {
    expect(actionsForStatus('pending_moderation')).toEqual(['approve', 'publish', 'reject']);
  });
  it('only takes down a public one', () => {
    expect(actionsForStatus('published')).toEqual(['withdraw']);
  });
  it('lets a taken-down or rejected one come back', () => {
    expect(actionsForStatus('withdrawn')).toContain('publish');
    expect(actionsForStatus('rejected')).toContain('approve');
  });
  it('offers nothing for an unknown status', () => {
    expect(actionsForStatus(undefined)).toEqual([]);
  });
  it('uses the agreed button words', () => {
    expect(ACTION_LABELS.reject).toBe('Not publish');
    expect(ACTION_LABELS.withdraw).toBe('Take down');
    expect(MODERATION_TAB_LABELS.waiting).toBe('Waiting for review');
  });
});

describe('testimonialText', () => {
  it('reads jsonb content and plain strings', () => {
    expect(testimonialText({ en: 'Great classes' })).toBe('Great classes');
    expect(testimonialText({ ta: 'Nalla' })).toBe('Nalla');
    expect(testimonialText('Plain')).toBe('Plain');
    expect(testimonialText(null)).toBe('');
  });
});

describe('confirming legacy public testimonials', () => {
  const unconfirmed = { publication_status: 'published', moderated_at: null };
  const confirmed = { publication_status: 'published', moderated_at: '2026-09-26T10:00:00Z' };

  it('flags public rows nobody has confirmed', () => {
    expect(needsConfirmation(unconfirmed)).toBe(true);
    expect(needsConfirmation(confirmed)).toBe(false);
    expect(needsConfirmation({ publication_status: 'pending_moderation', moderated_at: null })).toBe(false);
  });

  it('labels them clearly', () => {
    const labels = { published: 'Public', pending_moderation: 'Waiting for review' };
    expect(publicationLabel(unconfirmed, labels)).toBe('Public, not yet confirmed');
    expect(publicationLabel(confirmed, labels)).toBe('Public');
    expect(publicationLabel({ publication_status: 'pending_moderation' }, labels)).toBe('Waiting for review');
  });

  it('offers Confirm as genuine, which re-publishes', () => {
    expect(actionsForRow(unconfirmed)).toEqual(['confirm', 'withdraw']);
    expect(actionsForRow(confirmed)).toEqual(['withdraw']);
    expect(ACTION_LABELS.confirm).toBe('Confirm as genuine');
    expect(API_ACTION.confirm).toBe('publish');
  });

  it('has a Needs confirmation tab that reads published rows', () => {
    expect(resolveModerationTab('confirm')).toBe('confirm');
    expect(apiStatusForTab('confirm')).toBe('published');
    expect(rowMatchesTab('published', 'confirm', null)).toBe(true);
    expect(rowMatchesTab('published', 'confirm', '2026-09-26T10:00:00Z')).toBe(false);
    expect(rowMatchesTab('published', 'public', null)).toBe(true);
  });
});
