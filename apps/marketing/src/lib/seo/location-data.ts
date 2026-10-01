/**
 * Loads the three small datasets every location page computes its facts from:
 * NATA test cities (~96 rows), active B.Arch colleges (~190) and classroom
 * centres (~10). Cached for a day and shared by every page, the sitemap and
 * llms.txt, so ~800 pages cost three cached queries, not 2,400.
 *
 * Keep LOCATION_REVALIDATE equal to the pages' `revalidate`: Next takes the
 * lowest value in a route, so a smaller one here would silently win.
 */
import { unstable_cache } from 'next/cache';
import { cache } from 'react';
import { createAdminClientISR } from '@neram/database';
import { getClassroomCentres } from './facts';
import type { CollegeRow, ExamCentreRow, GeoDatasets } from './location-facts';

export const LOCATION_REVALIDATE = 86400;

const readExamCentres = unstable_cache(
  async (): Promise<ExamCentreRow[]> => {
    try {
      const { data, error } = await createAdminClientISR(LOCATION_REVALIDATE)
        .from('nata_exam_centers')
        .select('city_brochure, state, latitude, longitude, confidence, tcs_ion_confirmed, year, updated_at');
      if (error) throw error;
      return (data ?? []) as unknown as ExamCentreRow[];
    } catch {
      return [];
    }
  },
  ['marketing-geo-exam-centres-v1'],
  { revalidate: LOCATION_REVALIDATE, tags: ['geo-facts'] },
);

const readColleges = unstable_cache(
  async (): Promise<CollegeRow[]> => {
    try {
      const { data, error } = await createAdminClientISR(LOCATION_REVALIDATE)
        .from('colleges')
        .select(
          'slug, name, short_name, city, city_slug, district, state_slug, type, accepted_exams, counseling_systems, nirf_rank_architecture, updated_at',
        )
        .or('is_active.is.null,is_active.eq.true');
      if (error) throw error;
      // The generated Supabase types predate colleges.city_slug (it exists in both databases).
      return (data ?? []) as unknown as CollegeRow[];
    } catch {
      return [];
    }
  },
  ['marketing-geo-colleges-v1'],
  { revalidate: LOCATION_REVALIDATE, tags: ['geo-facts'] },
);

/** All three datasets, deduplicated within one render. */
export const loadGeoDatasets = cache(async (): Promise<GeoDatasets> => {
  const [examCentres, colleges, centres] = await Promise.all([readExamCentres(), readColleges(), getClassroomCentres()]);
  return { examCentres, colleges, centres };
});
