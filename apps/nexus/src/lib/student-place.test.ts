import { describe, it, expect } from 'vitest';
import { titleCasePlace, pickPlaceRow, pickStudentPlace, placeLabel } from './student-place';

describe('titleCasePlace', () => {
  it('matches the SQL INITCAP output', () => {
    expect(titleCasePlace('tamil nadu')).toBe('Tamil Nadu');
    expect(titleCasePlace('CHENNAI')).toBe('Chennai');
    expect(titleCasePlace('  new   delhi  ')).toBe('New Delhi');
  });

  it('treats an empty or missing value as no place', () => {
    expect(titleCasePlace('')).toBeNull();
    expect(titleCasePlace('   ')).toBeNull();
    expect(titleCasePlace(null)).toBeNull();
    expect(titleCasePlace(undefined)).toBeNull();
  });
});

describe('pickStudentPlace', () => {
  it('returns nothing when there are no rows', () => {
    expect(pickStudentPlace([])).toBeNull();
    expect(pickStudentPlace(null)).toBeNull();
    expect(pickStudentPlace(undefined)).toBeNull();
  });

  it('returns nothing when no row names a city', () => {
    expect(
      pickStudentPlace([
        { city: null, state: 'Tamil Nadu', created_at: '2026-08-01T00:00:00Z' },
        { city: '   ', state: 'Kerala', created_at: '2026-09-01T00:00:00Z' },
      ]),
    ).toBeNull();
  });

  it('keeps the newest row that names a city, not the first', () => {
    expect(
      pickStudentPlace([
        { city: 'madurai', state: 'tamil nadu', created_at: '2026-03-01T00:00:00Z' },
        { city: 'chennai', state: 'tamil nadu', created_at: '2026-09-01T00:00:00Z' },
      ]),
    ).toEqual({ city: 'Chennai', state: 'Tamil Nadu' });
  });

  it('skips a newer row that names no city', () => {
    expect(
      pickStudentPlace([
        { city: 'coimbatore', state: 'tamil nadu', created_at: '2026-03-01T00:00:00Z' },
        { city: '', state: 'kerala', created_at: '2026-09-01T00:00:00Z' },
      ]),
    ).toEqual({ city: 'Coimbatore', state: 'Tamil Nadu' });
  });

  it('still picks a row whose created_at is missing or unreadable', () => {
    expect(pickStudentPlace([{ city: 'salem', state: null, created_at: 'not a date' }])).toEqual({
      city: 'Salem',
      state: null,
    });
    expect(pickStudentPlace([{ city: 'erode' }])).toEqual({ city: 'Erode', state: null });
  });

  it('prefers a dated row over an undated one', () => {
    expect(
      pickStudentPlace([
        { city: 'trichy', state: 'tamil nadu' },
        { city: 'chennai', state: 'tamil nadu', created_at: '2026-01-01T00:00:00Z' },
      ]),
    ).toEqual({ city: 'Chennai', state: 'Tamil Nadu' });
  });
});

describe('pickPlaceRow', () => {
  it('hands back the whole winning row, so district and country come from the same one', () => {
    const rows = [
      { user_id: 'u1', city: 'madurai', state: 'tamil nadu', district: 'madurai', country: 'IN', created_at: '2026-03-01T00:00:00Z' },
      { user_id: 'u1', city: 'chennai', state: 'tamil nadu', district: 'tiruvallur', country: 'IN', created_at: '2026-09-01T00:00:00Z' },
    ];
    expect(pickPlaceRow(rows)).toBe(rows[1]);
  });

  it('agrees with pickStudentPlace about which row wins', () => {
    const rows = [
      { city: 'salem', state: 'tamil nadu', created_at: '2026-01-01T00:00:00Z' },
      { city: 'erode', state: 'tamil nadu', created_at: '2026-06-01T00:00:00Z' },
    ];
    expect(pickPlaceRow(rows)?.city).toBe('erode');
    expect(pickStudentPlace(rows)?.city).toBe('Erode');
  });

  it('returns nothing when no row names a city', () => {
    expect(pickPlaceRow([{ city: null, created_at: '2026-01-01T00:00:00Z' }])).toBeNull();
  });
});

describe('placeLabel', () => {
  it('reads city then state', () => {
    expect(placeLabel({ city: 'Chennai', state: 'Tamil Nadu' })).toBe('Chennai, Tamil Nadu');
  });

  it('drops a state that only repeats the city', () => {
    expect(placeLabel({ city: 'Delhi', state: 'Delhi' })).toBe('Delhi');
    expect(placeLabel({ city: 'Delhi', state: 'delhi' })).toBe('Delhi');
  });

  it('shows the city alone when there is no state', () => {
    expect(placeLabel({ city: 'Dubai', state: null })).toBe('Dubai');
  });

  it('says nothing without a place', () => {
    expect(placeLabel(null)).toBeNull();
    expect(placeLabel(undefined)).toBeNull();
  });
});
