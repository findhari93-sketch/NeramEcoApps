'use client';

import { useState, useRef } from 'react';
import {
  Box,
  Typography,
  Button,
  Paper,
  TextField,
  Chip,
  FormControlLabel,
  Checkbox,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  LinearProgress,
  Alert,
  Divider,
  Link,
} from '@neram/ui';
import ArrowBackOutlinedIcon from '@mui/icons-material/ArrowBackOutlined';
import CloudUploadOutlinedIcon from '@mui/icons-material/CloudUploadOutlined';
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined';
import CropOutlinedIcon from '@mui/icons-material/CropOutlined';

type ExamState = 'planning_to_write' | 'applied' | 'completed';

interface AttemptSelection {
  phase: string;
  attempt: number;
  selected: boolean;
  examDateId: string;
  hallTicketUploaded: boolean;
  state: 'planning' | 'applied' | 'completed' | 'scorecard_uploaded';
}

interface NataOnboardingProps {
  getToken: () => Promise<string | null>;
  examState: string;
  examDates: any[];
  examTemplates: any[];
  onComplete: () => void;
  onBack: () => void;
}

const NATA_ATTEMPTS: { phase: string; attempt: number; label: string }[] = [
  { phase: 'phase_1', attempt: 1, label: 'Phase 1 — Attempt 1' },
  { phase: 'phase_1', attempt: 2, label: 'Phase 1 — Attempt 2' },
  { phase: 'phase_2', attempt: 1, label: 'Phase 2 — Attempt 1' },
  { phase: 'phase_2', attempt: 2, label: 'Phase 2 — Attempt 2' },
];

export default function NataOnboarding({
  getToken,
  examState,
  examDates,
  examTemplates,
  onComplete,
  onBack,
}: NataOnboardingProps) {
  const [applicationNumber, setApplicationNumber] = useState('');
  const [appFormUploaded, setAppFormUploaded] = useState(false);
  const [attempts, setAttempts] = useState<AttemptSelection[]>(
    NATA_ATTEMPTS.map((a) => ({
      phase: a.phase,
      attempt: a.attempt,
      selected: false,
      examDateId: '',
      hallTicketUploaded: false,
      state: examState === 'completed' ? 'completed' : examState === 'applied' ? 'applied' : 'planning',
    }))
  );
  const [aptitudeScore, setAptitudeScore] = useState('');
  const [drawingScore, setDrawingScore] = useState('');
  const [scorecardUploaded, setScorecardUploaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadTarget, setUploadTarget] = useState<{ type: string; index?: number } | null>(null);

  const selectedAttempts = attempts.filter((a) => a.selected);
  const isApplied = examState === 'applied' || examState === 'completed';
  const isCompleted = examState === 'completed';

  // Validation
  const canProceed = () => {
    if (isApplied && !applicationNumber.trim()) return false;
    if (selectedAttempts.length === 0) return false;
    return true;
  };

  const handleUploadClick = (type: string, index?: number) => {
    setUploadTarget({ type, index });
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !uploadTarget) return;

    setUploading(uploadTarget.type + (uploadTarget.index ?? ''));
    setError(null);

    try {
      const token = await getToken();
      if (!token) throw new Error('Not authenticated');

      // Find the right template
      let template: any = null;
      if (uploadTarget.type === 'application') {
        template = examTemplates.find((t: any) => t.name.includes('Application') || t.name.includes('Summary'));
      } else if (uploadTarget.type === 'hall_ticket') {
        template = examTemplates.find((t: any) => t.name.includes('Hall Ticket'));
      } else if (uploadTarget.type === 'scorecard') {
        template = examTemplates.find((t: any) => t.name.includes('Score Card'));
      }

      const formData = new FormData();
      formData.append('file', file);
      formData.append('title', template?.name || uploadTarget.type);
      formData.append('category', 'exam');
      if (template) formData.append('template_id', template.id);

      const res = await fetch('/api/documents', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (!res.ok) throw new Error('Upload failed');

      // Mark as uploaded
      if (uploadTarget.type === 'application') setAppFormUploaded(true);
      else if (uploadTarget.type === 'scorecard') setScorecardUploaded(true);
      else if (uploadTarget.type === 'hall_ticket' && uploadTarget.index !== undefined) {
        setAttempts((prev) =>
          prev.map((a, i) => (i === uploadTarget.index ? { ...a, hallTicketUploaded: true } : a))
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(null);
      setUploadTarget(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token) return;
      const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

      // Update registration with application number
      if (applicationNumber.trim()) {
        await fetch('/api/documents/exam-registrations', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            exam_type: 'nata',
            is_writing: true,
            application_number: applicationNumber.trim(),
          }),
        });
      }

      // Create exam attempts for selected items
      for (const attempt of selectedAttempts) {
        await fetch('/api/documents/exam-attempts', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            exam_type: 'nata',
            phase: attempt.phase,
            attempt_number: attempt.attempt,
            state: attempt.state,
            exam_date_id: attempt.examDateId || null,
          }),
        });
      }

      // If completed with scores, save scores for first selected attempt
      if (isCompleted && aptitudeScore && selectedAttempts.length > 0) {
        // Get the created attempt to get its ID
        const attemptsRes = await fetch(
          `/api/documents/exam-attempts?exam_type=nata`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (attemptsRes.ok) {
          const attemptsData = await attemptsRes.json();
          const firstAttempt = (attemptsData.attempts || []).find(
            (a: any) => a.phase === selectedAttempts[0].phase && a.attempt_number === selectedAttempts[0].attempt
          );
          if (firstAttempt) {
            const apt = parseFloat(aptitudeScore) || 0;
            const drw = parseFloat(drawingScore) || 0;
            await fetch(`/api/documents/exam-attempts/${firstAttempt.id}/scores`, {
              method: 'PATCH',
              headers,
              body: JSON.stringify({
                aptitude_score: apt,
                drawing_score: drw,
                total_score: apt + drw,
              }),
            });
          }
        }
      }

      onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const toggleAttempt = (index: number) => {
    setAttempts((prev) =>
      prev.map((a, i) => (i === index ? { ...a, selected: !a.selected } : a))
    );
  };

  // Get exam dates for a specific phase/attempt
  const getDatesForAttempt = (phase: string, attempt: number) => {
    return examDates.filter(
      (d: any) => d.phase === phase && d.attempt_number === attempt && d.is_active
    );
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
      <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,application/pdf" style={{ display: 'none' }} onChange={handleFileChange} />

      <Box>
        <Typography variant="h6" sx={{ fontWeight: 700 }}>
          NATA 2026 Details
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {isCompleted
            ? 'Tell us about your completed NATA exam.'
            : isApplied
              ? 'Provide your NATA application details and select your attempts.'
              : 'Select which phases and attempts you plan to write.'}
        </Typography>
      </Box>

      {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}

      {/* Application Number + Form (for Applied/Completed) */}
      {isApplied && (
        <Paper elevation={0} sx={{ p: 2, borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1.5 }}>Application Details</Typography>
          <TextField
            label="NATA Application Number"
            value={applicationNumber}
            onChange={(e) => setApplicationNumber(e.target.value)}
            fullWidth
            size="small"
            required
            placeholder="e.g., NATA2026XXXXX"
            sx={{ mb: 2, '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
          />
          <UploadButton
            label="Application Confirmation Page"
            uploaded={appFormUploaded}
            uploading={uploading === 'application'}
            onClick={() => handleUploadClick('application')}
          />
        </Paper>
      )}

      {/* Phase/Attempt Selection */}
      <Paper elevation={0} sx={{ p: 2, borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1.5 }}>
          Select Your Attempts
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
          NATA has Phase 1 (2 attempts) and Phase 2 (2 attempts). Select the ones you&apos;re writing.
        </Typography>

        {NATA_ATTEMPTS.map((def, index) => {
          const attempt = attempts[index];
          const dates = getDatesForAttempt(def.phase, def.attempt);

          return (
            <Box key={`${def.phase}-${def.attempt}`}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 1 }}>
                <FormControlLabel
                  control={<Checkbox checked={attempt.selected} onChange={() => toggleAttempt(index)} />}
                  label={
                    <Typography variant="body2" sx={{ fontWeight: attempt.selected ? 600 : 400 }}>
                      {def.label}
                    </Typography>
                  }
                  sx={{ m: 0, flex: 1 }}
                />
              </Box>

              {attempt.selected && (
                <Box sx={{ pl: 4, pb: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                  {/* Exam date selector */}
                  {dates.length > 0 && (
                    <FormControl fullWidth size="small">
                      <InputLabel>Exam Date</InputLabel>
                      <Select
                        value={attempt.examDateId}
                        onChange={(e) =>
                          setAttempts((prev) =>
                            prev.map((a, i) => (i === index ? { ...a, examDateId: e.target.value } : a))
                          )
                        }
                        label="Exam Date"
                        sx={{ borderRadius: 2 }}
                      >
                        {dates.map((d: any) => (
                          <MenuItem key={d.id} value={d.id}>
                            {d.label || new Date(d.exam_date).toLocaleDateString()}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  )}

                  {/* Hall Ticket upload */}
                  {isApplied && (
                    <UploadButton
                      label="Hall Ticket"
                      uploaded={attempt.hallTicketUploaded}
                      uploading={uploading === `hall_ticket${index}`}
                      onClick={() => handleUploadClick('hall_ticket', index)}
                      optional
                    />
                  )}
                </Box>
              )}

              {index < NATA_ATTEMPTS.length - 1 && <Divider />}
            </Box>
          );
        })}
      </Paper>

      {/* Scores (for Completed) */}
      {isCompleted && selectedAttempts.length > 0 && (
        <Paper elevation={0} sx={{ p: 2, borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1.5 }}>Scores</Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
            Enter scores for your most recent completed attempt. Leave blank if results aren&apos;t out yet.
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
            <TextField
              label="Aptitude"
              value={aptitudeScore}
              onChange={(e) => setAptitudeScore(e.target.value)}
              type="number"
              size="small"
              sx={{ flex: 1, '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
            />
            <TextField
              label="Drawing"
              value={drawingScore}
              onChange={(e) => setDrawingScore(e.target.value)}
              type="number"
              size="small"
              sx={{ flex: 1, '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
            />
            <TextField
              label="Total"
              value={aptitudeScore && drawingScore ? String((parseFloat(aptitudeScore) || 0) + (parseFloat(drawingScore) || 0)) : ''}
              size="small"
              disabled
              sx={{ flex: 1, '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
            />
          </Box>
          <UploadButton
            label="NATA Scorecard"
            uploaded={scorecardUploaded}
            uploading={uploading === 'scorecard'}
            onClick={() => handleUploadClick('scorecard')}
            optional
          />
        </Paper>
      )}

      {/* Actions */}
      <Box sx={{ display: 'flex', gap: 2, mt: 1 }}>
        <Button
          variant="outlined"
          onClick={onBack}
          startIcon={<ArrowBackOutlinedIcon />}
          sx={{ borderRadius: 2, textTransform: 'none', px: 3 }}
        >
          Back
        </Button>
        <Button
          variant="contained"
          size="large"
          fullWidth
          disabled={saving || !canProceed()}
          onClick={handleSave}
          sx={{ py: 1.5, borderRadius: 2, textTransform: 'none', fontWeight: 600 }}
        >
          {saving ? 'Saving...' : 'Continue'}
        </Button>
      </Box>
    </Box>
  );
}

/** Reusable upload button with status */
function UploadButton({
  label,
  uploaded,
  uploading,
  onClick,
  optional,
}: {
  label: string;
  uploaded: boolean;
  uploading: boolean;
  onClick: () => void;
  optional?: boolean;
}) {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        p: 1.5,
        borderRadius: 2,
        border: '1px solid',
        borderColor: uploaded ? 'success.light' : 'divider',
        bgcolor: uploaded ? 'success.50' : 'transparent',
      }}
    >
      {uploaded ? (
        <CheckCircleOutlinedIcon sx={{ color: 'success.main', fontSize: 20 }} />
      ) : (
        <CloudUploadOutlinedIcon sx={{ color: 'text.disabled', fontSize: 20 }} />
      )}
      <Box sx={{ flex: 1 }}>
        <Typography variant="body2" sx={{ fontWeight: 500 }}>
          {label}
          {optional && !uploaded && (
            <Typography component="span" variant="caption" color="text.disabled"> (optional)</Typography>
          )}
        </Typography>
        {uploaded && <Typography variant="caption" color="success.main">Uploaded</Typography>}
      </Box>
      <Button
        variant={uploaded ? 'outlined' : 'contained'}
        size="small"
        disabled={uploading}
        onClick={onClick}
        sx={{ textTransform: 'none', borderRadius: 1.5, minWidth: 70 }}
      >
        {uploading ? '...' : uploaded ? 'Replace' : 'Upload'}
      </Button>
      {uploading && <LinearProgress sx={{ position: 'absolute', bottom: 0, left: 0, right: 0 }} />}
    </Box>
  );
}
