'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Box,
  Typography,
  Button,
  IconButton,
  Skeleton,
  Snackbar,
  Alert,
} from '@neram/ui';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import AddIcon from '@mui/icons-material/Add';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import HomeworkGradingGrid, {
  type HomeworkItem,
  type StudentItem,
  type SubmissionItem,
} from '@/components/course-plan/HomeworkGradingGrid';
import SubmissionReviewPanel from '@/components/course-plan/SubmissionReviewPanel';
import HomeworkCreateDialog from '@/components/course-plan/HomeworkCreateDialog';

export default function HomeworkPage() {
  const params = useParams();
  const router = useRouter();
  const planId = params.planId as string;
  const { getToken } = useNexusAuthContext();

  const [homework, setHomework] = useState<HomeworkItem[]>([]);
  const [students, setStudents] = useState<StudentItem[]>([]);
  const [submissions, setSubmissions] = useState<SubmissionItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Review panel state
  const [reviewOpen, setReviewOpen] = useState(false);
  const [selectedSubmission, setSelectedSubmission] = useState<SubmissionItem | null>(null);
  const [selectedHomework, setSelectedHomework] = useState<HomeworkItem | null>(null);
  const [selectedStudent, setSelectedStudent] = useState<StudentItem | null>(null);

  // Create dialog state
  const [createOpen, setCreateOpen] = useState(false);

  // Snackbar
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success',
  });

  const fetchGrid = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) return;

      const res = await fetch(`/api/course-plans/${planId}/homework/grid`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        setHomework(data.homework || []);
        setStudents(data.students || []);
        setSubmissions(data.submissions || []);
      } else {
        const data = await res.json().catch(() => ({}));
        setSnackbar({ open: true, message: data.error || 'Failed to load grid', severity: 'error' });
      }
    } catch (err) {
      console.error('Failed to load homework grid:', err);
      setSnackbar({ open: true, message: 'Failed to load homework data', severity: 'error' });
    } finally {
      setLoading(false);
    }
  }, [planId, getToken]);

  useEffect(() => {
    fetchGrid();
  }, [fetchGrid]);

  const handleCellClick = (submission: SubmissionItem | null, hw: HomeworkItem, student: StudentItem) => {
    setSelectedSubmission(submission);
    setSelectedHomework(hw);
    setSelectedStudent(student);
    setReviewOpen(true);
  };

  const handleReviewed = () => {
    setSnackbar({ open: true, message: 'Review saved', severity: 'success' });
    fetchGrid(); // Refresh grid data
  };

  const handleCreated = () => {
    setSnackbar({ open: true, message: 'Homework created', severity: 'success' });
    fetchGrid(); // Refresh grid data
  };

  return (
    <Box>
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          mb: 2,
          flexWrap: 'wrap',
        }}
      >
        <IconButton
          onClick={() => router.push(`/teacher/course-plans/${planId}`)}
          sx={{ width: 40, height: 40 }}
        >
          <ArrowBackIcon />
        </IconButton>
        <Typography
          variant="h5"
          component="h1"
          sx={{
            fontWeight: 700,
            flex: 1,
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          Homework
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setCreateOpen(true)}
          sx={{ textTransform: 'none', minHeight: 48, fontWeight: 600 }}
        >
          Add Homework
        </Button>
      </Box>

      {/* Loading skeleton */}
      {loading && (
        <Box>
          <Skeleton variant="rounded" height={48} sx={{ mb: 1, borderRadius: 2 }} />
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} variant="rounded" height={40} sx={{ mb: 0.5, borderRadius: 1 }} />
          ))}
        </Box>
      )}

      {/* Grid */}
      {!loading && (
        <HomeworkGradingGrid
          homework={homework}
          students={students}
          submissions={submissions}
          onCellClick={handleCellClick}
        />
      )}

      {/* Empty state */}
      {!loading && homework.length === 0 && students.length === 0 && (
        <Box sx={{ textAlign: 'center', py: 6 }}>
          <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
            No homework or students found for this plan.
          </Typography>
          <Button
            variant="outlined"
            startIcon={<AddIcon />}
            onClick={() => setCreateOpen(true)}
            sx={{ textTransform: 'none', minHeight: 48 }}
          >
            Create First Homework
          </Button>
        </Box>
      )}

      {/* Review Panel */}
      <SubmissionReviewPanel
        open={reviewOpen}
        onClose={() => setReviewOpen(false)}
        submission={selectedSubmission}
        homework={selectedHomework}
        student={selectedStudent}
        onReviewed={handleReviewed}
        getToken={getToken}
      />

      {/* Create Dialog */}
      <HomeworkCreateDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        planId={planId}
        onCreated={handleCreated}
        getToken={getToken}
      />

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          severity={snackbar.severity}
          onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
