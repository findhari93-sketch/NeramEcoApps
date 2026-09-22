// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  parseAskRequest,
  parseDetailsRequest,
  parseKeyRequest,
  parseLabelRequest,
  parsePictureRequest,
  parseSkipRequest,
  parseSubmitRequest,
} from './prompt-requests';

const SESSION = '11111111-1111-4111-8111-111111111111';
const PROMPT = '22222222-2222-4222-8222-222222222222';

describe('parseAskRequest', () => {
  it('defaults to a four-option multiple choice question', () => {
    expect(parseAskRequest({ sessionId: SESSION })).toEqual({
      ok: true,
      value: { sessionId: SESSION, answerType: 'mcq', optionCount: 4, label: null, text: null, imageUrl: null, optionTexts: null },
    });
  });

  it("carries the teacher's reference and the question text, left for the database to tidy", () => {
    expect(parseAskRequest({ sessionId: SESSION, label: ' 38 ', text: 'Which statement is correct?' })).toEqual({
      ok: true,
      value: { sessionId: SESSION, answerType: 'mcq', optionCount: 4, label: ' 38 ', text: 'Which statement is correct?', imageUrl: null, optionTexts: null },
    });
    expect(parseAskRequest({ sessionId: SESSION, label: null, text: null })).toMatchObject({ ok: true, value: { label: null, text: null } });
  });

  it('reads every answer type, keeping the option count for mcq only', () => {
    expect(parseAskRequest({ sessionId: SESSION.toUpperCase(), answerType: 'mcq', optionCount: 6 })).toEqual({
      ok: true,
      value: { sessionId: SESSION, answerType: 'mcq', optionCount: 6, label: null, text: null, imageUrl: null, optionTexts: null },
    });
    for (const answerType of ['numeric', 'text', 'yesno']) {
      expect(parseAskRequest({ sessionId: SESSION, answerType, optionCount: 5 })).toEqual({
        ok: true,
        value: { sessionId: SESSION, answerType, optionCount: null, label: null, text: null, imageUrl: null, optionTexts: null },
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
    [{ sessionId: SESSION, label: 38 }, 'label'],
    [{ sessionId: SESSION, label: 'x'.repeat(201) }, 'label'],
    [{ sessionId: SESSION, text: ['Which?'] }, 'text'],
    [{ sessionId: SESSION, text: 'x'.repeat(2001) }, 'text'],
  ])('refuses %j, naming %s', (body, field) => {
    expect(parseAskRequest(body)).toEqual({ ok: false, field });
  });
});

describe('parseAskRequest: the picture and option text', () => {
  it('carries a picture and option text for multiple choice, and drops option text for anything else', () => {
    const imageUrl = `https://db.neramclasses.com/storage/v1/object/public/uploads/pad/${SESSION}/a.jpg`;
    expect(parseAskRequest({ sessionId: SESSION, imageUrl, optionTexts: ['Both', null, '', 'Neither'] })).toMatchObject({
      ok: true,
      value: { imageUrl, optionTexts: ['Both', null, '', 'Neither'] },
    });
    expect(parseAskRequest({ sessionId: SESSION, answerType: 'yesno', optionTexts: ['Yes it is'] })).toMatchObject({
      ok: true,
      value: { optionTexts: null },
    });
  });

  it.each([
    [{ sessionId: SESSION, imageUrl: 7 }, 'imageUrl'],
    [{ sessionId: SESSION, imageUrl: `https://x.test/${'a'.repeat(1030)}` }, 'imageUrl'],
    [{ sessionId: SESSION, optionTexts: 'A' }, 'optionTexts'],
    [{ sessionId: SESSION, optionTexts: [1, 2] }, 'optionTexts'],
    [{ sessionId: SESSION, optionTexts: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] }, 'optionTexts'],
  ])('refuses %j, naming %s', (body, field) => {
    expect(parseAskRequest(body)).toEqual({ ok: false, field });
  });
});

describe('parsePictureRequest', () => {
  it('reads a picture address, or null to take it off', () => {
    expect(parsePictureRequest({ imageUrl: 'https://x.test/a.png' })).toEqual({ ok: true, value: { imageUrl: 'https://x.test/a.png' } });
    expect(parsePictureRequest({ imageUrl: null })).toEqual({ ok: true, value: { imageUrl: null } });
    expect(parsePictureRequest({ imageUrl: 5 })).toEqual({ ok: false, field: 'imageUrl' });
  });
});

describe('parseSkipRequest', () => {
  it('reads a reason from the list with an optional note, or null to take it back', () => {
    expect(parseSkipRequest({ promptId: PROMPT, reason: 'cant_see' })).toEqual({ ok: true, value: { promptId: PROMPT, reason: 'cant_see', note: null } });
    expect(parseSkipRequest({ promptId: PROMPT, reason: 'other', note: 'Froze' })).toEqual({
      ok: true,
      value: { promptId: PROMPT, reason: 'other', note: 'Froze' },
    });
    expect(parseSkipRequest({ promptId: PROMPT, reason: null })).toEqual({ ok: true, value: { promptId: PROMPT, reason: null, note: null } });
  });

  it.each([
    [{ reason: 'dont_know' }, 'promptId'],
    [{ promptId: PROMPT, reason: 'bored' }, 'reason'],
    [{ promptId: PROMPT, reason: 3 }, 'reason'],
    [{ promptId: PROMPT, reason: 'other', note: 'x'.repeat(201) }, 'note'],
  ])('refuses %j, naming %s', (body, field) => {
    expect(parseSkipRequest(body)).toEqual({ ok: false, field });
  });
});

describe('parseDetailsRequest', () => {
  it('reads both fields, treating a missing one as cleared', () => {
    expect(parseDetailsRequest({ label: '38', text: 'Which one?' })).toEqual({ ok: true, value: { label: '38', text: 'Which one?' } });
    expect(parseDetailsRequest({ label: '38' })).toEqual({ ok: true, value: { label: '38', text: null } });
    expect(parseDetailsRequest(null)).toEqual({ ok: true, value: { label: null, text: null } });
  });

  it.each([
    [{ label: 7 }, 'label'],
    [{ text: 'x'.repeat(2001) }, 'text'],
  ])('refuses %j, naming %s', (body, field) => {
    expect(parseDetailsRequest(body)).toEqual({ ok: false, field });
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
