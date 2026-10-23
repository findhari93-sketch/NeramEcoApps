import { describe, it, expect } from 'vitest';
import { adminOriginFor } from './admin-origin';

describe('adminOriginFor', () => {
  it('pairs each app host with its admin', () => {
    expect(adminOriginFor('app.neramclasses.com')).toBe('https://admin.neramclasses.com');
    expect(adminOriginFor('staging-app.neramclasses.com')).toBe('https://staging-admin.neramclasses.com');
    expect(adminOriginFor('localhost:3011')).toBe('http://localhost:3013');
  });

  it('lets the environment decide when set', () => {
    expect(adminOriginFor('app.neramclasses.com', 'https://admin.example.com/')).toBe('https://admin.example.com');
  });
});
