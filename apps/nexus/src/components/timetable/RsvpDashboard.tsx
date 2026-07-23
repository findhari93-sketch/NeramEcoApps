'use client';

import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  UserAvatar,
  LinearProgress,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  Skeleton,
  alpha,
  useTheme,
} from '@neram/ui';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { RSVP_REASONS, describeReason, reasonShortLabel, type RsvpReasonCode } from '@/lib/rsvp-reasons';
import { tagSx } from './timetable-theme';
import { formatTime } from './date-utils';

interface StudentInfo {
  id: string;
  name: string;
  avatar_url: string | null;
  reason?: string | null;
  reason_code?: string | null;
  responded_at?: string;
}

interface ClassBreakdown {
  class_id: string;
  title: string;
  scheduled_date: string;
  start_time: string;
  end_time: string;
  status: string;
  attending: StudentInfo[];
  not_attending: StudentInfo[];
  reason_tally?: Record<RsvpReasonCode, number>;
  summary: { attending: number; not_attending: number; total: number };
}

interface RsvpDashboardProps {
  open: boolean;
  onClose: () => void;
  classroomId: string;
  getToken: () => Promise<string | null>;
  /** If provided, show single-class view */
  classId?: string;
  /** If not single-class, provide date range */
  startDate?: string;
  endDate?: string;
}

/**
 * Who is coming to each class this week.
 *
 * Everyone attends by default, so the interesting number is the small one: who
 * stepped out and why. Attending is shown as a headline count rather than a
 * roll call, because listing thirty names nobody needs to read buries the four
 * that matter.
 */
function ClassRsvpCard({ breakdown }: { breakdown: ClassBreakdown }) {
  const theme = useTheme();
  const { summary } = breakdown;
  const attendPct = summary.total > 0 ? Math.round((summary.attending / summary.total) * 100) : 100;
  const optedOut = breakdown.not_attending || [];
  const tally = breakdown.reason_tally;

  return (
    <Accordion defaultExpanded={false} disableGutters>
      <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ minHeight: 56 }}>
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 0.75, pr: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Typography variant="body2" sx={{ fontWeight: 700 }}>
              {breakdown.title}
            </Typography>
            {breakdown.start_time && (
              <Typography variant="caption" color="text.secondary">
                {formatTime(breakdown.start_time)} to {formatTime(breakdown.end_time)}
              </Typography>
            )}
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Typography variant="body2" sx={{ fontWeight: 700, color: 'success.dark' }}>
              {summary.attending} of {summary.total} attending
            </Typography>
            {optedOut.length > 0 && (
              <Box component="span" sx={tagSx(theme, 'error')}>
                {optedOut.length} stepped out
              </Box>
            )}
          </Box>

          <LinearProgress
            variant="determinate"
            value={attendPct}
            aria-label={`${attendPct}% attending`}
            sx={{
              height: 6,
              borderRadius: 3,
              bgcolor: alpha(theme.palette.error.main, 0.15),
              '& .MuiLinearProgress-bar': { bgcolor: 'success.main', borderRadius: 3 },
            }}
          />
        </Box>
      </AccordionSummary>

      <AccordionDetails>
        {optedOut.length === 0 ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 1 }}>
            <CheckCircleIcon sx={{ fontSize: 18, color: 'success.main' }} />
            <Typography variant="body2" color="text.secondary">
              The whole class is in. Nobody has stepped out.
            </Typography>
          </Box>
        ) : (
          <>
            {tally && (
              <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mb: 1.5 }}>
                {RSVP_REASONS.filter((r) => (tally[r.code] || 0) > 0).map((r) => (
                  <Box key={r.code} component="span" sx={tagSx(theme, 'neutral')}>
                    {r.shortLabel}: {tally[r.code]}
                  </Box>
                ))}
              </Box>
            )}

            <Typography
              variant="caption"
              sx={{ fontWeight: 700, color: 'error.dark', display: 'block', mb: 0.5 }}
            >
              Not attending ({optedOut.length})
            </Typography>

            <List dense disablePadding>
              {optedOut.map((s) => (
                <ListItem key={s.id} sx={{ px: 0, alignItems: 'flex-start' }}>
                  <ListItemAvatar sx={{ minWidth: 40 }}>
                    <UserAvatar src={s.avatar_url} name={s.name} size={28} />
                  </ListItemAvatar>
                  <ListItemText
                    primary={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {s.name}
                        </Typography>
                        <Box component="span" sx={tagSx(theme, 'neutral')}>
                          {reasonShortLabel(s.reason_code)}
                        </Box>
                      </Box>
                    }
                    secondary={
                      <Typography variant="caption" color="text.secondary">
                        {describeReason(s.reason_code, s.reason)}
                      </Typography>
                    }
                    secondaryTypographyProps={{ component: 'div' }}
                  />
                </ListItem>
              ))}
            </List>
          </>
        )}
      </AccordionDetails>
    </Accordion>
  );
}

export default function RsvpDashboard({
  open,
  onClose,
  classroomId,
  getToken,
  classId,
  startDate,
  endDate,
}: RsvpDashboardProps) {
  const [breakdowns, setBreakdowns] = useState<ClassBreakdown[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open) return;

    async function fetchData() {
      setLoading(true);
      try {
        const token = await getToken();
        if (!token) return;

        const url = classId
          ? `/api/timetable/rsvp-dashboard?classroom_id=${classroomId}&class_id=${classId}`
          : `/api/timetable/rsvp-dashboard?classroom_id=${classroomId}&start=${startDate}&end=${endDate}`;

        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });

        if (res.ok) {
          const data = await res.json();
          if (classId) {
            setBreakdowns([
              {
                class_id: classId,
                title: 'This class',
                scheduled_date: '',
                start_time: '',
                end_time: '',
                status: '',
                ...data,
              },
            ]);
          } else {
            setBreakdowns(data.classes || []);
          }
        }
      } catch {
        // Leave the list empty; the dialog shows its empty state.
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [open, classroomId, classId, startDate, endDate, getToken]);

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle sx={{ pb: 0.5 }}>
        Who is coming
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontWeight: 400 }}>
          Everyone is attending by default. These are the students who stepped out.
        </Typography>
      </DialogTitle>
      <DialogContent>
        {loading ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, pt: 1 }}>
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} variant="rectangular" height={60} sx={{ borderRadius: 1 }} />
            ))}
          </Box>
        ) : breakdowns.length === 0 ? (
          <Typography variant="body2" color="text.disabled" sx={{ textAlign: 'center', py: 4 }}>
            No classes scheduled in this range.
          </Typography>
        ) : (
          <Box sx={{ pt: 1 }}>
            {breakdowns.map((b) => (
              <ClassRsvpCard key={b.class_id} breakdown={b} />
            ))}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} sx={{ minHeight: 44, textTransform: 'none' }}>
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
}
