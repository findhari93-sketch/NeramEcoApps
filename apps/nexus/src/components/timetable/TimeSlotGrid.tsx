'use client';

import { useMemo } from 'react';
import { Box, Typography, IconButton } from '@neram/ui';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import TodayIcon from '@mui/icons-material/Today';
import VideocamIcon from '@mui/icons-material/Videocam';
import { type ClassCardData } from './ClassCard';
import { type HolidayInfo } from './WeeklyCalendarGrid';

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const HOURS = Array.from({ length: 13 }, (_, i) => i + 8); // 8 AM to 8 PM

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

function timeToRow(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return (h - 8) * 2 + (m >= 30 ? 1 : 0);
}

function timeToRowEnd(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return (h - 8) * 2 + (m > 0 ? (m >= 30 ? 2 : 1) : 0);
}

function formatTime(hour: number) {
  const ampm = hour >= 12 ? 'PM' : 'AM';
  return `${hour % 12 || 12} ${ampm}`;
}

function formatTimeShort(time: string) {
  const [h, m] = time.split(':');
  const hour = parseInt(h);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  return `${hour % 12 || 12}:${m} ${ampm}`;
}

const statusColors: Record<string, string> = {
  scheduled: '#1976d2',
  live: '#d32f2f',
  completed: '#2e7d32',
  cancelled: '#9e9e9e',
  rescheduled: '#ed6c02',
};

interface TimeSlotGridProps {
  classes: ClassCardData[];
  weekOffset: number;
  onWeekChange: (offset: number) => void;
  holidays?: Record<string, HolidayInfo>;
  onSlotClick?: (date: string, startTime: string) => void;
  onClassClick?: (cls: ClassCardData) => void;
}

export default function TimeSlotGrid({
  classes,
  weekOffset,
  onWeekChange,
  holidays,
  onSlotClick,
  onClassClick,
}: TimeSlotGridProps) {
  const week = useMemo(() => getWeekDates(weekOffset), [weekOffset]);

  // Group classes by date
  const classesByDate = useMemo(() => {
    const map: Record<string, ClassCardData[]> = {};
    for (const cls of classes) {
      if (!map[cls.scheduled_date]) map[cls.scheduled_date] = [];
      map[cls.scheduled_date].push(cls);
    }
    return map;
  }, [classes]);

  const handleSlotClick = (dayIdx: number, hourIdx: number) => {
    const dateStr = formatDateISO(week.days[dayIdx]);
    if (holidays?.[dateStr]) return; // Don't create on holidays
    const hour = HOURS[hourIdx];
    const startTime = `${hour.toString().padStart(2, '0')}:00`;
    onSlotClick?.(dateStr, startTime);
  };

  return (
    <Box>
      {/* Week Navigation */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
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

      {/* Calendar Grid */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: '60px repeat(7, 1fr)',
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 1,
          overflow: 'hidden',
          bgcolor: 'background.paper',
        }}
      >
        {/* Top-left corner (empty) */}
        <Box sx={{ borderBottom: '1px solid', borderColor: 'divider', bgcolor: 'grey.50' }} />

        {/* Day headers */}
        {week.days.map((day, idx) => {
          const dateStr = formatDateISO(day);
          const today = isToday(day);
          const isHoliday = !!holidays?.[dateStr];

          return (
            <Box
              key={dateStr}
              sx={{
                textAlign: 'center',
                py: 1,
                borderBottom: '1px solid',
                borderLeft: '1px solid',
                borderColor: 'divider',
                bgcolor: isHoliday ? 'error.main' : today ? 'primary.main' : 'grey.50',
                color: isHoliday || today ? '#fff' : 'text.primary',
              }}
            >
              <Typography variant="caption" sx={{ fontWeight: 500, fontSize: '0.7rem' }}>
                {DAY_NAMES[idx]}
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 700 }}>
                {day.getDate()}
              </Typography>
              {isHoliday && (
                <Typography variant="caption" sx={{ fontSize: '0.6rem', display: 'block' }}>
                  {holidays![dateStr].title}
                </Typography>
              )}
            </Box>
          );
        })}

        {/* Hour rows */}
        {HOURS.map((hour, hourIdx) => (
          <Box key={hour} sx={{ display: 'contents' }}>
            {/* Time label */}
            <Box
              sx={{
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'center',
                py: 0.5,
                px: 0.5,
                borderTop: '1px solid',
                borderColor: 'divider',
                bgcolor: 'grey.50',
                height: 48,
              }}
            >
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
                {formatTime(hour)}
              </Typography>
            </Box>

            {/* Day cells */}
            {week.days.map((day, dayIdx) => {
              const dateStr = formatDateISO(day);
              const isHoliday = !!holidays?.[dateStr];

              return (
                <Box
                  key={`${dateStr}-${hour}`}
                  onClick={() => !isHoliday && handleSlotClick(dayIdx, hourIdx)}
                  sx={{
                    borderTop: '1px solid',
                    borderLeft: '1px solid',
                    borderColor: 'divider',
                    height: 48,
                    position: 'relative',
                    cursor: isHoliday ? 'not-allowed' : 'pointer',
                    bgcolor: isHoliday
                      ? 'error.50'
                      : 'transparent',
                    '&:hover': isHoliday
                      ? {}
                      : { bgcolor: 'primary.50' },
                    transition: 'background-color 0.15s',
                  }}
                />
              );
            })}
          </Box>
        ))}
      </Box>

      {/* Class blocks overlaid on the grid */}
      {/* Render class blocks as absolute positioned elements using CSS */}
      <Box sx={{ position: 'relative', mt: -((HOURS.length * 48) + 60) }}>
        <Box sx={{ ml: '60px', display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', height: HOURS.length * 48, position: 'relative', top: 60 }}>
          {week.days.map((day, dayIdx) => {
            const dateStr = formatDateISO(day);
            const dayClasses = classesByDate[dateStr] || [];

            return (
              <Box key={dateStr} sx={{ position: 'relative' }}>
                {dayClasses.map((cls) => {
                  const startRow = timeToRow(cls.start_time);
                  const endRow = timeToRowEnd(cls.end_time);
                  const top = startRow * 24; // Each half-hour = 24px (48px per hour / 2)
                  const height = Math.max((endRow - startRow) * 24, 24);

                  return (
                    <Box
                      key={cls.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        onClassClick?.(cls);
                      }}
                      sx={{
                        position: 'absolute',
                        top,
                        left: 2,
                        right: 2,
                        height,
                        bgcolor: statusColors[cls.status] || statusColors.scheduled,
                        color: '#fff',
                        borderRadius: 0.5,
                        px: 0.5,
                        py: 0.25,
                        overflow: 'hidden',
                        cursor: 'pointer',
                        fontSize: '0.65rem',
                        lineHeight: 1.3,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                        '&:hover': { opacity: 0.9, boxShadow: '0 2px 6px rgba(0,0,0,0.3)' },
                        transition: 'opacity 0.15s',
                        zIndex: 2,
                      }}
                    >
                      <Typography
                        variant="caption"
                        sx={{
                          fontWeight: 600,
                          fontSize: '0.65rem',
                          color: 'inherit',
                          display: 'block',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {cls.title}
                      </Typography>
                      {height >= 36 && (
                        <Typography
                          variant="caption"
                          sx={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.85)', display: 'block' }}
                        >
                          {formatTimeShort(cls.start_time)} - {formatTimeShort(cls.end_time)}
                        </Typography>
                      )}
                      {height >= 48 && cls.teams_meeting_id && (
                        <VideocamIcon sx={{ fontSize: 12, color: 'rgba(255,255,255,0.8)', mt: 0.25 }} />
                      )}
                    </Box>
                  );
                })}
              </Box>
            );
          })}
        </Box>
      </Box>
      {/* Spacer to account for the absolute positioning overlay */}
      <Box sx={{ height: 0 }} />
    </Box>
  );
}
