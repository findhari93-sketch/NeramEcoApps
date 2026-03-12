'use client';

import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  Chip,
  Skeleton,
  Button,
  Avatar,
  TextField,
  ToggleButtonGroup,
  ToggleButton,
  Divider,
} from '@neram/ui';
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined';
import ReplayOutlinedIcon from '@mui/icons-material/ReplayOutlined';
import GradeOutlinedIcon from '@mui/icons-material/GradeOutlined';
import BrushOutlinedIcon from '@mui/icons-material/BrushOutlined';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';

interface SubmissionForReview {
  id: string;
  submission_url: string;
  correction_url: string | null;
  status: string;
  grade: string | null;
  teacher_notes: string | null;
  attempt_number: number;
  created_at: string;
  exercise: {
    id: string;
    title: string;
    category: {
      id: string;
      title: string;
      level: { id: string; title: string; classroom_id: string };
    };
  };
  student: {
    id: string;
    name: string;
    email: string;
    avatar_url: string | null;
  };
}

export default function TeacherEvaluate() {
  const { activeClassroom, getToken } = useNexusAuthContext();
  const [submissions, setSubmissions] = useState<SubmissionForReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<SubmissionForReview | null>(null);
  const [evaluating, setEvaluating] = useState(false);
  const [evalStatus, setEvalStatus] = useState<'approved' | 'redo' | 'graded'>('approved');
  const [grade, setGrade] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!activeClassroom) return;
    fetchSubmissions();
  }, [activeClassroom]);

  async function fetchSubmissions() {
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) return;

      const res = await fetch(
        `/api/drawings/submissions?classroom=${activeClassroom!.id}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) {
        const data = await res.json();
        setSubmissions(data.submissions || []);
      }
    } catch (err) {
      console.error('Failed to load submissions:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleEvaluate() {
    if (!selected) return;
    setEvaluating(true);
    try {
      const token = await getToken();
      if (!token) return;

      const res = await fetch('/api/drawings/evaluate', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          submission_id: selected.id,
          status: evalStatus,
          grade: evalStatus === 'graded' ? grade : undefined,
          teacher_notes: notes || undefined,
        }),
      });

      if (res.ok) {
        // Remove from list and reset
        setSubmissions((prev) => prev.filter((s) => s.id !== selected.id));
        setSelected(null);
        setGrade('');
        setNotes('');
        setEvalStatus('approved');
      }
    } catch (err) {
      console.error('Failed to evaluate:', err);
    } finally {
      setEvaluating(false);
    }
  }

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <Box>
      <Typography variant="h6" component="h1" sx={{ fontWeight: 700, mb: 2 }}>
        Evaluate Drawings
        {submissions.length > 0 && (
          <Chip label={submissions.length} size="small" color="error" sx={{ ml: 1, verticalAlign: 'middle' }} />
        )}
      </Typography>

      {loading ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} variant="rectangular" height={72} sx={{ borderRadius: 1 }} />
          ))}
        </Box>
      ) : submissions.length === 0 ? (
        <Paper sx={{ p: 3, textAlign: 'center' }}>
          <CheckCircleOutlinedIcon sx={{ fontSize: 48, color: 'success.main', mb: 1 }} />
          <Typography variant="body2" color="text.secondary">
            All submissions have been reviewed!
          </Typography>
        </Paper>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {submissions.map((sub) => (
            <Paper
              key={sub.id}
              variant="outlined"
              onClick={() => {
                setSelected(sub);
                setGrade('');
                setNotes('');
                setEvalStatus('approved');
              }}
              sx={{
                p: 2,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
                '&:hover': { bgcolor: 'action.hover' },
                '&:active': { bgcolor: 'action.selected' },
                border: selected?.id === sub.id ? '2px solid' : '1px solid',
                borderColor: selected?.id === sub.id ? 'primary.main' : 'divider',
              }}
            >
              <Avatar
                src={sub.student.avatar_url || undefined}
                sx={{ width: 40, height: 40, fontSize: '0.875rem' }}
              >
                {sub.student.name?.charAt(0) || '?'}
              </Avatar>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                  {sub.student.name}
                </Typography>
                <Typography variant="caption" color="text.secondary" noWrap>
                  {sub.exercise.title} &middot; Attempt #{sub.attempt_number}
                </Typography>
              </Box>
              <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
                {formatDate(sub.created_at)}
              </Typography>
            </Paper>
          ))}
        </Box>
      )}

      {/* Evaluation Panel (bottom sheet) */}
      {selected && (
        <Box
          sx={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 1300,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <Box onClick={() => setSelected(null)} sx={{ flex: 1, bgcolor: 'rgba(0,0,0,0.5)', minHeight: 40 }} />
          <Paper
            elevation={8}
            sx={{
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16,
              maxHeight: '85vh',
              overflow: 'auto',
              p: { xs: 2, sm: 3 },
            }}
          >
            {/* Handle */}
            <Box sx={{ display: 'flex', justifyContent: 'center', mb: 1.5 }}>
              <Box sx={{ width: 40, height: 4, borderRadius: 2, bgcolor: 'divider' }} />
            </Box>

            {/* Student info */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
              <Avatar src={selected.student.avatar_url || undefined} sx={{ width: 36, height: 36 }}>
                {selected.student.name?.charAt(0)}
              </Avatar>
              <Box>
                <Typography variant="body2" fontWeight={600}>{selected.student.name}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {selected.exercise.category?.level?.title} &gt; {selected.exercise.category?.title} &gt; {selected.exercise.title}
                </Typography>
              </Box>
            </Box>

            {/* Submission image */}
            <Box
              component="img"
              src={selected.submission_url}
              alt="Student submission"
              sx={{
                width: '100%',
                maxHeight: 300,
                objectFit: 'contain',
                borderRadius: 1,
                border: '1px solid',
                borderColor: 'divider',
                bgcolor: 'grey.50',
                mb: 2,
              }}
            />

            <Divider sx={{ mb: 2 }} />

            {/* Evaluation controls */}
            <Typography variant="body2" fontWeight={600} sx={{ mb: 1 }}>
              Decision
            </Typography>
            <ToggleButtonGroup
              value={evalStatus}
              exclusive
              onChange={(_, v) => v && setEvalStatus(v)}
              fullWidth
              size="small"
              sx={{ mb: 2 }}
            >
              <ToggleButton value="approved" sx={{ textTransform: 'none', gap: 0.5 }}>
                <CheckCircleOutlinedIcon sx={{ fontSize: 18 }} /> Approve
              </ToggleButton>
              <ToggleButton value="redo" sx={{ textTransform: 'none', gap: 0.5 }}>
                <ReplayOutlinedIcon sx={{ fontSize: 18 }} /> Redo
              </ToggleButton>
              <ToggleButton value="graded" sx={{ textTransform: 'none', gap: 0.5 }}>
                <GradeOutlinedIcon sx={{ fontSize: 18 }} /> Grade
              </ToggleButton>
            </ToggleButtonGroup>

            {evalStatus === 'graded' && (
              <TextField
                label="Grade"
                value={grade}
                onChange={(e) => setGrade(e.target.value)}
                size="small"
                fullWidth
                placeholder="e.g., A+, 8/10"
                sx={{ mb: 2 }}
              />
            )}

            <TextField
              label="Notes (optional)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              size="small"
              fullWidth
              multiline
              rows={2}
              placeholder="Feedback for the student..."
              sx={{ mb: 2 }}
            />

            <Box sx={{ display: 'flex', gap: 1.5 }}>
              <Button
                variant="outlined"
                fullWidth
                onClick={() => setSelected(null)}
                sx={{ textTransform: 'none', minHeight: 48 }}
              >
                Cancel
              </Button>
              <Button
                variant="contained"
                fullWidth
                onClick={handleEvaluate}
                disabled={evaluating || (evalStatus === 'graded' && !grade)}
                sx={{ textTransform: 'none', minHeight: 48 }}
              >
                {evaluating ? 'Submitting...' : 'Submit Evaluation'}
              </Button>
            </Box>
          </Paper>
        </Box>
      )}
    </Box>
  );
}
