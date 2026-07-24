'use client';

import { Box, IconButton, ToggleButton, ToggleButtonGroup, Tooltip, Typography, useTheme } from '@neram/ui';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import TodayIcon from '@mui/icons-material/Today';
import ViewAgendaOutlinedIcon from '@mui/icons-material/ViewAgendaOutlined';
import GridViewOutlinedIcon from '@mui/icons-material/GridViewOutlined';
import UnfoldMoreIcon from '@mui/icons-material/UnfoldMore';
import UnfoldLessIcon from '@mui/icons-material/UnfoldLess';
import { RADIUS } from '../timetable-theme';
import { describeWindow } from '@/lib/timetable-window';
import { describeBands } from '@/lib/plan-shape';
import type { TimetableViewState } from '@/hooks/useTimetableView';

interface TimetableToolbarProps {
  state: TimetableViewState;
  /** Density and the band note only mean something in the grid. */
  showDensity?: boolean;
  /** Teachers see the list view as "Plan", since that is what it is for them. */
  agendaLabel?: string;
}

/**
 * Name the plans shaping the week without letting the line run away. One or two
 * plans read fine spelled out; beyond that (a classroom mid-changeover, or stray
 * draft plans overlapping the same dates) the honest, readable thing is a count,
 * not a paragraph of joined titles.
 */
function summarisePlanNames(names: string[]): string {
  if (names.length <= 2) return names.join(' and ');
  return `${names.length} course plans`;
}

/**
 * Week navigation, view switch and the density toggle.
 *
 * The band note under the toolbar is the honesty mechanism for the compact
 * window: when a class falls outside the configured hours the grid silently
 * grows to fit it, and this line says so, otherwise a stretched grid reads as
 * a bug.
 */
export default function TimetableToolbar({
  state,
  showDensity = true,
  agendaLabel = 'Agenda',
}: TimetableToolbarProps) {
  const theme = useTheme();
  const {
    view,
    setView,
    density,
    toggleDensity,
    weekOffset,
    goToToday,
    previousWeek,
    nextWeek,
    week,
    band,
    configuredWindow,
    isBandExpanded,
    activePlanNames,
  } = state;

  return (
    <Box sx={{ mb: 1.5 }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 1,
          flexWrap: 'wrap',
        }}
      >
        {/* Week navigation */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <IconButton
            onClick={previousWeek}
            aria-label="Previous week"
            sx={{ minWidth: 44, minHeight: 44 }}
          >
            <ChevronLeftIcon />
          </IconButton>
          <Typography variant="body2" sx={{ fontWeight: 700, minWidth: 108, textAlign: 'center' }}>
            {week.label}
          </Typography>
          <IconButton onClick={nextWeek} aria-label="Next week" sx={{ minWidth: 44, minHeight: 44 }}>
            <ChevronRightIcon />
          </IconButton>
          {weekOffset !== 0 && (
            <Tooltip title="Back to this week">
              <IconButton
                onClick={goToToday}
                aria-label="Back to this week"
                sx={{ minWidth: 44, minHeight: 44 }}
              >
                <TodayIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
        </Box>

        {/* View switch, plus density when the grid is showing */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {showDensity && view === 'grid' && (
            <Tooltip title={density === 'compact' ? 'Show the full day' : 'Show class hours only'}>
              <IconButton
                onClick={toggleDensity}
                aria-label={density === 'compact' ? 'Show the full day' : 'Show class hours only'}
                sx={{
                  minWidth: 44,
                  minHeight: 44,
                  border: `1px solid ${theme.palette.divider}`,
                  borderRadius: RADIUS.control,
                }}
              >
                {density === 'compact' ? (
                  <UnfoldMoreIcon fontSize="small" />
                ) : (
                  <UnfoldLessIcon fontSize="small" />
                )}
              </IconButton>
            </Tooltip>
          )}

          <ToggleButtonGroup
            value={view}
            exclusive
            onChange={(_, v) => v && setView(v)}
            size="small"
            aria-label="Timetable view"
            sx={{ borderRadius: RADIUS.control }}
          >
            <ToggleButton value="agenda" aria-label="Agenda view" sx={{ minWidth: 44, minHeight: 44, gap: 0.75, textTransform: 'none' }}>
              <ViewAgendaOutlinedIcon fontSize="small" />
              <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' }, fontWeight: 600 }}>
                {agendaLabel}
              </Box>
            </ToggleButton>
            <ToggleButton value="grid" aria-label="Grid view" sx={{ minWidth: 44, minHeight: 44, gap: 0.75, textTransform: 'none' }}>
              <GridViewOutlinedIcon fontSize="small" />
              <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' }, fontWeight: 600 }}>
                Grid
              </Box>
            </ToggleButton>
          </ToggleButtonGroup>
        </Box>
      </Box>

      {view === 'grid' && (
        <Typography
          variant="caption"
          color="text.disabled"
          sx={{ display: 'block', mt: 0.75, mx: 0.5 }}
        >
          {density === 'full'
            ? 'Showing the full day.'
            : [
                // Name the course plan when there is one, so a week that
                // suddenly grows a morning reads as "the crash course started",
                // not as a bug.
                activePlanNames.length > 0
                  ? `${summarisePlanNames(activePlanNames)}: ${describeBands(
                      band.segments.map((s) => ({
                        start: `${String(Math.floor(s.startMin / 60)).padStart(2, '0')}:${String(s.startMin % 60).padStart(2, '0')}`,
                        end: `${String(Math.floor(s.endMin / 60)).padStart(2, '0')}:${String(s.endMin % 60).padStart(2, '0')}`,
                      })),
                    )}`
                  : `Showing ${describeWindow(configuredWindow)}`,
                isBandExpanded
                  ? `expanded to fit ${band.expandedFor} ${band.expandedFor === 1 ? 'class' : 'classes'} outside those hours`
                  : null,
              ]
                .filter(Boolean)
                .join(', ') + '.'}
        </Typography>
      )}
    </Box>
  );
}
