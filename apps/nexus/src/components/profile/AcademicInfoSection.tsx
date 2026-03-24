'use client';

import { Box, Typography, Paper, LinearProgress, Skeleton } from '@neram/ui';
import ClassIcon from '@mui/icons-material/Class';

interface DashboardData {
  attendanceSummary: { total: number; attended: number; percentage: number };
  checklistProgress: { completed: number; total: number };
  topicProgress: { completed: number; total: number };
}

interface AcademicInfoSectionProps {
  dashboardData: DashboardData | null;
  loading: boolean;
  classroomName: string | null;
}

export default function AcademicInfoSection({
  dashboardData,
  loading,
  classroomName,
}: AcademicInfoSectionProps) {
  return (
    <Paper
      elevation={0}
      sx={{ p: { xs: 2.5, sm: 3 }, mb: 2, borderRadius: 3, border: '1px solid', borderColor: 'divider' }}
    >
      {/* Active Classroom */}
      {classroomName && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2.5 }}>
          <ClassIcon sx={{ color: 'primary.main', fontSize: 20 }} />
          <Box>
            <Typography variant="caption" color="text.secondary">Active Classroom</Typography>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>{classroomName}</Typography>
          </Box>
        </Box>
      )}

      <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 2, fontWeight: 600, letterSpacing: 0.5 }}>
        Attendance & Progress
      </Typography>

      {loading ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} variant="rectangular" height={48} sx={{ borderRadius: 1 }} />
          ))}
        </Box>
      ) : !dashboardData ? (
        <Typography variant="body2" color="text.secondary">
          No data available.
        </Typography>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
          {/* Attendance */}
          <ProgressRow
            label="Attendance"
            value={dashboardData.attendanceSummary.percentage}
            displayValue={`${dashboardData.attendanceSummary.percentage}%`}
            subtitle={`${dashboardData.attendanceSummary.attended} of ${dashboardData.attendanceSummary.total} classes`}
            color="primary"
          />

          {/* Checklist */}
          {dashboardData.checklistProgress.total > 0 && (
            <ProgressRow
              label="Checklist"
              value={(dashboardData.checklistProgress.completed / dashboardData.checklistProgress.total) * 100}
              displayValue={`${dashboardData.checklistProgress.completed}/${dashboardData.checklistProgress.total}`}
              color="success"
            />
          )}

          {/* Topics */}
          {dashboardData.topicProgress.total > 0 && (
            <ProgressRow
              label="Topics Completed"
              value={(dashboardData.topicProgress.completed / dashboardData.topicProgress.total) * 100}
              displayValue={`${dashboardData.topicProgress.completed}/${dashboardData.topicProgress.total}`}
              color="warning"
            />
          )}
        </Box>
      )}
    </Paper>
  );
}

function ProgressRow({
  label,
  value,
  displayValue,
  subtitle,
  color,
}: {
  label: string;
  value: number;
  displayValue: string;
  subtitle?: string;
  color: 'primary' | 'success' | 'warning';
}) {
  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
        <Typography variant="body2" sx={{ fontWeight: 500 }}>
          {label}
        </Typography>
        <Typography variant="body2" sx={{ fontWeight: 700, color: `${color}.main` }}>
          {displayValue}
        </Typography>
      </Box>
      <LinearProgress
        variant="determinate"
        value={value}
        color={color}
        sx={{ height: 8, borderRadius: 4, bgcolor: 'action.hover' }}
      />
      {subtitle && (
        <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
          {subtitle}
        </Typography>
      )}
    </Box>
  );
}
