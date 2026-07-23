'use client';

import { Box, Button, Skeleton, Typography, alpha, useTheme } from '@neram/ui';
import AddIcon from '@mui/icons-material/Add';
import type { ClassCardData } from '../ClassCard';
import { type HolidayInfo, formatDateISO, formatTime, isToday, type WeekDates } from '../date-utils';
import { LAYOUT, RADIUS, SHADOW, tagSx } from '../timetable-theme';

const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

interface PlannerWeekListProps {
  classes: ClassCardData[];
  week: WeekDates;
  loading?: boolean;
  holidays?: Record<string, HolidayInfo>;
  selectedId?: string | null;
  /** Which classes already have an assignment attached. */
  assignmentCounts?: Record<string, number>;
  onSelect: (cls: ClassCardData) => void;
  onAddClass: (date: string) => void;
  /**
   * Tapping the assignment affordance on a card. Separate from `onSelect`
   * because it is a distinct intent: attach work, not inspect the class.
   */
  onAssignmentClick?: (cls: ClassCardData, anchor: HTMLElement) => void;
}

/**
 * The week as a planning list: one row per day, each a card the teacher opens
 * to set up.
 *
 * This is the teacher's counterpart to the student Agenda. It answers "is this
 * week ready" at a glance: every row shows whether the Teams meeting exists and
 * whether work has been attached, and drafts are visually unmistakable so a
 * half-planned week can never be confused with a published one.
 */
export default function PlannerWeekList({
  classes,
  week,
  loading,
  holidays,
  selectedId,
  assignmentCounts,
  onSelect,
  onAddClass,
  onAssignmentClick,
}: PlannerWeekListProps) {
  const theme = useTheme();

  if (loading) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.125 }}>
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} variant="rectangular" height={62} sx={{ borderRadius: 2 }} />
        ))}
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.125 }}>
      {week.days.map((day) => {
        const dateStr = formatDateISO(day);
        const holiday = holidays?.[dateStr];
        const dayClasses = classes.filter((c) => c.scheduled_date === dateStr);
        const today = isToday(day);

        const stub = (
          <Box sx={{ width: LAYOUT.dayStub, flexShrink: 0, textAlign: 'center' }}>
            <Typography
              sx={{
                fontSize: '0.5938rem',
                textTransform: 'uppercase',
                letterSpacing: '.04em',
                fontWeight: today ? 700 : 600,
                color: today ? 'primary.main' : 'text.disabled',
              }}
            >
              {DAY_SHORT[(day.getDay() + 6) % 7]}
            </Typography>
            <Typography
              sx={{
                fontWeight: 800,
                fontSize: '1rem',
                lineHeight: 1.2,
                color: today ? 'primary.dark' : holiday ? 'text.disabled' : 'text.primary',
              }}
            >
              {day.getDate()}
            </Typography>
          </Box>
        );

        if (holiday) {
          return (
            <Box key={dateStr} sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
              {stub}
              <Box
                sx={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1.25,
                  px: 1.75,
                  py: 1.5,
                  borderRadius: RADIUS.card,
                  border: `1px dashed ${theme.palette.divider}`,
                  bgcolor: alpha(theme.palette.text.primary, 0.02),
                }}
              >
                <Box component="span" sx={tagSx(theme, 'neutral')}>
                  Holiday
                </Box>
                <Typography sx={{ fontWeight: 700, fontSize: '0.8125rem' }}>
                  {holiday.title}
                </Typography>
              </Box>
            </Box>
          );
        }

        if (dayClasses.length === 0) {
          return (
            <Box key={dateStr} sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
              {stub}
              <Button
                fullWidth
                startIcon={<AddIcon />}
                onClick={() => onAddClass(dateStr)}
                sx={{
                  justifyContent: 'flex-start',
                  minHeight: 56,
                  px: 1.75,
                  textTransform: 'none',
                  fontWeight: 600,
                  color: 'text.disabled',
                  borderRadius: RADIUS.card,
                  border: `1px dashed ${theme.palette.divider}`,
                  '&:hover': {
                    color: 'primary.main',
                    borderColor: theme.palette.primary.main,
                    bgcolor: alpha(theme.palette.primary.main, 0.03),
                  },
                }}
              >
                Schedule a class
              </Button>
            </Box>
          );
        }

        return (
          <Box key={dateStr} sx={{ display: 'flex', gap: 1.5, alignItems: 'stretch' }}>
            <Box sx={{ display: 'flex', alignItems: 'center' }}>{stub}</Box>
            <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 0.875 }}>
              {dayClasses.map((cls) => {
                const isDraft = (cls as any).publish_state === 'draft';
                const isSelected = selectedId === cls.id;
                const isCancelled = cls.status === 'cancelled';
                const assignmentCount = assignmentCounts?.[cls.id] ?? 0;

                return (
                  <Box
                    key={cls.id}
                    role="button"
                    tabIndex={0}
                    aria-pressed={isSelected}
                    onClick={() => onSelect(cls)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onSelect(cls);
                      }
                    }}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1.5,
                      px: 1.75,
                      py: 1.5,
                      minHeight: 56,
                      cursor: 'pointer',
                      borderRadius: RADIUS.card,
                      bgcolor: 'background.paper',
                      opacity: isCancelled ? 0.55 : 1,
                      // Drafts get a dashed edge and stay visually distinct even
                      // when selected: a half-planned week must never look live.
                      border: isSelected
                        ? `2px solid ${theme.palette.primary.main}`
                        : isDraft
                          ? `1px dashed ${theme.palette.divider}`
                          : `1px solid ${theme.palette.divider}`,
                      boxShadow: isSelected ? SHADOW.lift : SHADOW.card,
                      transition: 'border-color 150ms ease, box-shadow 150ms ease',
                      '&:focus-visible': {
                        outline: `2px solid ${theme.palette.primary.main}`,
                        outlineOffset: 2,
                      },
                    }}
                  >
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography
                        sx={{
                          fontWeight: 700,
                          fontSize: '0.8438rem',
                          lineHeight: 1.3,
                          textDecoration: isCancelled ? 'line-through' : 'none',
                        }}
                        noWrap
                      >
                        {cls.title}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {formatTime(cls.start_time)} to {formatTime(cls.end_time)}
                        {today ? ', today' : ''}
                      </Typography>
                    </Box>

                    <Box sx={{ display: 'flex', gap: 0.625, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      {isDraft && (
                        <Box component="span" sx={tagSx(theme, 'neutral')}>
                          Draft
                        </Box>
                      )}
                      {cls.teams_meeting_id && (
                        <Box component="span" sx={tagSx(theme, 'success')}>
                          Teams
                        </Box>
                      )}
                      {assignmentCount > 0 ? (
                        <Box component="span" sx={tagSx(theme, 'primary')}>
                          {assignmentCount === 1 ? 'Assignment' : `${assignmentCount} assignments`}
                        </Box>
                      ) : (
                        /* A real button, not a tag. As a span inside the card it
                           swallowed its own tap: the click bubbled to the card and
                           opened the panel instead of attaching work. */
                        <Box
                          component="button"
                          type="button"
                          aria-label={`Add an assignment to ${cls.title}`}
                          onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                            e.stopPropagation();
                            onAssignmentClick?.(cls, e.currentTarget);
                          }}
                          onKeyDown={(e: React.KeyboardEvent) => {
                            // The card also listens for Enter and Space.
                            if (e.key === 'Enter' || e.key === ' ') e.stopPropagation();
                          }}
                          sx={{
                            ...tagSx(theme, 'neutral'),
                            borderStyle: 'dashed',
                            color: theme.palette.primary.dark,
                            cursor: 'pointer',
                            fontFamily: 'inherit',
                            appearance: 'none',
                            // The pill stays small; the touch target does not.
                            position: 'relative',
                            '&::after': {
                              content: '""',
                              position: 'absolute',
                              top: '50%',
                              left: '50%',
                              transform: 'translate(-50%, -50%)',
                              width: '100%',
                              minWidth: 44,
                              height: 44,
                            },
                            '&:hover': {
                              borderColor: theme.palette.primary.main,
                              bgcolor: alpha(theme.palette.primary.main, 0.06),
                            },
                            '&:focus-visible': {
                              outline: `2px solid ${theme.palette.primary.main}`,
                              outlineOffset: 2,
                            },
                          }}
                        >
                          + Assignment
                        </Box>
                      )}
                    </Box>
                  </Box>
                );
              })}
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}
