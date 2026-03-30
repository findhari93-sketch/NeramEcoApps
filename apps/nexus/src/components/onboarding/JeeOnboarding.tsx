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
} from '@neram/ui';
import ArrowBackOutlinedIcon from '@mui/icons-material/ArrowBackOutlined';
import CloudUploadOutlinedIcon from '@mui/icons-material/CloudUploadOutlined';
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';

type ExamState = 'planning_to_write' | 'applied' | 'completed';

interface SessionSelection {
  phase: string; // session_1 or session_2
  label: string;
  selected: boolean;
  state: 'planning' | 'applied' | 'completed';
  hallTicketUploaded: boolean;
}

interface JeeOnboardingProps {
  getToken: () => Promise<string | null>;
  examState: string;
  examDates: any[];
  examTemplates: any[];
  onComplete: () => void;
  onBack: () => void;
}

export default function JeeOnboarding({
  getToken,
  examState,
  examDates,
  examTemplates,
  onComplete,
  onBack,
}: JeeOnboardingProps) {
  const [applicationNumber, setApplicationNumber] = useState('');
  const [appFormUploaded, setAppFormUploaded] = useState(false);
  const [scorecardUploaded, setScorecardUploaded] = useState(false);

  // JEE has Session 1 (January — already past in March 2026) and Session 2 (April)
  const [sessions, setSessions] = useState<SessionSelection[]>([
    {
      phase: 'session_1',
      label: 'Session 1 (January 2026)',
      selected: false,
      state: 'completed', // January is always past by March 2026
      hallTicketUploaded: false,
    },
    {
      phase: 'session_2',
      label: 'Session 2 (April 2026)',
      selected: false,
      state: examState === 'completed' ? 'completed' : examState === 'applied' ? 'applied' : 'planning',
      hallTicketUploaded: false,
    },
  ]);

  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadTarget, setUploadTarget] = useState<{ type: string; index?: number } | null>(null);

  const selectedSessions = sessions.filter((s) => s.selected);
  const isApplied = examState === 'applied' || examState === 'completed';
  const isCompleted = examState === 'completed';
  const hasCompletedSession = selectedSessions.some((s) => s.state === 'completed');

  const canProceed = () => {
    if (isApplied && !applicationNumber.trim()) return false;
    if (selectedSessions.length === 0) return false;
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

      let template: any = null;
      if (uploadTarget.type === 'application') {
        template = examTemplates.find((t: any) => t.name.includes('Application'));
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

      if (uploadTarget.type === 'application') setAppFormUploaded(true);
      else if (uploadTarget.type === 'scorecard') setScorecardUploaded(true);
      else if (uploadTarget.type === 'hall_ticket' && uploadTarget.index !== undefined) {
        setSessions((prev) =>
          prev.map((s, i) => (i === uploadTarget.index ? { ...s, hallTicketUploaded: true } : s))
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

      // Update registration
      if (applicationNumber.trim()) {
        await fetch('/api/documents/exam-registrations', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            exam_type: 'jee',
            is_writing: true,
            application_number: applicationNumber.trim(),
          }),
        });
      }

      // Create attempts for selected sessions
      for (const session of selectedSessions) {
        await fetch('/api/documents/exam-attempts', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            exam_type: 'jee',
            phase: session.phase,
            attempt_number: 1,
            state: session.state,
          }),
        });
      }

      onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const toggleSession = (index: number) => {
    setSessions((prev) =>
      prev.map((s, i) => (i === index ? { ...s, selected: !s.selected } : s))
    );
  };

  const updateSessionState = (index: number, state: 'planning' | 'applied' | 'completed') => {
    setSessions((prev) =>
      prev.map((s, i) => (i === index ? { ...s, state } : s))
    );
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
      <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,application/pdf" style={{ display: 'none' }} onChange={handleFileChange} />

      <Box>
        <Typography variant="h6" sx={{ fontWeight: 700 }}>JEE Main 2026 Details</Typography>
        <Typography variant="body2" color="text.secondary">
          {isCompleted
            ? 'Tell us about your completed JEE exam.'
            : isApplied
              ? 'Provide your JEE application details and select your sessions.'
              : 'Select which sessions you plan to write.'}
        </Typography>
      </Box>

      {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}

      {/* Application Number + Form (for Applied/Completed) */}
      {isApplied && (
        <Paper elevation={0} sx={{ p: 2, borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1.5 }}>Application Details</Typography>
          <TextField
            label="JEE Application Number"
            value={applicationNumber}
            onChange={(e) => setApplicationNumber(e.target.value)}
            fullWidth
            size="small"
            required
            placeholder="e.g., 260110XXXXXX"
            sx={{ mb: 2, '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
          />
          <UploadButton
            label="JEE Application Form PDF"
            uploaded={appFormUploaded}
            uploading={uploading === 'application'}
            onClick={() => handleUploadClick('application')}
          />
        </Paper>
      )}

      {/* Session Selection */}
      <Paper elevation={0} sx={{ p: 2, borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1.5 }}>Select Sessions</Typography>

        {sessions.map((session, index) => (
          <Box key={session.phase}>
            <Box sx={{ py: 1 }}>
              <FormControlLabel
                control={<Checkbox checked={session.selected} onChange={() => toggleSession(index)} />}
                label={
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: session.selected ? 600 : 400 }}>
                      {session.label}
                    </Typography>
                    {session.phase === 'session_1' && (
                      <Typography variant="caption" color="text.disabled">
                        January session is already over
                      </Typography>
                    )}
                  </Box>
                }
                sx={{ m: 0 }}
              />
            </Box>

            {session.selected && (
              <Box sx={{ pl: 4, pb: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                {/* Session status — editable per session */}
                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                  {(['planning', 'applied', 'completed'] as const).map((st) => (
                    <Chip
                      key={st}
                      label={st === 'planning' ? 'Planning' : st === 'applied' ? 'Applied' : 'Completed'}
                      variant={session.state === st ? 'filled' : 'outlined'}
                      color={session.state === st ? 'primary' : 'default'}
                      size="small"
                      onClick={() => updateSessionState(index, st)}
                      sx={{ cursor: 'pointer', fontWeight: session.state === st ? 600 : 400 }}
                    />
                  ))}
                </Box>

                {/* Hall ticket for applied/completed */}
                {(session.state === 'applied' || session.state === 'completed') && (
                  <UploadButton
                    label={`Hall Ticket — ${session.label}`}
                    uploaded={session.hallTicketUploaded}
                    uploading={uploading === `hall_ticket${index}`}
                    onClick={() => handleUploadClick('hall_ticket', index)}
                    optional
                  />
                )}

                {/* Info for Session 1 (January — past) */}
                {session.phase === 'session_1' && session.state === 'completed' && (
                  <Box sx={{ display: 'flex', gap: 1, p: 1, borderRadius: 1, bgcolor: 'info.50' }}>
                    <InfoOutlinedIcon sx={{ fontSize: 16, color: 'info.main', mt: 0.25 }} />
                    <Typography variant="caption" color="info.dark">
                      If you have your Session 1 scorecard, you can upload it from the Exam Tracker after onboarding.
                    </Typography>
                  </Box>
                )}
              </Box>
            )}

            {index < sessions.length - 1 && <Divider />}
          </Box>
        ))}
      </Paper>

      {/* Scorecard upload for completed */}
      {hasCompletedSession && (
        <Paper elevation={0} sx={{ p: 2, borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1.5 }}>Scorecard</Typography>
          <UploadButton
            label="JEE Score Card"
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
    </Box>
  );
}
