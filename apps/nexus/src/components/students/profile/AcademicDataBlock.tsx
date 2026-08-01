'use client';

import { Typography } from '@neram/ui';
import { EmptyNote, Field, FieldGrid } from './FieldGrid';
import { EMPTY_SENTENCE, describeAcademicData } from '@/lib/student-profile-fields';

/**
 * The `academic_data` jsonb column, rendered for whichever of the four shapes it
 * turns out to hold.
 *
 * All the judgement lives in describeAcademicData, which never throws and falls
 * back to a raw key/value list when the payload does not match the category it
 * claims. This component only decides how to draw the result, so a bad row from
 * an older version of the apply form cannot blank the whole profile.
 */
export default function AcademicDataBlock({
  applicantCategory,
  academicData,
}: {
  applicantCategory: string | null;
  academicData: unknown;
}) {
  const view = describeAcademicData(applicantCategory, academicData);

  if (view.rows.length === 0) {
    return <EmptyNote>{EMPTY_SENTENCE.academicData}</EmptyNote>;
  }

  return (
    <>
      <FieldGrid>
        {view.rows.map((r) => (
          <Field key={r.label} label={r.label} value={r.value} />
        ))}
      </FieldGrid>
      {view.fellBack && (
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: 'block', mt: 1.5 }}
        >
          {/* Say so rather than presenting a guess as structured truth. */}
          These answers do not match the applicant category on the form, so they
          are shown as they were stored.
        </Typography>
      )}
    </>
  );
}
