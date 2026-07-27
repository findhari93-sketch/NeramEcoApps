'use client';

import { useState, type ReactNode } from 'react';
import {
  Badge,
  Box,
  Button,
  Divider,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from '@neram/ui';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import TodayIcon from '@mui/icons-material/Today';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import ViewSidebarOutlinedIcon from '@mui/icons-material/ViewSidebarOutlined';
import CheckIcon from '@mui/icons-material/Check';
import UnfoldMoreIcon from '@mui/icons-material/UnfoldMore';
import { RADIUS, LAYOUT } from './timetable-theme';
import { describeWindow } from '@/lib/timetable-window';
import { describeBands } from '@/lib/plan-shape';
import type { TimetableViewMode, TimetableViewState } from '@/hooks/useTimetableView';

interface CalendarToolbarProps {
  state: TimetableViewState;
  /** Teachers see the list view as "Plan", since that is what it is for them. */
  agendaLabel?: string;
  /** Right-hand group, before the overflow button. Teacher: the New button. */
  actions?: ReactNode;
  /** Rendered inside the overflow menu. Receives a closer for its items. */
  overflowMenu?: (close: () => void) => ReactNode;
  /** Extra items at the top of the view menu, e.g. the teacher's class hours link. */
  viewMenuExtras?: (close: () => void) => ReactNode;
  /** Folded onto the overflow button at xs, where the notification bell has no room. */
  overflowBadge?: number;
}

/**
 * The one compact row, in the shape of the Microsoft Teams calendar toolbar.
 *
 * This replaces both the old page title row and the old TimetableToolbar. Every
 * control the timetable has now lives here or in one of its two menus, which is
 * what buys the calendar the ~200px of vertical space it used to give away.
 *
 * The view switch is a dropdown rather than a segmented control because four
 * options (Day, Week, Month, Plan) plus a density toggle do not fit a segmented
 * control at 375px.
 */
export default function CalendarToolbar({
  state,
  agendaLabel = 'Agenda',
  actions,
  overflowMenu,
  viewMenuExtras,
  overflowBadge = 0,
}: CalendarToolbarProps) {
  const theme = useTheme();
  const compact = !useMediaQuery(theme.breakpoints.up('sm'));
  const {
    view,
    setView,
    density,
    toggleDensity,
    railOpen,
    toggleRail,
    goToToday,
    previous,
    next,
    showingToday,
    range,
    band,
    configuredWindow,
    isBandExpanded,
    activePlanNames,
  } = state;

  const [viewAnchor, setViewAnchor] = useState<null | HTMLElement>(null);
  const [overflowAnchor, setOverflowAnchor] = useState<null | HTMLElement>(null);

  const VIEW_LABELS: Record<TimetableViewMode, string> = {
    day: 'Day',
    week: 'Week',
    month: 'Month',
    agenda: agendaLabel,
  };

  // "Previous week" / "Previous month" reads correctly, and keeps the existing
  // week-based E2E selectors working while the default view is still the week.
  const periodNoun = view === 'day' ? 'day' : view === 'month' ? 'month' : 'week';

  const navSx = {
    minWidth: 44,
    minHeight: 44,
    borderRadius: RADIUS.control,
    transition: theme.transitions.create(['background-color'], { duration: 150 }),
  } as const;

  return (
    <Box
      data-testid="calendar-toolbar"
      sx={{
        flex: '0 0 auto',
        minHeight: LAYOUT.toolbarRow,
        display: 'flex',
        alignItems: 'center',
        gap: { xs: 0.25, sm: 0.75 },
        px: { xs: 1, md: 1.5 },
        py: 0.5,
        borderBottom: `1px solid ${theme.palette.divider}`,
        bgcolor: 'background.paper',
      }}
    >
      {/* ── Left: rail toggle, Today, navigation, period label ─────────── */}
      <Tooltip title={railOpen ? 'Hide the calendar list' : 'Show the calendar list'}>
        <IconButton
          onClick={toggleRail}
          aria-label={railOpen ? 'Hide the calendar list' : 'Show the calendar list'}
          data-testid="cal-rail-toggle"
          sx={{ ...navSx, display: { xs: 'none', lg: 'inline-flex' } }}
        >
          <ViewSidebarOutlinedIcon fontSize="small" />
        </IconButton>
      </Tooltip>

      {/* Today is pointless while today is already on screen, so it disables
          rather than disappears: a control that moves is harder to hit again. */}
      <Button
        onClick={goToToday}
        disabled={showingToday}
        data-testid="cal-today"
        startIcon={<TodayIcon fontSize="small" />}
        sx={{
          display: { xs: 'none', sm: 'inline-flex' },
          minHeight: 44,
          px: 1.5,
          textTransform: 'none',
          fontWeight: 600,
          borderRadius: RADIUS.control,
          color: 'text.primary',
        }}
      >
        Today
      </Button>
      <IconButton
        onClick={goToToday}
        disabled={showingToday}
        aria-label="Go to today"
        sx={{ ...navSx, display: { xs: 'inline-flex', sm: 'none' } }}
      >
        <TodayIcon fontSize="small" />
      </IconButton>

      <IconButton
        onClick={previous}
        aria-label={`Previous ${periodNoun}`}
        data-testid="cal-prev"
        sx={navSx}
      >
        <ChevronLeftIcon />
      </IconButton>
      <IconButton
        onClick={next}
        aria-label={`Next ${periodNoun}`}
        data-testid="cal-next"
        sx={navSx}
      >
        <ChevronRightIcon />
      </IconButton>

      <Typography
        component="p"
        data-testid="cal-period-label"
        aria-live="polite"
        noWrap
        sx={{
          flex: '0 1 auto',
          minWidth: 0,
          ml: { xs: 0.5, sm: 1 },
          fontWeight: 700,
          fontSize: { xs: '0.875rem', sm: '1rem' },
        }}
      >
        {/* One label, picked in JS rather than two spans toggled by CSS: the
            hidden twin would still be read out and would still be found by
            anything reading text content. */}
        {compact ? range.shortLabel : range.label}
      </Typography>

      {/* The band note rides in the toolbar's slack rather than owning a row of
          its own. Below md there is no slack, so it lives in the view menu
          instead, beside the density toggle it explains. */}
      <Typography
        variant="caption"
        color="text.disabled"
        data-testid="cal-band-note"
        noWrap
        sx={{ flex: 1, minWidth: 0, ml: 1.5, display: { xs: 'none', md: 'block' } }}
      >
        {view === 'day' || view === 'week'
          ? bandNote({ density, band, configuredWindow, isBandExpanded, activePlanNames })
          : ''}
      </Typography>

      {/* ── Right: view switch, overflow, page actions ─────────────────── */}
      <Button
        onClick={(e) => setViewAnchor(e.currentTarget)}
        data-testid="cal-view-switch"
        endIcon={<ExpandMoreIcon />}
        aria-haspopup="menu"
        aria-label={`Change view, currently ${VIEW_LABELS[view]}`}
        sx={{
          minHeight: 44,
          px: { xs: 1, sm: 1.5 },
          textTransform: 'none',
          fontWeight: 600,
          borderRadius: RADIUS.control,
          border: `1px solid ${theme.palette.divider}`,
          color: 'text.primary',
          whiteSpace: 'nowrap',
          '& .MuiButton-endIcon': { ml: { xs: 0, sm: 0.5 } },
        }}
      >
        {!compact && VIEW_LABELS[view]}
      </Button>

      <Menu
        anchorEl={viewAnchor}
        open={Boolean(viewAnchor)}
        onClose={() => setViewAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        MenuListProps={{ 'aria-label': 'Calendar view' }}
        PaperProps={{ sx: { minWidth: 240, borderRadius: RADIUS.control } }}
      >
        {(['day', 'week', 'month', 'agenda'] as const).map((mode) => (
          <MenuItem
            key={mode}
            role="menuitemradio"
            aria-checked={view === mode}
            selected={view === mode}
            onClick={() => {
              setView(mode);
              setViewAnchor(null);
            }}
            sx={{ minHeight: 44 }}
          >
            <ListItemIcon sx={{ minWidth: 32 }}>
              {view === mode && <CheckIcon fontSize="small" color="primary" />}
            </ListItemIcon>
            <ListItemText primaryTypographyProps={{ fontWeight: view === mode ? 700 : 500 }}>
              {VIEW_LABELS[mode]}
            </ListItemText>
          </MenuItem>
        ))}

        {/* Density lost its own toolbar button. It only means anything where a
            time band is drawn, and it carries the band note with it, which is
            the honesty mechanism for a window that silently grew. */}
        {(view === 'day' || view === 'week') && <Divider />}
        {(view === 'day' || view === 'week') && (
          <MenuItem
            role="menuitemcheckbox"
            aria-checked={density === 'full'}
            onClick={() => {
              toggleDensity();
              setViewAnchor(null);
            }}
            sx={{ minHeight: 44 }}
          >
            <ListItemIcon sx={{ minWidth: 32 }}>
              {density === 'full' ? (
                <CheckIcon fontSize="small" color="primary" />
              ) : (
                <UnfoldMoreIcon fontSize="small" />
              )}
            </ListItemIcon>
            <ListItemText
              primary="Show the full day"
              secondary={bandNote({ density, band, configuredWindow, isBandExpanded, activePlanNames })}
              secondaryTypographyProps={{ sx: { whiteSpace: 'normal' } }}
            />
          </MenuItem>
        )}

        {viewMenuExtras && <Divider />}
        {viewMenuExtras?.(() => setViewAnchor(null))}
      </Menu>

      {overflowMenu && (
        <>
          <IconButton
            onClick={(e) => setOverflowAnchor(e.currentTarget)}
            aria-label="More timetable actions"
            aria-haspopup="menu"
            data-testid="cal-more"
            sx={navSx}
          >
            <Badge
              color="error"
              variant="dot"
              invisible={overflowBadge === 0}
              sx={{ display: { xs: 'inline-flex', sm: 'none' } }}
            >
              <MoreVertIcon />
            </Badge>
            <Box component="span" sx={{ display: { xs: 'none', sm: 'inline-flex' } }}>
              <MoreVertIcon />
            </Box>
          </IconButton>
          <Menu
            anchorEl={overflowAnchor}
            open={Boolean(overflowAnchor)}
            onClose={() => setOverflowAnchor(null)}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            transformOrigin={{ vertical: 'top', horizontal: 'right' }}
            PaperProps={{ sx: { minWidth: 260, borderRadius: RADIUS.control } }}
          >
            {overflowMenu(() => setOverflowAnchor(null))}
          </Menu>
        </>
      )}

      {actions}
    </Box>
  );
}

/**
 * "Showing 6 PM to 9 PM, expanded to fit 1 class outside those hours."
 *
 * The compact band draws only the configured window, and silently grows when a
 * class falls outside it. Without this line a stretched grid reads as a bug.
 * It used to occupy its own row under the toolbar; it now rides along with the
 * density toggle that controls it.
 */
function bandNote({
  density,
  band,
  configuredWindow,
  isBandExpanded,
  activePlanNames,
}: Pick<
  TimetableViewState,
  'density' | 'band' | 'configuredWindow' | 'isBandExpanded' | 'activePlanNames'
>): string {
  if (density === 'full') return 'Showing the full day.';

  const hhmm = (min: number) =>
    `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

  return (
    [
      // Name the course plan when there is one, so a week that suddenly grows a
      // morning reads as "the crash course started", not as a bug.
      activePlanNames.length > 0
        ? `${summarisePlanNames(activePlanNames)}: ${describeBands(
            band.segments.map((s) => ({ start: hhmm(s.startMin), end: hhmm(s.endMin) })),
          )}`
        : `Showing ${describeWindow(configuredWindow)}`,
      isBandExpanded
        ? `expanded to fit ${band.expandedFor} ${band.expandedFor === 1 ? 'class' : 'classes'} outside those hours`
        : null,
    ]
      .filter(Boolean)
      .join(', ') + '.'
  );
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
