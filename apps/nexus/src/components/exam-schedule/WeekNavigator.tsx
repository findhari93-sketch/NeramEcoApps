'use client';

import { useState } from 'react';
import { Box, Typography, IconButton, Chip, useTheme, useMediaQuery } from '@neram/ui';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import TodayOutlinedIcon from '@mui/icons-material/TodayOutlined';
import type { WeekData, WeekNavigation } from '@/types/exam-schedule';
import WeekDayColumn from './WeekDayColumn';

interface WeekNavigatorProps {
  week: WeekData;
  navigation: WeekNavigation;
  weekOffset: number;
  onWeekChange: (offset: number) => void;
  totalWeeks: number;
  currentUserId: string;
}

export default function WeekNavigator({
  week,
  navigation,
  weekOffset,
  onWeekChange,
  totalWeeks,
  currentUserId,
}: WeekNavigatorProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [activeDay, setActiveDay] = useState<'fri' | 'sat'>(week.friday ? 'fri' : 'sat');

  const canGoBack = weekOffset > navigation.min_week_offset;
  const canGoForward = weekOffset < navigation.max_week_offset;
  const isCurrentWeek = weekOffset === 0;

  return (
    <Box>
      {/* Week header with navigation */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          mb: 2,
        }}
      >
        <IconButton
          onClick={() => onWeekChange(weekOffset - 1)}
          disabled={!canGoBack}
          sx={{ minWidth: 40, minHeight: 40 }}
        >
          <ChevronLeftIcon />
        </IconButton>

        <Box sx={{ textAlign: 'center', flex: 1 }}>
          <Typography variant="subtitle1" fontWeight={700}>
            {week.week_label}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Week {week.week_number} of {totalWeeks}
          </Typography>
        </Box>

        <IconButton
          onClick={() => onWeekChange(weekOffset + 1)}
          disabled={!canGoForward}
          sx={{ minWidth: 40, minHeight: 40 }}
        >
          <ChevronRightIcon />
        </IconButton>
      </Box>

      {/* "This Week" pill when navigated away */}
      {!isCurrentWeek && (
        <Box sx={{ display: 'flex', justifyContent: 'center', mb: 1.5 }}>
          <Chip
            icon={<TodayOutlinedIcon sx={{ fontSize: '0.9rem' }} />}
            label="This Week"
            size="small"
            onClick={() => onWeekChange(0)}
            clickable
            color="primary"
            variant="outlined"
            sx={{ fontWeight: 600 }}
          />
        </Box>
      )}

      {/* Mobile: day tabs */}
      {isMobile ? (
        <Box>
          {/* Day selector tabs */}
          {week.friday && week.saturday && (
            <Box sx={{ display: 'flex', gap: 1, mb: 1.5 }}>
              <Chip
                label={`Friday${week.friday ? ` (${week.friday.total_students})` : ''}`}
                onClick={() => setActiveDay('fri')}
                color={activeDay === 'fri' ? 'primary' : 'default'}
                variant={activeDay === 'fri' ? 'filled' : 'outlined'}
                sx={{ flex: 1, fontWeight: 600, minHeight: 36 }}
              />
              <Chip
                label={`Saturday${week.saturday ? ` (${week.saturday.total_students})` : ''}`}
                onClick={() => setActiveDay('sat')}
                color={activeDay === 'sat' ? 'primary' : 'default'}
                variant={activeDay === 'sat' ? 'filled' : 'outlined'}
                sx={{ flex: 1, fontWeight: 600, minHeight: 36 }}
              />
            </Box>
          )}

          {/* Active day content */}
          {activeDay === 'fri' && week.friday && (
            <WeekDayColumn day={week.friday} currentUserId={currentUserId} />
          )}
          {activeDay === 'sat' && week.saturday && (
            <WeekDayColumn day={week.saturday} currentUserId={currentUserId} />
          )}
          {/* Single day week */}
          {!week.friday && week.saturday && (
            <WeekDayColumn day={week.saturday} currentUserId={currentUserId} />
          )}
          {week.friday && !week.saturday && (
            <WeekDayColumn day={week.friday} currentUserId={currentUserId} />
          )}
        </Box>
      ) : (
        /* Desktop: two columns side by side */
        <Box sx={{ display: 'flex', gap: 2 }}>
          {week.friday && (
            <WeekDayColumn day={week.friday} currentUserId={currentUserId} />
          )}
          {week.saturday && (
            <WeekDayColumn day={week.saturday} currentUserId={currentUserId} />
          )}
        </Box>
      )}
    </Box>
  );
}
