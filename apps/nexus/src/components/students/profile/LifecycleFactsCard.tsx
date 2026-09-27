'use client';

/**
 * Where this student is, in four lines: lifecycle stage (with what it means),
 * engagement, when they last did something that counts, and what they are
 * preparing for. Plus a notice when the student may have two records.
 *
 * Read-only signals from the shared lifecycle model (user_lifecycle_view). None
 * of it changes access, and the card says nothing it cannot back with a fact.
 *
 * Every status is text plus an icon, never colour alone. Loading is a skeleton
 * of the same height so the sections below do not jump.
 */

import {
  Alert,
  Box,
  Button,
  Link,
  Paper,
  Skeleton,
  Typography,
} from '@neram/ui';
import FlagOutlinedIcon from '@mui/icons-material/FlagOutlined';
import BoltOutlinedIcon from '@mui/icons-material/BoltOutlined';
import ScheduleOutlinedIcon from '@mui/icons-material/ScheduleOutlined';
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined';
import PlaylistAddCheckOutlinedIcon from '@mui/icons-material/PlaylistAddCheckOutlined';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import {
  ACTIVITY_SOURCE_LABELS,
  ENGAGEMENT_LABELS,
  LIFECYCLE_STAGE_LABELS,
  LIFECYCLE_STAGE_MEANINGS,
  profileCompleteness,
} from '@neram/database';
import type { ReactNode } from 'react';
import { formatDateTimeIN } from '@/lib/student-profile-fields';
import { formatTargetExams, relativeTime, type StudentLifecyclePayload } from '@/lib/lifecycle-display';

export interface LifecycleFactsCardProps {
  facts: StudentLifecyclePayload | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  /** Admin Duplicates link for this student. */
  duplicatesHref: string;
}

export default function LifecycleFactsCard({ facts, loading, error, onRetry, duplicatesHref }: LifecycleFactsCardProps) {
  return (
    <Paper
      variant="outlined"
      component="section"
      aria-labelledby="lifecycle-facts-title"
      sx={{ p: { xs: 2, md: 2.5 }, mb: 2, borderRadius: 2 }}
    >
      <Typography id="lifecycle-facts-title" component="h2" sx={{ fontWeight: 700, fontSize: '1rem', mb: 1.5 }}>
        Where this student is
      </Typography>

      {loading && !facts ? (
        <Box aria-busy="true" aria-label="Loading lifecycle facts" sx={{ display: 'grid', gap: 1.5, '@media (prefers-reduced-motion: reduce)': { '& .MuiSkeleton-root': { animation: 'none' } } }}>
          {[0, 1, 2].map((i) => (
            <Box key={i} sx={{ display: 'flex', gap: 1.5 }}>
              <Skeleton variant="circular" width={24} height={24} />
              <Box sx={{ flex: 1 }}>
                <Skeleton width="45%" />
                <Skeleton width="80%" />
              </Box>
            </Box>
          ))}
        </Box>
      ) : error && !facts ? (
        <Alert
          severity="warning"
          action={
            <Button color="inherit" onClick={onRetry} sx={{ minHeight: 44 }}>
              Try again
            </Button>
          }
        >
          {error}
        </Alert>
      ) : facts ? (
        <Facts facts={facts} duplicatesHref={duplicatesHref} />
      ) : null}
    </Paper>
  );
}

function Facts({ facts, duplicatesHref }: { facts: StudentLifecyclePayload; duplicatesHref: string }) {
  const stage = facts.lifecycle_stage as keyof typeof LIFECYCLE_STAGE_LABELS | null;
  const stageLabel = stage ? LIFECYCLE_STAGE_LABELS[stage] ?? stage : 'Not worked out yet';
  const stageMeaning = stage ? LIFECYCLE_STAGE_MEANINGS[stage] ?? null : 'The lifecycle model has not run for this student.';

  const engagement = facts.engagement as keyof typeof ENGAGEMENT_LABELS | null;
  const engagementLabel = engagement ? ENGAGEMENT_LABELS[engagement] ?? engagement : 'Not measured yet';

  const source = facts.last_meaningful_activity_source;
  const sourceLabel = source ? ACTIVITY_SOURCE_LABELS[source] ?? source.replace(/_/g, ' ') : null;
  const lastAt = facts.last_meaningful_activity_at;

  const exams = formatTargetExams(facts.target_exams);
  const preparing = [exams, facts.target_year ? `for ${facts.target_year}` : null].filter(Boolean).join(' ');

  const completeness = profileCompleteness(facts.profile_missing);

  return (
    <Box sx={{ display: 'grid', gap: 1.75 }}>
      <FactRow icon={<FlagOutlinedIcon fontSize="small" />} label="Stage" value={stageLabel} helper={stageMeaning} />
      <FactRow icon={<BoltOutlinedIcon fontSize="small" />} label="Engagement" value={engagementLabel} />
      <FactRow
        icon={<ScheduleOutlinedIcon fontSize="small" />}
        label="Last active"
        value={
          lastAt ? (
            <>
              <Box component="time" dateTime={lastAt} title={formatDateTimeIN(lastAt)}>
                {relativeTime(lastAt)}
              </Box>
              {sourceLabel ? `, ${sourceLabel.charAt(0).toLowerCase()}${sourceLabel.slice(1)}` : ''}
            </>
          ) : (
            'No activity recorded yet'
          )
        }
      />
      {preparing && <FactRow icon={<SchoolOutlinedIcon fontSize="small" />} label="Preparing for" value={preparing} />}
      {completeness.items.length > 0 && (
        <FactRow
          icon={<PlaylistAddCheckOutlinedIcon fontSize="small" />}
          label={`Profile ${completeness.percent}% complete`}
          value={`Missing: ${completeness.items.join(', ')}`}
        />
      )}

      {facts.openDuplicates > 0 && (
        <Alert severity="info" variant="outlined" sx={{ '& .MuiAlert-message': { minWidth: 0 } }}>
          <Typography variant="body2" sx={{ mb: 0.5 }}>
            This student may have two records. An admin can review it in Admin, Duplicates.
          </Typography>
          <Link
            href={duplicatesHref}
            target="_blank"
            rel="noopener noreferrer"
            underline="always"
            sx={{
              // Anchors the sr-only span, so it cannot escape into the page.
              position: 'relative',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 0.5,
              minHeight: 44,
              fontWeight: 600,
              '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2, borderRadius: 0.5 },
            }}
          >
            Open Duplicates in Admin
            <OpenInNewIcon sx={{ fontSize: 16 }} aria-hidden />
            <Box component="span" sx={visuallyHidden}>
              (opens in a new tab)
            </Box>
          </Link>
        </Alert>
      )}
    </Box>
  );
}

const visuallyHidden = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  padding: 0,
  margin: '-1px',
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: 0,
} as const;

function FactRow({
  icon,
  label,
  value,
  helper,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  helper?: string | null;
}) {
  return (
    <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start', minWidth: 0, position: 'relative' }}>
      <Box aria-hidden sx={{ color: 'text.secondary', mt: '2px', display: 'flex', flexShrink: 0 }}>
        {icon}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="caption" color="text.secondary" component="div" sx={{ fontWeight: 600, letterSpacing: 0.2 }}>
          {label}
        </Typography>
        <Typography variant="body2" component="div" sx={{ fontWeight: 600, wordBreak: 'break-word' }}>
          {value}
        </Typography>
        {helper && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
            {helper}
          </Typography>
        )}
      </Box>
    </Box>
  );
}
