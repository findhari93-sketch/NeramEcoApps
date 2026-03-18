'use client';

import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  LinearProgress,
  Rating,
  Avatar,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  Divider,
  Skeleton,
} from '@neram/ui';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import DescriptionIcon from '@mui/icons-material/Description';
import PeopleAltIcon from '@mui/icons-material/PeopleAlt';

interface RecapData {
  recording_url: string | null;
  transcript_url: string | null;
  recording_duration_minutes: number | null;
  has_teams_meeting: boolean;
  attendance: { present: number; absent: number; total: number };
  rsvp: { attending: number; not_attending: number; total: number };
  rsvp_vs_actual: { said_would_attend: number; actually_attended: number };
  average_rating: number | null;
  review_count: number;
  reviews: Array<{
    rating: number;
    comment: string | null;
    student: { id: string; name: string; avatar_url: string | null } | null;
  }>;
}

interface MeetingRecapProps {
  classId: string;
  classroomId: string;
  getToken: () => Promise<string | null>;
  role: 'teacher' | 'student' | 'parent';
}

export default function MeetingRecap({ classId, classroomId, getToken, role }: MeetingRecapProps) {
  const [data, setData] = useState<RecapData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchRecap() {
      setLoading(true);
      try {
        const token = await getToken();
        if (!token) return;

        const res = await fetch(
          `/api/timetable/recap?class_id=${classId}&classroom_id=${classroomId}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        if (res.ok) {
          setData(await res.json());
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    }

    fetchRecap();
  }, [classId, classroomId, getToken]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, py: 1 }}>
        <Skeleton variant="rectangular" height={40} sx={{ borderRadius: 1 }} />
        <Skeleton variant="rectangular" height={40} sx={{ borderRadius: 1 }} />
        <Skeleton variant="rectangular" height={60} sx={{ borderRadius: 1 }} />
      </Box>
    );
  }

  if (!data) return null;

  const attendancePercent = data.attendance.total > 0
    ? Math.round((data.attendance.present / data.attendance.total) * 100)
    : 0;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* Recording + Transcript */}
      {(data.recording_url || data.transcript_url) && (
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          {data.recording_url && (
            <Button
              variant="contained"
              size="small"
              href={data.recording_url}
              target="_blank"
              startIcon={<PlayCircleOutlineIcon />}
              sx={{ minHeight: 40, textTransform: 'none' }}
            >
              Watch Recording
              {data.recording_duration_minutes != null && ` (${data.recording_duration_minutes}m)`}
            </Button>
          )}
          {data.transcript_url && (
            <Button
              variant="outlined"
              size="small"
              href={data.transcript_url}
              target="_blank"
              startIcon={<DescriptionIcon />}
              sx={{ minHeight: 40, textTransform: 'none' }}
            >
              Transcript
            </Button>
          )}
        </Box>
      )}

      {/* Attendance Summary */}
      {data.attendance.total > 0 && (
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
            <PeopleAltIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              Attendance: {data.attendance.present}/{data.attendance.total} ({attendancePercent}%)
            </Typography>
          </Box>
          <LinearProgress
            variant="determinate"
            value={attendancePercent}
            sx={{
              height: 8,
              borderRadius: 4,
              bgcolor: 'error.100',
              '& .MuiLinearProgress-bar': { bgcolor: 'success.main', borderRadius: 4 },
            }}
          />
        </Box>
      )}

      {/* RSVP vs Actual */}
      {role === 'teacher' && data.rsvp_vs_actual.said_would_attend > 0 && (
        <Box sx={{ bgcolor: 'grey.50', p: 1.5, borderRadius: 1 }}>
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
            RSVP vs Actual Attendance
          </Typography>
          <Typography variant="body2">
            {data.rsvp_vs_actual.said_would_attend} said they&apos;d attend →{' '}
            {data.rsvp_vs_actual.actually_attended} actually did
          </Typography>
        </Box>
      )}

      {/* Average Rating */}
      {data.average_rating != null && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Rating value={data.average_rating} precision={0.1} size="small" readOnly />
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {data.average_rating}/5
          </Typography>
          <Typography variant="caption" color="text.secondary">
            ({data.review_count} review{data.review_count !== 1 ? 's' : ''})
          </Typography>
        </Box>
      )}

      {/* Reviews */}
      {data.reviews.length > 0 && (
        <Box>
          <Divider sx={{ mb: 1 }} />
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            {role === 'teacher' ? 'Student Reviews' : 'Your Review'}
          </Typography>
          <List dense disablePadding>
            {data.reviews.map((review, idx) => (
              <ListItem key={idx} sx={{ px: 0, alignItems: 'flex-start' }}>
                {review.student && (
                  <ListItemAvatar sx={{ minWidth: 36 }}>
                    <Avatar
                      src={review.student.avatar_url || undefined}
                      sx={{ width: 28, height: 28, fontSize: '0.75rem' }}
                    >
                      {review.student.name?.[0]}
                    </Avatar>
                  </ListItemAvatar>
                )}
                <ListItemText
                  primary={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      {review.student && (
                        <Typography variant="caption" sx={{ fontWeight: 600 }}>
                          {review.student.name}
                        </Typography>
                      )}
                      <Rating value={review.rating} size="small" readOnly sx={{ fontSize: 14 }} />
                    </Box>
                  }
                  secondary={review.comment || undefined}
                  secondaryTypographyProps={{ variant: 'caption' }}
                />
              </ListItem>
            ))}
          </List>
        </Box>
      )}

      {/* No data message */}
      {!data.recording_url && !data.transcript_url && data.attendance.total === 0 && data.review_count === 0 && (
        <Typography variant="body2" color="text.disabled" sx={{ textAlign: 'center', py: 2 }}>
          No recap data available yet
        </Typography>
      )}
    </Box>
  );
}
