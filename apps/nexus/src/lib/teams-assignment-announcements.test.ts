import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  buildAssignmentPublishedHtml,
  buildAssignmentLinkedHtml,
  announceAssignmentToTeams,
  canPostToGraph,
  shouldAnnounceLink,
  type AssignmentCard,
} from './teams-assignment-announcements';

/**
 * These cards are the only thing most students ever read about an assignment,
 * so the failures worth guarding are the silent ones: Teams accepts malformed
 * HTML and renders its best guess, and an unparseable date turns into
 * "Invalid Date" on a card nobody can edit after it is posted.
 */

const CARD: AssignmentCard = {
  title: 'Two-point perspective',
  assignmentType: 'drawing',
  dueAt: '2026-09-10T23:59:59+05:30',
  evaluationType: 'stars',
  maxMarks: 5,
  instructions: 'Draw a cube composition with two vanishing points.',
  assignmentUrl: 'https://nexus.neramclasses.com/student/assignments/a-1',
};

function makeSupabase(
  classroom: {
    ms_team_id: string | null;
    ms_group_chat_id: string | null;
    ms_assignment_channel_id: string | null;
  } | null,
) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: classroom }),
        }),
      }),
    }),
  } as any;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('buildAssignmentPublishedHtml', () => {
  it('carries the title, the deadline and the student link', () => {
    const html = buildAssignmentPublishedHtml(CARD);
    expect(html).toContain('Two-point perspective');
    expect(html).toContain('10 Sep');
    expect(html).toContain('https://nexus.neramclasses.com/student/assignments/a-1');
    expect(html).toContain('Please complete it');
  });

  it('uses the drawing icon for a drawing and the document icon otherwise', () => {
    expect(buildAssignmentPublishedHtml(CARD)).toContain('🎨');
    expect(buildAssignmentPublishedHtml({ ...CARD, assignmentType: 'document' })).toContain('📝');
  });

  it('names the class when the assignment is attached to one', () => {
    const html = buildAssignmentPublishedHtml({
      ...CARD,
      className: 'Perspective Drawing',
      classDate: '2026-09-08',
    });
    expect(html).toContain('Perspective Drawing');
    expect(html).toContain('8 Sep');
  });

  it('omits the class line entirely for a standalone assignment', () => {
    expect(buildAssignmentPublishedHtml(CARD)).not.toContain('<strong>From:</strong>');
  });

  it('escapes a title carrying markup instead of interpolating it raw', () => {
    const html = buildAssignmentPublishedHtml({
      ...CARD,
      title: 'Angles < 90 & > 45 <script>alert(1)</script>',
    });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&amp;');
  });

  it('escapes a quote in the URL so it cannot break out of the href attribute', () => {
    const html = buildAssignmentPublishedHtml({
      ...CARD,
      assignmentUrl: 'https://x.test/a" onclick="steal()',
    });
    expect(html).toContain('&quot;');
    expect(html).not.toContain('onclick="steal()"');
  });

  it('says there is no deadline rather than rendering Invalid Date', () => {
    expect(buildAssignmentPublishedHtml({ ...CARD, dueAt: null })).toContain('No deadline set.');
    expect(buildAssignmentPublishedHtml({ ...CARD, dueAt: 'not-a-date' })).toContain(
      'No deadline set.',
    );
    expect(buildAssignmentPublishedHtml({ ...CARD, dueAt: 'not-a-date' })).not.toContain(
      'Invalid Date',
    );
  });

  it('renders the deadline in IST, not the server timezone', () => {
    // 23:59 IST on the 10th is 18:29 UTC on the 10th. A card formatted in UTC
    // would still say 10 Sep here, so pick an instant that actually differs:
    // 00:30 IST on the 11th is 19:00 UTC on the 10th.
    const html = buildAssignmentPublishedHtml({ ...CARD, dueAt: '2026-09-10T19:00:00Z' });
    expect(html).toContain('11 Sep');
  });

  it('clips a long brief instead of pasting an essay into the chat', () => {
    const html = buildAssignmentPublishedHtml({ ...CARD, instructions: 'x'.repeat(400) });
    expect(html).toContain('...');
    expect(html.length).toBeLessThan(700);
  });

  it('flattens a multi-line brief, which Teams would otherwise run together', () => {
    const html = buildAssignmentPublishedHtml({ ...CARD, instructions: 'One.\n\nTwo.' });
    expect(html).toContain('One. Two.');
  });

  it('shows the marks total for a marks assignment and stars for a stars one', () => {
    expect(
      buildAssignmentPublishedHtml({ ...CARD, evaluationType: 'marks', maxMarks: 20 }),
    ).toContain('Marked out of 20.');
    expect(buildAssignmentPublishedHtml(CARD)).toContain('Graded 1 to 5 stars.');
  });
});

describe('buildAssignmentLinkedHtml', () => {
  it('leads with the class, because that is the only new information', () => {
    const html = buildAssignmentLinkedHtml({
      ...CARD,
      className: 'Perspective Drawing',
      classDate: '2026-09-08',
    });
    expect(html).toContain('is now part of Perspective Drawing');
    expect(html).toContain('8 Sep');
  });

  it('falls back to a generic phrase rather than printing null', () => {
    const html = buildAssignmentLinkedHtml({ ...CARD, className: null });
    expect(html).toContain('is now part of your class');
    expect(html).not.toContain('null');
  });
});

describe('announceAssignmentToTeams', () => {
  it('posts to the assignment channel and the group chat when both are set', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ id: 'posted' }),
    }) as unknown as Response);
    vi.stubGlobal('fetch', fetchMock);

    const result = await announceAssignmentToTeams(
      'token',
      makeSupabase({
        ms_team_id: 'team-1',
        ms_group_chat_id: 'chat-1',
        ms_assignment_channel_id: 'chan-assign',
      }),
      'room-1',
      '<h3>hi</h3>',
    );

    expect(result).toEqual({
      channelId: 'chan-assign',
      channelMessageId: 'posted',
      chatMessageId: 'posted',
    });
    const urls = fetchMock.mock.calls.map((c: any[]) => String(c[0]));
    expect(urls.some((u) => u.includes('/channels/chan-assign/messages'))).toBe(true);
    expect(urls.some((u) => u.includes('/chats/chat-1/messages'))).toBe(true);
  });

  it('never falls back to the meeting channel when no assignment channel is set', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ id: 'posted' }),
    }) as unknown as Response);
    vi.stubGlobal('fetch', fetchMock);

    const result = await announceAssignmentToTeams(
      'token',
      makeSupabase({
        ms_team_id: 'team-1',
        ms_group_chat_id: 'chat-1',
        ms_assignment_channel_id: null,
      }),
      'room-1',
      '<h3>hi</h3>',
    );

    expect(result?.channelId).toBeNull();
    expect(result?.channelMessageId).toBeNull();
    expect(result?.chatMessageId).toBe('posted');
    // The whole point of decision 2: assignment cards must not reach a channel
    // the teacher did not nominate.
    const urls = fetchMock.mock.calls.map((c: any[]) => String(c[0]));
    expect(urls.every((u) => !u.includes('/channels/'))).toBe(true);
  });

  it('returns null when the classroom has neither a channel nor a group chat', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await announceAssignmentToTeams(
      'token',
      makeSupabase({ ms_team_id: null, ms_group_chat_id: null, ms_assignment_channel_id: null }),
      'room-1',
      '<h3>hi</h3>',
    );

    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns null for a classroom that does not exist', async () => {
    const result = await announceAssignmentToTeams(
      'token',
      makeSupabase(null),
      'room-1',
      '<h3>hi</h3>',
    );
    expect(result).toBeNull();
  });

  it('reports a Graph failure as a null message id rather than throwing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 403, text: async () => 'Forbidden' }) as unknown as Response),
    );

    const result = await announceAssignmentToTeams(
      'token',
      makeSupabase({
        ms_team_id: 'team-1',
        ms_group_chat_id: 'chat-1',
        ms_assignment_channel_id: 'chan-assign',
      }),
      'room-1',
      '<h3>hi</h3>',
    );

    expect(result).toEqual({
      channelId: 'chan-assign',
      channelMessageId: null,
      chatMessageId: null,
    });
  });
});

describe('canPostToGraph', () => {
  it('accepts a real Microsoft bearer', () => {
    expect(canPostToGraph('eyJhbGciOiJSUzI1NiIs')).toBe(true);
  });

  it('rejects the tokens Nexus mints itself, which Graph would 401', () => {
    expect(canPostToGraph('imp_abc')).toBe(false);
    expect(canPostToGraph('par_abc')).toBe(false);
    expect(canPostToGraph('test_abc')).toBe(false);
    expect(canPostToGraph(null)).toBe(false);
    expect(canPostToGraph('')).toBe(false);
  });
});

describe('shouldAnnounceLink', () => {
  const CLASS = 'class-1';

  it('announces when a published standalone assignment is attached to a class', () => {
    expect(
      shouldAnnounceLink({ status: 'published', teams_announced_class_id: null }, CLASS),
    ).toBe(true);
  });

  it('stays silent for a draft, which is what holds the timetable path to one message', () => {
    // Creating from inside a class links the assignment while it is still a
    // draft. If this returned true, that path would post here AND again at
    // publish: the exact double message the feature was asked to avoid.
    expect(shouldAnnounceLink({ status: 'draft', teams_announced_class_id: null }, CLASS)).toBe(
      false,
    );
  });

  it('stays silent for a closed assignment', () => {
    expect(shouldAnnounceLink({ status: 'closed', teams_announced_class_id: null }, CLASS)).toBe(
      false,
    );
  });

  it('stays silent when relinking to the class it was already announced against', () => {
    expect(
      shouldAnnounceLink({ status: 'published', teams_announced_class_id: CLASS }, CLASS),
    ).toBe(false);
  });

  it('announces when the assignment moves to a different class', () => {
    expect(
      shouldAnnounceLink({ status: 'published', teams_announced_class_id: 'class-other' }, CLASS),
    ).toBe(true);
  });
});
