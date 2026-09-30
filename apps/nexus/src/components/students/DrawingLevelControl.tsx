'use client';

import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Snackbar,
  Typography,
  alpha,
} from '@neram/ui';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { LEVEL_KEYS, LEVEL_LABEL, LEVEL_MEANING, NOT_RATED_LABEL, type LevelKey, type LevelSource } from '@/lib/student-level';
import { useSetDrawingLevel } from '@/lib/student-level-client';
import { LevelBars } from './LevelMark';
import { useStudentStageFacts } from './StudentStageFactsProvider';

/**
 * "Drawing: Top", where a teacher is looking at the student's work.
 *
 * Managers and admins (coord.student.level) get a menu to change it, with Undo.
 * Everyone else sees the same chip read-only, so a teacher reviewing a sheet
 * knows what standard to hold it to.
 *
 * The level is read from the session lookup, so the chip, the avatar bars and
 * the roster filter always agree and move together when it changes.
 */
export default function DrawingLevelControl({
  studentId,
  studentName,
  source,
  /** Called after a successful change, e.g. to advance a queue. */
  onChanged,
  /** Just "Mid" rather than "Drawing: Mid", where the row already says Drawing. */
  compact = false,
}: {
  studentId: string;
  studentName?: string | null;
  source: LevelSource;
  onChanged?: (level: LevelKey | null) => void;
  compact?: boolean;
}) {
  const { can } = useNexusAuthContext();
  const canSet = can('coord.student.level');
  const { factsFor } = useStudentStageFacts();
  const level = factsFor(studentId)?.drawingLevel ?? null;
  const setLevel = useSetDrawingLevel();

  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [toast, setToast] = useState<{ message: string; undo?: LevelKey | null; error?: boolean } | null>(null);

  const who = studentName?.split(' ')[0] || 'this student';

  const choose = async (next: LevelKey | null, previous: LevelKey | null, isUndo = false) => {
    setAnchor(null);
    if (next === previous) return;
    try {
      await setLevel(studentId, next, source, previous);
      onChanged?.(next);
      setToast(
        isUndo
          ? { message: 'Change undone' }
          : {
              message: next ? `Drawing level for ${who}: ${LEVEL_LABEL[next]}` : `Drawing level cleared for ${who}`,
              undo: previous,
            },
      );
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : 'Could not save the level', error: true });
    }
  };

  const label = (
    <>
      {level ? <LevelBars level={level} size={16} /> : null}
      <Typography component="span" sx={{ fontSize: 13, fontWeight: 700, lineHeight: 1.2 }}>
        {compact ? '' : 'Drawing: '}
        {level ? LEVEL_LABEL[level] : NOT_RATED_LABEL}
      </Typography>
    </>
  );

  const chipSx = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 0.75,
    minHeight: 32,
    px: 1.25,
    borderRadius: 999,
    color: level ? 'primary.main' : 'text.secondary',
    bgcolor: (t: any) => (level ? alpha(t.palette.primary.main, 0.1) : t.palette.action.hover),
  } as const;

  return (
    <>
      {canSet ? (
        <Box
          component="button"
          type="button"
          onClick={(e: React.MouseEvent<HTMLElement>) => {
            e.stopPropagation();
            setAnchor(e.currentTarget);
          }}
          aria-haspopup="menu"
          aria-label={`Drawing level: ${level ? LEVEL_LABEL[level] : NOT_RATED_LABEL}. Change`}
          data-testid="drawing-level-control"
          sx={{
            ...chipSx,
            appearance: 'none',
            border: 0,
            font: 'inherit',
            cursor: 'pointer',
            pr: 0.5,
            // 44px tap height without a taller chip.
            position: 'relative',
            '&::after': { content: '""', position: 'absolute', inset: '-6px 0' },
            '&:focus-visible': { outline: '3px solid', outlineColor: 'primary.main', outlineOffset: 2 },
          }}
        >
          {label}
          <ArrowDropDownIcon sx={{ fontSize: 20 }} />
        </Box>
      ) : (
        <Box component="span" data-testid="drawing-level-chip" sx={chipSx}>
          {label}
        </Box>
      )}

      <Menu
        anchorEl={anchor}
        open={!!anchor}
        onClose={() => setAnchor(null)}
        onClick={(e) => e.stopPropagation()}
        slotProps={{ paper: { sx: { minWidth: 260 } } }}
      >
        {LEVEL_KEYS.map((key) => (
          <MenuItem
            key={key}
            selected={key === level}
            onClick={() => choose(key, level)}
            sx={{ minHeight: 48, alignItems: 'flex-start', py: 1 }}
          >
            <ListItemIcon sx={{ color: 'primary.main', mt: 0.25 }}>
              <LevelBars level={key} size={20} />
            </ListItemIcon>
            <ListItemText
              primary={LEVEL_LABEL[key]}
              secondary={LEVEL_MEANING[key]}
              primaryTypographyProps={{ fontWeight: 700 }}
              secondaryTypographyProps={{ sx: { whiteSpace: 'normal' } }}
            />
          </MenuItem>
        ))}
        {level && (
          <MenuItem onClick={() => choose(null, level)} sx={{ minHeight: 48 }}>
            <ListItemText inset primary="Clear (not rated)" />
          </MenuItem>
        )}
      </Menu>

      <Snackbar
        open={!!toast}
        autoHideDuration={toast?.error ? 6000 : 5000}
        onClose={(_, reason) => reason !== 'clickaway' && setToast(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        sx={{ bottom: { xs: 88, md: 24 } }}
      >
        {toast ? (
          <Alert
            severity={toast.error ? 'error' : 'success'}
            variant="filled"
            onClose={() => setToast(null)}
            action={
              toast.undo !== undefined ? (
                <Button
                  color="inherit"
                  size="small"
                  onClick={() => {
                    const back = toast.undo ?? null;
                    setToast(null);
                    void choose(back, level, true);
                  }}
                  sx={{ minHeight: 36 }}
                >
                  Undo
                </Button>
              ) : undefined
            }
            sx={{ width: '100%' }}
          >
            {toast.message}
          </Alert>
        ) : undefined}
      </Snackbar>
    </>
  );
}
