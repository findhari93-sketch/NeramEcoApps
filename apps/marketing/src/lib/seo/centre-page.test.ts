import { describe, it, expect } from 'vitest';
import { fullAddressLine, googleRatingLine, mapEmbedUrl, streetOnly } from './centre-page';

const madurai = {
  name: 'Neram Classes - NATA Coaching Madurai',
  address: '2/401, IInd Floor, Vasanth Nagar, Palangantham',
  city: 'Madurai',
  state: 'Tamil Nadu',
  pincode: '625003',
  lat: 9.9252,
  lng: 78.1198,
};

describe('centre page helpers', () => {
  it('streetOnly drops a bare city and a repeated trailing city', () => {
    expect(streetOnly('Kanchipuram', 'Kanchipuram')).toBeNull();
    expect(streetOnly('1595, North 2nd Street, Pudukkottai', 'Pudukkottai')).toBe('1595, North 2nd Street');
    expect(streetOnly(null, 'X')).toBeNull();
  });

  it('builds the full address line', () => {
    expect(fullAddressLine(madurai)).toBe('2/401, IInd Floor, Vasanth Nagar, Palangantham, Madurai, Tamil Nadu 625003');
    expect(fullAddressLine({ ...madurai, address: 'Madurai', pincode: null })).toBe('Madurai, Tamil Nadu');
  });

  it('embeds the map by business name and address, else by coordinates', () => {
    const url = mapEmbedUrl(madurai);
    expect(url).toMatch(/^https:\/\/maps\.google\.com\/maps\?q=/);
    expect(url).toContain('output=embed');
    expect(decodeURIComponent(url)).toContain('Neram Classes - NATA Coaching Madurai, 2/401');
    expect(decodeURIComponent(mapEmbedUrl({ ...madurai, address: 'Madurai' }))).toContain('q=9.9252,78.1198');
  });

  it('shows a fresh Google rating and hides a stale or missing one', () => {
    const rating = { value: 4.7, count: 37, checkedAt: '2026-10-03', url: null };
    expect(googleRatingLine(rating, new Date('2026-10-10T12:00:00+05:30'))).toBe('Rated 4.7 on Google by 37 students (checked 3 Oct 2026)');
    expect(googleRatingLine(rating, new Date('2027-01-05T12:00:00+05:30'))).toBeNull();
    expect(googleRatingLine({ ...rating, count: 1 }, new Date('2026-10-04T12:00:00+05:30'))).toContain('by 1 student ');
    expect(googleRatingLine(null)).toBeNull();
    expect(googleRatingLine({ ...rating, checkedAt: 'bad' })).toBeNull();
  });
});
