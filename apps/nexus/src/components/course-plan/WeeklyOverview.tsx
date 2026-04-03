'use client';

import { useMemo } from 'react';
import {
  Box,
  Typography,
  Paper,
  Tabs,
  Tab,
  Chip,
  alpha,
  useTheme,
} from '@neram/ui';
import CircleIcon from '@mui/icons-material/Circle';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';

interface SessionData {
  id: string;
  day_number: number;
  day_of_week: string;
  slot: string;
  title: string;
  status: string;
  topic?: { id: string; name: string } | null;
  teacher?: { id: string; name: string; avatar_url?: string | null } | null;
  homework_count?: number;
}

interface WeekData {
  id: string;
  week_number: number;
  title: string;
  start_date?: string | null;
  end_date?: string | null;
  sessions: SessionData[];
}

interface PlanData {
  weeks: WeekData[];
}

interface WeeklyOverviewProps {
  plan: PlanData;
  sessions: SessionData[];
  activeWeek: number;
  onWeekChange: (weekIndex: number) => void;
}

const DAY_NAMES: Record<string, string> = {
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
  sun: 'Sunday',
};

const STATUS_COLORS: Record<string, string> = {
  planned: 'text.disabled',
  scheduled: 'info.main',
  completed: 'success.main',
  skipped: 'error.main',
};

export default function WeeklyOverview({ plan, sessions, activeWeek, onWeekChange }: WeeklyOverviewProps) {
  const theme = useTheme();

  const currentWeek = plan.weeks[activeWeek];
  const weekSessions = useMemo(() => {
    if (!currentWeek) return [];
    return sessions.filter((s) => {
      // Match sessions that belong to this week
      const weekSessionIds = currentWeek.sessions.map((ws) => ws.id);
      return weekSessionIds.includes(s.id);
    });
  }, [currentWeek, sessions]);

  // Group sessions by day_number
  const dayGroups = useMemo(() => {
    const groups = new Map<number, SessionData[]>();
    const sessionsToGroup = weekSessions.length > 0 ? weekSessions : currentWeek?.sessions || [];
    for (const session of sessionsToGroup) {
      const existing = groups.get(session.day_number) || [];
      existing.push(session);
      groups.set(session.day_number, existing);
    }
    return Array.from(groups.entries()).sort(([a], [b]) => a - b);
  }, [weekSessions, currentWeek]);

  if (!plan.weeks.length) {
    return null;
  }

  return (
    <Box>
      <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5 }}>
        Weekly Schedule
      </Typography>

      <Tabs
        value={activeWeek}
        onChange={(_, v) => onWeekChange(v)}
        variant="scrollable"
        scrollButtons="auto"
        allowScrollButtonsMobile
        sx={{
          mb: 2,
          minHeight: 36,
          '& .MuiTab-root': {
            minHeight: 36,
            py: 0.5,
            px: 2,
            fontSize: '0.8rem',
            fontWeight: 600,
            textTransform: 'none',
          },
        }}
      >
        {plan.weeks.map((week, i) => (
          <Tab key={week.id} label={`Week ${week.week_number}`} />
        ))}
      </Tabs>

      {dayGroups.length === 0 ? (
        <Paper
          elevation={0}
          sx={{
            py: 3,
            textAlign: 'center',
            borderRadius: 2,
            border: `1px solid ${theme.palette.divider}`,
          }}
        >
          <Typography variant="body2" color="text.secondary">
            No sessions in this week yet
          </Typography>
        </Paper>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {dayGroups.map(([dayNumber, daySessions]) => {
            const dayOfWeek = daySessions[0]?.day_of_week || '';
            return (
              <Box key={dayNumber}>
                <Typography
                  variant="caption"
                  sx={{
                    fontWeight: 700,
                    color: 'text.secondary',
                    fontSize: '0.7rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    mb: 0.75,
                    display: 'block',
                  }}
                >
                  Day {dayNumber} ({DAY_NAMES[dayOfWeek] || dayOfWeek})
                </Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                  {daySessions.map((session) => (
                    <Paper
                      key={session.id}
                      elevation={0}
                      sx={{
                        p: 1.5,
                        borderRadius: 2,
                        border: `1px solid ${theme.palette.divider}`,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1,
                      }}
                    >
                      <CircleIcon
                        sx={{
                          fontSize: 8,
                          color: STATUS_COLORS[session.status] || 'text.disabled',
                          flexShrink: 0,
                        }}
                      />
                      <Chip
                        label={session.slot?.toUpperCase() || 'AM'}
                        size="small"
                        sx={{
                          height: 22,
                          fontSize: '0.6rem',
                          fontWeight: 700,
                          bgcolor: alpha(theme.palette.primary.main, 0.08),
                          color: 'primary.main',
                          flexShrink: 0,
                        }}
                      />
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.8rem' }} noWrap>
                          {session.topic?.name || session.title}
                        </Typography>
                        {session.teacher && (
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25, mt: 0.25 }}>
                            <PersonOutlineIcon sx={{ fontSize: '0.7rem', color: 'text.disabled' }} />
                            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
                              {session.teacher.name}
                            </Typography>
                          </Box>
                        )}
                      </Box>
                      {(session.homework_count ?? 0) > 0 && (
                        <Chip
                          label={`${session.homework_count} HW`}
                          size="small"
                          sx={{
                            height: 20,
                            fontSize: '0.6rem',
                            fontWeight: 600,
                            bgcolor: alpha(theme.palette.warning.main, 0.1),
                            color: 'warning.dark',
                          }}
                        />
                      )}
                    </Paper>
                  ))}
                </Box>
              </Box>
            );
          })}
        </Box>
      )}
    </Box>
  );
}
