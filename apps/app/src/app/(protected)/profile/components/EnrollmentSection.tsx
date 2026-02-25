'use client';

import { Box, Typography, Card, CardContent, Grid, LinearProgress } from '@neram/ui';
import type { StudentProfile } from '@neram/database';

interface EnrollmentSectionProps {
  studentProfile: StudentProfile;
  courseName: string | null;
  batchName: string | null;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatWatchTime(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

function relativeTime(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return `${months} month${months > 1 ? 's' : ''} ago`;
}

export default function EnrollmentSection({
  studentProfile,
  courseName,
  batchName,
}: EnrollmentSectionProps) {
  const feeProgress = studentProfile.total_fee > 0
    ? Math.round((studentProfile.fee_paid / studentProfile.total_fee) * 100)
    : 0;

  const stats = [
    { label: 'Lessons Completed', value: studentProfile.lessons_completed, color: 'primary.main' },
    { label: 'Assignments Done', value: studentProfile.assignments_completed, color: 'success.main' },
    { label: 'Watch Time', value: formatWatchTime(studentProfile.total_watch_time), color: 'info.main' },
    { label: 'Last Active', value: relativeTime(studentProfile.last_activity_at), color: 'warning.main' },
  ];

  return (
    <Box>
      {/* Enrollment info */}
      <Box sx={{ mb: 2 }}>
        <Typography variant="body2" color="text.secondary">
          Enrolled: {formatDate(studentProfile.enrollment_date)}
        </Typography>
        {courseName && (
          <Typography variant="body2" color="text.secondary">
            Course: {courseName}
          </Typography>
        )}
        {batchName && (
          <Typography variant="body2" color="text.secondary">
            Batch: {batchName}
          </Typography>
        )}
      </Box>

      {/* Progress stats */}
      <Grid container spacing={1.5}>
        {stats.map((stat) => (
          <Grid item xs={6} key={stat.label}>
            <Card variant="outlined" sx={{ textAlign: 'center' }}>
              <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                <Typography variant="h5" color={stat.color} sx={{ fontWeight: 600 }}>
                  {stat.value}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {stat.label}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Fee progress */}
      {studentProfile.total_fee > 0 && (
        <Box sx={{ mt: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
            <Typography variant="caption" color="text.secondary">
              Fee Paid
            </Typography>
            <Typography variant="caption" sx={{ fontWeight: 600 }}>
              {`₹${studentProfile.fee_paid.toLocaleString('en-IN')}`} / {`₹${studentProfile.total_fee.toLocaleString('en-IN')}`}
            </Typography>
          </Box>
          <LinearProgress
            variant="determinate"
            value={feeProgress}
            sx={{ height: 8, borderRadius: 4 }}
            color={feeProgress >= 100 ? 'success' : 'primary'}
          />
          {studentProfile.fee_due > 0 && studentProfile.next_payment_date && (
            <Typography variant="caption" color="warning.main" sx={{ display: 'block', mt: 0.5 }}>
              Next payment: ₹{studentProfile.fee_due.toLocaleString('en-IN')} due {formatDate(studentProfile.next_payment_date)}
            </Typography>
          )}
        </Box>
      )}
    </Box>
  );
}
