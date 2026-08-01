'use client';

import { Box, Typography, useTheme } from '@neram/ui';
import { EmptyNote } from './FieldGrid';
import ProfileSection from './ProfileSection';
import { EMPTY_SENTENCE, formatDateTimeIN } from '@/lib/student-profile-fields';
import type { ProfileTimelineEvent, TimelineKind } from '@/lib/student-profile-types';

const KIND_LABEL: Record<TimelineKind, string> = {
  enrollment: 'Enrolment',
  classification: 'Classification',
  document: 'Document',
  login: 'Sign in',
  application: 'Application',
  parent_account: 'Account',
  payment: 'Payment',
};

/**
 * A merged feed of everything dated we hold about this student.
 *
 * Payment events are merged in by the page only when the finance fetch
 * succeeded, so this component needs no capability check of its own: a teacher's
 * timeline simply never contains a payment row.
 */
export default function TimelineSection({ events }: { events: ProfileTimelineEvent[] }) {
  const theme = useTheme();

  const KIND_COLOR: Record<TimelineKind, string> = {
    enrollment: theme.palette.primary.main,
    classification: theme.palette.info.main,
    document: theme.palette.secondary.main,
    login: theme.palette.success.main,
    application: theme.palette.warning.main,
    parent_account: theme.palette.info.main,
    payment: theme.palette.success.main,
  };

  return (
    <ProfileSection
      id="profile-timeline"
      title="Activity"
      headline={events.length ? `${events.length} recorded events` : 'Nothing recorded'}
    >
      {events.length === 0 ? (
        <EmptyNote>{EMPTY_SENTENCE.timeline}</EmptyNote>
      ) : (
        <Box component="ol" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 2 }}>
          {events.map((e, i) => (
            <Box
              key={`${e.at}-${i}`}
              component="li"
              sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}
            >
              <Box
                aria-hidden
                sx={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  bgcolor: KIND_COLOR[e.kind],
                  mt: 0.75,
                  flexShrink: 0,
                }}
              />
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="body2" sx={{ fontWeight: 600, wordBreak: 'break-word' }}>
                  {e.title}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {KIND_LABEL[e.kind]} . {formatDateTimeIN(e.at)}
                </Typography>
                {e.detail && (
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
                    {e.detail}
                  </Typography>
                )}
              </Box>
            </Box>
          ))}
        </Box>
      )}
    </ProfileSection>
  );
}
