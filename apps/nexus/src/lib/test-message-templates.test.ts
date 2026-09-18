import { describe, it, expect } from 'vitest';
import {
  TEST_MESSAGE_TEMPLATES,
  fillConstants,
  isTestMessageTemplate,
  renderGroupPostHtml,
  renderTestMessage,
  type TestMessageContext,
} from './test-message-templates';

const ctx: TestMessageContext = {
  testTitle: 'Indus Valley: class test',
  passMark: 80,
  dueLabel: '18 Aug',
  reopening: true,
};

describe('renderTestMessage', () => {
  it('leaves the per-recipient placeholders for sendNudge to fill', () => {
    const { body } = renderTestMessage('redo', ctx);
    expect(body).toContain('{name}');
    expect(body).toContain('{score}');
  });

  it('says the test is reopened only when it actually is', () => {
    expect(renderTestMessage('redo', { ...ctx, reopening: true }).body).toContain(
      'I have reopened the test for you',
    );
    const notReopened = renderTestMessage('redo', { ...ctx, reopening: false }).body;
    expect(notReopened).not.toContain('I have reopened');
    expect(notReopened).toContain('Ask me to reopen it');
  });

  it('drops the pass-mark sentence for a run that has no pass mark', () => {
    const withMark = renderTestMessage('redo', ctx).body;
    const without = renderTestMessage('redo', { ...ctx, passMark: null }).body;
    expect(withMark).toContain('{pass_mark}');
    expect(without).not.toContain('{pass_mark}');
  });

  it('drops the due date sentence for a run that has no date', () => {
    expect(renderTestMessage('missed', ctx).body).toContain('{due}');
    expect(renderTestMessage('missed', { ...ctx, dueLabel: null }).body).not.toContain('{due}');
  });

  // Updated 2026-09-17: the in-app place a reason is recorded is now the card's
  // own "Tell your teacher why", which the teacher sees on the student's row.
  // "Ask to reopen" was never the button's name ("Ask my teacher" is).
  it('points "tell me why" at the in-app answer, where the reason is recorded', () => {
    const { body } = renderTestMessage('why', ctx);
    expect(body).toContain('"Tell your teacher why"');
    expect(body).toContain('"Ask my teacher"');
  });

  it('tells a re-graded student it was not their fault', () => {
    const { body } = renderTestMessage('regraded', ctx);
    expect(body).toContain('{score}');
    expect(body).toMatch(/not\s*\n?because of anything you did/);
  });

  it('gives custom nothing to start from', () => {
    expect(renderTestMessage('custom', ctx)).toEqual({ subject: '', body: '' });
  });

  it('names the test in every non-custom subject', () => {
    for (const t of TEST_MESSAGE_TEMPLATES) {
      if (t === 'custom') continue;
      expect(renderTestMessage(t, ctx).subject).toContain(ctx.testTitle);
    }
  });

  it('uses no em dash anywhere, per the house style', () => {
    for (const t of TEST_MESSAGE_TEMPLATES) {
      const { subject, body } = renderTestMessage(t, ctx);
      expect(subject + body).not.toMatch(/[—–]|--/);
    }
  });
});

describe('fillConstants', () => {
  it('fills the batch-wide values', () => {
    const out = fillConstants('{test} at {pass_mark}, due {due}', ctx);
    expect(out).toBe('Indus Valley: class test at 80%, due 18 Aug');
  });

  it('leaves the per-recipient placeholders alone', () => {
    expect(fillConstants('Hi {name}, you got {score}', ctx)).toBe('Hi {name}, you got {score}');
  });

  it('leaves an unknown placeholder visible instead of blanking it', () => {
    expect(fillConstants('Hi {nmae}', ctx)).toBe('Hi {nmae}');
  });

  it('has readable fallbacks when the run has no pass mark or date', () => {
    const out = fillConstants('{pass_mark} / {due}', { ...ctx, passMark: null, dueLabel: null });
    expect(out).toBe('the pass mark / the due date');
  });

  it('rounds a fractional pass mark', () => {
    expect(fillConstants('{pass_mark}', { ...ctx, passMark: 79.6 })).toBe('80%');
  });
});

describe('renderGroupPostHtml', () => {
  it('says it was reopened when it was', () => {
    const html = renderGroupPostHtml({
      testTitle: 'Indus Valley',
      count: 6,
      reopening: true,
      bodyHtml: 'Please redo it.',
    });
    expect(html).toContain('has been reopened for 6 students');
  });

  it('reads as a plain message when nothing was reopened', () => {
    const html = renderGroupPostHtml({
      testTitle: 'Indus Valley',
      count: 2,
      reopening: false,
      bodyHtml: 'Well done.',
    });
    expect(html).toContain('A message about');
    expect(html).not.toContain('reopened');
  });

  it('gets the singular right', () => {
    const html = renderGroupPostHtml({
      testTitle: 'T',
      count: 1,
      reopening: false,
      bodyHtml: 'x',
    });
    expect(html).toContain('1 student.');
  });

  it('never lists the names itself, because sendNudge appends the real ones', () => {
    const html = renderGroupPostHtml({
      testTitle: 'T',
      count: 3,
      reopening: true,
      bodyHtml: 'x',
    });
    expect(html).not.toContain('<at');
  });
});

describe('the reopen deadline', () => {
  const until = 'Mon 14 Sept, 11:59 PM';

  it('tells the student when the reopened test closes', () => {
    const body = renderTestMessage('missed', { ...ctx, until }).body;
    expect(body).toContain('It is open until {until}');
    expect(fillConstants(body, { ...ctx, until })).toContain('open until Mon 14 Sept, 11:59 PM');
  });

  it('puts the date in the class post and escapes a title a teacher typed', () => {
    const html = renderGroupPostHtml({
      testTitle: 'Indus <Valley>',
      count: 26,
      reopening: true,
      until,
      bodyHtml: 'x',
    });
    expect(html).toContain('has been reopened for 26 students, open until Mon 14 Sept, 11:59 PM.');
    expect(html).toContain('Indus &lt;Valley&gt;');
    expect(html).not.toContain('<Valley>');
  });
});

describe('the counted template', () => {
  it('says they need not sit it again, with their own score and the day they did it', () => {
    const { subject, body } = renderTestMessage('counted', ctx);
    expect(subject).toContain(ctx.testTitle);
    expect(body).toContain('{score}');
    expect(body).toContain('{date}');
    expect(body).not.toMatch(/reopen/i);
  });

  it('leaves {date} for sendNudge, because every student counted a different day', () => {
    expect(fillConstants('from {date}', ctx)).toBe('from {date}');
  });
});

describe('isTestMessageTemplate', () => {
  it('accepts the five real templates', () => {
    for (const t of TEST_MESSAGE_TEMPLATES) expect(isTestMessageTemplate(t)).toBe(true);
  });

  it('refuses anything else', () => {
    expect(isTestMessageTemplate('shout')).toBe(false);
    expect(isTestMessageTemplate(null)).toBe(false);
  });
});

/**
 * 2026-09-17. The "why" message used to ask for a reply in Teams chat, and
 * nothing in Nexus read replies back. It now sends students to the card, whose
 * answer reaches the teacher's Students tab.
 */
describe('the "Tell me why" message', () => {
  it('never asks the student to reply in chat', () => {
    const { body } = renderTestMessage('why', ctx);
    expect(body).not.toMatch(/reply/i);
  });

  it('names the link the route puts under it, so the text and the link agree', async () => {
    const { TELL_WHY_LINK_LABEL, templateLinksToWhy } = await import('./test-message-templates');
    expect(renderTestMessage('why', ctx).body).toContain(TELL_WHY_LINK_LABEL);
    expect(templateLinksToWhy('why')).toBe(true);
    for (const t of TEST_MESSAGE_TEMPLATES) {
      if (t !== 'why') expect(templateLinksToWhy(t)).toBe(false);
    }
  });

  it('does not claim a reason reopens anything', () => {
    const body = renderTestMessage('why', { ...ctx, reopening: false }).body;
    expect(body).toContain('does not reopen the test');
    expect(body).not.toContain('I have reopened');
  });
});
