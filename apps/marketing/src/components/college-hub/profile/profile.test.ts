import { describe, expect, it, vi } from 'vitest';

vi.mock('next/image', () => ({ default: () => null }));
vi.mock('@neram/auth', () => ({ useFirebaseAuth: () => ({ user: null }), getFirebaseAuth: () => ({}) }));

import { profileKpis } from './ProfileHero';
import { admissionSteps } from './AdmissionPath';
import { feePosition } from './FeesPanel';
import { directionsUrl, fullAddress } from './LocationContact';
import { isCollegeProfileRoute, isHubRoute } from '../hub-routes';
import type { CollegeDetail } from '@/lib/college-hub/types';

function college(over: Partial<CollegeDetail>): CollegeDetail {
  return {
    id: 'x',
    slug: 'msec',
    name: 'Mohamed Sathak Engineering College',
    short_name: 'MSEC',
    city: 'Kilakarai',
    district: 'Ramanathapuram',
    state: 'Tamil Nadu',
    state_slug: 'tamil-nadu',
    address: null,
    pincode: null,
    type: 'private',
    annual_fee_approx: null,
    annual_fee_min: null,
    total_barch_seats: null,
    accepted_exams: ['NATA', 'JEE Main'],
    counseling_systems: ['TNEA'],
    nirf_rank_architecture: null,
    established_year: null,
    latitude: null,
    longitude: null,
    fees: [],
    cutoffs: [],
    placements: [],
    faculty: [],
    infrastructure: null,
    ...over,
  } as unknown as CollegeDetail;
}

describe('profileKpis', () => {
  it('leads with the fee and adds the 5-year estimate', () => {
    const k = profileKpis(college({ annual_fee_approx: 50000, total_barch_seats: 40, established_year: 1993 }));
    expect(k.map((x) => x.label)).toEqual(['Annual fee', '5-year fee', 'B.Arch seats', 'Admission via', 'Entrance exam', 'Established']);
    expect(k[0]).toMatchObject({ value: '₹50,000', note: 'Approx. tuition' });
    expect(k[1].value).toBe('₹2.5L');
    expect(k.find((x) => x.label === 'Entrance exam')).toMatchObject({ value: 'NATA · JEE P2', note: 'Either one' });
  });

  it('says why a value is missing and skips the estimate for a starting fee', () => {
    const k = profileKpis(college({}));
    expect(k[0]).toMatchObject({ value: 'Not published', muted: true });
    expect(k.find((x) => x.label === '5-year fee')).toBeUndefined();
    const from = profileKpis(college({ annual_fee_min: 80000 }));
    expect(from[0].note).toBe('Starting from');
    expect(from.find((x) => x.label === '5-year fee')).toBeUndefined();
    expect(JSON.stringify(k)).not.toMatch(/N\/A|—/);
  });

  it('prefers the NIRF rank over the founding year', () => {
    const k = profileKpis(college({ nirf_rank_architecture: 7, established_year: 1950 }));
    expect(k.at(-1)).toMatchObject({ label: 'NIRF rank', value: '#7' });
  });
});

describe('admissionSteps', () => {
  it('walks through counselling when the college has it', () => {
    const s = admissionSteps(college({}));
    expect(s.map((x) => x.title)).toEqual(['Take an entrance exam', 'Register for TNEA', 'Choose MSEC', 'Confirm your seat']);
    expect(s[0].detail).toBe('Score in NATA or JEE Main Paper 2. Either one counts.');
  });

  it('finds counselling stored as an exam (TNEA in accepted_exams)', () => {
    const s = admissionSteps(college({ counseling_systems: [], accepted_exams: ['NATA', 'TNEA'] }));
    expect(s[1].title).toBe('Register for TNEA');
    expect(profileKpis(college({ counseling_systems: [], accepted_exams: ['NATA', 'TNEA'] })).find((k) => k.label === 'Admission via')?.value).toBe('TNEA');
  });

  it('says to check with the college when nothing is known', () => {
    expect(profileKpis(college({ counseling_systems: [], accepted_exams: ['NATA'] })).find((k) => k.label === 'Admission via')).toMatchObject({ value: 'Check with college', muted: true });
  });

  it('falls back to direct admission', () => {
    const s = admissionSteps(college({ counseling_systems: [], accepted_exams: ['NATA'] }));
    expect(s[1].title).toBe('Apply to the college');
    expect(s[0].detail).toBe('Score in NATA.');
  });
});

describe('feePosition', () => {
  const sim = [{ annual_fee_approx: 50000 }, { annual_fee_approx: 56000 }, { annual_fee_approx: null, annual_fee_min: null }] as never[];
  it('places the fee on the range of similar colleges', () => {
    expect(feePosition(50000, sim)).toMatchObject({ low: 50000, high: 56000, at: 0, where: 'low' });
    expect(feePosition(56000, sim)?.where).toBe('high');
    expect(feePosition(53000, sim)?.where).toBe('middle');
    expect(feePosition(40000, sim)?.where).toBe('below');
  });
  it('needs a fee and two other fees', () => {
    expect(feePosition(null, sim)).toBeNull();
    expect(feePosition(50000, sim.slice(0, 1))).toBeNull();
  });
});

describe('location helpers', () => {
  it('builds the address without repeating the city', () => {
    expect(fullAddress(college({ address: 'Sathak Nagar, East Coast Road, Kilakarai', pincode: '623806' }))).toBe(
      'Sathak Nagar, East Coast Road, Kilakarai, Ramanathapuram District, Tamil Nadu 623806'
    );
  });
  it('uses coordinates for directions when known', () => {
    expect(directionsUrl(college({ latitude: 9.23, longitude: 78.78 }))).toContain('query=9.23,78.78');
    expect(directionsUrl(college({}))).toContain(encodeURIComponent('Mohamed Sathak Engineering College, Kilakarai'));
  });
});

describe('hub routes', () => {
  it('tells a college page from the hub pages', () => {
    expect(isCollegeProfileRoute('/colleges/tamil-nadu/msec')).toBe(true);
    expect(isCollegeProfileRoute('/ta/colleges/tamil-nadu/msec')).toBe(true);
    expect(isCollegeProfileRoute('/colleges/city/chennai')).toBe(false);
    expect(isCollegeProfileRoute('/colleges/rankings/nirf')).toBe(false);
    expect(isCollegeProfileRoute('/colleges/tamil-nadu')).toBe(false);
    expect(isHubRoute('/colleges')).toBe(true);
    expect(isHubRoute('/about')).toBe(false);
  });
});
