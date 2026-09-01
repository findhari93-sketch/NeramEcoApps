import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  formatShareDue,
  formatShareGrading,
  renderAssignmentShareText,
  splitPending,
  MAX_NAMED,
  type AssignmentSharePayload,
  type SharePendingStudent,
} from './assignment-share-model';
import { renderAssignmentShareHtml } from './assignment-share-html';

function student(n: number, oid: string | null = `oid-${n}`): SharePendingStudent {
  return { id: `id-${n}`, name: `Student ${n}`, oid };
}

function payload(over: Partial<AssignmentSharePayload> = {}): AssignmentSharePayload {
  return {
    assignmentId: '126332cf-abec-44ca-97b1-e72cae0f5297',
    title: 'Cube composition with different vanishing points',
    assignmentType: 'drawing',
    // Deliberately far in the future so the "overdue" branch does not fire in
    // tests that are not about it.
    dueAt: '2099-09-05T23:59:59+05:30',
    evaluationType: 'stars',
    maxMarks: null,
    shareUrl: 'https://nexus.neramclasses.com/a/8f3c2a',
    pending: [student(1), student(2)],
    submittedCount: 5,
    totalCount: 7,
    ...over,
  };
}

const WITH_NAMES = { includeNames: true };
const NO_NAMES = { includeNames: false };

afterEach(() => {
  vi.useRealTimers();
});

describe('formatShareDue', () => {
  // The bug this guards: due_at is an instant with an IST offset, so a server
  // in UTC formatting it locally shows the PREVIOUS day.
  it('formats in IST regardless of the runtime zone', () => {
    const out = formatShareDue('2026-09-05T23:59:59+05:30');
    expect(out).toContain('5 Sep');
    expect(out).toContain('11:59 PM IST');
  });

  it('upper-cases the meridiem, because en-IN lower-cases it', () => {
    expect(formatShareDue('2026-09-05T09:30:00+05:30')).toContain('9:30 AM');
    expect(formatShareDue('2026-09-05T09:30:00+05:30')).not.toContain('am');
  });

  it('returns null for no deadline and for an unparseable one', () => {
    expect(formatShareDue(null)).toBeNull();
    expect(formatShareDue('not a date')).toBeNull();
  });
});

describe('formatShareGrading', () => {
  it('describes stars and marks', () => {
    expect(formatShareGrading('stars', null)).toBe('Graded 1 to 5 stars');
    expect(formatShareGrading('marks', 20)).toBe('Marked out of 20');
  });

  it('says nothing when marks are configured but no maximum is set', () => {
    expect(formatShareGrading('marks', null)).toBeNull();
    expect(formatShareGrading('marks', 0)).toBeNull();
  });
});

describe('splitPending', () => {
  it('names everyone under the cap', () => {
    const { named, extra } = splitPending([student(1), student(2)]);
    expect(named).toHaveLength(2);
    expect(extra).toBe(0);
  });

  it('caps the list and counts the remainder', () => {
    const many = Array.from({ length: MAX_NAMED + 5 }, (_, i) => student(i));
    const { named, extra } = splitPending(many);
    expect(named).toHaveLength(MAX_NAMED);
    expect(extra).toBe(5);
  });
});

describe('renderAssignmentShareText', () => {
  it('leads with the title, the deadline and the grading', () => {
    const text = renderAssignmentShareText(payload(), WITH_NAMES);
    expect(text).toContain('Cube composition with different vanishing points');
    expect(text).toContain('Due: ');
    expect(text).toContain('Graded 1 to 5 stars');
  });

  it('names the students who have not submitted, with the count', () => {
    const text = renderAssignmentShareText(payload(), WITH_NAMES);
    expect(text).toContain('Still to submit (2): Student 1, Student 2');
  });

  it('omits the whole block when names are switched off', () => {
    const text = renderAssignmentShareText(payload(), NO_NAMES);
    expect(text).not.toContain('Still to submit');
    expect(text).not.toContain('Student 1');
  });

  // A heading over an empty list is what makes a class stop trusting these.
  it('omits the block entirely when everybody has submitted', () => {
    const text = renderAssignmentShareText(payload({ pending: [] }), WITH_NAMES);
    expect(text).not.toContain('Still to submit');
    expect(text).toContain('Open it here:');
  });

  it('carries the link as a bare URL, which every chat app linkifies', () => {
    const text = renderAssignmentShareText(payload(), WITH_NAMES);
    expect(text).toContain('Open it here: https://nexus.neramclasses.com/a/8f3c2a');
  });

  it('counts the remainder past the cap rather than listing thirty-five names', () => {
    const many = Array.from({ length: MAX_NAMED + 5 }, (_, i) => student(i));
    const text = renderAssignmentShareText(payload({ pending: many }), WITH_NAMES);
    expect(text).toContain(`Still to submit (${MAX_NAMED + 5})`);
    expect(text).toContain('and 5 more');
  });

  it('drops a non-http link rather than pasting something unclickable', () => {
    const text = renderAssignmentShareText(
      payload({ shareUrl: 'javascript:alert(1)' }),
      WITH_NAMES,
    );
    expect(text).not.toContain('javascript:');
    expect(text).not.toContain('Open it here');
  });

  it('changes the closing line once the deadline has passed', () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.parse('2026-09-10T00:00:00+05:30'));
    const text = renderAssignmentShareText(
      payload({ dueAt: '2026-09-05T23:59:59+05:30' }),
      WITH_NAMES,
    );
    expect(text).toContain('past its deadline');
    expect(text).not.toContain('before the deadline');
  });
});

describe('renderAssignmentShareHtml', () => {
  it('carries the SAME url as the text, so the two cannot drift', () => {
    const p = payload();
    const text = renderAssignmentShareText(p, WITH_NAMES);
    const { html } = renderAssignmentShareHtml(p, WITH_NAMES);
    expect(text).toContain(p.shareUrl);
    expect(html).toContain(`href="${p.shareUrl}"`);
  });

  // Graph rejects the entire message if an <at id> has no matching entry.
  it('emits one mentions entry for every <at> tag, with matching ids', () => {
    const { html, mentions } = renderAssignmentShareHtml(payload(), WITH_NAMES);
    const ids = [...html.matchAll(/<at id="(\d+)">/g)].map((m) => Number(m[1]));
    expect(ids).toEqual([0, 1]);
    expect(mentions).toHaveLength(2);
    ids.forEach((id) => {
      expect(mentions.some((m) => (m as { id: number }).id === id)).toBe(true);
    });
  });

  it('addresses each mention to the student aad object id', () => {
    const { mentions } = renderAssignmentShareHtml(payload(), WITH_NAMES);
    const first = mentions[0] as { mentioned: { user: { id: string } } };
    expect(first.mentioned.user.id).toBe('oid-1');
  });

  // Dropping them would silently shorten a list the teacher expects to be whole.
  it('renders a student with no Microsoft account as bold text, not a mention', () => {
    const p = payload({ pending: [student(1), student(2, null)] });
    const { html, mentions } = renderAssignmentShareHtml(p, WITH_NAMES);
    expect(mentions).toHaveLength(1);
    expect(html).toContain('<b>Student 2</b>');
    expect(html).toContain('Still to submit (2)');
  });

  it('mentions nobody when names are switched off', () => {
    const { html, mentions } = renderAssignmentShareHtml(payload(), NO_NAMES);
    expect(mentions).toEqual([]);
    expect(html).not.toContain('<at ');
    expect(html).not.toContain('Still to submit');
  });

  it('mentions nobody when everybody has submitted', () => {
    const { html, mentions } = renderAssignmentShareHtml(payload({ pending: [] }), WITH_NAMES);
    expect(mentions).toEqual([]);
    expect(html).not.toContain('Still to submit');
  });

  it('caps the mentions and counts the rest', () => {
    const many = Array.from({ length: MAX_NAMED + 5 }, (_, i) => student(i));
    const { html, mentions } = renderAssignmentShareHtml(payload({ pending: many }), WITH_NAMES);
    expect(mentions).toHaveLength(MAX_NAMED);
    expect(html).toContain('and 5 more');
  });

  // The real bug this class of escaping fixed: a title with an ampersand or an
  // angle bracket produced a card Teams rendered as garbage, silently.
  it('escapes a title carrying markup characters', () => {
    const { html } = renderAssignmentShareHtml(
      payload({ title: 'Angles < 90 & > 45 "sharp"' }),
      WITH_NAMES,
    );
    expect(html).toContain('&lt; 90 &amp; &gt; 45 &quot;sharp&quot;');
    expect(html).not.toContain('< 90 &');
  });

  it('drops a non-http link rather than emitting a live javascript href', () => {
    const { html } = renderAssignmentShareHtml(
      payload({ shareUrl: 'javascript:alert(1)' }),
      WITH_NAMES,
    );
    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('<a href');
  });
});
