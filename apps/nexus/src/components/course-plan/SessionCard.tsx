'use client';

import { useMemo } from 'react';
import {
  Card,
  CardContent,
  Typography,
  Chip,
  Box,
  IconButton,
  Avatar,
  Tooltip,
} from '@neram/ui';
import EditIcon from '@mui/icons-material/Edit';
import PublishIcon from '@mui/icons-material/Publish';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ScheduleIcon from '@mui/icons-material/Schedule';
import SkipNextIcon from '@mui/icons-material/SkipNext';
import TaskAltIcon from '@mui/icons-material/TaskAlt';

export interface SessionData {
  id: string;
  day_number: number;
  day_of_week?: string;
  slot: string;
  title: string;
  description?: string | null;
  notes?: string | null;
  status: string;
  start_time?: string | null;
  end_time?: string | null;
  topic_id?: string | null;
  teacher_id?: string | null;
  scheduled_class_id?: string | null;
  topic?: { id: string; name: string } | null;
  teacher?: { id: string; name: string; avatar_url?: string | null } | null;
  scheduled_class?: {
    id: string;
    scheduled_date: string;
    start_time: string;
    end_time: string;
    status: string;
    meeting_url?: string | null;
  } | null;
  homework_count?: number;
  week_id?: string;
  plan_id?: string;
}

interface SessionCardProps {
  session: SessionData;
  onEdit: (session: SessionData) => void;
  onPush: (session: SessionData) => void;
  onComplete?: (session: SessionData) => void;
}

const STATUS_CONFIG: Record<string, { color: 'default' | 'info' | 'success' | 'error'; icon: React.ReactNode }> = {
  planned: { color: 'default', icon: <ScheduleIcon sx={{ fontSize: 14 }} /> },
  scheduled: { color: 'info', icon: <ScheduleIcon sx={{ fontSize: 14 }} /> },
  completed: { color: 'success', icon: <CheckCircleIcon sx={{ fontSize: 14 }} /> },
  skipped: { color: 'error', icon: <SkipNextIcon sx={{ fontSize: 14 }} /> },
};

/**
 * Extract teacher name from session.teacher or from session.notes.
 * Notes format: "Sudarshini | Apr 3 | Day 7" — first segment before `|`.
 */
function getTeacherDisplay(session: SessionData): { name: string; avatar?: string | null } | null {
  if (session.teacher?.name) {
    return { name: session.teacher.name, avatar: session.teacher.avatar_url };
  }
  if (session.notes) {
    const parts = session.notes.split('|');
    if (parts.length >= 2) {
      const name = parts[0].trim();
      if (name && name.length > 0 && name.length < 40) {
        return { name, avatar: null };
      }
    }
  }
  return null;
}

/**
 * Parse date from notes (e.g., "Sudarshini | Apr 3 | Day 7") and determine
 * whether the session end time has passed.
 * AM sessions end at 12:00, PM sessions end at 20:00.
 * Returns: { canComplete, hasEnded, reason }
 */
function getCompletionState(session: SessionData): { canComplete: boolean; hasEnded: boolean; reason: string } {
  // Only planned/scheduled sessions can be marked complete
  if (session.status !== 'planned' && session.status !== 'scheduled') {
    return { canComplete: false, hasEnded: false, reason: '' };
  }

  const now = new Date();
  const notes = session.notes || '';
  const slot = (session.slot || '').toLowerCase();

  // Extract date from notes: "... | Apr 3 | ..." or "... | Apr 03 | ..."
  const MONTHS: Record<string, number> = {
    Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
    Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
  };

  let sessionDate: Date | null = null;

  // Try notes parsing first
  const dateMatch = notes.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})\b/);
  if (dateMatch) {
    const month = MONTHS[dateMatch[1]];
    const day = parseInt(dateMatch[2], 10);
    // Assume current year, but handle year boundary
    const year = now.getFullYear();
    sessionDate = new Date(year, month, day);
  }

  // Fallback: try scheduled_class date
  if (!sessionDate && session.scheduled_class?.scheduled_date) {
    sessionDate = new Date(session.scheduled_class.scheduled_date);
  }

  if (!sessionDate) {
    // No date info — allow completion (teacher knows best)
    return { canComplete: true, hasEnded: true, reason: '' };
  }

  // Set the end time based on slot
  const endHour = slot === 'am' ? 12 : 20;
  const endDate = new Date(sessionDate.getFullYear(), sessionDate.getMonth(), sessionDate.getDate(), endHour, 0, 0);

  if (now >= endDate) {
    return { canComplete: true, hasEnded: true, reason: '' };
  }

  // Session is in the future or hasn't ended yet
  return { canComplete: true, hasEnded: false, reason: "Class hasn't ended yet" };
}

export default function SessionCard({ session, onEdit, onPush, onComplete }: SessionCardProps) {
  const statusCfg = STATUS_CONFIG[session.status] || STATUS_CONFIG.planned;
  const slotLabel = session.slot?.toUpperCase() || '?';
  const slotTime = session.slot === 'am' ? '11:00 - 12:00' : session.slot === 'pm' ? '7:00 - 8:00 PM' : '';
  const canPush = session.status === 'planned' && !session.scheduled_class_id;

  const teacherDisplay = useMemo(() => getTeacherDisplay(session), [session]);
  const completionState = useMemo(() => getCompletionState(session), [session]);

  // Left border color based on status
  const leftBorderColor =
    session.status === 'completed'
      ? 'success.main'
      : session.status === 'skipped'
        ? 'error.main'
        : undefined;

  return (
    <Card
      elevation={0}
      sx={{
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 2,
        borderLeft: leftBorderColor ? '4px solid' : '1px solid',
        borderLeftColor: leftBorderColor || 'divider',
        transition: 'box-shadow 200ms ease',
        '&:hover': { boxShadow: '0 2px 8px rgba(0,0,0,0.06)' },
      }}
    >
      <CardContent sx={{ p: { xs: 1.5, sm: 2 }, '&:last-child': { pb: { xs: 1.5, sm: 2 } } }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
          {/* Day number badge */}
          <Box
            sx={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              bgcolor: 'primary.main',
              color: 'primary.contrastText',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              fontSize: '0.85rem',
              flexShrink: 0,
            }}
          >
            {session.day_number}
          </Box>

          {/* Content */}
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.5, flexWrap: 'wrap' }}>
              <Chip
                label={slotLabel}
                size="small"
                color={slotLabel === 'AM' ? 'warning' : 'secondary'}
                sx={{ fontWeight: 700, fontSize: '0.65rem', height: 22 }}
              />
              <Chip
                label={session.status}
                size="small"
                color={statusCfg.color}
                icon={statusCfg.icon as React.ReactElement}
                variant="outlined"
                sx={{ textTransform: 'capitalize', fontSize: '0.65rem', height: 22 }}
              />
              {slotTime && (
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                  {slotTime}
                </Typography>
              )}
            </Box>

            <Typography
              variant="body2"
              sx={{
                fontWeight: 600,
                lineHeight: 1.3,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                ...(session.status === 'skipped' && {
                  textDecoration: 'line-through',
                  color: 'text.disabled',
                }),
              }}
            >
              {session.title}
            </Typography>

            {session.topic && (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
                {session.topic.name}
              </Typography>
            )}

            {/* Teacher display — from session.teacher or extracted from notes */}
            {teacherDisplay && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
                <Avatar
                  src={teacherDisplay.avatar || undefined}
                  sx={{ width: 24, height: 24, fontSize: '0.7rem' }}
                >
                  {teacherDisplay.name[0]}
                </Avatar>
                <Typography variant="caption" color="text.secondary">
                  {teacherDisplay.name}
                </Typography>
              </Box>
            )}

            {session.scheduled_class && (
              <Typography variant="caption" color="info.main" sx={{ display: 'block', mt: 0.5, fontWeight: 500 }}>
                {session.scheduled_class.scheduled_date} {session.scheduled_class.start_time}–{session.scheduled_class.end_time}
              </Typography>
            )}
          </Box>

          {/* Actions */}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, flexShrink: 0 }}>
            <Tooltip title="Edit session">
              <IconButton
                size="small"
                onClick={() => onEdit(session)}
                sx={{ width: 36, height: 36 }}
              >
                <EditIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            {canPush && (
              <Tooltip title="Push to timetable">
                <IconButton
                  size="small"
                  color="primary"
                  onClick={() => onPush(session)}
                  sx={{ width: 36, height: 36 }}
                >
                  <PublishIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
            {/* Mark Complete button */}
            {completionState.canComplete && onComplete && (
              <Tooltip title={completionState.hasEnded ? 'Mark complete' : completionState.reason}>
                <span>
                  <IconButton
                    size="small"
                    color="success"
                    disabled={!completionState.hasEnded}
                    onClick={() => onComplete(session)}
                    sx={{ width: 36, height: 36 }}
                  >
                    <TaskAltIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
            )}
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}
