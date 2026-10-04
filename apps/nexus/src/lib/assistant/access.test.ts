// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { ApiError } from '@/lib/api-errors';
import { resolveFlags } from '@/lib/feature-flags';
import { assertAssistantAccess, featuresOf, readAssistantGate, withAssistantPilot } from './access';

function settingsDb(rows: Record<string, unknown>) {
  return {
    from: () => ({
      select: () => ({
        in: async () => ({
          data: Object.entries(rows).map(([key, value]) => ({ key, value })),
          error: null,
        }),
      }),
    }),
  };
}

const student = { id: 'u1', user_type: 'student' };

describe('readAssistantGate', () => {
  it('is off with no settings rows at all', async () => {
    const gate = await readAssistantGate(settingsDb({}));
    expect(gate).toEqual({ enabled: false, pilot: [], features: { sketchbook: false, attendance: false, tests: false, questionBank: false, inspiration: false } });
  });

  it('reads the flag and the allowlist', async () => {
    const gate = await readAssistantGate(
      settingsDb({ feature_flags: { 'student.assistant-chat': true }, assistant_pilot_user_ids: ['u1', 'u2'] }),
    );
    expect(gate).toEqual({ enabled: true, pilot: ['u1', 'u2'], features: { sketchbook: false, attendance: false, tests: false, questionBank: false, inspiration: false } });
  });

  it('reads the sketchbook and attendance flags in the same read (Ruling 25)', async () => {
    const gate = await readAssistantGate(
      settingsDb({ feature_flags: { 'student.assistant-chat': true, 'student.sketchbook': true, 'student.attendance': false } }),
    );
    expect(gate.features).toEqual({ sketchbook: true, attendance: false, tests: false, questionBank: false, inspiration: false });
  });

  it('ignores a malformed allowlist instead of trusting it', async () => {
    const gate = await readAssistantGate(
      settingsDb({ feature_flags: { 'student.assistant-chat': true }, assistant_pilot_user_ids: 'u1' }),
    );
    expect(gate.pilot).toEqual([]);
  });
});

describe('assertAssistantAccess', () => {
  it('404s when the flag is off, so the route looks absent', async () => {
    await expect(assertAssistantAccess(settingsDb({}), student)).rejects.toMatchObject({ status: 404 });
  });

  it('403s a non-student', async () => {
    const db = settingsDb({ feature_flags: { 'student.assistant-chat': true } });
    await expect(assertAssistantAccess(db, { id: 't1', user_type: 'teacher' })).rejects.toMatchObject({ status: 403 });
  });

  it('403s a student outside a non-empty pilot list', async () => {
    const db = settingsDb({ feature_flags: { 'student.assistant-chat': true }, assistant_pilot_user_ids: ['u9'] });
    await expect(assertAssistantAccess(db, student)).rejects.toMatchObject({ status: 403 });
  });

  it('passes a student when the flag is on and the list is empty, with the features', async () => {
    const db = settingsDb({ feature_flags: { 'student.assistant-chat': true, 'student.attendance': true } });
    await expect(assertAssistantAccess(db, student)).resolves.toEqual({ sketchbook: false, attendance: true, tests: false, questionBank: false, inspiration: false });
  });

  it('passes a listed student', async () => {
    const db = settingsDb({ feature_flags: { 'student.assistant-chat': true }, assistant_pilot_user_ids: ['u1'] });
    await expect(assertAssistantAccess(db, student)).resolves.toEqual({ sketchbook: false, attendance: false, tests: false, questionBank: false, inspiration: false });
  });

  it('throws ApiError, not a bare Error', async () => {
    await expect(assertAssistantAccess(settingsDb({}), student)).rejects.toBeInstanceOf(ApiError);
  });
});

describe('withAssistantPilot (the per-user flag payload, Ruling 22)', () => {
  const on = resolveFlags({ 'student.assistant-chat': true, 'student.sketchbook': true });

  it('reads false for a student outside a non-empty pilot list', () => {
    const flags = withAssistantPilot(on, 'u1', ['u9']);
    expect(flags['student.assistant-chat']).toBe(false);
    // Nothing else moves.
    expect(flags['student.sketchbook']).toBe(true);
  });

  it('reads true for a listed student', () => {
    expect(withAssistantPilot(on, 'u1', ['u9', 'u1'])['student.assistant-chat']).toBe(true);
  });

  it('reads true for everyone when the list is empty, missing or malformed', () => {
    expect(withAssistantPilot(on, 'u1', [])['student.assistant-chat']).toBe(true);
    expect(withAssistantPilot(on, 'u1', null)['student.assistant-chat']).toBe(true);
    expect(withAssistantPilot(on, 'u1', 'u9')['student.assistant-chat']).toBe(true);
  });

  it('fails closed when the pilot setting could not be read, like the server gate', () => {
    expect(withAssistantPilot(on, 'u1', null, { readFailed: true })['student.assistant-chat']).toBe(false);
  });

  it('never turns the flag on when it is off', () => {
    expect(withAssistantPilot(resolveFlags({}), 'u1', ['u1'])['student.assistant-chat']).toBe(false);
  });
});

describe('featuresOf (M2 switches)', () => {
  it('reads tests, question bank and inspiration from the flag map', () => {
    const flags = resolveFlags({ 'student.tests': true, 'student.question-bank': false, 'student.inspiration': true });
    expect(featuresOf(flags)).toMatchObject({ tests: true, questionBank: false, inspiration: true });
  });

  it('fails closed on all five when the settings read fails', async () => {
    const broken = { from: () => ({ select: () => ({ in: async () => ({ data: null, error: { message: 'down' } }) }) }) };
    expect((await readAssistantGate(broken)).features).toEqual({ sketchbook: false, attendance: false, tests: false, questionBank: false, inspiration: false });
  });
});
