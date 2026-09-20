import { describe, expect, it } from 'vitest';
import {
  CHASE_COOLDOWN_DAYS,
  CHASE_GRACE_DAYS,
  CHASE_MAX_STEPS,
  chaseMessage,
  decideTestChase,
  type ChaseCandidate,
} from './test-chase';

const NOW = Date.parse('2026-09-18T04:30:00Z');
const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(NOW - n * DAY).toISOString();

const CLASSES = [
  { id: 'c1', title: 'Indian Architectural Heritage', date: '2026-08-12' },
  { id: 'c2', title: 'Indo-Aryan Temple Architecture', date: '2026-08-14' },
];

const candidate = (over: Partial<ChaseCandidate> = {}): ChaseCandidate => ({
  studentId: 's1',
  classroomId: 'room',
  placementId: 'run',
  testTitle: 'History of Architecture Test',
  enrolledAt: daysAgo(30),
  outstanding: CLASSES,
  sat: false,
  dormant: false,
  stepsSent: 0,
  lastSentAt: null,
  handedOff: false,
  ...over,
});

const decide = (list: ChaseCandidate[], skip?: Set<string>) =>
  decideTestChase(list, { now: NOW, skipStudentIds: skip });

describe('decideTestChase', () => {
  it('chases somebody behind who never sat it', () => {
    const out = decide([candidate()]);
    expect(out.send).toHaveLength(1);
    expect(out.send[0].step).toBe(1);
    expect(out.handOff).toHaveLength(0);
  });

  it('never chases somebody who sat it, however far behind they are', () => {
    expect(decide([candidate({ sat: true })]).send).toHaveLength(0);
  });

  it('never chases a paused student', () => {
    // Pausing means staff stopped tracking them. A cron that keeps messaging
    // says the opposite, and it is the reason Chetana was on the list at all.
    expect(decide([candidate({ dormant: true })]).send).toHaveLength(0);
  });

  it('leaves alone anybody with nothing outstanding', () => {
    expect(decide([candidate({ outstanding: [] })]).send).toHaveLength(0);
  });

  it('gives a new joiner their grace period', () => {
    expect(decide([candidate({ enrolledAt: daysAgo(CHASE_GRACE_DAYS - 1) })]).send).toHaveLength(0);
    expect(decide([candidate({ enrolledAt: daysAgo(CHASE_GRACE_DAYS + 1) })]).send).toHaveLength(1);
  });

  it('chases somebody with no enrolment date rather than skipping them', () => {
    expect(decide([candidate({ enrolledAt: null })]).send).toHaveLength(1);
  });

  it('holds the cooldown between steps', () => {
    expect(
      decide([candidate({ stepsSent: 1, lastSentAt: daysAgo(CHASE_COOLDOWN_DAYS - 1) })]).send,
    ).toHaveLength(0);
    const due = decide([candidate({ stepsSent: 1, lastSentAt: daysAgo(CHASE_COOLDOWN_DAYS) })]);
    expect(due.send[0].step).toBe(2);
  });

  it('stops after the last step and hands the student to a teacher, once', () => {
    const spent = candidate({ stepsSent: CHASE_MAX_STEPS, lastSentAt: daysAgo(CHASE_COOLDOWN_DAYS + 1) });
    const first = decide([spent]);
    expect(first.send).toHaveLength(0);
    expect(first.handOff).toHaveLength(1);

    // The log row written by that hand-off stops it happening again tomorrow.
    const again = decide([{ ...spent, handedOff: true }]);
    expect(again.handOff).toHaveLength(0);
    expect(again.send).toHaveLength(0);
  });

  it('waits out the cooldown before handing over, so the third message gets its week', () => {
    const justSent = candidate({ stepsSent: CHASE_MAX_STEPS, lastSentAt: daysAgo(1) });
    expect(decide([justSent]).handOff).toHaveLength(0);
  });

  it('skips anybody another pass has already messaged this morning', () => {
    expect(decide([candidate()], new Set(['s1'])).send).toHaveLength(0);
  });

  it('puts the furthest behind first when it has to cap', () => {
    const out = decideTestChase(
      [
        candidate({ studentId: 'one-class', outstanding: [CLASSES[0]] }),
        candidate({ studentId: 'two-classes', outstanding: CLASSES }),
      ],
      { now: NOW, max: 1 },
    );
    expect(out.send.map((s) => s.studentId)).toEqual(['two-classes']);
    expect(out.capped).toBe(true);
  });

  it('reports capped as false when everybody fits', () => {
    expect(decide([candidate()]).capped).toBe(false);
  });
});

describe('chaseMessage', () => {
  const input = { testTitle: 'History of Architecture Test', outstanding: CLASSES };

  it('names the classes and promises what the code actually does', () => {
    const first = chaseMessage(1, input);
    expect(first.subject).toContain('History of Architecture Test');
    expect(first.plain).toContain('Indian Architectural Heritage (12 Aug)');
    expect(first.plain).toContain('Indo-Aryan Temple Architecture (14 Aug)');
    expect(first.plain).toContain('opens for you on its own');
  });

  it('gets firmer, and the last one says a person will follow up', () => {
    expect(chaseMessage(2, input).subject).toContain('Still waiting');
    const last = chaseMessage(3, input);
    expect(last.subject).toContain('Last reminder');
    expect(last.plain).toContain('a teacher will be in touch');
  });

  it('keeps the Teams preview to one sentence', () => {
    for (const step of [1, 2, 3]) {
      expect(chaseMessage(step, input).teamsText.split('\n')).toHaveLength(1);
    }
  });

  it('counts one class correctly', () => {
    expect(chaseMessage(2, { ...input, outstanding: [CLASSES[0]] }).plain).toContain('1 class of catch-up');
  });

  it('never uses an em dash, which reads as machine-written', () => {
    for (const step of [1, 2, 3]) {
      const m = chaseMessage(step, input);
      expect(`${m.subject}${m.plain}`).not.toMatch(/[—]|--/);
    }
  });
});
