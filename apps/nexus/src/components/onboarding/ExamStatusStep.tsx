'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Button,
  Paper,
  Checkbox,
  FormControlLabel,
  Chip,
  Collapse,
  CircularProgress,
  Alert,
} from '@neram/ui';
import ArrowBackOutlinedIcon from '@mui/icons-material/ArrowBackOutlined';
import NataOnboarding from './NataOnboarding';
import JeeOnboarding from './JeeOnboarding';

type ExamState = 'still_thinking' | 'planning_to_write' | 'applied' | 'completed';

interface ExamSelection {
  exam_type: 'nata' | 'jee';
  enabled: boolean;
  state: ExamState;
}

const EXAM_STATES: { value: ExamState; label: string; description: string }[] = [
  { value: 'still_thinking', label: 'Still Thinking', description: 'Not sure yet' },
  { value: 'planning_to_write', label: 'Planning to Apply', description: 'Will apply soon' },
  { value: 'applied', label: 'Already Applied', description: 'Application submitted' },
  { value: 'completed', label: 'Exam Completed', description: 'Already wrote the exam' },
];

interface ExamStatusStepProps {
  classroomId: string;
  getToken: () => Promise<string | null>;
  onNext: () => void;
  onBack: () => void;
}

// Sub-steps within the exam flow
type SubStep = 'select' | 'nata_detail' | 'jee_detail';

export default function ExamStatusStep({ classroomId, getToken, onNext, onBack }: ExamStatusStepProps) {
  const [selections, setSelections] = useState<ExamSelection[]>([
    { exam_type: 'nata', enabled: false, state: 'still_thinking' },
    { exam_type: 'jee', enabled: false, state: 'still_thinking' },
  ]);
  const [subStep, setSubStep] = useState<SubStep>('select');
  const [saving, setSaving] = useState(false);
  const [examDates, setExamDates] = useState<any[]>([]);
  const [examTemplates, setExamTemplates] = useState<any[]>([]);

  const nata = selections.find((s) => s.exam_type === 'nata')!;
  const jee = selections.find((s) => s.exam_type === 'jee')!;

  // Fetch exam dates and exam document templates
  useEffect(() => {
    async function fetchData() {
      try {
        const token = await getToken();
        if (!token) return;
        const headers = { Authorization: `Bearer ${token}` };

        const [datesRes, templatesRes] = await Promise.all([
          fetch('/api/documents/exam-dates', { headers }),
          fetch('/api/documents/templates?category=exam', { headers }),
        ]);

        if (datesRes.ok) {
          const data = await datesRes.json();
          setExamDates(data.dates || data.examDates || []);
        }
        if (templatesRes.ok) {
          const data = await templatesRes.json();
          setExamTemplates(data.templates || []);
        }
      } catch {
        // non-critical
      }
    }
    fetchData();
  }, [getToken]);

  const updateSelection = (examType: string, updates: Partial<ExamSelection>) => {
    setSelections((prev) =>
      prev.map((s) => (s.exam_type === examType ? { ...s, ...updates } : s))
    );
  };

  // Save basic exam plan + registration, then proceed to detail sub-step
  const handleSelectContinue = async () => {
    const enabledExams = selections.filter((s) => s.enabled);

    if (enabledExams.length === 0) {
      onNext(); // Skip & Continue
      return;
    }

    setSaving(true);
    try {
      const token = await getToken();
      if (!token) return;

      // Save exam plans and registrations for all enabled exams
      for (const exam of enabledExams) {
        await fetch('/api/documents/exam-registrations', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            classroom_id: classroomId,
            exam_type: exam.exam_type,
            is_writing: exam.state !== 'still_thinking',
          }),
        });

        await fetch('/api/documents/exam-plans', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            classroom_id: classroomId,
            exam_type: exam.exam_type,
            state: exam.state,
          }),
        });
      }

      // Determine which detail sub-step to show first
      if (nata.enabled && nata.state !== 'still_thinking') {
        setSubStep('nata_detail');
      } else if (jee.enabled && jee.state !== 'still_thinking') {
        setSubStep('jee_detail');
      } else {
        // All enabled exams are "still_thinking" — no detail needed
        onNext();
      }
    } catch (err) {
      console.error('Failed to save exam selections:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleNataComplete = () => {
    // After NATA detail, check if JEE needs detail too
    if (jee.enabled && jee.state !== 'still_thinking') {
      setSubStep('jee_detail');
    } else {
      onNext();
    }
  };

  const handleJeeComplete = () => {
    onNext();
  };

  // Sub-step: NATA detail
  if (subStep === 'nata_detail') {
    return (
      <NataOnboarding
        classroomId={classroomId}
        getToken={getToken}
        examState={nata.state}
        examDates={examDates.filter((d: any) => d.exam_type === 'nata')}
        examTemplates={examTemplates.filter((t: any) => t.linked_exam === 'nata' || t.linked_exam === 'both')}
        onComplete={handleNataComplete}
        onBack={() => setSubStep('select')}
      />
    );
  }

  // Sub-step: JEE detail
  if (subStep === 'jee_detail') {
    return (
      <JeeOnboarding
        classroomId={classroomId}
        getToken={getToken}
        examState={jee.state}
        examDates={examDates.filter((d: any) => d.exam_type === 'jee')}
        examTemplates={examTemplates.filter((t: any) => t.linked_exam === 'jee' || t.linked_exam === 'both')}
        onComplete={handleJeeComplete}
        onBack={() => {
          if (nata.enabled && nata.state !== 'still_thinking') {
            setSubStep('nata_detail');
          } else {
            setSubStep('select');
          }
        }}
      />
    );
  }

  // Sub-step: Select exams
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Box>
        <Typography variant="h6" sx={{ fontWeight: 700 }}>
          Exam Plans
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Which entrance exams are you planning to write? Select all that apply.
        </Typography>
      </Box>

      {/* NATA Card */}
      <ExamCard
        label="NATA 2026"
        description="National Aptitude Test in Architecture"
        selection={nata}
        onUpdate={(u) => updateSelection('nata', u)}
      />

      {/* JEE Card */}
      <ExamCard
        label="JEE Main 2026"
        description="Joint Entrance Examination"
        selection={jee}
        onUpdate={(u) => updateSelection('jee', u)}
      />

      {!selections.some((s) => s.enabled) && (
        <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center' }}>
          Not planning any exams? You can skip this step and update later.
        </Typography>
      )}

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
          disabled={saving}
          onClick={handleSelectContinue}
          sx={{ py: 1.5, borderRadius: 2, textTransform: 'none', fontWeight: 600 }}
        >
          {saving ? 'Saving...' : selections.some((s) => s.enabled) ? 'Continue' : 'Skip & Continue'}
        </Button>
      </Box>
    </Box>
  );
}

function ExamCard({
  label,
  description,
  selection,
  onUpdate,
}: {
  label: string;
  description: string;
  selection: ExamSelection;
  onUpdate: (updates: Partial<ExamSelection>) => void;
}) {
  return (
    <Paper
      elevation={0}
      sx={{
        borderRadius: 3,
        border: '1px solid',
        borderColor: selection.enabled ? 'primary.light' : 'divider',
        bgcolor: selection.enabled ? 'primary.50' : 'background.paper',
        transition: 'all 0.2s',
        overflow: 'hidden',
      }}
    >
      <Box sx={{ p: 2 }}>
        <FormControlLabel
          control={
            <Checkbox
              checked={selection.enabled}
              onChange={(e) => onUpdate({ enabled: e.target.checked })}
            />
          }
          label={
            <Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>{label}</Typography>
              <Typography variant="caption" color="text.secondary">{description}</Typography>
            </Box>
          }
          sx={{ m: 0, alignItems: 'flex-start' }}
        />
      </Box>

      <Collapse in={selection.enabled}>
        <Box sx={{ px: 2, pb: 2, pt: 0 }}>
          <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1.5 }}>
            What&apos;s your current status?
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            {EXAM_STATES.map((s) => (
              <Chip
                key={s.value}
                label={s.label}
                variant={selection.state === s.value ? 'filled' : 'outlined'}
                color={selection.state === s.value ? 'primary' : 'default'}
                onClick={() => onUpdate({ state: s.value })}
                sx={{ cursor: 'pointer', fontWeight: selection.state === s.value ? 600 : 400, minHeight: 36 }}
              />
            ))}
          </Box>
          {selection.state !== 'still_thinking' && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
              We&apos;ll ask for more details in the next screen.
            </Typography>
          )}
        </Box>
      </Collapse>
    </Paper>
  );
}
