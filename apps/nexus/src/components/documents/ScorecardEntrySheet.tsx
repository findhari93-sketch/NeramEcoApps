'use client';

import { useRef, useState, useCallback } from 'react';
import {
  Drawer,
  Box,
  Typography,
  Button,
  TextField,
  LinearProgress,
  CircularProgress,
  alpha,
  useTheme,
  useMediaQuery,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@neram/ui';
import UploadFileOutlinedIcon from '@mui/icons-material/UploadFileOutlined';

interface ScorecardEntrySheetProps {
  open: boolean;
  onClose: () => void;
  attemptId: string;
  examType: 'nata' | 'jee';
  classroomId: string;
  getToken: () => Promise<string | null>;
  onSubmitted: () => void;
}

export default function ScorecardEntrySheet({
  open,
  onClose,
  attemptId,
  examType,
  classroomId,
  getToken,
  onSubmitted,
}: ScorecardEntrySheetProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [aptitudeScore, setAptitudeScore] = useState('');
  const [drawingScore, setDrawingScore] = useState('');
  const [totalScore, setTotalScore] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');

  const resetForm = useCallback(() => {
    setAptitudeScore('');
    setDrawingScore('');
    setTotalScore('');
    setFile(null);
    setError('');
    setProgress(0);
  }, []);

  const handleClose = useCallback(() => {
    resetForm();
    onClose();
  }, [resetForm, onClose]);

  const handleSubmit = useCallback(async () => {
    const apt = parseFloat(aptitudeScore);
    const drw = parseFloat(drawingScore);
    const tot = parseFloat(totalScore);

    if (isNaN(apt) || apt < 0) {
      setError('Please enter a valid aptitude score');
      return;
    }
    if (isNaN(drw) || drw < 0) {
      setError('Please enter a valid drawing score');
      return;
    }
    if (isNaN(tot) || tot < 0) {
      setError('Please enter a valid total score');
      return;
    }

    setSubmitting(true);
    setError('');
    setProgress(0);

    try {
      const token = await getToken();
      if (!token) return;

      // Step 1: Submit scores
      const scoresRes = await fetch(`/api/documents/exam-attempts/${attemptId}/scores`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          aptitude_score: apt,
          drawing_score: drw,
          total_score: tot,
        }),
      });

      if (!scoresRes.ok) {
        const json = await scoresRes.json();
        setError(json.error || 'Failed to save scores');
        return;
      }

      setProgress(50);

      // Step 2: Upload scorecard file if provided
      if (file) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('classroom_id', classroomId);
        formData.append('title', `${examType.toUpperCase()} Scorecard`);
        formData.append('category', 'exam');
        formData.append('exam_attempt_id', attemptId);

        const progressInterval = setInterval(() => {
          setProgress((prev) => Math.min(prev + 5, 95));
        }, 200);

        const uploadRes = await fetch('/api/documents', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        });

        clearInterval(progressInterval);

        if (!uploadRes.ok) {
          const json = await uploadRes.json();
          setError(json.error || 'Scores saved but scorecard upload failed');
          return;
        }
      }

      setProgress(100);
      resetForm();
      onSubmitted();
      onClose();
    } catch {
      setError('Failed to submit scorecard');
    } finally {
      setSubmitting(false);
      setProgress(0);
    }
  }, [aptitudeScore, drawingScore, totalScore, file, attemptId, examType, classroomId, getToken, resetForm, onSubmitted, onClose]);

  const content = (
    <Box sx={{ p: isMobile ? 2 : 0 }}>
      <Typography variant="body2" fontWeight={700} sx={{ mb: 0.5 }}>
        {examType.toUpperCase()} Scorecard
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
        Enter your scores and optionally upload the scorecard document.
      </Typography>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mb: 2 }}>
        <TextField
          label="Aptitude Score"
          type="number"
          value={aptitudeScore}
          onChange={(e) => setAptitudeScore(e.target.value)}
          fullWidth
          size="small"
          inputProps={{ min: 0, step: 0.01 }}
          sx={{ '& .MuiInputBase-root': { minHeight: 48 } }}
        />
        <TextField
          label="Drawing Score"
          type="number"
          value={drawingScore}
          onChange={(e) => setDrawingScore(e.target.value)}
          fullWidth
          size="small"
          inputProps={{ min: 0, step: 0.01 }}
          sx={{ '& .MuiInputBase-root': { minHeight: 48 } }}
        />
        <TextField
          label="Total Score"
          type="number"
          value={totalScore}
          onChange={(e) => setTotalScore(e.target.value)}
          fullWidth
          size="small"
          inputProps={{ min: 0, step: 0.01 }}
          sx={{ '& .MuiInputBase-root': { minHeight: 48 } }}
        />
      </Box>

      {/* File upload area */}
      {!file ? (
        <Box
          onClick={() => fileInputRef.current?.click()}
          sx={{
            borderRadius: 2,
            border: `2px dashed ${theme.palette.divider}`,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 0.5,
            cursor: 'pointer',
            py: 3,
            px: 2,
            mb: 2,
            '&:hover': {
              borderColor: theme.palette.primary.main,
              bgcolor: alpha(theme.palette.primary.main, 0.02),
            },
          }}
        >
          <UploadFileOutlinedIcon sx={{ fontSize: '1.5rem', color: 'text.secondary' }} />
          <Typography variant="body2" color="text.secondary">
            Upload Scorecard (optional)
          </Typography>
          <Typography variant="caption" color="text.disabled">
            PDF or image, max 10 MB
          </Typography>
        </Box>
      ) : (
        <Box
          sx={{
            p: 1.5,
            borderRadius: 1,
            border: `1px solid ${theme.palette.divider}`,
            mb: 2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Box>
            <Typography variant="body2" fontWeight={500} noWrap>
              {file.name}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {(file.size / 1024 / 1024).toFixed(2)} MB
            </Typography>
          </Box>
          <Button
            size="small"
            onClick={() => setFile(null)}
            disabled={submitting}
            sx={{ textTransform: 'none', minWidth: 'auto' }}
          >
            Remove
          </Button>
        </Box>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,application/pdf"
        hidden
        onChange={(e) => setFile(e.target.files?.[0] || null)}
      />

      {submitting && <LinearProgress variant="determinate" value={progress} sx={{ mb: 1, borderRadius: 1 }} />}

      {error && (
        <Typography variant="caption" color="error" sx={{ display: 'block', mb: 1 }}>
          {error}
        </Typography>
      )}

      <Button
        variant="contained"
        fullWidth
        onClick={handleSubmit}
        disabled={submitting || !aptitudeScore || !drawingScore || !totalScore}
        sx={{ textTransform: 'none', minHeight: 48, fontWeight: 600 }}
      >
        {submitting ? <CircularProgress size={20} /> : 'Submit Scorecard'}
      </Button>
    </Box>
  );

  if (isMobile) {
    return (
      <Drawer
        anchor="bottom"
        open={open}
        onClose={handleClose}
        PaperProps={{ sx: { borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '90vh' } }}
      >
        <Box sx={{ width: 40, height: 4, bgcolor: 'grey.300', borderRadius: 2, mx: 'auto', mt: 1 }} />
        {content}
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontWeight: 700 }}>Enter Scorecard</DialogTitle>
      <DialogContent>{content}</DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={handleClose} sx={{ textTransform: 'none' }}>Cancel</Button>
      </DialogActions>
    </Dialog>
  );
}
