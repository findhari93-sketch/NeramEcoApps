import type { CollegeContentSection } from '@/lib/college-hub/types';

/** The fields that make a section count as filled in on the dashboard checklist. */
const KEY_FIELDS: Record<CollegeContentSection, string[]> = {
  profile: ['about', 'admissions_phone'],
  fees: ['tuition'],
  admissions: ['total_barch_seats', 'accepted_exams'],
  facilities: ['design_studios', 'has_hostel_boys', 'has_hostel_girls', 'hostel_capacity'],
  location: ['address', 'latitude'],
  photos: ['hero_image_url'],
};

function present(v: unknown): boolean {
  if (v === null || v === undefined || v === '') return false;
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

export function sectionFilled(section: CollegeContentSection, live: Record<string, unknown> | null | undefined): boolean {
  if (!live) return false;
  const keys = KEY_FIELDS[section];
  // Facilities: any one answer counts; the others: every key field.
  return section === 'facilities' ? keys.some((k) => present(live[k]) && live[k] !== false) : keys.every((k) => present(live[k]));
}
