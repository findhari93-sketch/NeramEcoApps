import { describe, it, expect } from 'vitest';
import { intentsOf, intentsOfMany, isHot } from './intents';
import { inReviewQueue, isCreditsError, turnStatus, worstStatus } from './status';
import { leadStage } from './stage';
import { buildConversations, buildPeople, dayBucket, guestTag, initialsOf, istDay } from './build';
import { buildInsights, normalizeQuestion } from './insights';
import { parseAnswer, plainInline, sourceLabel } from './answer';
import type { InboxRow, InboxUser, Nudge } from './types';

const NOW = new Date('2026-10-15T16:30:00Z'); // 10 pm IST, 15 Oct

function row(p: Partial<InboxRow> & { id: string; session_id: string; created_at: string }): InboxRow {
  return {
    user_id: null,
    user_message: 'Hello',
    source: 'general_chatbot',
    page_url: '/',
    lead_name: null,
    lead_phone: null,
    error: null,
    thumbs_up: null,
    has_correction: false,
    promoted_to_kb: false,
    ai_verdict: null,
    geo_city: null,
    geo_state: null,
    geo_country: null,
    anonymous_id: null,
    device: null,
    channel: null,
    ...p,
  };
}

const user = (p: Partial<InboxUser> & { id: string }): InboxUser => ({
  name: null,
  phone: null,
  email: null,
  avatarUrl: null,
  joinedAt: null,
  firstChannel: null,
  profileLabel: null,
  enrolled: false,
  demoBooked: false,
  applied: false,
  ...p,
});

describe('intents', () => {
  it('reads fees, timings and demo questions', () => {
    expect(intentsOf('What are the course fees?')).toEqual(['fees']);
    expect(intentsOf('What are the class timings?')).toEqual(['timings']);
    expect(intentsOf('I booked a demo class today at 6pm. Where do I join?')).toContain('demo');
  });

  it('understands transliterated Tamil and Hindi', () => {
    expect(intentsOf('fees evlo?')).toContain('fees');
    expect(intentsOf('course ka fees kitna hai')).toContain('fees');
  });

  it('spots abroad, centres and exam dates', () => {
    expect(intentsOf('Can I take online classes from Dubai?')).toEqual(expect.arrayContaining(['abroad', 'online']));
    expect(intentsOf('Do you have weekend batches in Kochi? Which centre?')).toEqual(
      expect.arrayContaining(['timings', 'centres'])
    );
    expect(intentsOf('Is the NATA 2027 exam date announced?')).toContain('exam_dates');
  });

  it('does not call "do you offer online" a scholarship question', () => {
    expect(intentsOf('Do you offer online classes?')).not.toContain('scholarship');
  });

  it('orders a conversation by how often each intent comes up', () => {
    expect(intentsOfMany(['fees?', 'fee for 2 year', 'timings'])).toEqual(['fees', 'timings']);
    expect(isHot(['syllabus'])).toBe(false);
    expect(isHot(['syllabus', 'fees'])).toBe(true);
  });
});

describe('status', () => {
  const base = { error: null, thumbs_up: null, has_correction: false, ai_verdict: null } as const;
  it('ranks a correction above everything', () => {
    expect(turnStatus({ ...base, error: 'CREDITS_DEPLETED', has_correction: true })).toBe('corrected');
  });
  it('marks failures, thumbs and AI verdicts', () => {
    expect(turnStatus({ ...base, error: 'CREDITS_DEPLETED' })).toBe('error');
    expect(turnStatus({ ...base, thumbs_up: false })).toBe('review');
    expect(turnStatus({ ...base, thumbs_up: true, ai_verdict: 'wrong' })).toBe('ok');
    expect(turnStatus({ ...base, ai_verdict: 'needs_fix' })).toBe('review');
    expect(turnStatus({ ...base, ai_verdict: 'uncertain' })).toBe('none');
  });
  it('a conversation shows its worst turn', () => {
    expect(worstStatus(['ok', 'none', 'corrected'])).toBe('none');
    expect(worstStatus(['ok', 'error', 'review'])).toBe('error');
    expect(worstStatus([])).toBe('none');
    expect(inReviewQueue('error')).toBe(true);
    expect(inReviewQueue('none')).toBe(false);
  });
  it('knows every logged form of credits running out', () => {
    expect(isCreditsError('Gemini API error: 402 payment required')).toBe(true);
    expect(isCreditsError('AI_BLOCKED:credits')).toBe(true);
    expect(isCreditsError('TRUNCATED_MAX_TOKENS')).toBe(false);
  });
});

describe('lead stage', () => {
  it('lets facts decide before questions', () => {
    const u = user({ id: 'u', enrolled: true, demoBooked: true });
    expect(leadStage({ user: u, recentIntents: ['fees'], allIntents: ['fees'] })).toBe('Enrolled');
    expect(leadStage({ user: user({ id: 'u', demoBooked: true }), recentIntents: [], allIntents: [] })).toBe('Demo booked');
    expect(leadStage({ user: user({ id: 'u', applied: true }), recentIntents: [], allIntents: [] })).toBe('Applied');
  });
  it('signed in and asking about fees this week is a hot lead', () => {
    expect(leadStage({ user: user({ id: 'u' }), recentIntents: ['fees'], allIntents: ['fees'] })).toBe('Hot lead');
    expect(leadStage({ user: user({ id: 'u' }), recentIntents: [], allIntents: ['fees'] })).toBe('Warm');
  });
  it('guests are warm at best', () => {
    expect(leadStage({ user: null, recentIntents: ['fees'], allIntents: ['fees'] })).toBe('Warm');
    expect(leadStage({ user: null, recentIntents: [], allIntents: ['syllabus'] })).toBe('Unknown');
  });
});

describe('dates and names', () => {
  it('buckets by India date', () => {
    expect(istDay('2026-10-14T19:00:00Z')).toBe('2026-10-15'); // 00:30 IST on the 15th
    expect(dayBucket('2026-10-15T01:00:00Z', NOW)).toBe('today');
    expect(dayBucket('2026-10-14T05:00:00Z', NOW)).toBe('yesterday');
    expect(dayBucket('2026-10-11T05:00:00Z', NOW)).toBe('week');
    expect(dayBucket('2026-09-20T05:00:00Z', NOW)).toBe('2026-09');
  });
  it('tags guests by visitor id, or a stable session hash', () => {
    expect(guestTag(`anon_${'0'.repeat(28)}4a1f`, 's1')).toBe('#4A1F');
    expect(guestTag(null, 'chat_1_abc')).toMatch(/^#[0-9A-F]{4}$/);
    expect(guestTag(null, 'chat_1_abc')).toBe(guestTag(null, 'chat_1_abc'));
  });
  it('makes initials', () => {
    expect(initialsOf('Kunisetty Radhika')).toBe('KR');
    expect(initialsOf('Arjun')).toBe('A');
    expect(initialsOf('')).toBe('');
  });
});

describe('buildConversations and buildPeople', () => {
  const users = new Map<string, InboxUser>([
    ['u1', user({ id: 'u1', name: 'Arjun Selvam', phone: '+919444055218', firstChannel: 'youtube' })],
  ]);
  const anon = `anon_${'a'.repeat(28)}77c2`;
  const rows: InboxRow[] = [
    row({ id: '1', session_id: 's1', created_at: '2026-10-15T14:55:00Z', user_message: 'What are the class timings?', anonymous_id: anon, geo_city: 'Madurai', geo_state: 'Tamil Nadu', geo_country: 'IN', device: 'iPhone · Safari', channel: 'meta_ads' }),
    row({ id: '2', session_id: 's1', created_at: '2026-10-15T15:09:00Z', user_message: 'What are the course fees?', anonymous_id: anon, thumbs_up: false }),
    row({ id: '3', session_id: 's2', created_at: '2026-10-15T14:40:00Z', user_message: 'Is the NATA 2027 exam date announced?', user_id: 'u1', thumbs_up: true }),
    row({ id: '4', session_id: 's3', created_at: '2026-10-12T10:00:00Z', user_message: 'What are the course fees?', anonymous_id: anon, error: 'CREDITS_DEPLETED' }),
  ];
  const conversations = buildConversations(rows, users, NOW);

  it('groups turns by session, newest conversation first', () => {
    expect(conversations.map((c) => c.id)).toEqual(['s1', 's2', 's3']);
    const s1 = conversations[0];
    expect(s1.turnCount).toBe(2);
    expect(s1.lastQuestion).toBe('What are the course fees?');
    expect(s1.status).toBe('review');
    expect(s1.turnStatuses).toEqual(['none', 'review']);
    expect(s1.isGuest).toBe(true);
    expect(s1.guestTag).toBe('#77C2');
    expect(s1.place).toBe('Madurai, Tamil Nadu');
    expect(s1.intents).toEqual(['fees', 'timings']); // a tie keeps the fixed order
    expect(s1.bucket).toBe('today');
  });

  it('names signed-in people and falls back to their first channel', () => {
    const s2 = conversations[1];
    expect(s2.name).toBe('Arjun Selvam');
    expect(s2.initials).toBe('AS');
    expect(s2.phone).toBe('+919444055218');
    expect(s2.channel).toBe('youtube');
    expect(s2.status).toBe('ok');
  });

  it('counts credit failures', () => {
    expect(conversations[2].creditErrorCount).toBe(1);
    expect(conversations[2].status).toBe('error');
  });

  it('joins a guest visitor across sessions', () => {
    const nudges = new Map<string, Nudge>([[anon, { requestedAt: '2026-10-15T10:00:00Z', requestedByName: 'Hari', shownAt: null }]]);
    const people = buildPeople(conversations, users, nudges, NOW);
    expect(people).toHaveLength(2);
    const guest = people.find((p) => p.isGuest)!;
    expect(guest.visits).toBe(2);
    expect(guest.firstSeen).toBe('2026-10-12T10:00:00Z');
    expect(guest.lastConversationId).toBe('s1');
    expect(guest.stage).toBe('Warm');
    expect(guest.nudge?.requestedByName).toBe('Hari');
    expect(guest.device).toBe('iPhone · Safari');
    const arjun = people.find((p) => !p.isGuest)!;
    expect(arjun.stage).toBe('Warm');
    expect(arjun.channel).toBe('youtube');
  });

  it('works out insights for a range', () => {
    const people = buildPeople(conversations, users, new Map(), NOW);
    const ins = buildInsights(conversations, people, '30', NOW);
    expect(ins.chatters).toBe(2);
    expect(ins.signedIn).toBe(1);
    expect(ins.signedInPct).toBe(50);
    expect(ins.messages).toBe(4);
    expect(ins.needsReview).toBe(1);
    expect(ins.noAnswer).toBe(1);
    expect(ins.noAnswerCredits).toBe(1);
    expect(ins.intents[0]).toMatchObject({ key: 'fees', value: 2 });
    expect(ins.places[0]).toMatchObject({ label: 'Tamil Nadu', value: 1 });
    expect(ins.places.at(-1)).toMatchObject({ label: 'No location', muted: true });
    expect(ins.stateValues['tamil-nadu']).toBe(1);
    const fees = ins.struggles.find((s) => normalizeQuestion(s.question) === 'what are the course fees')!;
    expect(fees).toMatchObject({ asked: 2, flagged: 2 });
    expect(ins.struggles.find((s) => s.question.includes('timings'))).toBeUndefined();
  });

  it('a short range leaves older chats out', () => {
    const people = buildPeople(conversations, users, new Map(), NOW);
    const ins = buildInsights(conversations, people, '30', new Date('2026-12-01T00:00:00Z'));
    expect(ins.chatters).toBe(0);
    expect(ins.struggles).toEqual([]);
  });
});

describe('answer rendering', () => {
  it('turns a fee answer into a paragraph, a real table and cards', () => {
    const blocks = parseAnswer(
      'Here are our **exact** fee details:\n\n| Course | Duration | Fee |\n|---|---|---|\n| Crash Course | 3 months | ₹15,000 |\n| 1-Year | 12 months | ₹25,000 |\n\n[[fees:1-year,2-year]]\nScholarships are available.\n[[cta:apply,demo]]\n[[suggest: Timings? | Demo?]]'
    );
    expect(blocks[0]).toEqual({ type: 'paragraph', text: 'Here are our exact fee details:' });
    expect(blocks[1]).toEqual({
      type: 'table',
      header: ['Course', 'Duration', 'Fee'],
      rows: [
        ['Crash Course', '3 months', '₹15,000'],
        ['1-Year', '12 months', '₹25,000'],
      ],
    });
    expect(blocks[2]).toEqual({ type: 'card', label: 'Fee cards shown: 1-year, 2-year' });
    expect(blocks[3]).toEqual({ type: 'paragraph', text: 'Scholarships are available.' });
    expect(blocks[4]).toEqual({ type: 'card', label: 'Buttons shown: Apply, Book a demo' });
    expect(blocks[5]).toEqual({ type: 'card', label: 'Suggested next: Timings? · Demo?' });
  });

  it('reads lists and headings, and drops unknown directives', () => {
    const blocks = parseAnswer('## Batches\n- Weekday: 6 to 8 pm\n- Weekend: 10 am\n[[teleport]]');
    expect(blocks).toEqual([
      { type: 'heading', text: 'Batches' },
      { type: 'list', ordered: false, items: ['Weekday: 6 to 8 pm', 'Weekend: 10 am'] },
    ]);
    expect(parseAnswer(null)).toEqual([]);
  });

  it('strips inline marks and names sources', () => {
    expect(plainInline('Visit [our site](https://neramclasses.com) for `fees`')).toBe('Visit our site (https://neramclasses.com) for fees');
    expect(sourceLabel([])).toBe('Knowledge base');
    expect(sourceLabel(['search_colleges', 'get_college'])).toBe('College directory');
    expect(sourceLabel(['some_tool'])).toBe('Some tool');
  });
});
