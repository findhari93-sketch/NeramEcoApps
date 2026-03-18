'use client';

import { useMemo, useRef, useEffect, useState } from 'react';
import { Box, Typography, IconButton, useMediaQuery, useTheme } from '@neram/ui';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import TodayIcon from '@mui/icons-material/Today';
import VideocamIcon from '@mui/icons-material/Videocam';
import { type ClassCardData } from './ClassCard';
import { type HolidayInfo } from './WeeklyCalendarGrid';

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const HOURS = Array.from({ length: 13 }, (_, i) => i + 8); // 8 AM to 8 PM
const ROW_HEIGHT = 68; // px per day row
const DATE_COL_WIDTH = 56; // px for the left date column

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

function formatTime(hour: number) {
  const ampm = hour >= 12 ? 'PM' : 'AM';
  return `${hour % 12 || 12}${ampm}`;
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
  onSlotClick?: (date: string, startTime: string, event?: React.MouseEvent) => void;
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
  const scrollRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  // Measure available width and compute cell width dynamically
  const [cellWidth, setCellWidth] = useState(80);

  useEffect(() => {
    const measure = () => {
      if (containerRef.current) {
        const available = containerRef.current.clientWidth - DATE_COL_WIDTH - 2; // border
        const calculated = Math.floor(available / HOURS.length);
        // Minimum 50px per cell on desktop, 40px on mobile scroll
        setCellWidth(Math.max(calculated, isMobile ? 48 : 50));
      }
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [isMobile]);

  // Auto-scroll to current time on mount
  useEffect(() => {
    if (scrollRef.current && weekOffset === 0) {
      const now = new Date();
      const currentHour = now.getHours();
      if (currentHour >= 8 && currentHour <= 20) {
        const scrollTo = (currentHour - 8) * cellWidth - cellWidth; // show 1 hour before current
        scrollRef.current.scrollLeft = Math.max(0, scrollTo);
      }
    }
  }, [weekOffset, cellWidth]);

  // Group classes by date
  const classesByDate = useMemo(() => {
    const map: Record<string, ClassCardData[]> = {};
    for (const cls of classes) {
      if (!map[cls.scheduled_date]) map[cls.scheduled_date] = [];
      map[cls.scheduled_date].push(cls);
    }
    return map;
  }, [classes]);

  /** Convert a time string to a pixel offset from the left edge of the time grid */
  const timeToX = (time: string): number => {
    const [h, m] = time.split(':').map(Number);
    return ((h - 8) + m / 60) * cellWidth;
  };

  const handleSlotClick = (dayIdx: number, hourIdx: number, event: React.MouseEvent) => {
    const dateStr = formatDateISO(week.days[dayIdx]);
    if (holidays?.[dateStr]) return;
    const hour = HOURS[hourIdx];
    const startTime = `${hour.toString().padStart(2, '0')}:00`;
    onSlotClick?.(dateStr, startTime, event);
  };

  const totalTimeWidth = HOURS.length * cellWidth;
  // On desktop, if the grid fits, don't scroll
  const fitsInView = containerRef.current
    ? (totalTimeWidth + DATE_COL_WIDTH) <= containerRef.current.clientWidth
    : false;

  return (
    <Box ref={containerRef}>
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

      {/* Calendar Grid — dates as rows, times as columns */}
      <Box
        sx={{
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 1,
          overflow: 'hidden',
          bgcolor: 'background.paper',
          display: 'flex',
          width: '100%',
        }}
      >
        {/* Sticky date column */}
        <Box
          sx={{
            flexShrink: 0,
            width: DATE_COL_WIDTH,
            zIndex: 3,
            bgcolor: 'background.paper',
            borderRight: '2px solid',
            borderRightColor: 'divider',
          }}
        >
          {/* Corner cell */}
          <Box
            sx={{
              height: 36,
              borderBottom: '1px solid',
              borderColor: 'divider',
              bgcolor: 'grey.50',
            }}
          />
          {/* Date labels */}
          {week.days.map((day, idx) => {
            const dateStr = formatDateISO(day);
            const today = isToday(day);
            const isHoliday = !!holidays?.[dateStr];

            return (
              <Box
                key={dateStr}
                sx={{
                  height: ROW_HEIGHT,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderBottom: idx < 6 ? '1px solid' : 'none',
                  borderColor: 'divider',
                  bgcolor: isHoliday ? 'error.main' : today ? 'primary.main' : 'grey.50',
                  color: isHoliday || today ? '#fff' : 'text.primary',
                  px: 0.25,
                }}
              >
                <Typography variant="caption" sx={{ fontWeight: 500, fontSize: '0.65rem', lineHeight: 1.2 }}>
                  {DAY_NAMES[idx]}
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
                  {day.getDate()}
                </Typography>
                {isHoliday && (
                  <Typography
                    variant="caption"
                    sx={{
                      fontSize: '0.5rem',
                      lineHeight: 1.1,
                      textAlign: 'center',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      maxWidth: '100%',
                    }}
                  >
                    {holidays![dateStr].title}
                  </Typography>
                )}
              </Box>
            );
          })}
        </Box>

        {/* Scrollable time area */}
        <Box
          ref={scrollRef}
          sx={{
            flex: 1,
            overflowX: fitsInView ? 'hidden' : 'auto',
            overflowY: 'hidden',
            // Smooth scrolling & scroll snap on mobile for better touch UX
            ...(isMobile && {
              WebkitOverflowScrolling: 'touch',
              scrollSnapType: 'x proximity',
            }),
          }}
        >
          {/* Time header row */}
          <Box sx={{ display: 'flex', height: 36, minWidth: totalTimeWidth }}>
            {HOURS.map((hour) => (
              <Box
                key={hour}
                sx={{
                  width: cellWidth,
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderBottom: '1px solid',
                  borderLeft: '1px solid',
                  borderColor: 'divider',
                  bgcolor: 'grey.50',
                }}
              >
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.62rem', fontWeight: 500 }}>
                  {formatTime(hour)}
                </Typography>
              </Box>
            ))}
          </Box>

          {/* Day rows */}
          {week.days.map((day, dayIdx) => {
            const dateStr = formatDateISO(day);
            const isHoliday = !!holidays?.[dateStr];
            const dayClasses = classesByDate[dateStr] || [];

            return (
              <Box
                key={dateStr}
                sx={{
                  display: 'flex',
                  height: ROW_HEIGHT,
                  minWidth: totalTimeWidth,
                  position: 'relative',
                  borderBottom: dayIdx < 6 ? '1px solid' : 'none',
                  borderColor: 'divider',
                }}
              >
                {/* Hour cells (clickable background) */}
                {HOURS.map((hour, hourIdx) => (
                  <Box
                    key={`${dateStr}-${hour}`}
                    onClick={(e) => !isHoliday && handleSlotClick(dayIdx, hourIdx, e)}
                    sx={{
                      width: cellWidth,
                      flexShrink: 0,
                      borderLeft: '1px solid',
                      borderColor: 'divider',
                      cursor: isHoliday ? 'not-allowed' : 'pointer',
                      bgcolor: isHoliday ? 'rgba(211,47,47,0.04)' : 'transparent',
                      '&:hover': isHoliday ? {} : { bgcolor: 'rgba(25,118,210,0.04)' },
                      transition: 'background-color 0.15s',
                    }}
                  />
                ))}

                {/* Class blocks overlaid horizontally */}
                {dayClasses.map((cls) => {
                  const left = timeToX(cls.start_time);
                  const right = timeToX(cls.end_time);
                  const width = Math.max(right - left, cellWidth * 0.5);

                  return (
                    <Box
                      key={cls.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        onClassClick?.(cls);
                      }}
                      sx={{
                        position: 'absolute',
                        left,
                        top: 3,
                        bottom: 3,
                        width,
                        bgcolor: statusColors[cls.status] || statusColors.scheduled,
                        color: '#fff',
                        borderRadius: 1,
                        px: 0.75,
                        py: 0.25,
                        overflow: 'hidden',
                        cursor: 'pointer',
                        boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
                        '&:hover': { opacity: 0.9, boxShadow: '0 2px 8px rgba(0,0,0,0.3)' },
                        transition: 'opacity 0.15s',
                        zIndex: 2,
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'center',
                      }}
                    >
                      <Typography
                        variant="caption"
                        sx={{
                          fontWeight: 700,
                          fontSize: '0.68rem',
                          color: 'inherit',
                          display: 'block',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          lineHeight: 1.3,
                        }}
                      >
                        {cls.title}
                      </Typography>
                      <Typography
                        variant="caption"
                        sx={{ fontSize: '0.58rem', color: 'rgba(255,255,255,0.85)', lineHeight: 1.3 }}
                      >
                        {formatTimeShort(cls.start_time)} – {formatTimeShort(cls.end_time)}
                      </Typography>
                      {cls.teams_meeting_id && (
                        <VideocamIcon sx={{ fontSize: 12, color: 'rgba(255,255,255,0.8)', mt: 0.15 }} />
                      )}
                    </Box>
                  );
                })}
              </Box>
            );
          })}
        </Box>
      </Box>
    </Box>
  );
}
