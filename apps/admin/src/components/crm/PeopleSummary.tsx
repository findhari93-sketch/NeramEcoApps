'use client';

/**
 * The top of the admin People page in two compact rows:
 *   1. which exam season, and how many people told us their exam year
 *   2. one strip: where they are in the journey, then how active they are
 * Every segment is a filter button; the numbers come from summarisePeople()
 * over one grouped query, so they are exact and add up to what the table shows
 * after a click.
 */

import { Box, Typography, Skeleton, Tooltip, alpha } from '@neram/ui';
import type { Theme } from '@mui/material/styles';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import { ACTIVITY_GROUPS, LIFECYCLE_STAGE_MEANINGS, PEOPLE_STAGE_LABELS } from '@neram/database';
import type { ActivityGroup, LifecycleStage } from '@neram/database';
import {
  ACTIVITY_ORDER,
  STAGE_ORDER,
  formatCount,
  type PeopleSummary as Summary,
  type PeopleView,
  type Season,
} from '@/lib/people-summary';

/** Short strip labels; the full name and meaning are in the tooltip. */
const STAGE_SHORT: Record<LifecycleStage, string> = {
  prospect: 'Signed up',
  lead: 'Shared phone',
  applicant: 'Applied',
  enrolled: 'Enrolled',
  active_student: 'Studying',
  paused: 'Paused',
  alumni: 'Alumni',
  archived: 'Archived',
};

const ACTIVITY_SHORT: Record<ActivityGroup, string> = {
  recent: 'Active',
  quiet: 'Quiet',
  gone: 'No activity',
};

/** Palette keys from the @neram/ui theme; no new colours. */
const ACTIVITY_TONE: Record<ActivityGroup, 'success' | 'warning' | 'secondary'> = {
  recent: 'success',
  quiet: 'warning',
  gone: 'secondary',
};

/** The six journey stages always show in Current; Alumni and Archived only when present. */
const ALWAYS_SHOWN: LifecycleStage[] = ['prospect', 'lead', 'applicant', 'enrolled', 'active_student', 'paused'];

const toneColor = (theme: Theme, tone: 'success' | 'warning' | 'secondary' | 'primary') =>
  tone === 'secondary' ? theme.palette.text.secondary : theme.palette[tone].main;

const focusRing = {
  '&:focus-visible': { outline: '3px solid', outlineColor: 'primary.main', outlineOffset: 2 },
};

const noMotion = {
  transition: 'border-color 150ms, background-color 150ms, color 150ms',
  '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
};

interface PeopleSummaryProps {
  summary: Summary | null;
  view: PeopleView;
  season: Season;
  currentExamYear: number | null;
  activity: ActivityGroup | null;
  stage: LifecycleStage | null;
  /** True while the list shows only people whose exam year is estimated. */
  yearUnknownOnly: boolean;
  onSeasonChange: (season: Season) => void;
  onActivityChange: (activity: ActivityGroup | null) => void;
  onStageChange: (stage: LifecycleStage | null) => void;
  onYearUnknownOnlyChange: (on: boolean) => void;
}

export default function PeopleSummary({
  summary,
  view,
  season,
  currentExamYear,
  activity,
  stage,
  yearUnknownOnly,
  onSeasonChange,
  onActivityChange,
  onStageChange,
  onYearUnknownOnlyChange,
}: PeopleSummaryProps) {
  if (!summary || currentExamYear === null) {
    return (
      <Box aria-busy="true" aria-label="Loading counts" sx={{ display: 'grid', gap: 1.25 }}>
        <Skeleton variant="rounded" height={44} sx={{ maxWidth: 720 }} />
        <Skeleton variant="rounded" height={52} />
      </Box>
    );
  }

  const seasonChips: Array<{ key: Season; label: string; hint: string }> = [
    {
      key: 'current',
      label: `${currentExamYear} exam`,
      hint: `People preparing for the ${currentExamYear} exams: this season.`,
    },
    {
      key: 'later',
      label: `${currentExamYear + 1} and later`,
      hint: `People who plan to write in ${currentExamYear + 1} or after (class 10 and 11 students).`,
    },
    {
      key: 'earlier',
      label: 'Earlier',
      hint: `People whose exam was ${currentExamYear - 1} or before. Most have finished.`,
    },
    { key: 'all', label: 'All', hint: 'Everyone, whatever their exam year.' },
  ];

  const seasonTotal = summary.seasons[season];
  const known = Math.max(0, seasonTotal - summary.estimated);
  const activityBase = ACTIVITY_ORDER.reduce((sum, a) => sum + summary.activity[a], 0);
  const stageBase = STAGE_ORDER.reduce((sum, s) => sum + summary.stages[s], 0);
  const stagesShown = STAGE_ORDER.filter(
    (s) => (view === 'active' && ALWAYS_SHOWN.includes(s)) || summary.stages[s] > 0
  );
  const percent = (n: number, base: number) => (base > 0 ? Math.round((n / base) * 100) : 0);

  return (
    <Box sx={{ display: 'grid', gap: 1.25 }}>
      {/* Row 1: exam season, and how many told us their year */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1, justifyContent: 'space-between' }}>
        <Box role="group" aria-label="Exam season" sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 0.75 }}>
          <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.secondary', mr: 0.25 }}>
            Exam season
          </Typography>
          {seasonChips.map((chip) => {
            const selected = season === chip.key;
            return (
              <Tooltip key={chip.key} title={chip.hint} arrow>
                <Box
                  component="button"
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onSeasonChange(chip.key)}
                  sx={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 0.75,
                    minHeight: 44,
                    px: 1.5,
                    border: '1.5px solid',
                    borderColor: selected ? 'primary.main' : 'grey.300',
                    borderRadius: 999,
                    bgcolor: (t: Theme) => (selected ? alpha(t.palette.primary.main, 0.08) : t.palette.background.paper),
                    color: selected ? 'primary.main' : 'text.primary',
                    fontFamily: 'inherit',
                    fontSize: 14,
                    fontWeight: selected ? 700 : 500,
                    whiteSpace: 'nowrap',
                    cursor: 'pointer',
                    '&:hover': { borderColor: 'primary.main' },
                    ...focusRing,
                    ...noMotion,
                  }}
                >
                  {selected && <CheckCircleIcon sx={{ fontSize: 18 }} aria-hidden />}
                  {chip.label}
                  <Box component="span" sx={{ fontWeight: 700, color: selected ? 'primary.main' : 'text.secondary' }}>
                    {formatCount(summary.seasons[chip.key])}
                  </Box>
                </Box>
              </Tooltip>
            );
          })}
        </Box>

        <Tooltip
          arrow
          title={
            yearUnknownOnly
              ? 'Showing only people who never told us their exam year. Click to show everyone again.'
              : `${formatCount(summary.estimated)} of ${formatCount(seasonTotal)} never told us their exam year. Their season is estimated from when they signed up (a season runs 1 July to 30 June) and marked "est." in the table. Click to list them.`
          }
        >
          <Box
            component="button"
            type="button"
            aria-pressed={yearUnknownOnly}
            onClick={() => onYearUnknownOnlyChange(!yearUnknownOnly)}
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 0.75,
              minHeight: 44,
              px: 1.5,
              border: '1.5px solid',
              borderColor: yearUnknownOnly ? 'warning.main' : 'grey.300',
              borderRadius: 1,
              bgcolor: (t: Theme) => (yearUnknownOnly ? alpha(t.palette.warning.main, 0.1) : t.palette.background.paper),
              color: 'text.primary',
              fontFamily: 'inherit',
              fontSize: 13,
              whiteSpace: 'nowrap',
              cursor: 'pointer',
              '&:hover': { borderColor: 'warning.main' },
              ...focusRing,
              ...noMotion,
            }}
          >
            {yearUnknownOnly ? (
              <>
                <CheckCircleIcon sx={{ fontSize: 18, color: 'warning.dark' }} aria-hidden />
                Exam year still to ask: <b>{formatCount(summary.estimated)}</b>
              </>
            ) : (
              <>
                <HelpOutlineIcon sx={{ fontSize: 18, color: 'text.secondary' }} aria-hidden />
                Exam year known: <b>{formatCount(known)}</b> of {formatCount(seasonTotal)}
              </>
            )}
          </Box>
        </Tooltip>
      </Box>

      {/* Row 2: one strip. Stage funnel, then activity. */}
      <Box
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'stretch',
          border: '1px solid',
          borderColor: 'grey.200',
          borderRadius: 1,
          bgcolor: 'background.paper',
          overflow: 'hidden',
        }}
      >
        <Box
          role="group"
          aria-label="Where they are"
          sx={{ display: 'flex', alignItems: 'stretch', flex: '1 1 auto', minWidth: 0, overflowX: 'auto' }}
        >
          {stagesShown.map((key, i) => (
            <Box key={key} sx={{ display: 'flex', alignItems: 'center' }}>
              {i > 0 && <ChevronRightIcon aria-hidden sx={{ fontSize: 16, color: 'grey.400', mx: -0.25 }} />}
              <Segment
                label={STAGE_SHORT[key]}
                hint={`${PEOPLE_STAGE_LABELS[key]}: ${LIFECYCLE_STAGE_MEANINGS[key]} (${percent(summary.stages[key], stageBase)}%)`}
                count={summary.stages[key]}
                tone="primary"
                selected={stage === key}
                onClick={() => onStageChange(stage === key ? null : key)}
              />
            </Box>
          ))}
        </Box>
        <Box
          role="group"
          aria-label="How active"
          sx={{
            display: 'flex',
            alignItems: 'stretch',
            flex: '0 0 auto',
            borderLeft: '1px solid',
            borderColor: 'grey.200',
            bgcolor: 'grey.50',
            overflowX: 'auto',
          }}
        >
          {ACTIVITY_ORDER.map((key) => (
            <Segment
              key={key}
              label={ACTIVITY_SHORT[key]}
              hint={`${ACTIVITY_GROUPS[key].label}: ${ACTIVITY_GROUPS[key].hint} (${percent(summary.activity[key], activityBase)}%)`}
              count={summary.activity[key]}
              tone={ACTIVITY_TONE[key]}
              dot
              selected={activity === key}
              onClick={() => onActivityChange(activity === key ? null : key)}
            />
          ))}
        </Box>
      </Box>
    </Box>
  );
}

function Segment({
  label,
  hint,
  count,
  tone,
  dot,
  selected,
  onClick,
}: {
  label: string;
  hint: string;
  count: number;
  tone: 'success' | 'warning' | 'secondary' | 'primary';
  dot?: boolean;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <Tooltip title={hint} arrow placement="top">
      <Box
        component="button"
        type="button"
        aria-pressed={selected}
        aria-label={`${label}: ${formatCount(count)}${selected ? ', filter on' : ''}`}
        onClick={onClick}
        sx={(theme: Theme) => {
          const color = toneColor(theme, tone);
          return {
            display: 'inline-flex',
            alignItems: 'center',
            gap: 0.75,
            minHeight: 52,
            px: 1.25,
            border: 'none',
            borderBottom: '3px solid',
            borderBottomColor: selected ? color : 'transparent',
            bgcolor: selected ? alpha(color, 0.08) : 'transparent',
            fontFamily: 'inherit',
            whiteSpace: 'nowrap',
            cursor: 'pointer',
            '&:hover': { bgcolor: alpha(color, 0.06) },
            ...focusRing,
            outlineOffset: -3,
            ...noMotion,
          };
        }}
      >
        {dot && (
          <Box
            aria-hidden
            sx={(t: Theme) => ({ width: 8, height: 8, borderRadius: '50%', bgcolor: toneColor(t, tone), flexShrink: 0 })}
          />
        )}
        <Typography component="span" sx={{ fontSize: 13, fontWeight: 600, color: 'text.secondary' }}>
          {label}
        </Typography>
        <Typography
          component="span"
          sx={{ fontSize: 17, fontWeight: 800, color: count > 0 ? 'text.primary' : 'text.secondary' }}
        >
          {formatCount(count)}
        </Typography>
      </Box>
    </Tooltip>
  );
}
