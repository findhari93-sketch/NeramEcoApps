'use client';

import { useMemo, useRef, useEffect, useState, useCallback } from 'react';
import { Box, Typography, IconButton, Button, Popover, useMediaQuery, useTheme } from '@neram/ui';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import TodayIcon from '@mui/icons-material/Today';
import VideocamIcon from '@mui/icons-material/Videocam';
import PeopleAltIcon from '@mui/icons-material/PeopleAlt';
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord';
import { type ClassCardData } from './ClassCard';
import { type HolidayInfo } from './WeeklyCalendarGrid';

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DEFAULT_START_HOUR = 8;
const DEFAULT_END_HOUR = 20;
const ROW_HEIGHT = 72; // px per day row (slightly taller for 2 lines of text)
const DATE_COL_WIDTH = 60; // px for the left date column

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

interface TimeSlotGridProps {
  classes: ClassCardData[];
  weekOffset: number;
  onWeekChange: (offset: number) => void;
  holidays?: Record<string, HolidayInfo>;
  onSlotClick?: (date: string, startTime: string, event?: React.MouseEvent) => void;
  onClassClick?: (cls: ClassCardData) => void;
  // Optional: pass RSVP data for hover popover
  rsvpData?: Record<string, { attending: number; total: number }>;
  role?: 'teacher' | 'student' | 'parent';
}

export default function TimeSlotGrid({
  classes,
  weekOffset,
  onWeekChange,
  holidays,
  onSlotClick,
  onClassClick,
  rsvpData,
  role,
}: TimeSlotGridProps) {
  const week = useMemo(() => getWeekDates(weekOffset), [weekOffset]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));

  // Hover popover state
  const [popoverAnchor, setPopoverAnchor] = useState<HTMLElement | null>(null);
  const [popoverClass, setPopoverClass] = useState<ClassCardData | null>(null);
  const hoverTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleBlockMouseEnter = useCallback((event: React.MouseEvent<HTMLElement>, cls: ClassCardData) => {
    if (!isDesktop) return;
    const target = event.currentTarget;
    hoverTimeout.current = setTimeout(() => {
      setPopoverAnchor(target);
      setPopoverClass(cls);
    }, 250);
  }, [isDesktop]);

  const handleBlockMouseLeave = useCallback(() => {
    if (hoverTimeout.current) {
      clearTimeout(hoverTimeout.current);
      hoverTimeout.current = null;
    }
    setPopoverAnchor(null);
    setPopoverClass(null);
  }, []);

  // Compute hour range dynamically
  const HOURS = useMemo(() => {
    let startHour = DEFAULT_START_HOUR;
    let endHour = DEFAULT_END_HOUR;
    for (const cls of classes) {
      const sh = parseInt(cls.start_time.split(':')[0]);
      const eh = parseInt(cls.end_time.split(':')[0]);
      if (sh < startHour) startHour = sh;
      if (eh >= endHour) endHour = eh + 1;
    }
    return Array.from({ length: endHour - startHour + 1 }, (_, i) => i + startHour);
  }, [classes]);

  // Measure available width and compute cell width dynamically
  const [cellWidth, setCellWidth] = useState(80);

  useEffect(() => {
    const measure = () => {
      if (containerRef.current) {
        const available = containerRef.current.clientWidth - DATE_COL_WIDTH - 2;
        const calculated = Math.floor(available / HOURS.length);
        setCellWidth(Math.max(calculated, isMobile ? 48 : 50));
      }
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [isMobile, HOURS.length]);

  // Auto-scroll to current time on mount
  useEffect(() => {
    if (scrollRef.current && weekOffset === 0) {
      const now = new Date();
      const currentHour = now.getHours();
      if (currentHour >= HOURS[0] && currentHour <= HOURS[HOURS.length - 1]) {
        const scrollTo = (currentHour - HOURS[0]) * cellWidth - cellWidth;
        scrollRef.current.scrollLeft = Math.max(0, scrollTo);
      }
    }
  }, [weekOffset, cellWidth, HOURS]);

  // Group classes by date
  const classesByDate = useMemo(() => {
    const map: Record<string, ClassCardData[]> = {};
    for (const cls of classes) {
      if (!map[cls.scheduled_date]) map[cls.scheduled_date] = [];
      map[cls.scheduled_date].push(cls);
    }
    return map;
  }, [classes]);

  const timeToX = (time: string): number => {
    const [h, m] = time.split(':').map(Number);
    return ((h - HOURS[0]) + m / 60) * cellWidth;
  };

  const handleSlotClick = (dayIdx: number, hourIdx: number, event: React.MouseEvent) => {
    const dateStr = formatDateISO(week.days[dayIdx]);
    if (holidays?.[dateStr]) return;
    const hour = HOURS[hourIdx];
    const startTime = `${hour.toString().padStart(2, '0')}:00`;
    onSlotClick?.(dateStr, startTime, event);
  };

  const totalTimeWidth = HOURS.length * cellWidth;
  const fitsInView = containerRef.current
    ? (totalTimeWidth + DATE_COL_WIDTH) <= containerRef.current.clientWidth
    : false;

  // Status colors using theme tokens
  const getStatusBg = (status: string): string => {
    switch (status) {
      case 'scheduled': return theme.palette.primary.main;
      case 'live': return theme.palette.error.main;
      case 'completed': return theme.palette.success.main;
      case 'cancelled': return theme.palette.grey[400];
      case 'rescheduled': return theme.palette.warning.main;
      default: return theme.palette.primary.main;
    }
  };

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

      {/* Calendar Grid */}
      <Box
        sx={{
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 1.5,
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
                  px: 0.5,
                  transition: 'background-color 200ms ease',
                }}
              >
                <Typography variant="caption" sx={{ fontWeight: 600, fontSize: '0.65rem', lineHeight: 1.2 }}>
                  {DAY_NAMES[idx]}
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 700, lineHeight: 1.2, fontSize: '0.9rem' }}>
                  {day.getDate()}
                </Typography>
                {isHoliday && (
                  <Typography
                    variant="caption"
                    sx={{
                      fontSize: '0.48rem',
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
            const today = isToday(day);
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
                  // Today row highlight
                  bgcolor: today ? 'primary.50' : 'transparent',
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
                      cursor: isHoliday ? 'not-allowed' : onSlotClick ? 'pointer' : 'default',
                      bgcolor: isHoliday ? 'rgba(211,47,47,0.04)' : 'transparent',
                      '&:hover': isHoliday || !onSlotClick ? {} : { bgcolor: 'action.hover' },
                      transition: 'background-color 150ms ease',
                    }}
                  />
                ))}

                {/* Class blocks overlaid horizontally */}
                {dayClasses.map((cls) => {
                  const left = timeToX(cls.start_time);
                  const right = timeToX(cls.end_time);
                  const width = Math.max(right - left, cellWidth * 0.5);
                  const isCancelled = cls.status === 'cancelled';
                  const isLive = cls.status === 'live';
                  const bgColor = getStatusBg(cls.status);

                  return (
                    <Box
                      key={cls.id}
                      onMouseEnter={(e) => handleBlockMouseEnter(e, cls)}
                      onMouseLeave={handleBlockMouseLeave}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleBlockMouseLeave();
                        onClassClick?.(cls);
                      }}
                      sx={{
                        position: 'absolute',
                        left,
                        top: 4,
                        bottom: 4,
                        width,
                        bgcolor: bgColor,
                        color: '#fff',
                        borderRadius: 1,
                        px: 0.75,
                        py: 0.5,
                        overflow: 'hidden',
                        cursor: 'pointer',
                        boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
                        opacity: isCancelled ? 0.45 : 1,
                        transition: 'all 200ms ease',
                        '&:hover': {
                          boxShadow: '0 3px 12px rgba(0,0,0,0.25)',
                          transform: 'scale(1.02)',
                        },
                        zIndex: 2,
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'center',
                        // Cancelled: diagonal stripe pattern
                        ...(isCancelled && {
                          backgroundImage: `repeating-linear-gradient(
                            -45deg,
                            transparent,
                            transparent 4px,
                            rgba(255,255,255,0.15) 4px,
                            rgba(255,255,255,0.15) 8px
                          )`,
                        }),
                        // Live: subtle pulse
                        ...(isLive && {
                          animation: 'livePulse 2s ease-in-out infinite',
                          '@keyframes livePulse': {
                            '0%, 100%': { boxShadow: '0 1px 4px rgba(0,0,0,0.15)' },
                            '50%': { boxShadow: `0 2px 16px ${theme.palette.error.main}40` },
                          },
                        }),
                      }}
                    >
                      {/* Live dot + Title */}
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        {isLive && (
                          <FiberManualRecordIcon
                            sx={{
                              fontSize: 7,
                              color: '#fff',
                              flexShrink: 0,
                              animation: 'blink 1.5s infinite',
                              '@keyframes blink': { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.3 } },
                            }}
                          />
                        )}
                        <Typography
                          variant="caption"
                          sx={{
                            fontWeight: 700,
                            fontSize: '0.7rem',
                            color: 'inherit',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            lineHeight: 1.3,
                            textDecoration: isCancelled ? 'line-through' : 'none',
                          }}
                        >
                          {cls.title}
                        </Typography>
                      </Box>
                      {/* Teacher name + Teams icon */}
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
                        <Typography
                          variant="caption"
                          sx={{
                            fontSize: '0.58rem',
                            color: 'rgba(255,255,255,0.8)',
                            lineHeight: 1.3,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            flex: 1,
                          }}
                        >
                          {cls.teacher?.name?.split(' ')[0] || ''}
                        </Typography>
                        {cls.teams_meeting_id && (
                          <VideocamIcon sx={{ fontSize: 11, color: 'rgba(255,255,255,0.75)', flexShrink: 0 }} />
                        )}
                      </Box>
                    </Box>
                  );
                })}
              </Box>
            );
          })}
        </Box>
      </Box>

      {/* Hover Popover - desktop only */}
      <Popover
        open={!!popoverAnchor && !!popoverClass}
        anchorEl={popoverAnchor}
        onClose={handleBlockMouseLeave}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        sx={{ pointerEvents: 'none' }}
        disableRestoreFocus
        slotProps={{
          paper: {
            sx: {
              p: 1.5,
              maxWidth: 300,
              borderRadius: 1.5,
              boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
              pointerEvents: 'auto',
            },
            onMouseLeave: handleBlockMouseLeave,
          },
        }}
      >
        {popoverClass && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            <Typography variant="body2" sx={{ fontWeight: 700 }}>
              {popoverClass.title}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {formatTimeShort(popoverClass.start_time)} - {formatTimeShort(popoverClass.end_time)}
            </Typography>
            {popoverClass.teacher && (
              <Typography variant="caption" color="text.secondary">
                {popoverClass.teacher.name}
              </Typography>
            )}
            {popoverClass.topic && (
              <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.68rem' }}>
                {popoverClass.topic.title}
              </Typography>
            )}
            {popoverClass.batch && (
              <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.68rem' }}>
                Batch: {popoverClass.batch.name}
              </Typography>
            )}

            {/* RSVP count in popover */}
            {role === 'teacher' && rsvpData?.[popoverClass.id] && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.25 }}>
                <PeopleAltIcon sx={{ fontSize: 13, color: 'text.secondary' }} />
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.68rem' }}>
                  {rsvpData[popoverClass.id].attending}/{rsvpData[popoverClass.id].total} attending
                </Typography>
              </Box>
            )}

            {/* Quick join button */}
            {(popoverClass.status === 'scheduled' || popoverClass.status === 'live') &&
              (popoverClass.teams_meeting_join_url || popoverClass.teams_meeting_url) && (
              <Button
                variant="contained"
                size="small"
                href={popoverClass.teams_meeting_join_url || popoverClass.teams_meeting_url || ''}
                target="_blank"
                onClick={(e: React.MouseEvent) => e.stopPropagation()}
                startIcon={<VideocamIcon sx={{ fontSize: '14px !important' }} />}
                sx={{
                  mt: 0.5,
                  textTransform: 'none',
                  fontSize: '0.72rem',
                  minHeight: 32,
                  bgcolor: popoverClass.status === 'live' ? 'success.main' : 'primary.main',
                  '&:hover': { bgcolor: popoverClass.status === 'live' ? 'success.dark' : 'primary.dark' },
                }}
              >
                {popoverClass.status === 'live' ? 'Join Now' : 'Join Meeting'}
              </Button>
            )}
          </Box>
        )}
      </Popover>
    </Box>
  );
}
