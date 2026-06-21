'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Typography,
  Box,
  TextField,
  Button,
  Alert,
  CircularProgress,
  Divider,
  Radio,
  RadioGroup,
  FormControlLabel,
  FormControl,
  Checkbox,
  Tooltip,
} from '@neram/ui';
import FactCheckOutlinedIcon from '@mui/icons-material/FactCheckOutlined';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import type { UserJourney, ExamStatus } from '@neram/database';
import { buildWhatsAppLink } from '@/lib/whatsapp-templates/whatsapp';

interface VerifyStatusDialogProps {
  open: boolean;
  onClose: () => void;
  user: UserJourney | null;
  onConfirm: (payload: {
    examStatus: ExamStatus;
    academicYear?: string;
    archive: boolean;
    reason?: string;
  }) => Promise<void>;
}

const EXAM_STATUS_OPTIONS: { value: ExamStatus; label: string; hint: string }[] = [
  { value: 'writing_exam_this_year', label: 'Writing the exam this year', hint: 'Active aspirant, keep in focus' },
  { value: 'completed_exam', label: 'Already completed the exam', hint: 'Past batch' },
  { value: 'not_writing', label: 'Not writing the exam', hint: 'No longer a candidate' },
  { value: 'not_sure', label: 'Not sure / no answer yet', hint: 'Follow up later' },
];

const ACADEMIC_YEAR_REGEX = /^[0-9]{4}-[0-9]{2}$/;

function defaultAcademicYear(): string {
  const d = new Date();
  const startYear = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`;
}

export default function VerifyStatusDialog({
  open,
  onClose,
  user,
  onConfirm,
}: VerifyStatusDialogProps) {
  const [examStatus, setExamStatus] = useState<ExamStatus>('writing_exam_this_year');
  const [academicYear, setAcademicYear] = useState('');
  const [archive, setArchive] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open && user) {
      setExamStatus('writing_exam_this_year');
      setAcademicYear(user.academic_year || defaultAcademicYear());
      setArchive(false);
      setError('');
    }
  }, [open, user]);

  // Suggest archiving when the answer means they are no longer in this cycle.
  const handleStatusChange = (value: ExamStatus) => {
    setExamStatus(value);
    setArchive(value === 'completed_exam' || value === 'not_writing');
  };

  const yearValid = !academicYear || ACADEMIC_YEAR_REGEX.test(academicYear);

  const handleConfirm = async () => {
    setSaving(true);
    setError('');
    try {
      await onConfirm({
        examStatus,
        academicYear: academicYear || undefined,
        archive,
        reason: `Verified: ${EXAM_STATUS_OPTIONS.find((o) => o.value === examStatus)?.label}`,
      });
    } catch (err: any) {
      setError(err.message || 'Failed to record');
    } finally {
      setSaving(false);
    }
  };

  const whatsappMessage = user
    ? `Hi ${user.name || 'there'}, this is Neram Classes. We're updating our records, are you appearing for the NATA / JEE exam this year, or have you already completed it? A quick reply helps us serve you better.`
    : '';
  const hasPhone = Boolean(user?.phone);

  return (
    <Dialog open={open} onClose={() => !saving && onClose()} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 1.5 } }}>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5, pb: 1 }}>
        <FactCheckOutlinedIcon sx={{ color: 'primary.main' }} />
        <Box>
          <Typography variant="h6" fontWeight={700}>
            Verify exam status
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {user?.name || 'User'}
            {user?.phone ? ` · ${user.phone}` : ''}
          </Typography>
        </Box>
      </DialogTitle>

      <Divider />

      <DialogContent sx={{ pt: 2 }}>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {/* WhatsApp / call outreach */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <Tooltip title={hasPhone ? '' : 'No phone number on file, ask by call instead and record the answer below'}>
            <span>
              <Button
                variant="outlined"
                color="success"
                size="small"
                disabled={!hasPhone}
                startIcon={<WhatsAppIcon sx={{ fontSize: 18 }} />}
                onClick={() => window.open(buildWhatsAppLink(whatsappMessage, user?.phone || undefined), '_blank')}
                sx={{ textTransform: 'none', borderRadius: 0.75 }}
              >
                Ask on WhatsApp
              </Button>
            </span>
          </Tooltip>
          <Typography variant="caption" color="text.secondary">
            Then record their answer below.
          </Typography>
        </Box>

        <Divider sx={{ mb: 2 }} />

        {/* Exam status answer */}
        <Typography variant="body2" fontWeight={600} sx={{ mb: 1 }}>
          Their answer:
        </Typography>
        <FormControl sx={{ mb: 2 }}>
          <RadioGroup value={examStatus} onChange={(e) => handleStatusChange(e.target.value as ExamStatus)}>
            {EXAM_STATUS_OPTIONS.map((opt) => (
              <FormControlLabel
                key={opt.value}
                value={opt.value}
                control={<Radio size="small" />}
                label={
                  <Box>
                    <Typography variant="body2">{opt.label}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {opt.hint}
                    </Typography>
                  </Box>
                }
                sx={{ alignItems: 'flex-start', mb: 0.5 }}
              />
            ))}
          </RadioGroup>
        </FormControl>

        {/* Academic year cohort */}
        <Typography variant="body2" fontWeight={600} sx={{ mb: 1 }}>
          Academic year cohort:
        </Typography>
        <TextField
          fullWidth
          size="small"
          placeholder="2026-27"
          value={academicYear}
          onChange={(e) => setAcademicYear(e.target.value)}
          disabled={saving}
          error={!yearValid}
          helperText={!yearValid ? 'Use YYYY-YY format, e.g. 2026-27' : 'Update if they are re-attempting next year'}
          sx={{ mb: 1 }}
        />

        {/* Archive toggle */}
        <FormControlLabel
          control={
            <Checkbox
              size="small"
              checked={archive}
              onChange={(e) => setArchive(e.target.checked)}
              disabled={saving}
            />
          }
          label={
            <Typography variant="body2">
              Archive this user after recording (reversible)
            </Typography>
          }
        />
      </DialogContent>

      <Divider />

      <DialogActions sx={{ p: 2, gap: 1 }}>
        <Button onClick={onClose} disabled={saving} sx={{ textTransform: 'none' }}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleConfirm}
          disabled={saving || !yearValid}
          startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <FactCheckOutlinedIcon sx={{ fontSize: 18 }} />}
          sx={{ textTransform: 'none', minWidth: 150 }}
        >
          {saving ? 'Saving...' : 'Record answer'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
