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

interface MyPlan {
  plan_state: string | null;
  target_year: string | null;
  application_number: string | null;
}

interface AddExamDateSheetProps {
  open: boolean;
  onClose: () => void;
  phaseInfo: PhaseInfo;
  myAttempts: MyAttempt[];
  classroomId: string;
  getToken: () => Promise<string | null>;
  onSubmitted: () => void;
  myPlan?: MyPlan | null;
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

const TARGET_YEARS = ['2026-27', '2027-28', '2028-29'];

export default function AddExamDateSheet({
  open,
  onClose,
  phaseInfo,
  myAttempts,
  classroomId,
  getToken,
  onSubmitted,
  myPlan,
}: AddExamDateSheetProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  // Step 0 = intent declaration (shown when no plan exists or user taps "Update status")
  // Step 1+ = existing date picker flow
  const hasPlan = myPlan?.plan_state && myPlan.plan_state !== 'not_this_year';
  const [step, setStep] = useState(hasPlan ? 1 : 0);
  const [intentChoice, setIntentChoice] = useState<'writing' | 'not_this_year' | null>(null);
  const [appliedChoice, setAppliedChoice] = useState<'has_number' | 'applied_no_number' | 'not_applied' | null>(null);
  const [intentAppNumber, setIntentAppNumber] = useState(myPlan?.application_number || '');
  const [targetYear, setTargetYear] = useState<string | null>(null);
  const [savingIntent, setSavingIntent] = useState(false);

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

  const saveIntent = async (state: string, options?: { target_year?: string; application_number?: string }) => {
    setSavingIntent(true);
    try {
      const token = await getToken();
      await fetch('/api/documents/exam-plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          classroom_id: classroomId,
          exam_type: 'nata',
          state,
          target_year: options?.target_year ?? null,
          application_number: options?.application_number ?? null,
        }),
      });
    } catch {
      // non-critical
    } finally {
      setSavingIntent(false);
    }
  };

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
    setStep(hasPlan ? 1 : 0);
    setIntentChoice(null);
    setAppliedChoice(null);
    setTargetYear(null);
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
          <Typography variant="h6" fontWeight={700}>
            {step === 0 ? 'My NATA Plan' : 'Add My Exam Date'}
          </Typography>
          {step > 0 && (
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
          )}
          {step > 0 && hasPlan && (
            <Typography
              variant="caption"
              color="primary"
              sx={{ cursor: 'pointer', textDecoration: 'underline', display: 'block', mt: 0.5 }}
              onClick={() => setStep(0)}
            >
              Update my status
            </Typography>
          )}
        </Box>

        {/* Step 0: Intent declaration */}
        {step === 0 && (
          <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
            {intentChoice === null && (
              <>
                <Typography variant="body2" color="text.secondary">
                  Are you writing NATA 2025-26?
                </Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                  <Paper
                    variant="outlined"
                    onClick={() => setIntentChoice('writing')}
                    sx={{ p: 2, cursor: 'pointer', borderRadius: 2, '&:hover': { borderColor: 'primary.main', bgcolor: alpha(theme.palette.primary.main, 0.04) } }}
                  >
                    <Typography variant="body2" fontWeight={600}>Yes, writing 2025-26</Typography>
                    <Typography variant="caption" color="text.secondary">I plan to take NATA this academic year</Typography>
                  </Paper>
                  <Paper
                    variant="outlined"
                    onClick={() => setIntentChoice('not_this_year')}
                    sx={{ p: 2, cursor: 'pointer', borderRadius: 2, '&:hover': { borderColor: 'warning.main', bgcolor: alpha(theme.palette.warning.main, 0.04) } }}
                  >
                    <Typography variant="body2" fontWeight={600}>Not writing this year</Typography>
                    <Typography variant="caption" color="text.secondary">I will write in a future academic year</Typography>
                  </Paper>
                </Box>
              </>
            )}

            {intentChoice === 'writing' && appliedChoice === null && (
              <>
                <Typography variant="body2" color="text.secondary">Have you applied for NATA 2025-26?</Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                  <Paper variant="outlined" onClick={() => setAppliedChoice('has_number')} sx={{ p: 2, cursor: 'pointer', borderRadius: 2, '&:hover': { borderColor: 'primary.main', bgcolor: alpha(theme.palette.primary.main, 0.04) } }}>
                    <Typography variant="body2" fontWeight={600}>Yes, I have my application number</Typography>
                  </Paper>
                  <Paper variant="outlined" onClick={async () => { await saveIntent('applied'); handleClose(); onSubmitted(); }} sx={{ p: 2, cursor: 'pointer', borderRadius: 2, '&:hover': { borderColor: 'primary.main' } }}>
                    <Typography variant="body2" fontWeight={600}>Applied, waiting for confirmation</Typography>
                    <Typography variant="caption" color="text.secondary">No application number yet</Typography>
                  </Paper>
                  <Paper variant="outlined" onClick={async () => { await saveIntent('planning_to_write'); handleClose(); onSubmitted(); }} sx={{ p: 2, cursor: 'pointer', borderRadius: 2, '&:hover': { borderColor: 'primary.main' } }}>
                    <Typography variant="body2" fontWeight={600}>Not yet applied</Typography>
                    <Typography variant="caption" color="text.secondary">Planning to apply soon</Typography>
                  </Paper>
                </Box>
                <Button variant="text" size="small" onClick={() => setIntentChoice(null)} sx={{ textTransform: 'none', alignSelf: 'flex-start' }}>Back</Button>
              </>
            )}

            {intentChoice === 'writing' && appliedChoice === 'has_number' && (
              <>
                <Typography variant="body2" color="text.secondary">Enter your NATA application number</Typography>
                <TextField
                  label="Application Number"
                  value={intentAppNumber}
                  onChange={(e) => setIntentAppNumber(e.target.value)}
                  fullWidth
                  placeholder="e.g., NATA2025XXXXX"
                  InputProps={{ sx: { minHeight: 48 } }}
                />
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Button variant="outlined" fullWidth onClick={() => setAppliedChoice(null)} sx={{ textTransform: 'none', borderRadius: 2 }}>Back</Button>
                  <Button
                    variant="contained"
                    fullWidth
                    disabled={savingIntent}
                    onClick={async () => {
                      await saveIntent('applied', { application_number: intentAppNumber.trim() || undefined });
                      setStep(needsAttemptPick ? 1 : 1);
                    }}
                    sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 2 }}
                  >
                    {savingIntent ? 'Saving...' : 'Pick a Date'}
                  </Button>
                </Box>
              </>
            )}

            {intentChoice === 'not_this_year' && (
              <>
                <Typography variant="body2" color="text.secondary">Which year are you planning to write?</Typography>
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                  {TARGET_YEARS.map(year => (
                    <Chip
                      key={year}
                      label={year}
                      onClick={() => setTargetYear(year)}
                      color={targetYear === year ? 'primary' : 'default'}
                      variant={targetYear === year ? 'filled' : 'outlined'}
                      sx={{ fontWeight: 600, minHeight: 36 }}
                    />
                  ))}
                </Box>
                <Box sx={{ display: 'flex', gap: 1, mt: 'auto' }}>
                  <Button variant="outlined" fullWidth onClick={() => setIntentChoice(null)} sx={{ textTransform: 'none', borderRadius: 2 }}>Back</Button>
                  <Button
                    variant="contained"
                    fullWidth
                    disabled={!targetYear || savingIntent}
                    onClick={async () => {
                      if (!targetYear) return;
                      await saveIntent('not_this_year', { target_year: targetYear });
                      handleClose();
                      onSubmitted();
                    }}
                    sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 2 }}
                  >
                    {savingIntent ? 'Saving...' : 'Confirm'}
                  </Button>
                </Box>
              </>
            )}
          </Box>
        )}

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
