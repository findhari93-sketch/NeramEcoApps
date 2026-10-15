import type { CollegeContentSection } from '@/lib/college-hub/types';
import { SECTIONS } from './content-sections';

type Row = Record<string, unknown>;

/** Columns read from colleges for the sections that live on that table. */
export const COLLEGE_SECTION_COLUMNS =
  'id, name, slug, state_slug, about, highlights, phone, email, admissions_phone, admissions_email, website, youtube_channel_url, instagram_handle, ' +
  'total_barch_seats, brochure_url, admission_opens_on, admission_closes_on, accepted_exams, counseling_systems, has_management_quota, has_nri_quota, scholarships_text, ' +
  'address, pincode, latitude, longitude, nearest_railway, railway_distance_km, nearest_airport, airport_distance_km, ' +
  'hero_image_url, logo_url, gallery_images, college_provided';

function pick(source: Row | null | undefined, section: CollegeContentSection): Row {
  const def = SECTIONS.find((s) => s.key === section)!;
  const out: Row = {};
  for (const f of def.fields) out[f.key] = source?.[f.key] ?? null;
  return out;
}

/**
 * The live values of every section, to prefill the dashboard forms and to keep
 * a "before" copy on each submission. Fees come from the newest first-year
 * general fee row.
 */
export async function loadLiveSections(db: any, collegeId: string): Promise<{ college: Row; sections: Record<CollegeContentSection, Row> }> {
  const [collegeRes, feeRes, infraRes] = await Promise.all([
    db.from('colleges').select(COLLEGE_SECTION_COLUMNS).eq('id', collegeId).single(),
    db
      .from('college_fees')
      .select('academic_year, tuition, hostel, mess, other_fees, caution_deposit')
      .eq('college_id', collegeId)
      .eq('year_number', 1)
      .order('academic_year', { ascending: false })
      .limit(1),
    db.from('college_infrastructure').select('*').eq('college_id', collegeId).maybeSingle(),
  ]);
  if (collegeRes.error) throw collegeRes.error;
  const college = collegeRes.data as Row;
  const fee = ((feeRes.data ?? []) as Row[])[0] ?? null;

  return {
    college,
    sections: {
      profile: pick(college, 'profile'),
      admissions: pick(college, 'admissions'),
      location: pick(college, 'location'),
      photos: pick(college, 'photos'),
      fees: pick(fee, 'fees'),
      facilities: pick(infraRes.data as Row | null, 'facilities'),
    },
  };
}
