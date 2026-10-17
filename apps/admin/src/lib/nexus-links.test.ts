// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { nexusOriginFor, PROD_NEXUS_ORIGIN } from './nexus-links';

describe('nexusOriginFor', () => {
  it('uses the configured NEXT_PUBLIC_NEXUS_URL first, without a trailing slash', () => {
    expect(nexusOriginFor('https://admin.neramclasses.com', 'https://nexus.example.com/')).toBe('https://nexus.example.com');
    expect(nexusOriginFor(null, ' http://localhost:4000 ')).toBe('http://localhost:4000');
  });

  it('pairs production admin with production nexus', () => {
    expect(nexusOriginFor('https://admin.neramclasses.com')).toBe('https://nexus.neramclasses.com');
  });

  it('pairs staging admin with staging nexus', () => {
    expect(nexusOriginFor('https://staging-admin.neramclasses.com')).toBe('https://staging-nexus.neramclasses.com');
  });

  it('uses port 3012 on a laptop', () => {
    expect(nexusOriginFor('http://localhost:3013')).toBe('http://localhost:3012');
    expect(nexusOriginFor('http://127.0.0.1:3013/crm/x')).toBe('http://127.0.0.1:3012');
  });

  it('falls back to production for a preview host, a blank configured value or garbage', () => {
    expect(nexusOriginFor('https://neram-admin-new-abc123.vercel.app')).toBe(PROD_NEXUS_ORIGIN);
    expect(nexusOriginFor('not a url', '   ')).toBe(PROD_NEXUS_ORIGIN);
    expect(nexusOriginFor(undefined)).toBe(PROD_NEXUS_ORIGIN);
  });
});
