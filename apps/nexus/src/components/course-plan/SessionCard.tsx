'use client';

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
}

const STATUS_CONFIG: Record<string, { color: 'default' | 'info' | 'success' | 'error'; icon: React.ReactNode }> = {
  planned: { color: 'default', icon: <ScheduleIcon sx={{ fontSize: 14 }} /> },
  scheduled: { color: 'info', icon: <ScheduleIcon sx={{ fontSize: 14 }} /> },
  completed: { color: 'success', icon: <CheckCircleIcon sx={{ fontSize: 14 }} /> },
  skipped: { color: 'error', icon: <SkipNextIcon sx={{ fontSize: 14 }} /> },
};

export default function SessionCard({ session, onEdit, onPush }: SessionCardProps) {
  const statusCfg = STATUS_CONFIG[session.status] || STATUS_CONFIG.planned;
  const slotLabel = session.slot?.toUpperCase() || '?';
  const canPush = session.status === 'planned' && !session.scheduled_class_id;

  return (
    <Card
      elevation={0}
      sx={{
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 2,
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
            </Box>

            <Typography
              variant="body2"
              sx={{
                fontWeight: 600,
                lineHeight: 1.3,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {session.title}
            </Typography>

            {session.topic && (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
                {session.topic.name}
              </Typography>
            )}

            {session.teacher && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
                <Avatar
                  src={session.teacher.avatar_url || undefined}
                  sx={{ width: 20, height: 20, fontSize: '0.65rem' }}
                >
                  {session.teacher.name?.[0]}
                </Avatar>
                <Typography variant="caption" color="text.secondary">
                  {session.teacher.name}
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
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}
