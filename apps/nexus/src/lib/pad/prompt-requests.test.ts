// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { parseAskRequest, parseKeyRequest, parseLabelRequest, parseSubmitRequest } from './prompt-requests';

const SESSION = '11111111-1111-4111-8111-111111111111';
const PROMPT = '22222222-2222-4222-8222-222222222222';

describe('parseAskRequest', () => {
  it('defaults to a four-option multiple choice question', () => {
    expect(parseAskRequest({ sessionId: SESSION })).toEqual({ ok: true, value: { sessionId: SESSION, answerType: 'mcq', optionCount: 4 } });
  });

  it('reads every answer type, keeping the option count for mcq only', () => {
    expect(parseAskRequest({ sessionId: SESSION.toUpperCase(), answerType: 'mcq', optionCount: 6 })).toEqual({
      ok: true,
      value: { sessionId: SESSION, answerType: 'mcq', optionCount: 6 },
    });
    for (const answerType of ['numeric', 'text', 'yesno']) {
      expect(parseAskRequest({ sessionId: SESSION, answerType, optionCount: 5 })).toEqual({
        ok: true,
        value: { sessionId: SESSION, answerType, optionCount: null },
      });
    }
  });

  it.each([
    [{}, 'sessionId'],
    [{ sessionId: 'session-1' }, 'sessionId'],
    [{ sessionId: SESSION, answerType: 'essay' }, 'answerType'],
    [{ sessionId: SESSION, answerType: 7 }, 'answerType'],
    [{ sessionId: SESSION, optionCount: 1 }, 'optionCount'],
    [{ sessionId: SESSION, optionCount: 7 }, 'optionCount'],
    [{ sessionId: SESSION, optionCount: 3.5 }, 'optionCount'],
    [{ sessionId: SESSION, optionCount: '4' }, 'optionCount'],
  ])('refuses %j, naming %s', (body, field) => {
    expect(parseAskRequest(body)).toEqual({ ok: false, field });
  });
});

describe('parseKeyRequest', () => {
  it('reads the correct answers, or Poll / Don\'t grade', () => {
    expect(parseKeyRequest({ keys: ['B', 'c'] })).toEqual({ ok: true, value: { ungraded: false, keys: ['B', 'c'] } });
    expect(parseKeyRequest({ keys: ['42'], ungraded: false })).toEqual({ ok: true, value: { ungraded: false, keys: ['42'] } });
    expect(parseKeyRequest({ ungraded: true })).toEqual({ ok: true, value: { ungraded: true, keys: null } });
    expect(parseKeyRequest({ ungraded: true, keys: null })).toEqual({ ok: true, value: { ungraded: true, keys: null } });
  });

  it.each([
    [{}, 'keys'],
    [{ keys: [] }, 'keys'],
    [{ keys: 'A' }, 'keys'],
    [{ keys: ['A', 7] }, 'keys'],
    [{ keys: ['  '] }, 'keys'],
    [{ keys: ['x'.repeat(101)] }, 'keys'],
    [{ keys: Array.from({ length: 51 }, (_, i) => String(i)) }, 'keys'],
    [{ ungraded: true, keys: ['A'] }, 'keys'],
    [{ ungraded: 'yes', keys: ['A'] }, 'ungraded'],
  ])('refuses %j, naming %s', (body, field) => {
    expect(parseKeyRequest(body)).toEqual({ ok: false, field });
  });
});

describe('parseLabelRequest', () => {
  it('reads a note, and clears it for null or a missing label', () => {
    expect(parseLabelRequest({ label: 'Kinematics Q3' })).toEqual({ ok: true, value: { label: 'Kinematics Q3' } });
    expect(parseLabelRequest({ label: null })).toEqual({ ok: true, value: { label: null } });
    expect(parseLabelRequest({})).toEqual({ ok: true, value: { label: null } });
  });

  it('refuses a label that is not text or is far too long', () => {
    expect(parseLabelRequest({ label: 12 })).toEqual({ ok: false, field: 'label' });
    expect(parseLabelRequest({ label: 'x'.repeat(201) })).toEqual({ ok: false, field: 'label' });
  });
});

describe('parseSubmitRequest', () => {
  it('passes the answer through exactly as the student gave it', () => {
    expect(parseSubmitRequest({ promptId: PROMPT, answer: ' 1,000.50 ' })).toEqual({ ok: true, value: { promptId: PROMPT, answer: ' 1,000.50 ' } });
  });

  it.each([
    [{ answer: 'A' }, 'promptId'],
    [{ promptId: 'p1', answer: 'A' }, 'promptId'],
    [{ promptId: PROMPT }, 'answer'],
    [{ promptId: PROMPT, answer: '' }, 'answer'],
    [{ promptId: PROMPT, answer: '   ' }, 'answer'],
    [{ promptId: PROMPT, answer: 4 }, 'answer'],
    [{ promptId: PROMPT, answer: 'x'.repeat(201) }, 'answer'],
  ])('refuses %j, naming %s', (body, field) => {
    expect(parseSubmitRequest(body)).toEqual({ ok: false, field });
  });
});
