import { afterEach, describe, expect, it } from 'vitest';
import { authorisedBearer } from './internal-auth';

function req(header: string | null) {
  return { headers: { get: (name: string) => (name === 'Authorization' ? header : null) } };
}

describe('authorisedBearer', () => {
  const ENV = 'TEST_INTERNAL_TOKEN_XYZ';
  afterEach(() => {
    delete process.env[ENV];
  });

  it('accepts the exact secret', () => {
    process.env[ENV] = 's3cret-value';
    expect(authorisedBearer(req('Bearer s3cret-value'), ENV)).toBe(true);
  });

  it('refuses a wrong secret, including one of the same length', () => {
    process.env[ENV] = 's3cret-value';
    expect(authorisedBearer(req('Bearer s3cret-valuX'), ENV)).toBe(false);
    expect(authorisedBearer(req('Bearer short'), ENV)).toBe(false);
  });

  it('refuses a missing header or a header without the Bearer prefix', () => {
    process.env[ENV] = 's3cret-value';
    expect(authorisedBearer(req(null), ENV)).toBe(false);
    expect(authorisedBearer(req('s3cret-value'), ENV)).toBe(false);
  });

  it('refuses everything when the env var is unset or empty', () => {
    expect(authorisedBearer(req('Bearer '), ENV)).toBe(false);
    process.env[ENV] = '';
    expect(authorisedBearer(req('Bearer '), ENV)).toBe(false);
  });
});
