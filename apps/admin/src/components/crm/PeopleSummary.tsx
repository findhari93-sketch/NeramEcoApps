'use client';

/**
 * The top of the admin People page: which exam season, who is still around,
 * and where they are in the journey. Every card is a filter button; the
 * numbers come from summarisePeople() over one grouped query, so they are
 * exact and add up to what the table shows after a click.
 */

import { Box, Typography, Skeleton, Tooltip, alpha } from '@neram/ui';
import type { Theme } from '@mui/material/styles';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import ScheduleIcon from '@mui/icons-material/Schedule';
import BedtimeOutlinedIcon from '@mui/icons-material/BedtimeOutlined';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import PhoneAndroidIcon from '@mui/icons-material/PhoneAndroid';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import HowToRegOutlinedIcon from '@mui/icons-material/HowToRegOutlined';
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined';
import PauseCircleOutlineIcon from '@mui/icons-material/PauseCircleOutline';
import WorkspacePremiumOutlinedIcon from '@mui/icons-material/WorkspacePremiumOutlined';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import { ACTIVITY_GROUPS, PEOPLE_STAGE_LABELS, LIFECYCLE_STAGE_MEANINGS } from '@neram/database';
import type { ActivityGroup, LifecycleStage } from '@neram/database';
import {
  ACTIVITY_ORDER,
  STAGE_ORDER,
  formatCount,
  type PeopleSummary as Summary,
  type PeopleView,
  type Season,
} from '@/lib/people-summary';

const ACTIVITY_ICONS: Record<ActivityGroup, React.ElementType> = {
  recent: TrendingUpIcon,
  quiet: ScheduleIcon,
  gone: BedtimeOutlinedIcon,
};

/** Palette keys from the @neram/ui theme; no new colours. */
const ACTIVITY_TONE: Record<ActivityGroup, 'success' | 'warning' | 'secondary'> = {
  recent: 'success',
  quiet: 'warning',
  gone: 'secondary',
};

const STAGE_ICONS: Record<LifecycleStage, React.ElementType> = {
  prospect: PersonOutlineIcon,
  lead: PhoneAndroidIcon,
  applicant: DescriptionOutlinedIcon,
  enrolled: HowToRegOutlinedIcon,
  active_student: SchoolOutlinedIcon,
  paused: PauseCircleOutlineIcon,
  alumni: WorkspacePremiumOutlinedIcon,
  archived: Inventory2OutlinedIcon,
};

/** The six journey stages always show in Current; Alumni and Archived only when present. */
const ALWAYS_SHOWN: LifecycleStage[] = ['prospect', 'lead', 'applicant', 'enrolled', 'active_student', 'paused'];

const toneColor = (theme: Theme, tone: 'success' | 'warning' | 'secondary' | 'primary') =>
  tone === 'secondary' ? theme.palette.text.secondary : theme.palette[tone].main;

const focusRing = {
  '&:focus-visible': { outline: '3px solid', outlineColor: 'primary.main', outlineOffset: 2 },
};

const noMotion = {
  transition: 'border-color 150ms, background-color 150ms',
  '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
};

interface PeopleSummaryProps {
  summary: Summary | null;
  view: PeopleView;
  season: Season;
  currentExamYear: number | null;
  activity: ActivityGroup | null;
  stage: LifecycleStage | null;
  onSeasonChange: (season: Season) => void;
  onActivityChange: (activity: ActivityGroup | null) => void;
  onStageChange: (stage: LifecycleStage | null) => void;
}

export default function PeopleSummary({
  summary,
  view,
  season,
  currentExamYear,
  activity,
  stage,
  onSeasonChange,
  onActivityChange,
  onStageChange,
}: PeopleSummaryProps) {
  if (!summary || currentExamYear === null) {
    return (
      <Box aria-busy="true" aria-label="Loading counts" sx={{ display: 'grid', gap: 1.5 }}>
        <Skeleton variant="rounded" height={44} sx={{ maxWidth: 640 }} />
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 1.5 }}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} variant="rounded" height={88} />
          ))}
        </Box>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 1.5 }}>
          {ALWAYS_SHOWN.map((s) => (
            <Skeleton key={s} variant="rounded" height={88} />
          ))}
        </Box>
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
      label: 'Earlier seasons',
      hint: `People whose exam was ${currentExamYear - 1} or before. Most have finished.`,
    },
    { key: 'all', label: 'All seasons', hint: 'Everyone, whatever their exam year.' },
  ];

  const seasonTotal = summary.seasons[season];
  const activityBase = ACTIVITY_ORDER.reduce((sum, a) => sum + summary.activity[a], 0);
  const stageBase = STAGE_ORDER.reduce((sum, s) => sum + summary.stages[s], 0);
  const stagesShown = STAGE_ORDER.filter(
    (s) => (view === 'active' && ALWAYS_SHOWN.includes(s)) || summary.stages[s] > 0
  );

  return (
    <Box sx={{ display: 'grid', gap: 2 }}>
      {/* Exam season */}
      <Box>
        <Box
          role="group"
          aria-label="Exam season"
          sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1 }}
        >
          <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.secondary', mr: 0.5 }}>
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
                    px: 1.75,
                    border: '1.5px solid',
                    borderColor: selected ? 'primary.main' : 'grey.300',
                    borderRadius: 999,
                    bgcolor: (t: Theme) => (selected ? alpha(t.palette.primary.main, 0.08) : t.palette.background.paper),
                    color: selected ? 'primary.main' : 'text.primary',
                    fontFamily: 'inherit',
                    fontSize: 14,
                    fontWeight: selected ? 700 : 500,
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
        {summary.estimated > 0 && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.75, color: 'text.secondary' }}>
            <InfoOutlinedIcon sx={{ fontSize: 16 }} aria-hidden />
            <Typography variant="caption" sx={{ fontSize: 13 }}>
              {formatCount(summary.estimated)} of {formatCount(seasonTotal)} never told us their exam year. Their
              season is estimated from when they signed up (a season runs 1 July to 30 June), marked &quot;est.&quot;
              in the table.
            </Typography>
          </Box>
        )}
      </Box>

      {/* Still around? */}
      <CardRow title="Still around?" minWidth={210}>
        {ACTIVITY_ORDER.map((key) => {
          const group = ACTIVITY_GROUPS[key];
          return (
            <FilterCard
              key={key}
              label={group.label}
              hint={group.hint}
              count={summary.activity[key]}
              base={activityBase}
              tone={ACTIVITY_TONE[key]}
              Icon={ACTIVITY_ICONS[key]}
              selected={activity === key}
              onClick={() => onActivityChange(activity === key ? null : key)}
            />
          );
        })}
      </CardRow>

      {/* Where they are */}
      <CardRow title="Where they are" minWidth={150}>
        {stagesShown.map((key) => (
          <FilterCard
            key={key}
            label={PEOPLE_STAGE_LABELS[key]}
            hint={LIFECYCLE_STAGE_MEANINGS[key]}
            count={summary.stages[key]}
            base={stageBase}
            tone="primary"
            Icon={STAGE_ICONS[key]}
            selected={stage === key}
            onClick={() => onStageChange(stage === key ? null : key)}
          />
        ))}
      </CardRow>
    </Box>
  );
}

function CardRow({ title, minWidth, children }: { title: string; minWidth: number; children: React.ReactNode }) {
  return (
    <Box role="group" aria-label={title}>
      <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.secondary', mb: 0.75 }}>
        {title}
      </Typography>
      {/* auto-fill measures the content area, not the window, so the sidebar never squeezes it. */}
      <Box sx={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${minWidth}px, 1fr))`, gap: 1.5 }}>
        {children}
      </Box>
    </Box>
  );
}

function FilterCard({
  label,
  hint,
  count,
  base,
  tone,
  Icon,
  selected,
  onClick,
}: {
  label: string;
  hint: string;
  count: number;
  base: number;
  tone: 'success' | 'warning' | 'secondary' | 'primary';
  Icon: React.ElementType;
  selected: boolean;
  onClick: () => void;
}) {
  const percent = base > 0 ? Math.round((count / base) * 100) : 0;
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
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            gap: 0.5,
            minHeight: 88,
            p: 1.5,
            textAlign: 'left',
            fontFamily: 'inherit',
            cursor: 'pointer',
            borderRadius: 1,
            border: '1.5px solid',
            borderColor: selected ? color : theme.palette.grey[200],
            bgcolor: selected ? alpha(color, 0.08) : theme.palette.background.paper,
            '&:hover': { borderColor: color },
            ...focusRing,
            ...noMotion,
          };
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', width: '100%', gap: 1 }}>
          <Icon sx={(t: Theme) => ({ fontSize: 20, color: toneColor(t, tone) })} aria-hidden />
          <Typography
            component="span"
            sx={{ fontSize: 13, fontWeight: 600, color: 'text.primary', lineHeight: 1.3, flex: 1 }}
          >
            {label}
          </Typography>
          {selected && <CheckCircleIcon sx={(t: Theme) => ({ fontSize: 18, color: toneColor(t, tone) })} aria-hidden />}
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
          <Typography
            component="span"
            sx={{ fontSize: 26, fontWeight: 800, lineHeight: 1.1, color: count > 0 ? 'text.primary' : 'text.secondary' }}
          >
            {formatCount(count)}
          </Typography>
          {count > 0 && (
            <Typography component="span" sx={{ fontSize: 12, fontWeight: 600, color: 'text.secondary' }}>
              {percent}%
            </Typography>
          )}
        </Box>
      </Box>
    </Tooltip>
  );
}
