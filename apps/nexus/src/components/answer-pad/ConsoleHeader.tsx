'use client';

/**
 * The top of the teacher's console: the class, where the round is, the class
 * strip (who is expected, in the meeting, with the pad, answered), and one
 * menu. Built for a 300px side panel: the title is one line (tap it to rename
 * the class), the status is one short caption, and there is exactly one button
 * beside it. End round lives in the menu, with a confirm, so it cannot be hit
 * by mistake next to the menu button.
 */

import { useState, type FormEvent, type MouseEvent, type ReactNode } from 'react';
import {
  Box,
  Button,
  Divider,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@neram/ui';
import EditRounded from '@mui/icons-material/EditRounded';
import GroupsRounded from '@mui/icons-material/GroupsRounded';
import HelpOutlineRounded from '@mui/icons-material/HelpOutlineRounded';
import MoreVertRounded from '@mui/icons-material/MoreVertRounded';
import OpenInNewRounded from '@mui/icons-material/OpenInNewRounded';
import ScreenShareRounded from '@mui/icons-material/ScreenShareRounded';
import StopCircleRounded from '@mui/icons-material/StopCircleRounded';
import StopScreenShareRounded from '@mui/icons-material/StopScreenShareRounded';
import TextDecreaseRounded from '@mui/icons-material/TextDecreaseRounded';
import TextIncreaseRounded from '@mui/icons-material/TextIncreaseRounded';
import { TEACHER_TEXT_SCALE, TEXT_SCALES, setTextScale, stepTextScale, textScaleLabel, useTextScale } from '@/lib/pad/client/text-scale';

/** A button that looks like the text inside it. */
const PLAIN_BUTTON = { border: 0, background: 'none', color: 'inherit', font: 'inherit', p: 0, m: 0, cursor: 'pointer', textAlign: 'left' } as const;

export interface ConsoleHeaderProps {
  title: string;
  /** "Round 1", then the round's state ("Q.32 open"). */
  status: string;
  /** The class strip, under the status; absent once the round has ended. */
  strip?: ReactNode;
  onRename: (title: string | null) => void;
  renaming: boolean;
  onClassDetails: () => void;
  onPopOut?: () => void;
  share?: { sharing: boolean; busy: boolean; toggle: () => void } | null;
  onHelp: () => void;
  /** Absent once the round has ended. */
  onEndRound?: () => void;
  disabled: boolean;
}

export default function ConsoleHeader({
  title,
  status,
  strip,
  onRename,
  renaming,
  onClassDetails,
  onPopOut,
  share,
  onHelp,
  onEndRound,
  disabled,
}: ConsoleHeaderProps) {
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const scale = useTextScale(TEACHER_TEXT_SCALE);
  const close = () => setMenuAnchor(null);

  const save = (event: FormEvent) => {
    event.preventDefault();
    const next = draft.replace(/\s+/g, ' ').trim();
    if (next !== title) onRename(next || null);
    setEditing(false);
  };

  return (
    <Box
      component="header"
      sx={{
        position: 'sticky',
        top: 0,
        zIndex: 3,
        mx: -2,
        mt: -2,
        px: 2,
        pt: 1,
        pb: 1,
        bgcolor: 'var(--pad-bg)',
        borderBottom: '1px solid',
        borderColor: 'divider',
      }}
    >
      {editing ? (
        <Stack component="form" direction="row" spacing={1} alignItems="center" onSubmit={save}>
          <TextField
            size="small"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            inputProps={{ maxLength: 120, 'aria-label': 'Class name', autoComplete: 'off' }}
            autoFocus
            sx={{ flex: 1, minWidth: 0 }}
          />
          <Button type="submit" variant="contained" size="small" disabled={renaming} sx={{ minHeight: 40 }}>
            Save
          </Button>
          <Button size="small" onClick={() => setEditing(false)} sx={{ minHeight: 40, minWidth: 0 }}>
            Cancel
          </Button>
        </Stack>
      ) : (
        <Stack direction="row" alignItems="center" spacing={0.5}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Box
              component="button"
              type="button"
              onClick={() => {
                setDraft(title);
                setEditing(true);
              }}
              aria-label={`${title}. Rename the class`}
              sx={{
                ...PLAIN_BUTTON,
                maxWidth: '100%',
                minHeight: 36,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-start',
                borderRadius: 1,
                gap: 0.5,
                '&:hover .rename-hint, &:focus-visible .rename-hint': { opacity: 1 },
                '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
              }}
            >
              <Typography component="h1" variant="subtitle1" fontWeight={800} noWrap sx={{ lineHeight: 1.3, minWidth: 0 }}>
                {title}
              </Typography>
              <EditRounded className="rename-hint" sx={{ fontSize: 16, opacity: 0.5, flexShrink: 0, color: 'text.secondary' }} aria-hidden />
            </Box>
            <Typography variant="caption" color="text.secondary" noWrap component="p" sx={{ minWidth: 0 }}>
              {status}
            </Typography>
          </Box>
          <IconButton
            aria-label="Console menu"
            aria-haspopup="menu"
            aria-expanded={menuAnchor ? true : undefined}
            onClick={(event: MouseEvent<HTMLElement>) => setMenuAnchor(event.currentTarget)}
            sx={{ width: 44, height: 44, flexShrink: 0 }}
          >
            <MoreVertRounded />
          </IconButton>
        </Stack>
      )}
      {!editing && strip}

      <Menu anchorEl={menuAnchor} open={!!menuAnchor} onClose={close} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }}>
        <MenuItem
          onClick={() => {
            close();
            onClassDetails();
          }}
          sx={{ minHeight: 48 }}
        >
          <ListItemIcon>
            <GroupsRounded />
          </ListItemIcon>
          <ListItemText primary="Class details" secondary="Who is here, room code, checks" />
        </MenuItem>
        {onPopOut && (
          <MenuItem
            onClick={() => {
              close();
              onPopOut();
            }}
            sx={{ minHeight: 48 }}
          >
            <ListItemIcon>
              <OpenInNewRounded />
            </ListItemIcon>
            <ListItemText primary="Open in its own window" />
          </MenuItem>
        )}
        {share && (
          <MenuItem
            disabled={share.busy}
            onClick={() => {
              close();
              share.toggle();
            }}
            sx={{ minHeight: 48, whiteSpace: 'normal' }}
          >
            <ListItemIcon>{share.sharing ? <StopScreenShareRounded /> : <ScreenShareRounded />}</ListItemIcon>
            <ListItemText
              primary={share.sharing ? 'Stop showing results on the meeting screen' : 'Show results on the meeting screen'}
              secondary={share.sharing ? null : 'This replaces your screen share'}
            />
          </MenuItem>
        )}

        {/* Not a menu item: two buttons that change the size and keep the menu open to see it. */}
        <Box component="li" role="none" sx={{ px: 2, py: 1 }}>
          <Stack direction="row" alignItems="center" spacing={1} role="group" aria-label="Text size">
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="body2">Text size</Typography>
              <Typography variant="caption" color="text.secondary" aria-live="polite">
                {textScaleLabel(scale)}
              </Typography>
            </Box>
            <IconButton
              aria-label="Smaller text"
              onClick={() => setTextScale(stepTextScale(scale, -1))}
              disabled={scale === TEXT_SCALES[0].value}
              sx={{ width: 44, height: 44, border: '1px solid', borderColor: 'divider' }}
            >
              <TextDecreaseRounded />
            </IconButton>
            <IconButton
              aria-label="Larger text"
              onClick={() => setTextScale(stepTextScale(scale, 1))}
              disabled={scale === TEXT_SCALES[TEXT_SCALES.length - 1].value}
              sx={{ width: 44, height: 44, border: '1px solid', borderColor: 'divider' }}
            >
              <TextIncreaseRounded />
            </IconButton>
          </Stack>
        </Box>

        <MenuItem
          onClick={() => {
            close();
            onHelp();
          }}
          sx={{ minHeight: 48 }}
        >
          <ListItemIcon>
            <HelpOutlineRounded />
          </ListItemIcon>
          <ListItemText primary="Using one screen?" />
        </MenuItem>
        {onEndRound && <Divider />}
        {onEndRound && (
          <MenuItem
            disabled={disabled}
            onClick={() => {
              close();
              onEndRound();
            }}
            sx={{ minHeight: 48, color: 'error.main' }}
          >
            <ListItemIcon sx={{ color: 'error.main' }}>
              <StopCircleRounded />
            </ListItemIcon>
            <ListItemText primary="End round" secondary="See results and publish them" />
          </MenuItem>
        )}
      </Menu>
    </Box>
  );
}
