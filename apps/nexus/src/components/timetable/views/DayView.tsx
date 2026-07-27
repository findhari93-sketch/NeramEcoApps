'use client';

import { useMemo } from 'react';
import { Box, Typography, alpha, useTheme } from '@neram/ui';
import EventBusyIcon from '@mui/icons-material/EventBusy';
import GridView from './GridView';
import DayStrip from '../DayStrip';
import { formatDateISO, type HolidayInfo, type ResolvedBand, type WeekDates } from '../date-utils';
import { type ClassCardData } from '../ClassCard';

interface DayViewProps {
  classes: ClassCardData[];
  /** The week containing the anchor. Drives the day strip AND the band scale. */
  week: WeekDates;
  anchorDate: Date;
  band: ResolvedBand;
  onSelectDate: (d: Date) => void;
  loading?: boolean;
  holidays?: Record<string, HolidayInfo>;
  role: 'teacher' | 'student' | 'parent';
  onClassClick?: (cls: ClassCardData) => void;
  onSlotClick?: (date: string, startTime: string, event?: React.MouseEvent) => void;
  rsvpData?: Record<string, { attending: number; total: number }>;
}

/**
 * One day, as a full-width time band, with the rest of the week a tap away.
 *
 * A thin wrapper over GridView: it already draws a band for whatever days it is
 * given, so a one-day week is all it needs. The band still comes from the whole
 * week, so paging day to day keeps a stable vertical scale rather than
 * rescaling under the user.
 */
export default function DayView({
  classes,
  week,
  anchorDate,
  band,
  onSelectDate,
  loading,
  holidays,
  role,
  onClassClick,
  onSlotClick,
  rsvpData,
}: DayViewProps) {
  const theme = useTheme();
  const anchorISO = formatDateISO(anchorDate);

  const singleDay = useMemo<WeekDates>(
    () => ({ ...week, days: [anchorDate] }),
    [week, anchorDate],
  );

  const dayClasses = useMemo(
    () => classes.filter((c) => c.scheduled_date === anchorISO),
    [classes, anchorISO],
  );

  const markedDates = useMemo(
    () => new Set(classes.map((c) => c.scheduled_date)),
    [classes],
  );

  const holidayDates = useMemo(() => new Set(Object.keys(holidays ?? {})), [holidays]);
  const holiday = holidays?.[anchorISO];

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <DayStrip
        days={week.allDays}
        selectedISO={anchorISO}
        onSelect={onSelectDate}
        markedDates={markedDates}
        holidayDates={holidayDates}
      />

      {/* A holiday is an all-day fact, so it reads above the band rather than
          as a block inside it. */}
      {holiday && (
        <Box
          sx={{
            flex: '0 0 auto',
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            px: 2,
            py: 1.25,
            bgcolor: alpha(theme.palette.text.primary, 0.03),
            borderBottom: `1px solid ${theme.palette.divider}`,
          }}
        >
          <EventBusyIcon fontSize="small" sx={{ color: 'text.disabled' }} />
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontWeight: 700, fontSize: '0.875rem' }} noWrap>
              {holiday.title}
            </Typography>
            {holiday.description && (
              <Typography variant="caption" color="text.secondary" noWrap>
                {holiday.description}
              </Typography>
            )}
          </Box>
        </Box>
      )}

      <GridView
        classes={dayClasses}
        week={singleDay}
        band={band}
        loading={loading}
        holidays={holidays}
        role={role}
        onClassClick={onClassClick}
        onSlotClick={onSlotClick}
        rsvpData={rsvpData}
      />
    </Box>
  );
}
