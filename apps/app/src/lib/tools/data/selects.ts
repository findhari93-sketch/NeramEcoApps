/**
 * Every column the public tool pages read. Personal fields (names, dates of
 * birth, application numbers, contact details) must never appear here;
 * facts.test.ts enforces it.
 */
export const SELECTS = {
  centres: 'city_brochure, state, latitude, longitude, confidence, tcs_ion_confirmed, probable_center_1, probable_center_2, is_new_2025, year, updated_at',
  allotments: 'college_code, aggregate_mark, allotted_category, year',
  rankList: 'rank, aggregate_mark, year',
  directory: 'college_code, college_name, city, district',
  keam: 'year, phase, college_code, college_name, town, district, seat_type, seats_filled, closing_rank',
  coa: 'institution_code, name, city, state, current_intake, approval_period_raw, commenced_year, affiliating_university, last_scraped_at',
  josaa: 'year, round_no, quota, seat_type, gender, closing_rank, institute_id, program_id',
  josaaInstitutes: 'id, name, short_name, institute_type, state, city',
  colleges: 'slug, name, city, city_slug, district, state_slug',
  /** Titles and topics only; the body is read for the one public sample. */
  questions: 'id, title, category, exam_year, vote_score, created_at',
  questionSample: 'id, title, body, category, exam_year',
} as const;
