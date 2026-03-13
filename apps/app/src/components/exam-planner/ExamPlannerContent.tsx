'use client';

import { useState } from 'react';
import {
  Box,
  Typography,
  Button,
  Paper,
  Chip,
  CircularProgress,
  Alert,
  Snackbar,
  Skeleton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@neram/ui';
import LockIcon from '@mui/icons-material/Lock';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import WbSunnyIcon from '@mui/icons-material/WbSunny';
import NightsStayIcon from '@mui/icons-material/NightsStay';
import type { ExamPhase, ExamTimeSlot, PlannerSession } from '@neram/database';
import { useExamPlanner } from '@/hooks/useExamPlanner';
import {
  PHASE_1_SESSIONS,
  PHASE_2_SESSIONS,
  isSessionPast,
  getSessionKey,
  groupSessionsByMonth,
} from './nata-2026-schedule';

// --- Phase Toggle ---

function PhaseToggle({
  selectedPhase,
  savedPhase,
  onSelect,
}: {
  selectedPhase: ExamPhase | null;
  savedPhase: ExamPhase | null;
  onSelect: (phase: ExamPhase) => void;
}) {
  const phases: { phase: ExamPhase; label: string; subtitle: string; dateRange: string }[] = [
    {
      phase: 'phase_1',
      label: 'Phase 1',
      subtitle: 'Pick up to 2 sessions',
      dateRange: 'Apr 4 – Jun 13',
    },
    {
      phase: 'phase_2',
      label: 'Phase 2',
      subtitle: 'Pick 1 session',
      dateRange: 'Aug 7 – 8',
    },
  ];

  return (
    <Box sx={{ display: 'flex', gap: 1.5, mb: 3 }}>
      {phases.map((p) => {
        const isSelected = selectedPhase === p.phase;
        const isLocked = savedPhase !== null && savedPhase !== p.phase;

        return (
          <Paper
            key={p.phase}
            onClick={() => !isLocked && onSelect(p.phase)}
            sx={{
              flex: 1,
              p: 2,
              cursor: isLocked ? 'not-allowed' : 'pointer',
              border: '2px solid',
              borderColor: isSelected ? 'primary.main' : isLocked ? 'action.disabled' : 'divider',
              bgcolor: isSelected ? 'primary.50' : isLocked ? 'action.disabledBackground' : 'background.paper',
              opacity: isLocked ? 0.6 : 1,
              transition: 'all 0.2s',
              '&:active': !isLocked ? { transform: 'scale(0.97)' } : {},
              position: 'relative',
              overflow: 'hidden',
            }}
            elevation={isSelected ? 2 : 0}
          >
            {isLocked && (
              <LockIcon
                sx={{
                  position: 'absolute',
                  top: 8,
                  right: 8,
                  fontSize: '1rem',
                  color: 'text.disabled',
                }}
              />
            )}
            <Typography variant="subtitle2" sx={{ fontWeight: 700, color: isSelected ? 'primary.main' : 'text.primary' }}>
              {p.label}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
              {p.dateRange}
            </Typography>
            <Typography variant="caption" color={isSelected ? 'primary.main' : 'text.secondary'}>
              {isLocked ? 'Locked' : p.subtitle}
            </Typography>
          </Paper>
        );
      })}
    </Box>
  );
}

// --- Session Card ---

function SessionCard({
  session,
  isSelected,
  isDisabled,
  isPast,
  onToggle,
}: {
  session: PlannerSession;
  isSelected: boolean;
  isDisabled: boolean;
  isPast: boolean;
  onToggle: () => void;
}) {
  const d = new Date(session.date + 'T00:00:00');
  const dateLabel = d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
  const isMorning = session.timeSlot === 'morning';

  return (
    <Paper
      onClick={() => !isPast && !isDisabled && onToggle()}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        p: 1.5,
        cursor: isPast || isDisabled ? 'default' : 'pointer',
        border: '2px solid',
        borderColor: isSelected ? 'primary.main' : 'divider',
        bgcolor: isSelected
          ? 'primary.50'
          : isPast
          ? 'action.disabledBackground'
          : 'background.paper',
        opacity: isPast ? 0.5 : isDisabled ? 0.6 : 1,
        transition: 'all 0.15s',
        '&:active': !isPast && !isDisabled ? { transform: 'scale(0.98)' } : {},
        minHeight: 56,
      }}
      elevation={0}
    >
      {/* Date column */}
      <Box sx={{ minWidth: 64, textAlign: 'center' }}>
        <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.2 }}>
          {dateLabel}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {session.day}
        </Typography>
      </Box>

      {/* Time slot */}
      <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', gap: 0.75 }}>
        {isMorning ? (
          <WbSunnyIcon sx={{ fontSize: '1rem', color: 'warning.main' }} />
        ) : (
          <NightsStayIcon sx={{ fontSize: '1rem', color: 'info.main' }} />
        )}
        <Box>
          <Typography variant="body2" sx={{ fontWeight: 500 }}>
            {isMorning ? 'Morning' : 'Afternoon'}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {session.timeLabel}
          </Typography>
        </Box>
      </Box>

      {/* Status */}
      {isPast ? (
        <Chip label="Past" size="small" variant="outlined" sx={{ fontSize: '0.7rem', height: 24 }} />
      ) : isSelected ? (
        <CheckCircleIcon sx={{ color: 'primary.main', fontSize: '1.4rem' }} />
      ) : isDisabled ? (
        <Chip label="Full" size="small" variant="outlined" sx={{ fontSize: '0.7rem', height: 24, color: 'text.disabled' }} />
      ) : null}
    </Paper>
  );
}

// --- Session Grid ---

function SessionGrid({
  sessions,
  selectedSessions,
  canSelectMore,
  onToggle,
}: {
  sessions: PlannerSession[];
  selectedSessions: Set<string>;
  canSelectMore: boolean;
  onToggle: (date: string, timeSlot: ExamTimeSlot) => void;
}) {
  const grouped = groupSessionsByMonth(sessions);

  return (
    <Box sx={{ mb: 10 }}>
      {Array.from(grouped.entries()).map(([month, monthSessions]) => (
        <Box key={month} sx={{ mb: 3 }}>
          <Typography
            variant="overline"
            sx={{
              display: 'block',
              mb: 1,
              fontWeight: 600,
              letterSpacing: '0.08em',
              color: 'text.secondary',
            }}
          >
            {month}
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {monthSessions.map((session) => {
              const key = getSessionKey(session.date, session.timeSlot);
              const isSelected = selectedSessions.has(key);
              const isPast = isSessionPast(session.date);
              const isDisabled = !isSelected && !canSelectMore && !isPast;

              return (
                <SessionCard
                  key={key}
                  session={session}
                  isSelected={isSelected}
                  isDisabled={isDisabled}
                  isPast={isPast}
                  onToggle={() => onToggle(session.date, session.timeSlot)}
                />
              );
            })}
          </Box>
        </Box>
      ))}
    </Box>
  );
}

// --- Selection Summary (sticky bottom) ---

function SelectionSummary({
  selectedCount,
  maxSelections,
  hasUnsavedChanges,
  saving,
  savedPhase,
  onSave,
  onClear,
}: {
  selectedCount: number;
  maxSelections: number;
  hasUnsavedChanges: boolean;
  saving: boolean;
  savedPhase: ExamPhase | null;
  onSave: () => void;
  onClear: () => void;
}) {
  const [showClearDialog, setShowClearDialog] = useState(false);

  if (selectedCount === 0 && !savedPhase) return null;

  return (
    <>
      <Paper
        sx={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 1100,
          p: 2,
          pb: 'calc(env(safe-area-inset-bottom, 0px) + 16px)',
          borderTop: '1px solid',
          borderColor: 'divider',
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
        }}
        elevation={8}
      >
        <Box sx={{ flex: 1 }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {selectedCount} of {maxSelections} selected
          </Typography>
          {!hasUnsavedChanges && savedPhase && (
            <Typography variant="caption" color="success.main">
              Saved
            </Typography>
          )}
        </Box>

        {savedPhase && (
          <Button
            size="small"
            color="error"
            variant="outlined"
            onClick={() => setShowClearDialog(true)}
            startIcon={<DeleteOutlineIcon />}
            sx={{ minWidth: 'auto', fontSize: '0.78rem' }}
          >
            Clear
          </Button>
        )}

        <Button
          variant="contained"
          size="small"
          disabled={!hasUnsavedChanges || selectedCount === 0 || saving}
          onClick={onSave}
          startIcon={saving ? <CircularProgress size={14} /> : <CheckCircleIcon />}
        >
          {saving ? 'Saving...' : 'Save My Plan'}
        </Button>
      </Paper>

      <Dialog open={showClearDialog} onClose={() => setShowClearDialog(false)}>
        <DialogTitle>Clear selections?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            This will remove all your saved exam session preferences. You can re-select later.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowClearDialog(false)}>Cancel</Button>
          <Button
            color="error"
            onClick={() => {
              setShowClearDialog(false);
              onClear();
            }}
          >
            Clear All
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

// --- Reward Banner ---

function PlannerRewardBanner({
  show,
  onDismiss,
}: {
  show: boolean;
  onDismiss: () => void;
}) {
  return (
    <Snackbar
      open={show}
      autoHideDuration={5000}
      onClose={onDismiss}
      anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
    >
      <Alert
        severity="success"
        icon={<EmojiEventsIcon />}
        onClose={onDismiss}
        sx={{ width: '100%' }}
      >
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          +5 Neram Points earned!
        </Typography>
        <Typography variant="caption">
          Thanks for planning your NATA sessions
        </Typography>
      </Alert>
    </Snackbar>
  );
}

// --- Main Content ---

export default function ExamPlannerContent() {
  const planner = useExamPlanner();

  if (planner.loading) {
    return (
      <Box sx={{ p: { xs: 2, md: 3 } }}>
        <Skeleton variant="text" width={200} height={32} sx={{ mb: 2 }} />
        <Box sx={{ display: 'flex', gap: 1.5, mb: 3 }}>
          <Skeleton variant="rounded" sx={{ flex: 1, height: 80 }} />
          <Skeleton variant="rounded" sx={{ flex: 1, height: 80 }} />
        </Box>
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} variant="rounded" height={56} sx={{ mb: 1 }} />
        ))}
      </Box>
    );
  }

  const activeSessions = planner.selectedPhase === 'phase_2' ? PHASE_2_SESSIONS : PHASE_1_SESSIONS;

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 600, mx: 'auto' }}>
      {/* Header */}
      <Box sx={{ mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
          <CalendarTodayIcon sx={{ color: 'primary.main', fontSize: '1.2rem' }} />
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            Exam Planner
          </Typography>
        </Box>
        <Typography variant="body2" color="text.secondary">
          Select your preferred NATA 2026 exam dates and sessions. Plan your attempts wisely!
        </Typography>

        {planner.rewardEarned && !planner.showRewardBanner && (
          <Chip
            icon={<EmojiEventsIcon />}
            label="+5 Points Earned"
            size="small"
            color="success"
            variant="outlined"
            sx={{ mt: 1 }}
          />
        )}
      </Box>

      {/* Rules */}
      <Alert severity="info" sx={{ mb: 3, '& .MuiAlert-message': { fontSize: '0.8rem' } }}>
        <strong>Rules:</strong> Maximum 2 attempts in Phase 1 <strong>OR</strong> 1 attempt in Phase 2.
        Phases are mutually exclusive — you can only select from one phase.
      </Alert>

      {/* Error */}
      {planner.error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => {}}>
          {planner.error}
        </Alert>
      )}

      {/* Phase Toggle */}
      <PhaseToggle
        selectedPhase={planner.selectedPhase}
        savedPhase={planner.savedPhase}
        onSelect={planner.selectPhase}
      />

      {/* Session Grid */}
      {planner.selectedPhase ? (
        <SessionGrid
          sessions={activeSessions}
          selectedSessions={planner.selectedSessions}
          canSelectMore={planner.canSelectMore}
          onToggle={planner.toggleSession}
        />
      ) : (
        <Paper sx={{ p: 3, textAlign: 'center' }}>
          <CalendarTodayIcon sx={{ fontSize: 48, color: 'action.disabled', mb: 1 }} />
          <Typography variant="body2" color="text.secondary">
            Select a phase above to view exam sessions
          </Typography>
        </Paper>
      )}

      {/* Sticky Bottom Summary */}
      <SelectionSummary
        selectedCount={planner.selectedSessions.size}
        maxSelections={planner.maxSelections}
        hasUnsavedChanges={planner.hasUnsavedChanges}
        saving={planner.saving}
        savedPhase={planner.savedPhase}
        onSave={planner.save}
        onClear={planner.clearSelections}
      />

      {/* Reward Banner */}
      <PlannerRewardBanner
        show={planner.showRewardBanner}
        onDismiss={planner.dismissRewardBanner}
      />
    </Box>
  );
}
