import { describe, it, expect } from 'vitest';
import { parseCoordinates, mapEmbedUrl } from './map';

describe('parseCoordinates', () => {
  it('reads plain "lat, lng" text', () => {
    expect(parseCoordinates('12.8342, 79.7036')).toEqual({ lat: 12.8342, lng: 79.7036 });
    expect(parseCoordinates('12.8342 79.7036')).toEqual({ lat: 12.8342, lng: 79.7036 });
  });

  it('reads Google Maps links', () => {
    expect(parseCoordinates('https://www.google.com/maps/place/Papni/@12.8342123,79.7036456,17z/data=x')).toEqual({ lat: 12.834212, lng: 79.703646 });
    expect(parseCoordinates('https://maps.google.com/?q=12.83,79.70')).toEqual({ lat: 12.83, lng: 79.7 });
    expect(parseCoordinates('https://www.google.com/maps/place/X/data=!3m1!4b1!4m6!3m5!1s0x0!8m2!3d12.8342!4d79.7036')).toEqual({ lat: 12.8342, lng: 79.7036 });
  });

  it('reads OpenStreetMap links', () => {
    expect(parseCoordinates('https://www.openstreetmap.org/#map=17/12.8342/79.7036')).toEqual({ lat: 12.8342, lng: 79.7036 });
    expect(parseCoordinates('https://www.openstreetmap.org/?mlat=12.8342&mlon=79.7036')).toEqual({ lat: 12.8342, lng: 79.7036 });
  });

  it('rejects text without usable coordinates', () => {
    expect(parseCoordinates('')).toBeNull();
    expect(parseCoordinates('Kancheepuram')).toBeNull();
    expect(parseCoordinates('95, 80')).toBeNull();
    expect(parseCoordinates('0, 0')).toBeNull();
  });
});

describe('mapEmbedUrl', () => {
  it('points the embed at the coordinates', () => {
    expect(mapEmbedUrl({ lat: 12.8, lng: 79.7 })).toBe('https://maps.google.com/maps?q=12.8,79.7&z=15&output=embed');
  });
});
