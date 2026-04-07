'use client';

import { useState } from 'react';
import {
  Box,
  Typography,
  Button,
  Drawer,
  TextField,
  Chip,
  Paper,
  ToggleButton,
  ToggleButtonGroup,
  alpha,
  useMediaQuery,
  useTheme,
} from '@neram/ui';
import WbSunnyOutlinedIcon from '@mui/icons-material/WbSunnyOutlined';
import WbTwilightOutlinedIcon from '@mui/icons-material/WbTwilightOutlined';
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined';
import type { MyAttempt, PhaseInfo } from '@/types/exam-schedule';

interface AddExamDateSheetProps {
  open: boolean;
  onClose: () => void;
  phaseInfo: PhaseInfo;
  myAttempts: MyAttempt[];
  classroomId: string;
  getToken: () => Promise<string | null>;
  onSubmitted: () => void;
}

function formatLocalDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function generateDateOptions(phaseInfo: PhaseInfo): { date: string; label: string; month: string; isPast: boolean }[] {
  const today = formatLocalDate(new Date());
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  if (phaseInfo.phase === 'phase_2') {
    return [phaseInfo.start_date, phaseInfo.end_date].map(dateStr => {
      const d = new Date(dateStr + 'T00:00:00');
      return {
        date: dateStr,
        label: `${days[d.getDay()]}, ${months[d.getMonth()]} ${d.getDate()}`,
        month: months[d.getMonth()],
        isPast: dateStr < today,
      };
    });
  }

  // Phase 1: generate all Fri/Sat
  const start = new Date(phaseInfo.start_date + 'T00:00:00');
  const end = new Date(phaseInfo.end_date + 'T00:00:00');
  const options: { date: string; label: string; month: string; isPast: boolean }[] = [];
  const d = new Date(start);
  while (d <= end) {
    if (d.getDay() === 5 || d.getDay() === 6) {
      const dateStr = formatLocalDate(d);
      options.push({
        date: dateStr,
        label: `${days[d.getDay()]}, ${months[d.getMonth()]} ${d.getDate()}`,
        month: months[d.getMonth()],
        isPast: dateStr < today,
      });
    }
    d.setDate(d.getDate() + 1);
  }
  return options;
}

export default function AddExamDateSheet({
  open,
  onClose,
  phaseInfo,
  myAttempts,
  classroomId,
  getToken,
  onSubmitted,
}: AddExamDateSheetProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const [step, setStep] = useState(1);
  const [attemptNumber, setAttemptNumber] = useState(1);
  const [selectedDate, setSelectedDate] = useState('');
  const [city, setCity] = useState('');
  const [session, setSession] = useState<'morning' | 'afternoon' | ''>('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const dateOptions = generateDateOptions(phaseInfo);
  const availableAttempts = Array.from({ length: phaseInfo.max_attempts }, (_, i) => i + 1);
  const usedAttempts = myAttempts.filter(a => a.exam_date);

  // Determine starting step
  const needsAttemptPick = phaseInfo.max_attempts > 1 && usedAttempts.length < phaseInfo.max_attempts;

  const handleSubmit = async () => {
    if (!selectedDate) { setError('Please select a date'); return; }
    setSubmitting(true);
    setError('');

    try {
      const token = await getToken();
      const res = await fetch('/api/exam-schedule/my-date', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          exam_date: selectedDate,
          exam_city: city.trim() || null,
          exam_session: session || null,
          classroom_id: classroomId,
          attempt_number: attemptNumber,
          phase: phaseInfo.phase,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to submit');
      }
      onSubmitted();
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    setStep(1);
    setAttemptNumber(1);
    setSelectedDate('');
    setCity('');
    setSession('');
    setError('');
    onClose();
  };

  // Group dates by month for the picker
  const datesByMonth: Record<string, typeof dateOptions> = {};
  for (const opt of dateOptions) {
    if (!datesByMonth[opt.month]) datesByMonth[opt.month] = [];
    datesByMonth[opt.month].push(opt);
  }

  return (
    <Drawer
      anchor={isMobile ? 'bottom' : 'right'}
      open={open}
      onClose={handleClose}
      PaperProps={{
        sx: {
          width: isMobile ? '100%' : 420,
          maxHeight: isMobile ? '90vh' : '100%',
          borderTopLeftRadius: isMobile ? 16 : 0,
          borderTopRightRadius: isMobile ? 16 : 0,
        },
      }}
    >
      <Box sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 2.5, height: '100%' }}>
        {/* Header + progress */}
        <Box>
          <Typography variant="h6" fontWeight={700}>Add My Exam Date</Typography>
          <Box sx={{ display: 'flex', gap: 0.75, mt: 1 }}>
            {(needsAttemptPick ? [1, 2, 3] : [1, 2]).map(s => (
              <Box
                key={s}
                sx={{
                  flex: 1,
                  height: 3,
                  borderRadius: 2,
                  bgcolor: s <= step ? 'primary.main' : alpha(theme.palette.text.primary, 0.1),
                }}
              />
            ))}
          </Box>
        </Box>

        {/* Step 1: Pick attempt */}
        {step === 1 && needsAttemptPick && (
          <Box sx={{ flex: 1 }}>
            <Typography variant="body2" fontWeight={600} sx={{ mb: 1.5 }}>Which attempt?</Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {availableAttempts.map(num => {
                const existing = myAttempts.find(a => a.attempt_number === num && a.exam_date);
                return (
                  <Paper
                    key={num}
                    variant="outlined"
                    onClick={() => { if (!existing) { setAttemptNumber(num); setStep(2); } }}
                    sx={{
                      p: 2,
                      cursor: existing ? 'default' : 'pointer',
                      opacity: existing ? 0.6 : 1,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1.5,
                      '&:hover': existing ? {} : { borderColor: 'primary.main', bgcolor: alpha(theme.palette.primary.main, 0.04) },
                    }}
                  >
                    {existing ? (
                      <CheckCircleOutlinedIcon sx={{ color: 'success.main' }} />
                    ) : (
                      <Box sx={{ width: 24, height: 24, borderRadius: '50%', border: `2px solid ${theme.palette.divider}` }} />
                    )}
                    <Box sx={{ flex: 1 }}>
                      <Typography variant="body2" fontWeight={600}>
                        {num === 1 ? '1st' : '2nd'} Attempt
                      </Typography>
                      {existing && (
                        <Typography variant="caption" color="text.secondary">
                          {existing.exam_date} {existing.exam_city ? `in ${existing.exam_city}` : ''}
                        </Typography>
                      )}
                    </Box>
                  </Paper>
                );
              })}
            </Box>
          </Box>
        )}

        {/* Step 1 skip (single attempt) or Step 2: Pick date */}
        {((step === 1 && !needsAttemptPick) || step === 2) && (
          <Box sx={{ flex: 1, overflow: 'auto' }}>
            <Typography variant="body2" fontWeight={600} sx={{ mb: 1 }}>Pick a date</Typography>
            {Object.entries(datesByMonth).map(([month, dates]) => (
              <Box key={month} sx={{ mb: 2 }}>
                <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ mb: 0.5, display: 'block', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  {month}
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                  {dates.map(opt => (
                    <Chip
                      key={opt.date}
                      label={opt.label}
                      disabled={opt.isPast}
                      onClick={() => { setSelectedDate(opt.date); setStep(3); }}
                      color={selectedDate === opt.date ? 'primary' : 'default'}
                      variant={selectedDate === opt.date ? 'filled' : 'outlined'}
                      sx={{ fontWeight: 500, minHeight: 36, fontSize: '0.8rem' }}
                    />
                  ))}
                </Box>
              </Box>
            ))}
          </Box>
        )}

        {/* Step 3: City + Submit (session is optional, assigned by CoA) */}
        {step === 3 && (
          <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2.5 }}>
            <Box>
              <Typography variant="body2" fontWeight={600} sx={{ mb: 0.5 }}>
                Selected: {dateOptions.find(d => d.date === selectedDate)?.label}
              </Typography>
              <Chip
                label="Change date"
                size="small"
                variant="outlined"
                onClick={() => setStep(needsAttemptPick ? 2 : 1)}
                sx={{ fontSize: '0.7rem' }}
              />
            </Box>

            <TextField
              label="Exam City"
              placeholder="e.g., Chennai, Bangalore, Trichy"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              fullWidth
              InputProps={{ sx: { minHeight: 48 } }}
            />

            {/* Session is optional since CoA assigns it */}
            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ mb: 0.75, display: 'block' }}>
                Session (optional, assigned by Council of Architecture)
              </Typography>
              <ToggleButtonGroup
                value={session}
                exclusive
                onChange={(_, v) => setSession(v || '')}
                size="small"
                sx={{ '& .MuiToggleButton-root': { textTransform: 'none', px: 2, minHeight: 36 } }}
              >
                <ToggleButton value="morning">
                  <WbSunnyOutlinedIcon sx={{ fontSize: '0.9rem', mr: 0.5 }} /> AM
                </ToggleButton>
                <ToggleButton value="afternoon">
                  <WbTwilightOutlinedIcon sx={{ fontSize: '0.9rem', mr: 0.5 }} /> PM
                </ToggleButton>
              </ToggleButtonGroup>
            </Box>

            {error && <Typography variant="body2" color="error">{error}</Typography>}

            <Button
              variant="contained"
              onClick={handleSubmit}
              disabled={submitting || !selectedDate}
              fullWidth
              sx={{ textTransform: 'none', fontWeight: 700, minHeight: 48, mt: 'auto' }}
            >
              {submitting ? 'Submitting...' : 'Submit'}
            </Button>
          </Box>
        )}
      </Box>
    </Drawer>
  );
}
