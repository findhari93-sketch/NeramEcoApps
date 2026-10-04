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
import ButtonBase from '@mui/material/ButtonBase';
import { alpha } from '@mui/material/styles';
import LockIcon from '@mui/icons-material/Lock';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import WbSunnyIcon from '@mui/icons-material/WbSunny';
import NightsStayIcon from '@mui/icons-material/NightsStay';
import RefreshIcon from '@mui/icons-material/Refresh';
import EventBusyIcon from '@mui/icons-material/EventBusy';
import type { ExamPhase, ExamTimeSlot, PlannerSession } from '@neram/database';
import { useExamPlanner } from '@/hooks/useExamPlanner';
import ToolPageHeader from '@/components/tools-hub/ToolPageHeader';
import {
  PHASE_1_SESSIONS,
  PHASE_2_SESSIONS,
  isSessionPast,
  getSessionKey,
  groupSessionsByMonth,
} from './nata-2026-schedule';

// Phase toggle

function PhaseToggle({
  selectedPhase,
  savedPhase,
  phase1Over,
  phase2Over,
  onSelect,
}: {
  selectedPhase: ExamPhase | null;
  savedPhase: ExamPhase | null;
  phase1Over: boolean;
  phase2Over: boolean;
  onSelect: (phase: ExamPhase) => void;
}) {
  const phases: { phase: ExamPhase; label: string; subtitle: string; dateRange: string; over: boolean }[] = [
    { phase: 'phase_1', label: 'Phase 1', subtitle: 'Pick up to 2 sessions', dateRange: 'Apr 4 to Jun 13', over: phase1Over },
    { phase: 'phase_2', label: 'Phase 2', subtitle: 'Pick 1 session', dateRange: 'Aug 7 and 8', over: phase2Over },
  ];

  return (
    <Box role="group" aria-label="Exam phase" sx={{ display: 'flex', gap: 1.5, mb: 3 }}>
      {phases.map((p) => {
        const isSelected = selectedPhase === p.phase;
        const isLocked = savedPhase !== null && savedPhase !== p.phase;
        const isUnavailable = isLocked || (p.over && !isSelected);

        return (
          <ButtonBase
            key={p.phase}
            onClick={() => onSelect(p.phase)}
            disabled={isUnavailable}
            aria-pressed={isSelected}
            sx={(theme) => ({
              flex: 1,
              minWidth: 0,
              minHeight: 88,
              p: 2,
              display: 'block',
              textAlign: 'left',
              borderRadius: 3,
              border: '2px solid',
              borderColor: isSelected ? 'primary.main' : 'divider',
              bgcolor: isSelected
                ? alpha(theme.palette.primary.main, theme.palette.mode === 'light' ? 0.08 : 0.16)
                : isUnavailable
                  ? 'action.disabledBackground'
                  : 'background.paper',
              position: 'relative',
              transition: 'border-color 0.2s, background-color 0.2s',
              '&:hover': isUnavailable ? {} : { borderColor: 'primary.main' },
              '&.Mui-disabled': { opacity: 0.75 },
            })}
          >
            {isLocked && (
              <LockIcon
                aria-hidden="true"
                sx={{ position: 'absolute', top: 10, right: 10, fontSize: '1.125rem', color: 'text.secondary' }}
              />
            )}
            <Typography
              component="span"
              variant="subtitle1"
              sx={{ display: 'block', fontWeight: 700, color: isSelected ? 'primary.main' : 'text.primary' }}
            >
              {p.label}
            </Typography>
            <Typography component="span" variant="body2" color="text.secondary" sx={{ display: 'block' }}>
              {p.dateRange}
            </Typography>
            <Typography component="span" variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
              {isLocked ? 'Locked: clear your plan to switch' : p.over ? 'Sessions over' : p.subtitle}
            </Typography>
          </ButtonBase>
        );
      })}
    </Box>
  );
}

// Session card

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
  const slotLabel = isMorning ? 'Morning' : 'Afternoon';
  const statusLabel = isPast ? ', session over' : isDisabled ? ', limit reached' : '';

  return (
    <ButtonBase
      onClick={onToggle}
      disabled={isPast || isDisabled}
      aria-pressed={isSelected}
      aria-label={`${dateLabel} ${session.day}, ${slotLabel}, ${session.timeLabel}${statusLabel}`}
      sx={(theme) => ({
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-start',
        textAlign: 'left',
        gap: 1.5,
        p: 1.5,
        minHeight: 64,
        borderRadius: 3,
        border: '2px solid',
        borderColor: isSelected ? 'primary.main' : 'divider',
        bgcolor: isSelected
          ? alpha(theme.palette.primary.main, theme.palette.mode === 'light' ? 0.08 : 0.16)
          : isPast
            ? 'action.disabledBackground'
            : 'background.paper',
        transition: 'border-color 0.15s, background-color 0.15s',
        '&:hover': isPast || isDisabled ? {} : { borderColor: 'primary.main' },
        '&.Mui-disabled': { opacity: isPast ? 0.7 : 0.8 },
      })}
    >
      {/* Date column */}
      <Box sx={{ minWidth: 64, textAlign: 'center' }} aria-hidden="true">
        <Typography component="span" variant="body2" sx={{ display: 'block', fontWeight: 600, lineHeight: 1.2 }}>
          {dateLabel}
        </Typography>
        <Typography component="span" variant="caption" color="text.secondary">
          {session.day}
        </Typography>
      </Box>

      {/* Time slot */}
      <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', gap: 1 }} aria-hidden="true">
        {isMorning ? (
          <WbSunnyIcon sx={{ fontSize: '1.125rem', color: 'warning.main' }} />
        ) : (
          <NightsStayIcon sx={{ fontSize: '1.125rem', color: 'info.main' }} />
        )}
        <Box>
          <Typography component="span" variant="body2" sx={{ display: 'block', fontWeight: 500 }}>
            {slotLabel}
          </Typography>
          <Typography component="span" variant="caption" color="text.secondary">
            {session.timeLabel}
          </Typography>
        </Box>
      </Box>

      {/* Status */}
      <Box aria-hidden="true" sx={{ display: 'flex' }}>
        {isPast ? (
          <Chip label="Over" size="small" variant="outlined" sx={{ fontSize: '0.75rem', height: 26 }} />
        ) : isSelected ? (
          <CheckCircleIcon sx={{ color: 'primary.main', fontSize: '1.5rem' }} />
        ) : isDisabled ? (
          <Chip label="Limit reached" size="small" variant="outlined" sx={{ fontSize: '0.75rem', height: 26 }} />
        ) : null}
      </Box>
    </ButtonBase>
  );
}

// Session grid

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
    <Box sx={{ mb: 4 }}>
      {Array.from(grouped.entries()).map(([month, monthSessions]) => (
        <Box key={month} component="section" aria-label={month} sx={{ mb: 3 }}>
          <Typography variant="overline" component="h2" sx={{ display: 'block', mb: 1, color: 'text.secondary' }}>
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

// Selection summary (fixed bottom bar)

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
          // Above the phone tab bar and beside the laptop sidebar (set by AppShell)
          bottom: 'var(--app-bottom-inset, 0px)',
          left: 'var(--app-left-inset, 0px)',
          right: 0,
          zIndex: 1050,
          p: 2,
          borderTop: '1px solid',
          borderColor: 'divider',
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
        }}
        elevation={8}
      >
        <Box sx={{ flex: 1, minWidth: 0 }} aria-live="polite">
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {selectedCount} of {maxSelections} selected
          </Typography>
          {savedPhase && (
            <Typography variant="caption" color={hasUnsavedChanges ? 'text.secondary' : 'success.main'}>
              {hasUnsavedChanges ? 'Unsaved changes' : 'Saved'}
            </Typography>
          )}
        </Box>

        {savedPhase && (
          <Button
            color="error"
            variant="outlined"
            onClick={() => setShowClearDialog(true)}
            startIcon={<DeleteOutlineIcon />}
            disabled={saving}
            sx={{ minWidth: 'auto', minHeight: 44 }}
          >
            Clear
          </Button>
        )}

        <Button
          variant="contained"
          disabled={!hasUnsavedChanges || selectedCount === 0 || saving}
          onClick={onSave}
          startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <CheckCircleIcon />}
          sx={{ minHeight: 44, whiteSpace: 'nowrap' }}
        >
          {saving ? 'Saving' : 'Save my plan'}
        </Button>
      </Paper>

      <Dialog open={showClearDialog} onClose={() => setShowClearDialog(false)}>
        <DialogTitle>Clear selections?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            This removes all your saved exam session preferences. You can pick sessions again later.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowClearDialog(false)} sx={{ minHeight: 44 }}>
            Cancel
          </Button>
          <Button
            color="error"
            sx={{ minHeight: 44 }}
            onClick={() => {
              setShowClearDialog(false);
              onClear();
            }}
          >
            Clear all
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

// Reward banner

function PlannerRewardBanner({ show, onDismiss }: { show: boolean; onDismiss: () => void }) {
  return (
    <Snackbar
      open={show}
      autoHideDuration={5000}
      onClose={onDismiss}
      anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
    >
      <Alert severity="success" icon={<EmojiEventsIcon />} onClose={onDismiss} sx={{ width: '100%' }}>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          You earned 5 Neram Points
        </Typography>
        <Typography variant="caption">Thanks for planning your NATA sessions.</Typography>
      </Alert>
    </Snackbar>
  );
}

// Main content

function PlannerSkeleton() {
  return (
    <Box aria-hidden="true">
      <Skeleton variant="rounded" height={64} sx={{ mb: 3 }} />
      <Box sx={{ display: 'flex', gap: 1.5, mb: 3 }}>
        <Skeleton variant="rounded" sx={{ flex: 1, height: 88 }} />
        <Skeleton variant="rounded" sx={{ flex: 1, height: 88 }} />
      </Box>
      {[1, 2, 3, 4].map((i) => (
        <Skeleton key={i} variant="rounded" height={64} sx={{ mb: 1 }} />
      ))}
    </Box>
  );
}

export default function ExamPlannerContent() {
  const planner = useExamPlanner();

  const phase1Over = PHASE_1_SESSIONS.every((s) => isSessionPast(s.date));
  const phase2Over = PHASE_2_SESSIONS.every((s) => isSessionPast(s.date));
  const allOver = phase1Over && phase2Over;
  const activeSessions = planner.selectedPhase === 'phase_2' ? PHASE_2_SESSIONS : PHASE_1_SESSIONS;
  const sortedPrefs = [...planner.preferences].sort((a, b) => a.exam_date.localeCompare(b.exam_date));

  let body: React.ReactNode;

  if (planner.loading) {
    body = <PlannerSkeleton />;
  } else if (planner.loadError) {
    body = (
      <Alert
        severity="error"
        role="alert"
        action={
          <Button color="inherit" onClick={planner.retryLoad} startIcon={<RefreshIcon />} sx={{ minHeight: 44 }}>
            Retry
          </Button>
        }
      >
        {planner.loadError} Your saved plan has not been changed.
      </Alert>
    );
  } else if (allOver) {
    body = (
      <Paper sx={{ p: { xs: 2.5, md: 3 } }}>
        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
          <EventBusyIcon sx={{ color: 'text.secondary', fontSize: 28, mt: 0.25 }} aria-hidden="true" />
          <Box>
            <Typography variant="h6" component="h2" gutterBottom>
              NATA 2026 sessions are over
            </Typography>
            <Typography variant="body2" color="text.secondary">
              2027 dates are not announced yet. When the Council of Architecture publishes the NATA 2027
              schedule, you can plan your sessions here.
            </Typography>
          </Box>
        </Box>
        {sortedPrefs.length > 0 && (
          <Box sx={{ mt: 2.5 }}>
            <Typography variant="subtitle2" component="h3" gutterBottom>
              Your NATA 2026 plan
            </Typography>
            <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
              {sortedPrefs.map((p) => (
                <Typography component="li" variant="body2" key={`${p.exam_date}_${p.time_slot}`}>
                  {p.session_label}
                </Typography>
              ))}
            </Box>
          </Box>
        )}
      </Paper>
    );
  } else {
    body = (
      <>
        <Alert severity="info" sx={{ mb: 3 }}>
          <strong>Rules:</strong> up to 2 attempts in Phase 1 <strong>or</strong> 1 attempt in Phase 2. The
          phases are mutually exclusive, so you can only pick from one phase.
        </Alert>

        {planner.error && (
          <Alert severity="error" role="alert" sx={{ mb: 2 }} onClose={planner.clearError}>
            {planner.error}
          </Alert>
        )}

        <PhaseToggle
          selectedPhase={planner.selectedPhase}
          savedPhase={planner.savedPhase}
          phase1Over={phase1Over}
          phase2Over={phase2Over}
          onSelect={planner.selectPhase}
        />

        {planner.selectedPhase ? (
          <SessionGrid
            sessions={activeSessions}
            selectedSessions={planner.selectedSessions}
            canSelectMore={planner.canSelectMore}
            onToggle={planner.toggleSession}
          />
        ) : (
          <Paper sx={{ p: 3, textAlign: 'center' }}>
            <CalendarTodayIcon sx={{ fontSize: 44, color: 'text.secondary', mb: 1 }} aria-hidden="true" />
            <Typography variant="body2" color="text.secondary">
              Choose a phase above to see its exam sessions.
            </Typography>
          </Paper>
        )}

        <SelectionSummary
          selectedCount={planner.selectedSessions.size}
          maxSelections={planner.maxSelections}
          hasUnsavedChanges={planner.hasUnsavedChanges}
          saving={planner.saving}
          savedPhase={planner.savedPhase}
          onSave={planner.save}
          onClear={planner.clearSelections}
        />
      </>
    );
  }

  return (
    // Bottom space keeps the last sessions clear of the fixed selection bar
    <Box sx={{ pb: 14, maxWidth: 720, mx: 'auto' }}>
      <ToolPageHeader
        toolId="nata-exam-planner"
        description="Pick your preferred NATA 2026 exam dates and sessions, then save your plan."
        meta={
          planner.rewardEarned && !planner.showRewardBanner ? (
            <Chip
              icon={<EmojiEventsIcon />}
              label="5 points earned"
              size="small"
              color="success"
              variant="outlined"
              sx={{ height: 26, fontSize: '0.75rem' }}
            />
          ) : undefined
        }
      />
      {body}
      <PlannerRewardBanner show={planner.showRewardBanner} onDismiss={planner.dismissRewardBanner} />
    </Box>
  );
}
