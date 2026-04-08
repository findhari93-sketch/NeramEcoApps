'use client';

import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  Paper,
  Chip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  CircularProgress,
  Checkbox,
  FormControlLabel,
  Alert,
} from '@neram/ui';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import EditIcon from '@mui/icons-material/Edit';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { useFirebaseAuth, getFirebaseAuth } from '@neram/auth';
import { useExamCountdown } from '@/hooks/useExamCountdown';
import type { ExamScheduleSession, NataExamStatus } from '@neram/database';

// --- Sub-components ---

function MotivationalCTA({ onStart, onSkip }: { onStart: () => void; onSkip: () => void }) {
  return (
    <Paper sx={{ p: { xs: 2, md: 2.5 }, mb: 3, border: '1px solid', borderColor: 'primary.main', borderRadius: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
        <CalendarTodayIcon sx={{ color: 'primary.main', mt: 0.3 }} />
        <Box sx={{ flex: 1 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 0.5 }}>
            Get your personalized exam countdown
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Know exactly how many days you have to prepare. Plan smarter with a countdown tailored to your registered sessions.
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <Button variant="contained" size="small" onClick={onStart}>
              Personalize my dashboard
            </Button>
            <Button size="small" color="inherit" onClick={onSkip} sx={{ color: 'text.secondary' }}>
              Skip
            </Button>
          </Box>
        </Box>
      </Box>
    </Paper>
  );
}

function IntentStep({
  onSelect,
}: {
  onSelect: (status: NataExamStatus, planYear?: number) => void;
}) {
  const currentYear = new Date().getFullYear();

  const options: { label: string; status: NataExamStatus; planYear?: number }[] = [
    { label: "Yes, I've applied", status: 'applied_waiting' },
    { label: 'Planning to apply', status: 'planning_to_apply', planYear: currentYear },
    { label: 'Maybe next year', status: 'planning_to_apply', planYear: currentYear + 1 },
    { label: 'Just exploring', status: 'not_interested' },
  ];

  return (
    <Paper sx={{ p: { xs: 2, md: 2.5 }, mb: 3 }}>
      <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>
        Are you writing NATA this year?
      </Typography>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
        {options.map((opt) => (
          <Chip
            key={opt.label}
            label={opt.label}
            onClick={() => onSelect(opt.status, opt.planYear)}
            sx={{
              height: 40,
              fontSize: '0.85rem',
              cursor: 'pointer',
              '&:hover': { bgcolor: 'action.hover' },
            }}
            variant="outlined"
          />
        ))}
      </Box>
    </Paper>
  );
}

function SessionStep({
  sessions,
  onNext,
  onBack,
}: {
  sessions: ExamScheduleSession[];
  onNext: (selected: ExamScheduleSession[]) => void;
  onBack: () => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);

  const toggle = (label: string) => {
    setSelected((prev) =>
      prev.includes(label) ? prev.filter((s) => s !== label) : [...prev, label]
    );
  };

  return (
    <Paper sx={{ p: { xs: 2, md: 2.5 }, mb: 3 }}>
      <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 0.5 }}>
        Which sessions are you registered for?
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Tap all that apply
      </Typography>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mb: 2 }}>
        {sessions.map((s) => (
          <Chip
            key={s.label}
            label={`${s.label} · ${s.day}, ${new Date(s.date + 'T00:00:00').toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}`}
            onClick={() => toggle(s.label)}
            color={selected.includes(s.label) ? 'primary' : 'default'}
            variant={selected.includes(s.label) ? 'filled' : 'outlined'}
            sx={{ height: 44, fontSize: '0.85rem', cursor: 'pointer', justifyContent: 'flex-start' }}
          />
        ))}
      </Box>
      <Box sx={{ display: 'flex', gap: 1 }}>
        <Button size="small" color="inherit" onClick={onBack}>
          Back
        </Button>
        <Button
          size="small"
          variant="contained"
          disabled={selected.length === 0}
          onClick={() =>
            onNext(sessions.filter((s) => selected.includes(s.label)))
          }
        >
          Next
        </Button>
      </Box>
    </Paper>
  );
}

function CityStep({
  selectedSessions,
  onDone,
  onBack,
}: {
  selectedSessions: ExamScheduleSession[];
  onDone: (data: {
    sessions: {
      session_label: string;
      exam_date: string;
      exam_city?: string;
      exam_state?: string;
      user_reported_city?: string;
    }[];
  }) => void;
  onBack: () => void;
}) {
  const [states, setStates] = useState<string[]>([]);
  const [cities, setCities] = useState<string[]>([]);
  const [selectedState, setSelectedState] = useState('');
  const [selectedCity, setSelectedCity] = useState('');
  const [sameForAll, setSameForAll] = useState(true);
  const [notListed, setNotListed] = useState(false);
  const [customCity, setCustomCity] = useState('');
  const [loadingStates, setLoadingStates] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/tools/exam-centers?action=states')
      .then((r) => r.json())
      .then((d) => setStates(d.states || []))
      .catch(() => {})
      .finally(() => setLoadingStates(false));
  }, []);

  useEffect(() => {
    if (selectedState) {
      fetch(`/api/tools/exam-centers?action=cities&state=${encodeURIComponent(selectedState)}`)
        .then((r) => r.json())
        .then((d) => setCities(d.cities || []))
        .catch(() => {});
    } else {
      setCities([]);
    }
  }, [selectedState]);

  const handleDone = () => {
    setSaving(true);
    const sessionsData = selectedSessions.map((s) => ({
      session_label: s.label,
      exam_date: s.date,
      exam_city: notListed ? undefined : selectedCity || undefined,
      exam_state: selectedState || undefined,
      user_reported_city: notListed ? customCity || undefined : undefined,
    }));
    onDone({ sessions: sessionsData });
  };

  const canSubmit = selectedState && (selectedCity || (notListed && customCity));

  return (
    <Paper sx={{ p: { xs: 2, md: 2.5 }, mb: 3 }}>
      <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>
        Where will you take the exam?
      </Typography>

      <FormControl fullWidth size="small" sx={{ mb: 1.5 }} disabled={loadingStates}>
        <InputLabel>State</InputLabel>
        <Select
          value={selectedState}
          label="State"
          onChange={(e) => {
            setSelectedState(e.target.value);
            setSelectedCity('');
            setNotListed(false);
          }}
        >
          {states.map((s) => (
            <MenuItem key={s} value={s}>
              {s}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      {!notListed && (
        <FormControl fullWidth size="small" sx={{ mb: 1.5 }} disabled={!selectedState}>
          <InputLabel>City</InputLabel>
          <Select
            value={selectedCity}
            label="City"
            onChange={(e) => setSelectedCity(e.target.value)}
          >
            {cities.map((c) => (
              <MenuItem key={c} value={c}>
                {c}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      )}

      {notListed && (
        <TextField
          fullWidth
          size="small"
          label="Enter your city"
          value={customCity}
          onChange={(e) => setCustomCity(e.target.value)}
          sx={{ mb: 1.5 }}
          placeholder="e.g., Coimbatore"
        />
      )}

      <Button
        size="small"
        color="inherit"
        onClick={() => {
          setNotListed(!notListed);
          setSelectedCity('');
          setCustomCity('');
        }}
        sx={{ mb: 1.5, color: 'text.secondary', textTransform: 'none', fontSize: '0.78rem' }}
      >
        {notListed ? 'Select from list' : 'My city is not listed'}
      </Button>

      {selectedSessions.length > 1 && (
        <FormControlLabel
          control={
            <Checkbox checked={sameForAll} onChange={(e) => setSameForAll(e.target.checked)} size="small" />
          }
          label={<Typography variant="body2">Same city for all sessions</Typography>}
          sx={{ mb: 1.5 }}
        />
      )}

      <Box sx={{ display: 'flex', gap: 1 }}>
        <Button size="small" color="inherit" onClick={onBack}>
          Back
        </Button>
        <Button
          size="small"
          variant="contained"
          disabled={!canSubmit || saving}
          onClick={handleDone}
          startIcon={saving ? <CircularProgress size={14} /> : <CheckCircleIcon />}
        >
          Done
        </Button>
      </Box>
    </Paper>
  );
}

function PersonalizedCountdown({
  daysLeft,
  sessionLabel,
  examDate,
  examCity,
  examState,
  onEdit,
}: {
  daysLeft: number | null;
  sessionLabel: string | null;
  examDate: string | null;
  examCity: string | null;
  examState: string | null;
  onEdit: () => void;
}) {
  const dateStr = examDate
    ? new Date(examDate + 'T00:00:00').toLocaleDateString('en-IN', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : '';

  return (
    <Paper sx={{ p: { xs: 2, md: 2.5 }, mb: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Box>
          <Typography variant="overline" color="text.secondary" sx={{ fontSize: '0.65rem', letterSpacing: '0.1em' }}>
            YOUR NEXT EXAM
          </Typography>
          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
            NATA {new Date().getFullYear()} · {sessionLabel}
          </Typography>
        </Box>
        <Button size="small" startIcon={<EditIcon sx={{ fontSize: '0.8rem !important' }} />} onClick={onEdit} sx={{ fontSize: '0.75rem' }}>
          Edit
        </Button>
      </Box>
      {daysLeft !== null && (
        <Typography variant="h3" sx={{ fontWeight: 700, color: 'primary.main', my: 1 }}>
          {daysLeft} <Typography component="span" variant="body2" color="text.secondary">days</Typography>
        </Typography>
      )}
      <Typography variant="body2" color="text.secondary">
        {dateStr}
        {examCity && ` · ${examCity}`}
        {examState && !examCity?.includes(examState) && `, ${examState}`}
      </Typography>
    </Paper>
  );
}

function PlanningCard({
  registrationCloseDate,
  nextSessionDate,
  nextSessionDay,
  onApplied,
  onEdit,
}: {
  registrationCloseDate: string | null;
  nextSessionDate: string | null;
  nextSessionDay: string | null;
  onApplied: () => void;
  onEdit: () => void;
}) {
  const regCloseStr = registrationCloseDate
    ? new Date(registrationCloseDate + 'T00:00:00').toLocaleDateString('en-IN', {
        month: 'short',
        day: 'numeric',
      })
    : null;
  const nextStr = nextSessionDate
    ? `${nextSessionDay}, ${new Date(nextSessionDate + 'T00:00:00').toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}`
    : null;

  return (
    <Paper sx={{ p: { xs: 2, md: 2 }, mb: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box>
          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
            NATA {new Date().getFullYear()}
          </Typography>
          {regCloseStr && (
            <Typography variant="body2" color="text.secondary">
              Registration closes: {regCloseStr}
            </Typography>
          )}
          {nextStr && (
            <Typography variant="body2" color="text.secondary">
              Next exam: {nextStr}
            </Typography>
          )}
        </Box>
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          <Button size="small" variant="outlined" onClick={onApplied}>
            I've applied!
          </Button>
          <Button size="small" color="inherit" onClick={onEdit} sx={{ minWidth: 'auto', px: 1 }}>
            <EditIcon fontSize="small" />
          </Button>
        </Box>
      </Box>
    </Paper>
  );
}

function CompactInfoCard({
  nextSessionDate,
  nextSessionDay,
  registrationCloseDate,
  onChangeIntent,
}: {
  nextSessionDate: string | null;
  nextSessionDay: string | null;
  registrationCloseDate: string | null;
  onChangeIntent: () => void;
}) {
  const nextStr = nextSessionDate
    ? `${nextSessionDay}, ${new Date(nextSessionDate + 'T00:00:00').toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}`
    : null;
  const regStr = registrationCloseDate
    ? new Date(registrationCloseDate + 'T00:00:00').toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })
    : null;

  return (
    <Paper sx={{ p: 1.5, mb: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="body2" color="text.secondary">
          NATA {new Date().getFullYear()}
          {nextStr && ` · Next exam: ${nextStr}`}
          {regStr && ` · Reg closes: ${regStr}`}
        </Typography>
        <Button size="small" color="inherit" onClick={onChangeIntent} sx={{ fontSize: '0.72rem', textTransform: 'none', color: 'primary.main' }}>
          Writing NATA?
        </Button>
      </Box>
    </Paper>
  );
}

function PostExamCard({
  attempts,
  nextSession,
  onUpdate,
}: {
  attempts: { session_label: string | null; exam_date: string | null; exam_city: string | null; status: string }[];
  nextSession: ExamScheduleSession | null;
  onUpdate: () => void;
}) {
  return (
    <Paper sx={{ p: { xs: 2, md: 2.5 }, mb: 3 }}>
      <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
        {attempts.some((a) => a.status === 'registered') ? 'Exam update' : 'All sessions done!'}
      </Typography>
      {attempts.map((a, i) => {
        // Only mark as past after the full exam day has ended in IST (11:59 PM IST)
        const isPast = a.exam_date && new Date(a.exam_date + 'T23:59:59+05:30') < new Date();
        return (
          <Typography key={i} variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
            {a.session_label} · {a.exam_date ? new Date(a.exam_date + 'T00:00:00').toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }) : ''}
            {a.exam_city && ` · ${a.exam_city}`}
            {isPast ? ' ✓' : ''}
          </Typography>
        );
      })}
      {nextSession && (
        <Button size="small" variant="outlined" sx={{ mt: 1 }} onClick={onUpdate}>
          Update details
        </Button>
      )}
    </Paper>
  );
}

// --- Main Component ---

export default function ExamSetupCard() {
  const { user } = useFirebaseAuth();
  const countdown = useExamCountdown();
  const [step, setStep] = useState<'idle' | 'intent' | 'sessions' | 'city'>('idle');
  const [selectedSessions, setSelectedSessions] = useState<ExamScheduleSession[]>([]);
  const [skipped, setSkipped] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check sessionStorage for skip
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const skipCount = sessionStorage.getItem('exam-setup-skipped');
      if (skipCount === 'true') setSkipped(true);
    }
  }, []);

  const saveDetails = async (
    status: NataExamStatus,
    planYear?: number,
    sessions?: {
      session_label: string;
      exam_date: string;
      exam_city?: string;
      exam_state?: string;
      user_reported_city?: string;
    }[]
  ) => {
    setError(null);
    try {
      const auth = getFirebaseAuth();
      const currentUser = auth.currentUser;
      if (!currentUser) return;

      const idToken = await currentUser.getIdToken();
      const res = await fetch('/api/exam-details', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          nata_status: status,
          planning_year: planYear,
          sessions,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save');
      }

      setStep('idle');
      countdown.refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    }
  };

  const handleIntentSelect = (status: NataExamStatus, planYear?: number) => {
    if (status === 'applied_waiting') {
      // Need sessions + city
      setStep('sessions');
      // Save status eagerly so refetch picks it up
      saveDetails(status, planYear);
    } else {
      // Save directly — no further steps needed
      saveDetails(status, planYear);
    }
  };

  const handleSessionsNext = (selected: ExamScheduleSession[]) => {
    setSelectedSessions(selected);
    setStep('city');
  };

  const handleCityDone = (data: {
    sessions: {
      session_label: string;
      exam_date: string;
      exam_city?: string;
      exam_state?: string;
      user_reported_city?: string;
    }[];
  }) => {
    saveDetails('applied_waiting', new Date().getFullYear(), data.sessions);
  };

  const handleSkip = () => {
    setSkipped(true);
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('exam-setup-skipped', 'true');
    }
  };

  const startEdit = () => {
    setStep('intent');
  };

  const startFromSessions = () => {
    setStep('sessions');
  };

  // Don't render anything while loading or if no schedule
  if (countdown.loading) return null;
  if (countdown.cardState === 'no-schedule') return null;
  if (!user) return null;

  // Show error if any
  if (error) {
    return (
      <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
        {error}
      </Alert>
    );
  }

  // Active setup flow
  if (step === 'intent') {
    return <IntentStep onSelect={handleIntentSelect} />;
  }
  if (step === 'sessions' && countdown.schedule) {
    return (
      <SessionStep
        sessions={countdown.schedule.sessions}
        onNext={handleSessionsNext}
        onBack={() => setStep('intent')}
      />
    );
  }
  if (step === 'city') {
    return (
      <CityStep
        selectedSessions={selectedSessions}
        onDone={handleCityDone}
        onBack={() => setStep('sessions')}
      />
    );
  }

  // Card states
  switch (countdown.cardState) {
    case 'cta':
      if (skipped) return null;
      return <MotivationalCTA onStart={() => setStep('intent')} onSkip={handleSkip} />;

    case 'applied':
      return (
        <PersonalizedCountdown
          daysLeft={countdown.daysLeft}
          sessionLabel={countdown.nextAttempt?.session_label || countdown.nextSession?.label || null}
          examDate={countdown.nextAttempt?.exam_date || countdown.nextSession?.date || null}
          examCity={countdown.nextAttempt?.exam_city || null}
          examState={countdown.nextAttempt?.exam_state || null}
          onEdit={startEdit}
        />
      );

    case 'planning':
      return (
        <PlanningCard
          registrationCloseDate={countdown.registrationCloseDate}
          nextSessionDate={countdown.nextSession?.date || null}
          nextSessionDay={countdown.nextSession?.day || null}
          onApplied={startFromSessions}
          onEdit={startEdit}
        />
      );

    case 'not-interested':
      return (
        <CompactInfoCard
          nextSessionDate={countdown.nextSession?.date || null}
          nextSessionDay={countdown.nextSession?.day || null}
          registrationCloseDate={countdown.registrationCloseDate}
          onChangeIntent={startEdit}
        />
      );

    case 'post-exam':
      return (
        <PostExamCard
          attempts={countdown.attempts}
          nextSession={countdown.nextSession}
          onUpdate={startEdit}
        />
      );

    default:
      return null;
  }
}
