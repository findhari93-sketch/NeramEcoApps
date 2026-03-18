'use client';

import { useState, useMemo } from 'react';
import { Box, Typography, IconButton, useMediaQuery, useTheme, Skeleton } from '@neram/ui';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import TodayIcon from '@mui/icons-material/Today';
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
  /** Holidays keyed by date string (YYYY-MM-DD) */
  holidays?: Record<string, HolidayInfo>;
  // Pass-through to ClassCard
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
  // Adjust to Monday of the current week
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
  return d.toISOString().split('T')[0];
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
  onEdit,
  onDelete,
  onRsvp,
  onRate,
  onViewAttendance,
  onSyncRecording,
}: WeeklyCalendarGridProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const week = useMemo(() => getWeekDates(weekOffset), [weekOffset]);

  // On mobile, show single day with date scroller
  const [selectedDayIndex, setSelectedDayIndex] = useState(() => {
    // Default to today if within the current week, else Monday
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

  const renderClassCards = (dateStr: string) => {
    const holiday = holidays?.[dateStr];
    const dayClasses = classesByDate[dateStr] || [];

    return (
      <>
        {/* Holiday indicator */}
        {holiday && (
          <Box
            sx={{
              p: 1,
              borderRadius: 1,
              bgcolor: 'error.50',
              border: '1px dashed',
              borderColor: 'error.200',
              textAlign: 'center',
            }}
          >
            <Typography variant="caption" sx={{ fontWeight: 700, color: 'error.main' }}>
              🏖️ {holiday.title}
            </Typography>
          </Box>
        )}
        {dayClasses.length === 0 && !holiday && (
          <Typography variant="caption" color="text.disabled" sx={{ py: 2, textAlign: 'center', display: 'block' }}>
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
            onEdit={onClassClick ? undefined : onEdit}
            onDelete={onClassClick ? undefined : onDelete}
            onRsvp={onClassClick ? undefined : onRsvp}
            onRate={onClassClick ? undefined : onRate}
            onViewAttendance={onClassClick ? undefined : onViewAttendance}
            onSyncRecording={onClassClick ? undefined : onSyncRecording}
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
            <Skeleton key={i} variant="rectangular" height={80} sx={{ borderRadius: 1 }} />
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
                  {/* Dot indicator for days with classes or holidays */}
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
        /* ==================== DESKTOP: 7-column weekly grid ==================== */
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(7, 1fr)',
            gap: 1,
            minHeight: 300,
          }}
        >
          {week.days.map((day, idx) => {
            const dateStr = formatDateISO(day);
            const today = isToday(day);
            const isHoliday = !!holidays?.[dateStr];

            return (
              <Box
                key={dateStr}
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  borderRadius: 1,
                  border: '1px solid',
                  borderColor: isHoliday ? 'error.main' : today ? 'primary.main' : 'divider',
                  overflow: 'hidden',
                  bgcolor: isHoliday ? 'error.50' : today ? 'primary.50' : 'background.default',
                }}
              >
                {/* Day header */}
                <Box
                  sx={{
                    textAlign: 'center',
                    py: 0.75,
                    bgcolor: isHoliday ? 'error.main' : today ? 'primary.main' : 'grey.100',
                    color: isHoliday || today ? '#fff' : 'text.primary',
                  }}
                >
                  <Typography variant="caption" sx={{ fontWeight: 500, fontSize: '0.7rem' }}>
                    {DAY_NAMES[idx]}
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>
                    {day.getDate()}
                  </Typography>
                </Box>

                {/* Day's classes */}
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, p: 0.75, flex: 1 }}>
                  {renderClassCards(dateStr)}
                </Box>
              </Box>
            );
          })}
        </Box>
      )}
    </Box>
  );
}
