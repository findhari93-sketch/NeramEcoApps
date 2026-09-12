import { describe, it, expect } from 'vitest';
import { PROD_ADMIN_ORIGIN, adminCrmUrl, adminOriginFor } from './admin-links';

describe('adminOriginFor', () => {
  it('pairs each Nexus host with its Admin twin', () => {
    expect(adminOriginFor('https://nexus.neramclasses.com')).toBe('https://admin.neramclasses.com');
    expect(adminOriginFor('https://staging-nexus.neramclasses.com')).toBe(
      'https://staging-admin.neramclasses.com',
    );
    expect(adminOriginFor('http://localhost:3012')).toBe('http://localhost:3013');
  });

  it('prefers a configured address and trims its trailing slash', () => {
    expect(adminOriginFor('https://nexus.neramclasses.com', 'https://admin.example.com/')).toBe(
      'https://admin.example.com',
    );
  });

  it('falls back to production for anything it cannot pair', () => {
    expect(adminOriginFor('https://neram-nexus-abc.vercel.app')).toBe(PROD_ADMIN_ORIGIN);
    expect(adminOriginFor('not a url')).toBe(PROD_ADMIN_ORIGIN);
    expect(adminOriginFor(null)).toBe(PROD_ADMIN_ORIGIN);
  });
});

describe('adminCrmUrl', () => {
  it('opens the student page, scrolled to a section when asked', () => {
    expect(adminCrmUrl('u-1', { nexusOrigin: 'https://nexus.neramclasses.com' })).toBe(
      'https://admin.neramclasses.com/crm/u-1',
    );
    expect(
      adminCrmUrl('u-1', { nexusOrigin: 'http://localhost:3012', section: 'application' }),
    ).toBe('http://localhost:3013/crm/u-1?section=application');
  });
});
