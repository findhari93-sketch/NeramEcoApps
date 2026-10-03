// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { ApiError } from '@/lib/api-errors';
import { assertAssistantAccess, readAssistantGate } from './access';

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
    expect(gate).toEqual({ enabled: false, pilot: [] });
  });

  it('reads the flag and the allowlist', async () => {
    const gate = await readAssistantGate(
      settingsDb({ feature_flags: { 'student.assistant-chat': true }, assistant_pilot_user_ids: ['u1', 'u2'] }),
    );
    expect(gate).toEqual({ enabled: true, pilot: ['u1', 'u2'] });
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

  it('passes a student when the flag is on and the list is empty', async () => {
    const db = settingsDb({ feature_flags: { 'student.assistant-chat': true } });
    await expect(assertAssistantAccess(db, student)).resolves.toBeUndefined();
  });

  it('passes a listed student', async () => {
    const db = settingsDb({ feature_flags: { 'student.assistant-chat': true }, assistant_pilot_user_ids: ['u1'] });
    await expect(assertAssistantAccess(db, student)).resolves.toBeUndefined();
  });

  it('throws ApiError, not a bare Error', async () => {
    await expect(assertAssistantAccess(settingsDb({}), student)).rejects.toBeInstanceOf(ApiError);
  });
});
