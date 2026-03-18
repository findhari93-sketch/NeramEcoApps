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
  Avatar,
  Chip,
  LinearProgress,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  Skeleton,
} from '@neram/ui';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';

interface StudentInfo {
  id: string;
  name: string;
  avatar_url: string | null;
  reason?: string | null;
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
  no_response: StudentInfo[];
  summary: { attending: number; not_attending: number; no_response: number; total: number };
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

function formatTime(time: string) {
  const [h, m] = time.split(':');
  const hour = parseInt(h);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  return `${hour % 12 || 12}:${m} ${ampm}`;
}

function StudentList({ students, color }: { students: StudentInfo[]; color: 'success' | 'error' | 'default' }) {
  if (students.length === 0) {
    return (
      <Typography variant="caption" color="text.disabled" sx={{ pl: 2 }}>
        None
      </Typography>
    );
  }

  return (
    <List dense disablePadding>
      {students.map((s) => (
        <ListItem key={s.id} sx={{ px: 0 }}>
          <ListItemAvatar sx={{ minWidth: 36 }}>
            <Avatar src={s.avatar_url || undefined} sx={{ width: 28, height: 28, fontSize: '0.75rem' }}>
              {s.name?.[0]}
            </Avatar>
          </ListItemAvatar>
          <ListItemText
            primary={s.name}
            secondary={
              color === 'error' && s.reason ? (
                <Typography variant="caption" color="error.main" component="span">
                  Reason: {s.reason}
                </Typography>
              ) : undefined
            }
            primaryTypographyProps={{ variant: 'body2' }}
          />
        </ListItem>
      ))}
    </List>
  );
}

function ClassRsvpCard({ breakdown }: { breakdown: ClassBreakdown }) {
  const { summary } = breakdown;
  const attendPct = summary.total > 0 ? Math.round((summary.attending / summary.total) * 100) : 0;

  return (
    <Accordion defaultExpanded={false}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {breakdown.title}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {formatTime(breakdown.start_time)} - {formatTime(breakdown.end_time)}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Chip
              icon={<CheckCircleIcon sx={{ fontSize: '14px !important' }} />}
              label={summary.attending}
              size="small"
              color="success"
              variant="outlined"
              sx={{ height: 22, fontSize: '0.7rem' }}
            />
            <Chip
              icon={<CancelIcon sx={{ fontSize: '14px !important' }} />}
              label={summary.not_attending}
              size="small"
              color="error"
              variant="outlined"
              sx={{ height: 22, fontSize: '0.7rem' }}
            />
            <Chip
              icon={<HelpOutlineIcon sx={{ fontSize: '14px !important' }} />}
              label={summary.no_response}
              size="small"
              variant="outlined"
              sx={{ height: 22, fontSize: '0.7rem' }}
            />
          </Box>
          <LinearProgress
            variant="determinate"
            value={attendPct}
            sx={{
              height: 6,
              borderRadius: 3,
              bgcolor: 'error.100',
              '& .MuiLinearProgress-bar': { bgcolor: 'success.main', borderRadius: 3 },
              mt: 0.5,
            }}
          />
        </Box>
      </AccordionSummary>
      <AccordionDetails>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {/* Attending */}
          <Box>
            <Typography variant="caption" sx={{ fontWeight: 700, color: 'success.main' }}>
              Attending ({summary.attending})
            </Typography>
            <StudentList students={breakdown.attending} color="success" />
          </Box>

          {/* Not attending */}
          <Box>
            <Typography variant="caption" sx={{ fontWeight: 700, color: 'error.main' }}>
              Not Attending ({summary.not_attending})
            </Typography>
            <StudentList students={breakdown.not_attending} color="error" />
          </Box>

          {/* No response */}
          <Box>
            <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>
              No Response ({summary.no_response})
            </Typography>
            <StudentList students={breakdown.no_response} color="default" />
          </Box>
        </Box>
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

        let url: string;
        if (classId) {
          url = `/api/timetable/rsvp-dashboard?classroom_id=${classroomId}&class_id=${classId}`;
        } else {
          url = `/api/timetable/rsvp-dashboard?classroom_id=${classroomId}&start=${startDate}&end=${endDate}`;
        }

        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (res.ok) {
          const data = await res.json();
          if (classId) {
            // Single class response — wrap it
            setBreakdowns([{ class_id: classId, title: '', scheduled_date: '', start_time: '', end_time: '', status: '', ...data }]);
          } else {
            setBreakdowns(data.classes || []);
          }
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [open, classroomId, classId, startDate, endDate, getToken]);

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>RSVP Dashboard</DialogTitle>
      <DialogContent>
        {loading ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} variant="rectangular" height={60} sx={{ borderRadius: 1 }} />
            ))}
          </Box>
        ) : breakdowns.length === 0 ? (
          <Typography variant="body2" color="text.disabled" sx={{ textAlign: 'center', py: 4 }}>
            No classes found for this period
          </Typography>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {breakdowns.map((b) => (
              <ClassRsvpCard key={b.class_id} breakdown={b} />
            ))}
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} sx={{ minHeight: 48 }}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
