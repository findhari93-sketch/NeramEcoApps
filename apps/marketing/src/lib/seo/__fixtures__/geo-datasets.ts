/** Small, realistic datasets for the location-page unit tests. */
import type { ClassroomCentre } from '../facts';
import type { CollegeRow, ExamCentreRow, GeoDatasets } from '../location-facts';

export const examRow = (city_brochure: string, state: string, lat: number, lng: number, confidence = 'HIGH'): ExamCentreRow => ({
  city_brochure,
  state,
  latitude: lat,
  longitude: lng,
  confidence,
  tcs_ion_confirmed: confidence === 'HIGH',
  year: 2025,
  updated_at: '2026-03-05T00:00:00Z',
});

export const collegeRow = (over: Partial<CollegeRow>): CollegeRow => ({
  slug: 'x',
  name: 'X School of Architecture',
  short_name: null,
  city: null,
  city_slug: null,
  district: null,
  state_slug: 'tamil-nadu',
  type: 'private',
  accepted_exams: ['NATA'],
  counseling_systems: ['TNEA'],
  nirf_rank_architecture: null,
  updated_at: '2026-05-01T00:00:00Z',
  ...over,
});

export const centreRow = (over: Partial<ClassroomCentre>): ClassroomCentre => ({
  slug: 'chennai',
  seoSlug: 'nata-coaching-center-in-chennai',
  name: 'Neram Chennai',
  city: 'Chennai',
  citySlug: 'chennai',
  areaLabel: 'Chennai',
  state: 'Tamil Nadu',
  pincode: '600078',
  lat: 13.0382,
  lng: 80.212,
  isHeadquarters: false,
  updatedAt: '2026-06-01T00:00:00Z',
  ...over,
});

export const FIXTURE_DATASETS: GeoDatasets = {
  examCentres: [
    examRow('Chennai', 'Tamil Nadu', 13.0827, 80.2707),
    examRow('Kottayam / Thrissur', 'Kerala', 10.0159, 76.3419, 'LOW'),
    examRow('Dubai (UAE)', 'International', 25.2048, 55.2708, 'LOW'),
    examRow('Jaipur', 'Rajasthan', 26.9124, 75.7873),
  ],
  colleges: [
    collegeRow({ slug: 'anna', name: 'Anna University SAP', city_slug: 'chennai', district: 'chennai', nirf_rank_architecture: 5 }),
    collegeRow({ slug: 'mys', name: 'Mysuru College', city_slug: 'mysuru', state_slug: 'karnataka', accepted_exams: ['NATA', 'KCET'] }),
    collegeRow({ slug: 'nitp', name: 'NIT Patna', city_slug: 'patna', state_slug: 'bihar', accepted_exams: ['JEE Main'], counseling_systems: null }),
    collegeRow({ slug: 'iitr', name: 'IIT Roorkee', city_slug: 'roorkee', state_slug: 'uttarakhand', accepted_exams: ['JEE Advanced', 'AAT'] }),
  ],
  centres: [
    centreRow({}),
    centreRow({
      slug: 'bangalore-hq',
      seoSlug: 'nata-coaching-center-in-bangalore',
      name: 'Neram HQ',
      city: 'Bangalore',
      citySlug: 'bangalore',
      areaLabel: 'Electronic City, Bangalore',
      state: 'Karnataka',
      lat: 12.8456,
      lng: 77.6603,
      isHeadquarters: true,
    }),
  ],
};
