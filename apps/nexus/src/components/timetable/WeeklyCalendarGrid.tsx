'use client';

import { useState, useMemo } from 'react';
import { Box, Typography, IconButton, useMediaQuery, useTheme, Skeleton } from '@neram/ui';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import TodayIcon from '@mui/icons-material/Today';
import EventBusyIcon from '@mui/icons-material/EventBusy';
import ClassCard, { type ClassCardData } from './ClassCard';

export interface HolidayInfo {
  title: string;
  description?: string | null;
}

interface WeeklyCalendarGridProps {
  classes: ClassCardData[];
  loading: boolean;
  weekOffset: number;
  onWeekChange: (offset: number) => void;
  role: 'teacher' | 'student' | 'parent';
  holidays?: Record<string, HolidayInfo>;
  rsvpData?: Record<string, { attending: number; total: number }>;
  myRsvps?: Record<string, 'attending' | 'not_attending'>;
  averageRatings?: Record<string, number>;
  myAttendance?: Record<string, boolean>;
  onClassClick?: (cls: ClassCardData) => void;
  onEdit?: (cls: ClassCardData) => void;
  onDelete?: (classId: string) => void;
  onRsvp?: (classId: string, response: 'attending' | 'not_attending') => void;
  onRate?: (cls: ClassCardData) => void;
  onViewAttendance?: (cls: ClassCardData) => void;
  onSyncRecording?: (cls: ClassCardData) => void;
}

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_NAMES_FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function getWeekDates(offset: number) {
  const now = new Date();
  const monday = new Date(now);
  const dayOfWeek = now.getDay();
  const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  monday.setDate(now.getDate() + diff + offset * 7);
  monday.setHours(0, 0, 0, 0);

  const days: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    days.push(d);
  }

  const sunday = days[6];
  const label = `${monday.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })} - ${sunday.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}`;

  return { days, start: formatDateISO(monday), end: formatDateISO(sunday), label };
}

function formatDateISO(d: Date) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isToday(d: Date) {
  const today = new Date();
  return d.getDate() === today.getDate() && d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
}

export { getWeekDates };

export default function WeeklyCalendarGrid({
  classes,
  loading,
  weekOffset,
  onWeekChange,
  role,
  holidays,
  rsvpData,
  myRsvps,
  averageRatings,
  myAttendance,
  onClassClick,
}: WeeklyCalendarGridProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const week = useMemo(() => getWeekDates(weekOffset), [weekOffset]);

  const [selectedDayIndex, setSelectedDayIndex] = useState(() => {
    const today = new Date();
    const todayStr = formatDateISO(today);
    const idx = week.days.findIndex((d) => formatDateISO(d) === todayStr);
    return idx >= 0 ? idx : 0;
  });

  // Group classes by date
  const classesByDate = useMemo(() => {
    const map: Record<string, ClassCardData[]> = {};
    for (const cls of classes) {
      if (!map[cls.scheduled_date]) map[cls.scheduled_date] = [];
      map[cls.scheduled_date].push(cls);
    }
    return map;
  }, [classes]);

  // For desktop: determine which days have content (classes or holidays)
  const daysWithContent = useMemo(() => {
    return week.days.map((day, idx) => {
      const dateStr = formatDateISO(day);
      const hasClasses = (classesByDate[dateStr]?.length || 0) > 0;
      const isHoliday = !!holidays?.[dateStr];
      const today = isToday(day);
      return { day, idx, dateStr, hasClasses, isHoliday, today, hasContent: hasClasses || isHoliday || today };
    });
  }, [week.days, classesByDate, holidays]);

  const activeDays = useMemo(() => daysWithContent.filter((d) => d.hasContent), [daysWithContent]);
  const emptyDayNames = useMemo(
    () => daysWithContent.filter((d) => !d.hasContent).map((d) => DAY_NAMES[d.idx]),
    [daysWithContent]
  );

  const renderClassCards = (dateStr: string) => {
    const holiday = holidays?.[dateStr];
    const dayClasses = classesByDate[dateStr] || [];

    return (
      <>
        {holiday && (
          <Box
            sx={{
              p: 0.75,
              borderRadius: 1,
              bgcolor: 'error.50',
              border: '1px dashed',
              borderColor: 'error.200',
              display: 'flex',
              alignItems: 'center',
              gap: 0.5,
            }}
          >
            <EventBusyIcon sx={{ fontSize: 14, color: 'error.main' }} />
            <Typography variant="caption" sx={{ fontWeight: 600, color: 'error.main', fontSize: '0.7rem' }}>
              {holiday.title}
            </Typography>
          </Box>
        )}
        {dayClasses.length === 0 && !holiday && (
          <Typography variant="caption" color="text.disabled" sx={{ py: 1.5, textAlign: 'center', display: 'block', fontSize: '0.72rem' }}>
            No classes
          </Typography>
        )}
        {dayClasses.map((cls) => (
          <ClassCard
            key={cls.id}
            cls={cls}
            role={role}
            rsvpSummary={rsvpData?.[cls.id]}
            myRsvp={myRsvps?.[cls.id]}
            averageRating={averageRatings?.[cls.id]}
            myAttended={myAttendance?.[cls.id]}
            onClick={onClassClick}
          />
        ))}
      </>
    );
  };

  return (
    <Box>
      {/* Week Navigation Header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          mb: 2,
          px: 0.5,
        }}
      >
        <IconButton onClick={() => onWeekChange(weekOffset - 1)} sx={{ minWidth: 40, minHeight: 40 }}>
          <ChevronLeftIcon />
        </IconButton>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {week.label}
          </Typography>
          {weekOffset !== 0 && (
            <IconButton size="small" onClick={() => onWeekChange(0)} sx={{ minWidth: 32, minHeight: 32 }}>
              <TodayIcon sx={{ fontSize: 18 }} />
            </IconButton>
          )}
        </Box>
        <IconButton onClick={() => onWeekChange(weekOffset + 1)} sx={{ minWidth: 40, minHeight: 40 }}>
          <ChevronRightIcon />
        </IconButton>
      </Box>

      {loading ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} variant="rectangular" height={56} sx={{ borderRadius: 1 }} />
          ))}
        </Box>
      ) : isMobile ? (
        /* ==================== MOBILE: Day view with date scroller ==================== */
        <Box>
          {/* Horizontal date pills */}
          <Box
            sx={{
              display: 'flex',
              gap: 0.75,
              overflowX: 'auto',
              pb: 1.5,
              mb: 1,
              scrollbarWidth: 'none',
              '&::-webkit-scrollbar': { display: 'none' },
            }}
          >
            {week.days.map((day, idx) => {
              const dateStr = formatDateISO(day);
              const isSelected = idx === selectedDayIndex;
              const today = isToday(day);
              const hasClasses = (classesByDate[dateStr]?.length || 0) > 0;
              const isHoliday = !!holidays?.[dateStr];

              return (
                <Box
                  key={dateStr}
                  onClick={() => setSelectedDayIndex(idx)}
                  sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    minWidth: 48,
                    py: 0.75,
                    px: 1,
                    borderRadius: 2,
                    cursor: 'pointer',
                    bgcolor: isSelected
                      ? 'primary.main'
                      : isHoliday
                        ? 'error.50'
                        : today
                          ? 'primary.50'
                          : 'transparent',
                    color: isSelected ? 'primary.contrastText' : isHoliday ? 'error.main' : 'text.primary',
                    transition: 'all 0.2s',
                    position: 'relative',
                    '&:hover': { bgcolor: isSelected ? 'primary.dark' : 'action.hover' },
                  }}
                >
                  <Typography
                    variant="caption"
                    sx={{
                      fontWeight: 500,
                      fontSize: '0.65rem',
                      color: isSelected ? 'inherit' : isHoliday ? 'error.main' : 'text.secondary',
                    }}
                  >
                    {DAY_NAMES[idx]}
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 700, fontSize: '1rem' }}>
                    {day.getDate()}
                  </Typography>
                  {(hasClasses || isHoliday) && (
                    <Box
                      sx={{
                        width: 5,
                        height: 5,
                        borderRadius: '50%',
                        bgcolor: isSelected
                          ? 'primary.contrastText'
                          : isHoliday
                            ? 'error.main'
                            : 'primary.main',
                        mt: 0.25,
                      }}
                    />
                  )}
                </Box>
              );
            })}
          </Box>

          {/* Selected day's full name */}
          <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1, color: 'text.secondary' }}>
            {DAY_NAMES_FULL[selectedDayIndex]}, {week.days[selectedDayIndex].toLocaleDateString('en-IN', { month: 'long', day: 'numeric' })}
          </Typography>

          {/* Classes for selected day */}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {renderClassCards(formatDateISO(week.days[selectedDayIndex]))}
          </Box>
        </Box>
      ) : (
        /* ==================== DESKTOP: Adaptive grid - only days with content ==================== */
        <Box>
          {activeDays.length === 0 ? (
            /* Empty week state */
            <Box sx={{ textAlign: 'center', py: 6 }}>
              <EventBusyIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
              <Typography variant="body1" color="text.secondary" sx={{ fontWeight: 500 }}>
                No classes this week
              </Typography>
              <Typography variant="caption" color="text.disabled">
                {role === 'teacher' ? 'Tap + to schedule a class' : 'Check back later'}
              </Typography>
            </Box>
          ) : (
            <>
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: activeDays.length <= 2
                    ? `repeat(${activeDays.length}, minmax(280px, 420px))`
                    : activeDays.length <= 4
                      ? `repeat(${activeDays.length}, 1fr)`
                      : `repeat(auto-fill, minmax(250px, 1fr))`,
                  gap: 1.5,
                  minHeight: 200,
                }}
              >
                {activeDays.map(({ day, idx, dateStr, today, isHoliday }) => (
                  <Box
                    key={dateStr}
                    sx={{
                      display: 'flex',
                      flexDirection: 'column',
                      borderRadius: 1.5,
                      border: '1px solid',
                      borderColor: isHoliday ? 'error.200' : today ? 'primary.main' : 'divider',
                      overflow: 'hidden',
                      bgcolor: 'background.paper',
                      transition: 'border-color 200ms ease',
                    }}
                  >
                    {/* Day header */}
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 0.75,
                        py: 0.75,
                        px: 1.25,
                        bgcolor: isHoliday ? 'error.main' : today ? 'primary.main' : 'grey.50',
                        color: isHoliday || today ? '#fff' : 'text.primary',
                        borderBottom: '1px solid',
                        borderColor: isHoliday ? 'error.main' : today ? 'primary.main' : 'divider',
                      }}
                    >
                      <Typography variant="caption" sx={{ fontWeight: 600, fontSize: '0.72rem' }}>
                        {DAY_NAMES_FULL[idx]}
                      </Typography>
                      <Typography variant="body2" sx={{ fontWeight: 700, ml: 'auto' }}>
                        {day.getDate()}
                      </Typography>
                    </Box>

                    {/* Day's classes */}
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, p: 0.75, flex: 1 }}>
                      {renderClassCards(dateStr)}
                    </Box>
                  </Box>
                ))}
              </Box>

              {/* Empty days summary */}
              {emptyDayNames.length > 0 && (
                <Typography
                  variant="caption"
                  sx={{
                    display: 'block',
                    textAlign: 'center',
                    mt: 1.5,
                    color: 'text.disabled',
                    fontSize: '0.72rem',
                  }}
                >
                  No classes on {emptyDayNames.join(', ')}
                </Typography>
              )}
            </>
          )}
        </Box>
      )}
    </Box>
  );
}
