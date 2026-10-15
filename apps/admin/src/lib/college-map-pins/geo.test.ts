// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { geocodeQueries, googleMapsUrl, isValidLatLng, parseLatLng, stateMatches } from './geo';

describe('parseLatLng', () => {
  it('reads coordinates pasted from Google Maps', () => {
    expect(parseLatLng('9.925201, 78.119775')).toEqual({ lat: 9.925201, lng: 78.119775 });
    expect(parseLatLng('(13.0827, 80.2707)')).toEqual({ lat: 13.0827, lng: 80.2707 });
    expect(parseLatLng('13.0827 80.2707')).toEqual({ lat: 13.0827, lng: 80.2707 });
  });

  it('reads a Google Maps link', () => {
    expect(parseLatLng('https://www.google.com/maps/@9.9252,78.1198,15z')).toEqual({ lat: 9.9252, lng: 78.1198 });
    expect(parseLatLng('https://maps.google.com/?q=9.9,78.1')).toEqual({ lat: 9.9, lng: 78.1 });
  });

  it('refuses junk and out-of-range values', () => {
    expect(parseLatLng('')).toBeNull();
    expect(parseLatLng('Madurai')).toBeNull();
    expect(parseLatLng('91, 78')).toBeNull();
    expect(parseLatLng('9, 181')).toBeNull();
  });
});

describe('isValidLatLng', () => {
  it('checks ranges and types', () => {
    expect(isValidLatLng(9.9, 78.1)).toBe(true);
    expect(isValidLatLng('9.9', 78.1)).toBe(false);
    expect(isValidLatLng(NaN, 78.1)).toBe(false);
  });
});

describe('stateMatches', () => {
  it('matches case-insensitively either way round', () => {
    expect(stateMatches('Tamil Nadu', 'tamil nadu')).toBe(true);
    expect(stateMatches('NCT of Delhi', 'Delhi')).toBe(true);
    expect(stateMatches('Jammu and Kashmir', 'Jammu & Kashmir')).toBe(true);
  });

  it('refuses a different or missing state', () => {
    expect(stateMatches('Kerala', 'Tamil Nadu')).toBe(false);
    expect(stateMatches(undefined, 'Tamil Nadu')).toBe(false);
    expect(stateMatches('Kerala', null)).toBe(false);
  });
});

describe('geocodeQueries', () => {
  it('tries name, city, state then name, state', () => {
    expect(geocodeQueries({ name: 'Papni School of Architecture', city: 'Madurai', state: 'Tamil Nadu' })).toEqual([
      'Papni School of Architecture, Madurai, Tamil Nadu',
      'Papni School of Architecture, Tamil Nadu',
    ]);
    expect(geocodeQueries({ name: 'X', city: null, state: 'Kerala' })).toEqual(['X, Kerala']);
  });
});

describe('googleMapsUrl', () => {
  it('builds a search link at the coordinates', () => {
    expect(googleMapsUrl(9.9, 78.1)).toBe('https://www.google.com/maps/search/?api=1&query=9.9%2C78.1');
  });
});
