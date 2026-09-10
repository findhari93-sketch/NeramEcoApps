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

  it('points "tell me why" at the in-app ask, where the reason is recorded', () => {
    expect(renderTestMessage('why', ctx).body).toContain('Ask to reopen');
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

describe('isTestMessageTemplate', () => {
  it('accepts the five real templates', () => {
    for (const t of TEST_MESSAGE_TEMPLATES) expect(isTestMessageTemplate(t)).toBe(true);
  });

  it('refuses anything else', () => {
    expect(isTestMessageTemplate('shout')).toBe(false);
    expect(isTestMessageTemplate(null)).toBe(false);
  });
});
