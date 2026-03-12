'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Button,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  Alert,
  Snackbar,
  Divider,
} from '@neram/ui';
import DataTable from '@/components/DataTable';
import type {
  JobApplicationWithJob,
  JobApplicationStatus,
  JobPosting,
  ScreeningQuestion,
  ScreeningAnswer,
} from '@neram/database';

const APPLICATION_STATUSES: { value: JobApplicationStatus; label: string }[] = [
  { value: 'new', label: 'New' },
  { value: 'reviewing', label: 'Reviewing' },
  { value: 'shortlisted', label: 'Shortlisted' },
  { value: 'interview', label: 'Interview' },
  { value: 'offered', label: 'Offered' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'withdrawn', label: 'Withdrawn' },
];

const STATUS_COLORS: Record<JobApplicationStatus, 'default' | 'info' | 'primary' | 'secondary' | 'success' | 'error' | 'warning'> = {
  new: 'info',
  reviewing: 'primary',
  shortlisted: 'secondary',
  interview: 'warning',
  offered: 'success',
  rejected: 'error',
  withdrawn: 'default',
};

export default function ApplicationsPage() {
  const [applications, setApplications] = useState<JobApplicationWithJob[]>([]);
  const [postings, setPostings] = useState<JobPosting[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterJobId, setFilterJobId] = useState<string>('');
  const [detailDialog, setDetailDialog] = useState<JobApplicationWithJob | null>(null);
  const [detailStatus, setDetailStatus] = useState<JobApplicationStatus>('new');
  const [detailNotes, setDetailNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [jobQuestions, setJobQuestions] = useState<ScreeningQuestion[]>([]);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false, message: '', severity: 'success',
  });

  // Fetch postings for filter dropdown
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/careers');
        if (res.ok) {
          const json = await res.json();
          setPostings(json.data || []);
        }
      } catch {
        // silently fail
      }
    })();
  }, []);

  // Fetch applications
  const fetchApplications = useCallback(async () => {
    setLoading(true);
    try {
      const url = filterJobId
        ? `/api/careers/applications?job_posting_id=${filterJobId}`
        : '/api/careers/applications';
      const res = await fetch(url);
      if (res.ok) {
        const json = await res.json();
        setApplications(json.data || []);
      }
    } catch {
      setSnackbar({ open: true, message: 'Failed to load applications', severity: 'error' });
    } finally {
      setLoading(false);
    }
  }, [filterJobId]);

  useEffect(() => {
    fetchApplications();
  }, [fetchApplications]);

  // Open detail dialog
  const handleRowClick = async (row: JobApplicationWithJob) => {
    setDetailDialog(row);
    setDetailStatus(row.status);
    setDetailNotes(row.admin_notes || '');

    // Fetch the job posting to get screening questions
    try {
      const res = await fetch(`/api/careers/${row.job_posting_id}`);
      if (res.ok) {
        const json = await res.json();
        setJobQuestions(json.data?.screening_questions || []);
      }
    } catch {
      setJobQuestions([]);
    }
  };

  // Save status update
  const handleSaveStatus = async () => {
    if (!detailDialog) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/careers/applications/${detailDialog.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: detailStatus, admin_notes: detailNotes }),
      });
      if (!res.ok) throw new Error('Update failed');
      setSnackbar({ open: true, message: 'Application updated', severity: 'success' });
      setDetailDialog(null);
      fetchApplications();
    } catch {
      setSnackbar({ open: true, message: 'Failed to update application', severity: 'error' });
    } finally {
      setSaving(false);
    }
  };

  // Render screening answer
  const renderAnswer = (answer: ScreeningAnswer, questions: ScreeningQuestion[]) => {
    const question = questions.find(q => q.question_id === answer.question_id || q.id === answer.question_id);
    const questionText = question?.question || `Question ${answer.question_id}`;
    let answerText: string;
    if (Array.isArray(answer.answer)) {
      answerText = answer.answer.join(', ');
    } else if (typeof answer.answer === 'boolean') {
      answerText = answer.answer ? 'Yes' : 'No';
    } else {
      answerText = String(answer.answer);
    }
    return { questionText, answerText };
  };

  // Table columns
  const columns = [
    { field: 'applicant_name', headerName: 'Name', width: 160 },
    { field: 'applicant_email', headerName: 'Email', width: 200 },
    { field: 'applicant_phone', headerName: 'Phone', width: 130 },
    {
      field: 'job_posting',
      headerName: 'Job Title',
      width: 180,
      renderCell: ({ value }: { row: any; value: any }) => (
        <Typography variant="body2" noWrap>{value?.title || '-'}</Typography>
      ),
    },
    {
      field: 'resume_url',
      headerName: 'Resume',
      width: 80,
      renderCell: ({ value }: { row: any; value: any }) =>
        value ? (
          <Button
            size="small"
            href={value}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
          >
            View
          </Button>
        ) : (
          <Typography variant="body2" color="text.secondary">-</Typography>
        ),
    },
    {
      field: 'status',
      headerName: 'Status',
      width: 110,
      renderCell: ({ value }: { row: any; value: any }) => (
        <Chip
          label={value}
          size="small"
          color={STATUS_COLORS[value as JobApplicationStatus] || 'default'}
        />
      ),
    },
    {
      field: 'created_at',
      headerName: 'Applied',
      width: 110,
      renderCell: ({ value }: { row: any; value: any }) => (
        <Typography variant="body2">
          {value ? new Date(value).toLocaleDateString() : '-'}
        </Typography>
      ),
    },
  ];

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h5" fontWeight={700}>Job Applications</Typography>
        <Button variant="outlined" href="/careers">
          Back to Job Postings
        </Button>
      </Box>

      {/* Filter by job */}
      <Box sx={{ mb: 2, maxWidth: 400 }}>
        <TextField
          label="Filter by Job Posting"
          select
          value={filterJobId}
          onChange={(e) => setFilterJobId(e.target.value)}
          fullWidth
          size="small"
        >
          <MenuItem value="">All Postings</MenuItem>
          {postings.map((p) => (
            <MenuItem key={p.id} value={p.id}>{p.title}</MenuItem>
          ))}
        </TextField>
      </Box>

      {/* Data table */}
      <DataTable
        rows={applications}
        columns={columns}
        loading={loading}
        onRowClick={handleRowClick}
      />

      {/* Detail dialog */}
      <Dialog
        open={!!detailDialog}
        onClose={() => setDetailDialog(null)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Application Details</DialogTitle>
        <DialogContent>
          {detailDialog && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
              {/* Contact info */}
              <Box>
                <Typography variant="subtitle2" color="text.secondary">Applicant</Typography>
                <Typography variant="body1" fontWeight={600}>{detailDialog.applicant_name}</Typography>
                <Typography variant="body2">{detailDialog.applicant_email}</Typography>
                <Typography variant="body2">{detailDialog.applicant_phone}</Typography>
              </Box>

              <Divider />

              {/* Job info */}
              <Box>
                <Typography variant="subtitle2" color="text.secondary">Position</Typography>
                <Typography variant="body1">{detailDialog.job_posting?.title || '-'}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {detailDialog.job_posting?.department || ''}
                </Typography>
              </Box>

              {/* Resume & Portfolio */}
              <Box sx={{ display: 'flex', gap: 2 }}>
                {detailDialog.resume_url && (
                  <Button
                    variant="outlined"
                    size="small"
                    href={detailDialog.resume_url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Download Resume
                  </Button>
                )}
                {detailDialog.portfolio_url && (
                  <Button
                    variant="outlined"
                    size="small"
                    href={detailDialog.portfolio_url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    View Portfolio
                  </Button>
                )}
              </Box>

              {/* Screening Q&A */}
              {detailDialog.screening_answers && detailDialog.screening_answers.length > 0 && (
                <>
                  <Divider />
                  <Box>
                    <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
                      Screening Answers
                    </Typography>
                    {detailDialog.screening_answers.map((ans, idx) => {
                      const { questionText, answerText } = renderAnswer(ans, jobQuestions);
                      return (
                        <Box key={idx} sx={{ mb: 1.5 }}>
                          <Typography variant="body2" fontWeight={600}>{questionText}</Typography>
                          <Typography variant="body2" color="text.secondary">{answerText}</Typography>
                        </Box>
                      );
                    })}
                  </Box>
                </>
              )}

              <Divider />

              {/* Status update */}
              <TextField
                label="Status"
                select
                value={detailStatus}
                onChange={(e) => setDetailStatus(e.target.value as JobApplicationStatus)}
                fullWidth
                size="small"
              >
                {APPLICATION_STATUSES.map((s) => (
                  <MenuItem key={s.value} value={s.value}>{s.label}</MenuItem>
                ))}
              </TextField>

              <TextField
                label="Admin Notes"
                multiline
                rows={4}
                value={detailNotes}
                onChange={(e) => setDetailNotes(e.target.value)}
                fullWidth
              />
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDetailDialog(null)} disabled={saving}>Cancel</Button>
          <Button variant="contained" onClick={handleSaveStatus} disabled={saving}>
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setSnackbar({ ...snackbar, open: false })}
          severity={snackbar.severity}
          variant="filled"
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
