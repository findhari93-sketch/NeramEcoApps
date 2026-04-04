'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  Typography,
  Button,
  Paper,
  Alert,
  Chip,
  CircularProgress,
} from '@neram/ui';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import type { CoursePlanCSVData, TeacherMapping } from '@/lib/course-plan-csv-schema';

interface ConfirmStepProps {
  planId: string;
  data: CoursePlanCSVData;
  teacherMappings: TeacherMapping[];
  onComplete: () => void;
  getToken: () => Promise<string | null>;
}

export default function ConfirmStep({
  planId,
  data,
  teacherMappings,
  onComplete,
  getToken,
}: ConfirmStepProps) {
  const router = useRouter();
  const [importing, setImporting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<Record<string, number> | null>(null);

  const sessionsWithHomework = data.sessions.filter((s) => s.homework).length;

  const handleImport = async () => {
    setImporting(true);
    setError(null);

    try {
      const token = await getToken();
      if (!token) {
        setError('Authentication failed');
        setImporting(false);
        return;
      }

      // Build teacher abbreviation → user_id map
      const teacherMap: Record<string, string> = {};
      for (const t of teacherMappings) {
        teacherMap[t.abbreviation.toLowerCase()] = t.user_id;
        teacherMap[t.abbreviation] = t.user_id;
      }

      const res = await fetch(`/api/course-plans/${planId}/csv-upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ data, teacherMap }),
      });

      const result = await res.json();

      if (!res.ok) {
        setError(result.error || 'Import failed');
        setImporting(false);
        return;
      }

      setSummary(result.summary);
      setSuccess(true);
      onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  // Success state
  if (success) {
    return (
      <Paper
        variant="outlined"
        sx={{ p: { xs: 3, sm: 4 }, textAlign: 'center', borderRadius: 2.5 }}
      >
        <CheckCircleOutlineIcon
          sx={{ fontSize: 56, color: 'success.main', mb: 1.5 }}
        />
        <Typography variant="h6" fontWeight={700} sx={{ mb: 1 }}>
          Import Complete
        </Typography>
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ mb: 2.5 }}
        >
          Your course plan data has been imported successfully.
        </Typography>

        {summary && (
          <Box
            sx={{
              display: 'flex',
              gap: 1,
              flexWrap: 'wrap',
              justifyContent: 'center',
              mb: 3,
            }}
          >
            {summary.weeks_updated > 0 && (
              <Chip label={`${summary.weeks_updated} weeks updated`} color="success" size="small" />
            )}
            {summary.sessions_updated > 0 && (
              <Chip label={`${summary.sessions_updated} sessions updated`} color="success" size="small" />
            )}
            {summary.homework_inserted > 0 && (
              <Chip label={`${summary.homework_inserted} homework added`} color="success" size="small" />
            )}
            {summary.tests_inserted > 0 && (
              <Chip label={`${summary.tests_inserted} tests added`} color="success" size="small" />
            )}
            {summary.drills_inserted > 0 && (
              <Chip label={`${summary.drills_inserted} drills added`} color="success" size="small" />
            )}
            {summary.resources_inserted > 0 && (
              <Chip label={`${summary.resources_inserted} resources added`} color="success" size="small" />
            )}
          </Box>
        )}

        <Button
          variant="contained"
          onClick={() => router.push(`/teacher/course-plans/${planId}`)}
          sx={{ textTransform: 'none', minHeight: 48 }}
        >
          Go to Plan Dashboard
        </Button>
      </Paper>
    );
  }

  // Confirmation state
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
      {/* Summary card */}
      <Paper
        variant="outlined"
        sx={{ p: { xs: 2, sm: 3 }, borderRadius: 2.5 }}
      >
        <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 2 }}>
          Import Summary
        </Typography>

        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(3, 1fr)' },
            gap: 1.5,
          }}
        >
          <SummaryItem label="Sessions" value={data.sessions.length} />
          <SummaryItem label="Weeks" value={data.weeks.length} />
          <SummaryItem label="Homework" value={sessionsWithHomework} />
          <SummaryItem label="Tests" value={data.tests.length} />
          <SummaryItem label="Drills" value={data.drills.length} />
          <SummaryItem label="Resources" value={data.resources.length} />
        </Box>
      </Paper>

      {/* Warning */}
      <Alert severity="warning" icon={<WarningAmberIcon />}>
        <Typography variant="body2" fontWeight={600} sx={{ mb: 0.5 }}>
          This will update existing data
        </Typography>
        <Typography variant="body2">
          Sessions and weeks that already have data will be updated.
          Homework, tests, drills, and resources will be added (not replaced).
          This action cannot be undone.
        </Typography>
      </Alert>

      {/* Error */}
      {error && (
        <Alert severity="error" icon={<ErrorOutlineIcon />}>
          {error}
        </Alert>
      )}

      {/* Import button */}
      <Button
        variant="contained"
        size="large"
        onClick={handleImport}
        disabled={importing}
        startIcon={
          importing ? (
            <CircularProgress size={20} color="inherit" />
          ) : undefined
        }
        sx={{ minHeight: 56, textTransform: 'none', fontWeight: 700 }}
      >
        {importing ? 'Importing...' : 'Import Plan Data'}
      </Button>
    </Box>
  );
}

function SummaryItem({ label, value }: { label: string; value: number }) {
  return (
    <Box
      sx={{
        p: 1.5,
        borderRadius: 1.5,
        bgcolor: 'action.hover',
        textAlign: 'center',
      }}
    >
      <Typography variant="h5" fontWeight={700} color="primary.main">
        {value}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
    </Box>
  );
}
