import { describe, expect, it } from 'vitest';
import { checksumSource, mathBalanced, verifyPack, type TutorPack } from './pack';
import { tutorMatchers } from './matchers';
import { KNOWN_CONCEPTS, MCQ_PACK, MCQ_QUESTION, NUM_PACK, NUM_QUESTION } from './testing/fixtures';

const clone = <T>(v: T): T => structuredClone(v);
const verify = (p: unknown, q = MCQ_QUESTION) => verifyPack(p, q, tutorMatchers, KNOWN_CONCEPTS);

describe('verifyPack', () => {
  it('passes the fixture packs', () => {
    expect(verify(MCQ_PACK)).toEqual({ ok: true, errors: [] });
    expect(verify(NUM_PACK, NUM_QUESTION)).toEqual({ ok: true, errors: [] });
  });

  it('refuses an MCQ final that disagrees with the key', () => {
    const p = clone(MCQ_PACK);
    p.final.option_id = 'b';
    expect(verify(p).errors).toContain('final: option b disagrees with the key');
  });

  it('refuses a numerical final that disagrees with the key, and accepts an equal form', () => {
    const wrong = clone(NUM_PACK);
    wrong.final.value = '25';
    expect(verify(wrong, NUM_QUESTION).ok).toBe(false);
    const same = clone(NUM_PACK);
    same.final.value = 'sqrt(25)';
    same.steps[1].expected = '10/2';
    expect(verify(same, NUM_QUESTION).ok).toBe(true);
  });

  it('refuses a last number step that does not reach the final answer', () => {
    const p = clone(NUM_PACK);
    p.steps[1].expected = '6';
    expect(verify(p, NUM_QUESTION).errors.join()).toMatch(/does not reach the final answer/);
  });

  it('needs exactly one correct choice per check', () => {
    const p = clone(MCQ_PACK);
    p.steps[0].choices![1].correct = true;
    expect(verify(p).errors.join()).toMatch(/has 2 correct choices/);
  });

  it('refuses a mistake whose trigger is the correct option or not an option', () => {
    const p = clone(MCQ_PACK);
    p.mistakes[0].trigger = { option_id: 'a' };
    expect(verify(p).errors.join()).toMatch(/is the correct answer/);
    p.mistakes[0].trigger = { option_id: 'z' };
    expect(verify(p).errors.join()).toMatch(/not an option/);
  });

  it('refuses a fourth hint that gives the answer away', () => {
    const p = clone(NUM_PACK);
    const q = { ...NUM_QUESTION, correct_answer: '12.5' };
    p.final.value = '12.5';
    p.steps[1].expected = '12.5';
    p.hints[3] = 'It comes to 12.5.';
    expect(verify(p, q).errors).toContain('hints[3]: gives away the final value');
    // A short value inside honest working is not a giveaway.
    expect(verify(NUM_PACK, NUM_QUESTION).ok).toBe(true);
  });

  it('refuses unknown concepts, unbalanced maths and dashes', () => {
    const p = clone(MCQ_PACK) as TutorPack;
    p.steps[0].concept = 'vector_algebra.nope';
    p.steps[0].teach = 'Broken $x';
    p.steps[1].teach = 'A pause \u2014 then on';
    const errs = verify(p).errors.join('\n');
    expect(errs).toMatch(/unknown slug vector_algebra.nope/);
    expect(errs).toMatch(/s1.teach: unbalanced/);
    expect(errs).toMatch(/s2.teach: has a dash/);
  });

  it('refuses a numerical trigger that is the key or does not parse, and a numerical pack with no number step', () => {
    const p = clone(NUM_PACK);
    p.mistakes[0].trigger = { value: '10/2' };
    expect(verify(p, NUM_QUESTION).errors.join()).toMatch(/is the correct answer, not a mistake/);
    p.mistakes[0].trigger = { value: 'five' };
    expect(verify(p, NUM_QUESTION).errors.join()).toMatch(/does not parse/);
    const noNumber = clone(NUM_PACK);
    noNumber.steps = [{ ...MCQ_PACK.steps[0], concept: 'vector_algebra.magnitude' }];
    noNumber.mistakes = [];
    expect(verify(noNumber, NUM_QUESTION).errors.join()).toMatch(/needs at least one number step/);
  });

  it('refuses a fourth hint that writes out a long correct option', () => {
    const q = { ...MCQ_QUESTION, options: [{ id: 'a', text: '$\\frac{56}{33}$' }, { id: 'b', text: '$2$' }] };
    const p = clone(MCQ_PACK);
    p.mistakes = [];
    p.hints[3] = 'It simplifies to $\\frac{56}{33}$.';
    expect(verify(p, q).errors).toContain('hints[3]: gives away the correct option');
  });

  it('refuses a drawing or other format', () => {
    expect(verify(MCQ_PACK, { ...MCQ_QUESTION, question_format: 'DRAWING_PROMPT' }).ok).toBe(false);
  });

  it('refuses garbage without throwing', () => {
    expect(verify(null).ok).toBe(false);
    expect(verify({ v: 2 }).ok).toBe(false);
    expect(verify({ v: 1 }).ok).toBe(false);
  });
});

describe('mathBalanced', () => {
  it('counts dollars and braces, ignoring escapes', () => {
    expect(mathBalanced('$\\frac{1}{2}$')).toBe(true);
    expect(mathBalanced('costs \\$5')).toBe(true);
    expect(mathBalanced('$x')).toBe(false);
    expect(mathBalanced('$\\frac{1}{2$')).toBe(false);
  });
});

describe('checksumSource', () => {
  it('changes when the key or an option changes', () => {
    const base = checksumSource(MCQ_QUESTION);
    expect(checksumSource({ ...MCQ_QUESTION, correct_answer: 'b' })).not.toBe(base);
    expect(checksumSource({ ...MCQ_QUESTION, options: [{ id: 'a', text: '$-2$' }] })).not.toBe(base);
    expect(checksumSource({ ...MCQ_QUESTION, question_image_url: 'https://x/fig.png' })).not.toBe(base);
    expect(checksumSource({ ...MCQ_QUESTION, options: MCQ_QUESTION.options!.map((o, i) => (i ? o : { ...o, image_url: 'https://x/a.png' })) })).not.toBe(base);
    expect(checksumSource({ ...MCQ_QUESTION })).toBe(base);
  });
});
