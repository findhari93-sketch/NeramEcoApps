import { describe, it, expect, afterEach } from 'vitest';
import { assertCronRequest } from './cron-auth';

const original = process.env.CRON_SECRET;

afterEach(() => {
  if (original === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = original;
});

function req(authorization?: string) {
  return new Request('https://nexus.example/api/cron/sync-attendance', {
    headers: authorization ? { Authorization: authorization } : {},
  });
}

describe('assertCronRequest', () => {
  it('allows the call through when no secret is configured', () => {
    // Deliberate: adding the guard to an existing cron must be a no-op until the
    // secret is set, so a deploy cannot silently break a working schedule.
    delete process.env.CRON_SECRET;
    expect(assertCronRequest(req())).toBeNull();
  });

  it('rejects a call with no Authorization header once a secret is set', () => {
    process.env.CRON_SECRET = 's3cret';
    const res = assertCronRequest(req());
    expect(res?.status).toBe(401);
  });

  it('rejects a wrong secret', () => {
    process.env.CRON_SECRET = 's3cret';
    expect(assertCronRequest(req('Bearer wrong'))?.status).toBe(401);
  });

  it('allows the matching secret through', () => {
    process.env.CRON_SECRET = 's3cret';
    expect(assertCronRequest(req('Bearer s3cret'))).toBeNull();
  });
});

describe('assertCronRequest with { required: true }', () => {
  it('refuses to run at all when no secret is configured', () => {
    // The permissive default is merely untidy for a route that sends reminders.
    // For the YouTube backup it is a public button that spends 1600 of a 10,000
    // unit daily quota per press, so that route opts into failing closed.
    delete process.env.CRON_SECRET;
    const res = assertCronRequest(req(), { required: true });
    expect(res?.status).toBe(503);
  });

  it('still rejects a wrong secret', () => {
    process.env.CRON_SECRET = 's3cret';
    expect(assertCronRequest(req('Bearer wrong'), { required: true })?.status).toBe(401);
  });

  it('allows the matching secret through', () => {
    process.env.CRON_SECRET = 's3cret';
    expect(assertCronRequest(req('Bearer s3cret'), { required: true })).toBeNull();
  });

  it('changes nothing for callers that do not opt in', () => {
    delete process.env.CRON_SECRET;
    expect(assertCronRequest(req())).toBeNull();
    expect(assertCronRequest(req(), { required: false })).toBeNull();
  });
});
