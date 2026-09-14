'use client';

import { Box, Typography } from '@neram/ui';
import LoginOutlinedIcon from '@mui/icons-material/LoginOutlined';
import NoPhotographyOutlinedIcon from '@mui/icons-material/NoPhotographyOutlined';
import { EmptyNote } from './FieldGrid';
import ProfileSection from './ProfileSection';
import { signInOutcomeLabel } from '@/lib/not-started';
import { formatDateIN, formatDateTimeIN } from '@/lib/student-profile-fields';
import type { ProfileSignIn, ProfileStudent } from '@/lib/student-profile-types';

/**
 * Every time this student opened Nexus, and whether they got in.
 *
 * The question a teacher brings here is about a quiet student: did they never
 * try, or did they try and stop at the photo step? The two need different
 * follow-ups (a nudge versus help with a photo), and nothing else on the profile
 * can tell them apart. One row per 30 minutes of app use, newest first.
 */
export default function SignInHistorySection({
  student,
  signIns,
}: {
  student: Pick<ProfileStudent, 'nexus_entered_at' | 'nexus_first_login_at'>;
  signIns: ProfileSignIn[];
}) {
  const stopped = signIns.filter((s) => s.outcome === 'photo_step').length;

  const headline = student.nexus_entered_at
    ? `First entered Nexus ${formatDateIN(student.nexus_entered_at)}`
    : stopped > 0
      ? `Has not entered Nexus. Stopped at the photo step ${stopped === 1 ? 'once' : `${stopped} times`}`
      : 'Has not entered Nexus yet';

  return (
    <ProfileSection id="profile-sign-ins" title="Sign-in history" headline={headline}>
      {signIns.length === 0 ? (
        <EmptyNote>
          {student.nexus_first_login_at
            ? 'No recent sign-ins recorded. Nexus started keeping this history in September 2026, so earlier visits are not listed.'
            : 'This student has never opened Nexus.'}
        </EmptyNote>
      ) : (
        <Box component="ol" aria-label="Sign-ins, newest first" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 1.5 }}>
          {signIns.map((s, i) => {
            const stoppedHere = s.outcome === 'photo_step';
            const Icon = stoppedHere ? NoPhotographyOutlinedIcon : LoginOutlinedIcon;
            return (
              <Box
                key={`${s.at}-${i}`}
                component="li"
                sx={{ display: 'flex', gap: 1.25, alignItems: 'flex-start', minWidth: 0 }}
              >
                <Icon
                  aria-hidden
                  sx={{ fontSize: 20, mt: 0.25, flexShrink: 0, color: stoppedHere ? 'warning.dark' : 'success.dark' }}
                />
                <Box sx={{ minWidth: 0 }}>
                  <Typography
                    variant="body2"
                    sx={{ fontWeight: 700, color: stoppedHere ? 'warning.dark' : 'text.primary' }}
                  >
                    {signInOutcomeLabel(s.outcome)}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {formatDateTimeIN(s.at)}
                    {s.device ? ` · ${s.device}` : ''}
                  </Typography>
                </Box>
              </Box>
            );
          })}
        </Box>
      )}
    </ProfileSection>
  );
}
