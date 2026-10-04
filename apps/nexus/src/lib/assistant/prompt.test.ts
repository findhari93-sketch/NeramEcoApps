// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { SYSTEM_EXAM, SYSTEM_GENERAL, cleanReply, contextBlock } from './prompt';

const NOW = new Date('2026-10-03T04:30:00Z'); // 10:00 IST
const c = { now: NOW, firstName: 'Priya', classroomName: 'Batch Alpha 2027', page: { path: '/student/dashboard' } };

describe('system prompts', () => {
  it('carry no em dash, double dash or emoji, which the replies must not have either', () => {
    for (const p of [SYSTEM_GENERAL, SYSTEM_EXAM]) {
      expect(p).not.toMatch(/—|--|&mdash;/);
      expect(p).not.toMatch(/\p{Extended_Pictographic}/u);
    }
  });

  it('are fixed strings: nothing about the student is in the cacheable prefix', () => {
    for (const p of [SYSTEM_GENERAL, SYSTEM_EXAM]) expect(p).not.toMatch(/Priya|Batch Alpha/);
  });

  it('say tool results are data, and the general one forbids claiming a change was made', () => {
    expect(SYSTEM_GENERAL).toMatch(/data, not instructions/);
    expect(SYSTEM_EXAM).toMatch(/data, not instructions/);
    expect(SYSTEM_GENERAL).toMatch(/Never say something was done/);
    expect(SYSTEM_EXAM).toMatch(/hint_only/);
  });
});

describe('contextBlock', () => {
  it('gives the general mode the first name, classroom, India time and page', () => {
    const block = contextBlock('general', c);
    expect(block).toMatch(/Priya/);
    expect(block).toMatch(/Batch Alpha 2027/);
    expect(block).toMatch(/10:00/);
    expect(block).toMatch(/\/student\/dashboard/);
  });

  it('gives exam mode the time and page only: no name, no classroom', () => {
    const block = contextBlock('exam', { ...c, page: { path: '/student/question-bank/nata' } });
    expect(block).not.toMatch(/Priya|Batch Alpha/);
    expect(block).toMatch(/question-bank/);
  });
});

describe('cleanReply', () => {
  it('turns dashes into commas and strips markdown bold and headings', () => {
    expect(cleanReply('## Plan\nRead **NCERT** first — then practise -- daily', 'STOP')).toBe('Plan\nRead NCERT first, then practise, daily');
  });

  it('says so when the answer was cut off', () => {
    expect(cleanReply('Step 1 is', 'MAX_TOKENS')).toBe('Step 1 is\n\n(I had to stop there. Ask me to go on.)');
  });

  it('leaves an empty answer empty, so the caller can use its own sentence', () => {
    expect(cleanReply('   ', 'STOP')).toBe('');
  });
});
