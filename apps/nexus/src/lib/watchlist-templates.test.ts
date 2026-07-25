import { describe, it, expect } from 'vitest';
import {
  ACTION_EVENT,
  ACTION_STAGE,
  STAGE_LABEL,
  buildTemplate,
  canRemove,
  canTakeAction,
  ladderIndex,
  nextAction,
  removalNote,
  sendsMessage,
  type WatchlistAction,
  type WatchlistStage,
} from './watchlist-templates';

const STAGES: WatchlistStage[] = [
  'none',
  'nudged',
  'warned',
  'parent_contacted',
  'final_notice',
  'removed',
  'resolved',
];

const ACTIONS: WatchlistAction[] = [
  'nudge',
  'warn',
  'parent_contacted',
  'final_notice',
  'resolve',
  'snooze',
  'note',
  'removed',
];

describe('the ladder', () => {
  it('walks none to removed one rung at a time', () => {
    expect(nextAction('none')).toBe('nudge');
    expect(nextAction('nudged')).toBe('warn');
    expect(nextAction('warned')).toBe('parent_contacted');
    expect(nextAction('parent_contacted')).toBe('final_notice');
    expect(nextAction('final_notice')).toBe('removed');
  });

  it('offers nothing further once removed or resolved', () => {
    expect(nextAction('removed')).toBeNull();
    expect(nextAction('resolved')).toBeNull();
  });

  it('lets a teacher take only the next rung', () => {
    expect(canTakeAction('none', 'nudge')).toBe(true);
    expect(canTakeAction('none', 'final_notice')).toBe(false);
    expect(canTakeAction('none', 'removed')).toBe(false);
    expect(canTakeAction('warned', 'parent_contacted')).toBe(true);
    expect(canTakeAction('warned', 'removed')).toBe(false);
  });

  it('lets an admin jump stages', () => {
    expect(canTakeAction('none', 'removed', true)).toBe(true);
    expect(canTakeAction('none', 'final_notice', true)).toBe(true);
  });

  it('always allows the off-ramps from any stage, for anyone', () => {
    for (const stage of STAGES) {
      expect(canTakeAction(stage, 'resolve')).toBe(true);
      expect(canTakeAction(stage, 'snooze')).toBe(true);
      expect(canTakeAction(stage, 'note')).toBe(true);
    }
  });
});

describe('canRemove', () => {
  it('opens up only after the final notice, for a teacher', () => {
    expect(canRemove('none')).toBe(false);
    expect(canRemove('nudged')).toBe(false);
    expect(canRemove('warned')).toBe(false);
    expect(canRemove('parent_contacted')).toBe(false);
    expect(canRemove('final_notice')).toBe(true);
  });

  it('is always open to an admin', () => {
    for (const stage of STAGES) {
      expect(canRemove(stage, true)).toBe(true);
    }
  });
});

describe('ladderIndex', () => {
  it('increases along the ladder and is -1 for the off-ramp', () => {
    expect(ladderIndex('none')).toBe(0);
    expect(ladderIndex('final_notice')).toBeGreaterThan(ladderIndex('warned'));
    expect(ladderIndex('resolved')).toBe(-1);
  });
});

describe('maps cover every action and stage', () => {
  it('every action has an event name and a stage entry', () => {
    for (const action of ACTIONS) {
      expect(ACTION_EVENT[action]).toBeTruthy();
      expect(action in ACTION_STAGE).toBe(true);
    }
  });

  it('note and snooze do not move the student', () => {
    expect(ACTION_STAGE.note).toBeNull();
    expect(ACTION_STAGE.snooze).toBeNull();
  });

  it('every stage has a label', () => {
    for (const stage of STAGES) {
      expect(STAGE_LABEL[stage]).toBeTruthy();
    }
  });
});

describe('sendsMessage', () => {
  it('only the three escalating rungs message the student', () => {
    expect(sendsMessage('nudge')).toBe(true);
    expect(sendsMessage('warn')).toBe(true);
    expect(sendsMessage('final_notice')).toBe(true);
    expect(sendsMessage('parent_contacted')).toBe(false);
    expect(sendsMessage('removed')).toBe(false);
    expect(sendsMessage('resolve')).toBe(false);
    expect(sendsMessage('snooze')).toBe(false);
    expect(sendsMessage('note')).toBe(false);
  });
});

describe('buildTemplate', () => {
  it('addresses the student by first name only', () => {
    const t = buildTemplate('nudge', { name: 'Kaira Rohit', reasons: ['Never opened Nexus'] });
    expect(t.body).toContain('Hi Kaira,');
    expect(t.body).not.toContain('Rohit');
  });

  it('falls back gracefully when there is no name', () => {
    const t = buildTemplate('nudge', { name: '', reasons: [] });
    expect(t.body).toContain('Hi there,');
  });

  it('states the actual reasons, joined readably', () => {
    const t = buildTemplate('warn', {
      name: 'Nuha',
      reasons: ['No assignment ever submitted', 'Never opened Nexus'],
    });
    expect(t.body).toContain('no assignment ever submitted and never opened nexus');
  });

  it('renders for every action with a subject and a body', () => {
    for (const action of ACTIONS) {
      const t = buildTemplate(action, { name: 'Ooveya', reasons: ['Missed half the classes'] });
      expect(t.subject.length).toBeGreaterThan(0);
      expect(t.body.length).toBeGreaterThan(0);
      expect(t.body).toContain('Ooveya');
    }
  });

  it('the final notice names the actual consequence', () => {
    const t = buildTemplate('final_notice', { name: 'Test', reasons: ['Never opened Nexus'] });
    expect(t.body.toLowerCase()).toContain('lose');
  });
});

describe('removalNote', () => {
  it('records the evidence, not a bare label', () => {
    const note = removalNote('critical', ['Never opened Nexus', 'No assignment ever submitted']);
    expect(note).toContain('critical');
    expect(note).toContain('never opened nexus');
    expect(note).toContain('no assignment ever submitted');
  });

  it('still reads sensibly with no reasons', () => {
    expect(removalNote('watch', [])).toContain('no activity recorded');
  });
});

describe('content rules', () => {
  it('no generated string contains an em dash or a double dash', () => {
    const strings: string[] = [
      ...Object.values(STAGE_LABEL),
      removalNote('critical', ['Never opened Nexus']),
      removalNote('watch', []),
    ];
    for (const action of ACTIONS) {
      const t = buildTemplate(action, {
        name: 'Test Student',
        reasons: ['Never opened Nexus', 'Missed half the classes'],
      });
      strings.push(t.subject, t.body);
    }
    for (const s of strings) {
      expect(s).not.toMatch(/—|--|&mdash;/);
    }
  });
});
