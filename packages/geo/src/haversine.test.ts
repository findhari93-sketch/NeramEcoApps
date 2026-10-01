import { describe, it, expect } from 'vitest';
import { haversineKm, roundKm } from './haversine';

describe('haversineKm', () => {
  it('measures Chennai to Bangalore at about 290 km', () => {
    const km = haversineKm({ lat: 13.0827, lng: 80.2707 }, { lat: 12.9716, lng: 77.5946 });
    expect(km).toBeGreaterThan(280);
    expect(km).toBeLessThan(300);
  });

  it('is zero for the same point and symmetric', () => {
    const a = { lat: 10.79, lng: 78.7 };
    const b = { lat: 9.92, lng: 78.12 };
    expect(haversineKm(a, a)).toBe(0);
    expect(haversineKm(a, b)).toBeCloseTo(haversineKm(b, a), 9);
  });
});

describe('roundKm', () => {
  it('rounds to the nearest 5 km, or 1 km below 10 km', () => {
    expect(roundKm(52.4)).toBe(50);
    expect(roundKm(53)).toBe(55);
    expect(roundKm(7.6)).toBe(8);
    expect(roundKm(0.2)).toBe(1);
  });
});
