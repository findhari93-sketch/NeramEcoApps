'use client';

import {
  Box,
  Typography,
  Paper,
  Button,
  Chip,
  alpha,
  useTheme,
} from '@neram/ui';
import VideocamOutlinedIcon from '@mui/icons-material/VideocamOutlined';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined';
import SelfImprovementOutlinedIcon from '@mui/icons-material/SelfImprovementOutlined';

interface SessionData {
  id: string;
  slot: string;
  title: string;
  status: string;
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
}

interface HomeworkData {
  id: string;
  title: string;
  due_date?: string | null;
  type: string;
}

interface TodaysPlanCardProps {
  sessions: SessionData[];
  homework: HomeworkData[];
}

function formatTime(time: string) {
  const [h, m] = time.split(':');
  const hour = parseInt(h);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${m} ${ampm}`;
}

function SessionRow({ session, label }: { session: SessionData; label: string }) {
  const theme = useTheme();
  const sc = session.scheduled_class;

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        p: 1.5,
        borderRadius: 2,
        bgcolor: alpha(theme.palette.background.paper, 0.6),
      }}
    >
      <Box
        sx={{
          width: 40,
          height: 40,
          borderRadius: 1.5,
          bgcolor: alpha(theme.palette.primary.main, 0.1),
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <Typography variant="caption" sx={{ fontWeight: 700, color: 'primary.main', fontSize: '0.65rem' }}>
          {label}
        </Typography>
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
          {session.topic?.name || session.title}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.25 }}>
          {sc && (
            <>
              <AccessTimeIcon sx={{ fontSize: '0.75rem', color: 'text.disabled' }} />
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                {formatTime(sc.start_time)} - {formatTime(sc.end_time)}
              </Typography>
            </>
          )}
          {session.teacher && (
            <>
              <PersonOutlineIcon sx={{ fontSize: '0.75rem', color: 'text.disabled', ml: 0.5 }} />
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                {session.teacher.name}
              </Typography>
            </>
          )}
        </Box>
      </Box>
      {sc?.meeting_url && sc.status !== 'completed' && (
        <Button
          variant="contained"
          size="small"
          href={sc.meeting_url}
          target="_blank"
          startIcon={<VideocamOutlinedIcon sx={{ fontSize: '1rem !important' }} />}
          sx={{
            textTransform: 'none',
            minHeight: 48,
            borderRadius: 2,
            fontWeight: 600,
            fontSize: '0.8rem',
            px: 2,
            boxShadow: 'none',
            '&:hover': { boxShadow: 'none' },
          }}
        >
          Join
        </Button>
      )}
    </Box>
  );
}

export default function TodaysPlanCard({ sessions, homework }: TodaysPlanCardProps) {
  const theme = useTheme();
  const today = new Date();
  const dateStr = today.toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
  });

  const hasSessions = sessions.length > 0;

  return (
    <Paper
      elevation={0}
      sx={{
        p: 2,
        borderRadius: 2.5,
        background: hasSessions
          ? `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${alpha(theme.palette.primary.dark, 0.9)} 100%)`
          : `linear-gradient(135deg, ${theme.palette.grey[100]} 0%, ${theme.palette.grey[200]} 100%)`,
        color: hasSessions ? '#fff' : 'text.primary',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700, fontSize: '0.85rem' }}>
          Today&apos;s Plan
        </Typography>
        <Typography variant="caption" sx={{ opacity: 0.85, fontSize: '0.7rem' }}>
          {dateStr}
        </Typography>
      </Box>

      {hasSessions ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {sessions.map((session) => (
            <SessionRow
              key={session.id}
              session={session}
              label={session.slot?.toUpperCase() || 'AM'}
            />
          ))}
        </Box>
      ) : (
        <Box sx={{ textAlign: 'center', py: 2 }}>
          <SelfImprovementOutlinedIcon sx={{ fontSize: 40, opacity: 0.5, mb: 1 }} />
          <Typography variant="body2" sx={{ opacity: 0.8 }}>
            No classes today — review your notes!
          </Typography>
        </Box>
      )}

      {homework.length > 0 && (
        <Box sx={{ mt: 1.5, pt: 1.5, borderTop: `1px solid ${alpha(hasSessions ? '#fff' : theme.palette.divider, 0.2)}` }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.75 }}>
            <AssignmentOutlinedIcon sx={{ fontSize: '0.85rem', opacity: 0.7 }} />
            <Typography variant="caption" sx={{ fontWeight: 600, opacity: 0.8, fontSize: '0.7rem' }}>
              Homework due today
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
            {homework.map((hw) => (
              <Chip
                key={hw.id}
                label={hw.title}
                size="small"
                sx={{
                  height: 24,
                  fontSize: '0.65rem',
                  bgcolor: alpha(hasSessions ? '#fff' : theme.palette.warning.main, 0.2),
                  color: hasSessions ? '#fff' : 'warning.dark',
                  fontWeight: 500,
                }}
              />
            ))}
          </Box>
        </Box>
      )}
    </Paper>
  );
}
