'use client';

/**
 * The teacher's controls under the shared question. One big button that does
 * the next thing (Start, Close now, Reveal, Next), and around it: back and
 * forward, the question grid, the timer, more time, the answer spread, the
 * solution, full screen and exit.
 *
 * Fades after a few seconds without the mouse moving, so the class sees only
 * the question; it never fades while a menu is open or the pointer is on it.
 * Its space stays reserved, so nothing on the stage moves when it fades.
 */

import { useState } from 'react';
import { Box, Button, CircularProgress, IconButton, Menu, MenuItem, Stack, Tooltip, Typography } from '@neram/ui';
import ArrowBackIosNewRoundedIcon from '@mui/icons-material/ArrowBackIosNewRounded';
import ArrowForwardIosRoundedIcon from '@mui/icons-material/ArrowForwardIosRounded';
import AppsRoundedIcon from '@mui/icons-material/AppsRounded';
import BarChartRoundedIcon from '@mui/icons-material/BarChartRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import FullscreenRoundedIcon from '@mui/icons-material/FullscreenRounded';
import FullscreenExitRoundedIcon from '@mui/icons-material/FullscreenExitRounded';
import LightbulbOutlinedIcon from '@mui/icons-material/LightbulbOutlined';
import MoreTimeRoundedIcon from '@mui/icons-material/MoreTimeRounded';
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded';
import StopRoundedIcon from '@mui/icons-material/StopRounded';
import TimerOutlinedIcon from '@mui/icons-material/TimerOutlined';
import VisibilityRoundedIcon from '@mui/icons-material/VisibilityRounded';
import type { PresentPhase, PrimaryAction } from './present-model';

export const TIMER_CHOICES = [0, 30, 45, 60, 90, 120, 180, 300] as const;

export function timerLabel(seconds: number): string {
  if (!seconds) return 'No timer';
  if (seconds < 60) return `${seconds}s`;
  return seconds % 60 ? `${Math.floor(seconds / 60)}m ${seconds % 60}s` : `${seconds / 60} min`;
}

export function primaryLabel(action: PrimaryAction, timer: number): string {
  switch (action) {
    case 'start':
      return timer ? `Start ${timerLabel(timer)}` : 'Start';
    case 'close':
      return 'Close now';
    case 'reveal':
      return 'Reveal answer';
    case 'next':
      return 'Next question';
    case 'none':
      return 'Last question';
  }
}

const PRIMARY_ICON: Record<PrimaryAction, JSX.Element | null> = {
  start: <PlayArrowRoundedIcon />,
  close: <StopRoundedIcon />,
  reveal: <VisibilityRoundedIcon />,
  next: <ArrowForwardIosRoundedIcon sx={{ fontSize: 18 }} />,
  none: null,
};

/** A mouse click leaves focus on the button, and the next Space would press it again. */
const blurAfterMouse = (event: React.MouseEvent<HTMLElement>) => {
  if (event.detail > 0) event.currentTarget.blur();
};

export interface PresentControlBarProps {
  visible: boolean;
  onHoldVisible: (hold: boolean) => void;
  phase: PresentPhase;
  primary: PrimaryAction;
  busy: boolean;
  onPrimary: () => void;
  canPrev: boolean;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  position: string;
  onGrid: () => void;
  timer: number;
  onTimer: (seconds: number) => void;
  /** More time is offered while open, and on a closed question when the pad allows it. */
  canAddTime: boolean;
  onAddTime: () => void;
  canSpread: boolean;
  spreadOn: boolean;
  onSpread: () => void;
  canSolution: boolean;
  solutionOn: boolean;
  onSolution: () => void;
  fullscreen: boolean;
  onFullscreen: () => void;
  onExit: () => void;
  /** Left of the big button: the pad's state. */
  padSlot: React.ReactNode;
}

export default function PresentControlBar(props: PresentControlBarProps) {
  const {
    visible,
    onHoldVisible,
    primary,
    busy,
    onPrimary,
    canPrev,
    canNext,
    onPrev,
    onNext,
    position,
    onGrid,
    timer,
    onTimer,
    canAddTime,
    onAddTime,
    canSpread,
    spreadOn,
    onSpread,
    canSolution,
    solutionOn,
    onSolution,
    fullscreen,
    onFullscreen,
    onExit,
    padSlot,
  } = props;
  const [timerAnchor, setTimerAnchor] = useState<HTMLElement | null>(null);

  const iconSx = { width: 48, height: 48 };

  return (
    <Box
      component="nav"
      aria-label="Presenter controls"
      onMouseEnter={() => onHoldVisible(true)}
      onMouseLeave={() => onHoldVisible(false)}
      onFocusCapture={() => onHoldVisible(true)}
      onBlurCapture={() => onHoldVisible(false)}
      sx={{
        position: 'relative',
        height: 72,
        px: { xs: 1, md: 2 },
        display: 'flex',
        alignItems: 'center',
        gap: { xs: 0.5, md: 1 },
        borderTop: 1,
        borderColor: 'divider',
        bgcolor: 'background.paper',
        opacity: visible ? 1 : 0,
        transition: 'opacity 200ms ease-out',
        '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
        overflowX: 'auto',
        overflowY: 'hidden',
      }}
    >
      <Box sx={{ display: { xs: 'none', md: 'flex' }, alignItems: 'center', minWidth: 0, flex: '1 1 0' }}>{padSlot}</Box>

      <Stack direction="row" alignItems="center" spacing={{ xs: 0.5, md: 1 }} sx={{ flexShrink: 0, mx: 'auto' }}>
        <Tooltip title="Previous question (Left arrow)">
          <span>
            <IconButton aria-label="Previous question" onClick={(e) => { blurAfterMouse(e); onPrev(); }} disabled={!canPrev} sx={iconSx}>
              <ArrowBackIosNewRoundedIcon />
            </IconButton>
          </span>
        </Tooltip>

        <Tooltip title="All questions (G)">
          <Button
            onClick={(e) => { blurAfterMouse(e); onGrid(); }}
            startIcon={<AppsRoundedIcon />}
            sx={{ minHeight: 48, fontWeight: 700, whiteSpace: 'nowrap', color: 'text.primary' }}
          >
            {position}
          </Button>
        </Tooltip>

        <Button
          variant="contained"
          size="large"
          disabled={primary === 'none' || busy}
          onClick={(e) => { blurAfterMouse(e); onPrimary(); }}
          startIcon={busy ? <CircularProgress size={18} color="inherit" /> : PRIMARY_ICON[primary]}
          aria-keyshortcuts="Space"
          color={primary === 'close' ? 'warning' : primary === 'reveal' ? 'success' : 'primary'}
          sx={{ minHeight: 52, minWidth: { xs: 150, md: 210 }, fontWeight: 800, fontSize: 16, borderRadius: 3, whiteSpace: 'nowrap' }}
        >
          {primaryLabel(primary, timer)}
        </Button>

        <Tooltip title="Next question (Right arrow)">
          <span>
            <IconButton aria-label="Next question" onClick={(e) => { blurAfterMouse(e); onNext(); }} disabled={!canNext} sx={iconSx}>
              <ArrowForwardIosRoundedIcon />
            </IconButton>
          </span>
        </Tooltip>
      </Stack>

      <Stack direction="row" alignItems="center" spacing={0.5} justifyContent="flex-end" sx={{ flex: '1 1 0', minWidth: 0 }}>
        <Tooltip title="Timer for the next question (T)">
          <Button
            onClick={(e) => setTimerAnchor(e.currentTarget)}
            startIcon={<TimerOutlinedIcon />}
            aria-haspopup="menu"
            aria-expanded={!!timerAnchor}
            sx={{ minHeight: 48, whiteSpace: 'nowrap', color: 'text.primary' }}
          >
            {timerLabel(timer)}
          </Button>
        </Tooltip>
        <Menu
          anchorEl={timerAnchor}
          open={!!timerAnchor}
          onClose={() => setTimerAnchor(null)}
          anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
          transformOrigin={{ vertical: 'bottom', horizontal: 'center' }}
          TransitionProps={{ onEnter: () => onHoldVisible(true), onExited: () => onHoldVisible(false) }}
        >
          {TIMER_CHOICES.map((seconds) => (
            <MenuItem
              key={seconds}
              selected={seconds === timer}
              onClick={() => {
                onTimer(seconds);
                setTimerAnchor(null);
              }}
              sx={{ minHeight: 44 }}
            >
              {timerLabel(seconds)}
            </MenuItem>
          ))}
        </Menu>

        {canAddTime && (
          <Tooltip title="15 more seconds (+)">
            <Button onClick={(e) => { blurAfterMouse(e); onAddTime(); }} startIcon={<MoreTimeRoundedIcon />} sx={{ minHeight: 48, whiteSpace: 'nowrap' }}>
              +15s
            </Button>
          </Tooltip>
        )}
        {canSpread && (
          <Tooltip title={spreadOn ? 'Hide how the class answered (D)' : 'Show how the class answered (D)'}>
            <IconButton aria-label="How the class answered" aria-pressed={spreadOn} onClick={(e) => { blurAfterMouse(e); onSpread(); }} color={spreadOn ? 'primary' : 'default'} sx={iconSx}>
              <BarChartRoundedIcon />
            </IconButton>
          </Tooltip>
        )}
        {canSolution && (
          <Tooltip title={solutionOn ? 'Hide the solution (S)' : 'Show the solution (S)'}>
            <IconButton aria-label="Solution" aria-pressed={solutionOn} onClick={(e) => { blurAfterMouse(e); onSolution(); }} color={solutionOn ? 'primary' : 'default'} sx={iconSx}>
              <LightbulbOutlinedIcon />
            </IconButton>
          </Tooltip>
        )}
        <Tooltip title={fullscreen ? 'Leave full screen (F)' : 'Full screen (F)'}>
          <IconButton aria-label={fullscreen ? 'Leave full screen' : 'Full screen'} onClick={(e) => { blurAfterMouse(e); onFullscreen(); }} sx={iconSx}>
            {fullscreen ? <FullscreenExitRoundedIcon /> : <FullscreenRoundedIcon />}
          </IconButton>
        </Tooltip>
        <Tooltip title="Exit presenting">
          <IconButton aria-label="Exit presenting" onClick={onExit} sx={iconSx}>
            <CloseRoundedIcon />
          </IconButton>
        </Tooltip>
      </Stack>
      <Typography component="span" sx={{ position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
        Space does the main action. Left and Right arrows move between questions.
      </Typography>
    </Box>
  );
}
