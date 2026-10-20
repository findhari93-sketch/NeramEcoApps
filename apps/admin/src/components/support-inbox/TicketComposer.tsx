'use client';

/**
 * The reply box, pinned to the bottom of the detail pane.
 *
 *   Reply           the requester sees it, gets a bell and an email
 *   Internal note   staff only, notifies nobody
 *
 * The split Send button also offers "Send and ask requester" and "Send and
 * resolve", one call each. Ctrl+Enter sends. The draft is kept per ticket in
 * sessionStorage, so switching tickets or a 409 reload never loses it.
 */
import { forwardRef, useEffect, useRef, useState } from 'react';
import {
  Box,
  Button,
  ButtonGroup,
  Chip,
  CircularProgress,
  Menu,
  MenuItem,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@neram/ui';
import { alpha } from '@mui/material/styles';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import SendIcon from '@mui/icons-material/Send';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import ReplyIcon from '@mui/icons-material/Reply';
import type { SupportTicketResolutionCode } from '@neram/database';
import { TICKET_STAFF_OUTCOMES, canTicketMove } from '@neram/database/support-ticket-status';
import { applyTemplate, templatesFor } from '@/lib/support-inbox/reply-templates';
import { ARIA_KEYS, isSendShortcut } from '@/lib/support-inbox/keyboard';
import { CHIP_SX } from './bits';

export type ComposerMode = 'reply' | 'note';
export type SendThen = 'none' | 'ask' | 'resolve';

const MIN_RESOLVE_NOTE = 10;

function draftKey(ticketId: string, mode: ComposerMode) {
  return `support-inbox:draft:${ticketId}:${mode}`;
}

function readDraft(ticketId: string, mode: ComposerMode): string {
  try {
    return window.sessionStorage.getItem(draftKey(ticketId, mode)) ?? '';
  } catch {
    return '';
  }
}

function writeDraft(ticketId: string, mode: ComposerMode, text: string) {
  try {
    if (text) window.sessionStorage.setItem(draftKey(ticketId, mode), text);
    else window.sessionStorage.removeItem(draftKey(ticketId, mode));
  } catch {
    // Storage blocked (private window): the draft just is not kept.
  }
}

export const TicketComposer = forwardRef<
  HTMLTextAreaElement,
  {
    ticketId: string;
    status: string;
    mode: ComposerMode;
    onMode: (m: ComposerMode) => void;
    busy: boolean;
    onSend: (input: { content: string; internal: boolean; then: SendThen; resolution_code?: SupportTicketResolutionCode }) => Promise<boolean>;
  }
>(function TicketComposer({ ticketId, status, mode, onMode, busy, onSend }, ref) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [outcomeAnchor, setOutcomeAnchor] = useState<HTMLElement | null>(null);
  const [focused, setFocused] = useState(false);
  const splitRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setText(readDraft(ticketId, mode));
    setError(null);
  }, [ticketId, mode]);

  const update = (v: string) => {
    setText(v);
    setError(null);
    writeDraft(ticketId, mode, v);
  };

  const internal = mode === 'note';
  // From New the server starts the ticket first, so judge follow-on moves from In progress.
  const effective = status === 'open' ? 'in_progress' : status;
  const canAsk = !internal && canTicketMove(effective, 'request_info', 'staff');
  const canResolve = !internal && canTicketMove(effective, 'resolve', 'staff');

  const send = async (then: SendThen, code?: SupportTicketResolutionCode) => {
    const content = text.trim();
    if (!content) {
      setError(internal ? 'Write the note first.' : 'Write a reply first.');
      return;
    }
    if (then === 'resolve' && content.length < MIN_RESOLVE_NOTE) {
      setError(`A resolve note needs at least ${MIN_RESOLVE_NOTE} characters.`);
      return;
    }
    const ok = await onSend({ content, internal, then, resolution_code: code });
    if (ok) update('');
  };

  const templates = templatesFor(internal ? 'note' : 'reply');
  const resolveOutcomes = TICKET_STAFF_OUTCOMES.filter((o) => o.code !== 'duplicate');
  // Sticky at the bottom of the pane, so at rest it stays small: on a laptop
  // the full composer (toggle, templates, 2-row box, hint, Send) hid the report
  // and the timeline it sits under. It opens up on focus or once there is text.
  // The Send menus render in a portal outside the form, so an open menu counts as focus.
  const expanded = focused || text.length > 0 || !!error || busy || !!menuAnchor || !!outcomeAnchor;

  return (
    <Box
      component="form"
      aria-label={internal ? 'Write an internal note' : 'Write a reply'}
      onSubmit={(e) => {
        e.preventDefault();
        send('none');
      }}
      onFocus={() => setFocused(true)}
      onBlur={(e) => {
        // Moving to a template chip or the Send menu keeps it open.
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false);
      }}
      sx={{
        position: 'sticky',
        bottom: 0,
        zIndex: 2,
        borderTop: 1,
        borderColor: internal ? 'warning.main' : 'divider',
        bgcolor: (t) => (internal ? alpha(t.palette.warning.main, 0.08) : t.palette.background.paper),
        p: 1.5,
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <ToggleButtonGroup
          exclusive
          size="small"
          value={mode}
          onChange={(_, v: ComposerMode | null) => v && onMode(v)}
          aria-label="Message type"
        >
          <ToggleButton value="reply" aria-keyshortcuts={ARIA_KEYS.reply} sx={{ minHeight: 44, px: 1.5, gap: 0.75, textTransform: 'none', fontWeight: 600 }}>
            <ReplyIcon fontSize="small" aria-hidden />
            Reply
          </ToggleButton>
          <ToggleButton value="note" aria-keyshortcuts={ARIA_KEYS.note} sx={{ minHeight: 44, px: 1.5, gap: 0.75, textTransform: 'none', fontWeight: 600 }}>
            <LockOutlinedIcon fontSize="small" aria-hidden />
            Internal note
          </ToggleButton>
        </ToggleButtonGroup>
        <Typography variant="caption" color="text.secondary" sx={{ flex: 1, minWidth: 160 }}>
          {internal ? 'Only staff see this. Nobody is notified.' : 'The requester sees this and gets a bell and an email.'}
        </Typography>
      </Box>

      {expanded && templates.length > 0 && (
        <Box role="group" aria-label="Templates" sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          {templates.map((t) => (
            <Chip key={t.id} label={t.label} variant="outlined" clickable onClick={() => update(applyTemplate(text, t))} sx={CHIP_SX} />
          ))}
        </Box>
      )}

      <TextField
        inputRef={ref}
        value={text}
        onChange={(e) => update(e.target.value)}
        placeholder={internal ? 'Add a note for the team' : 'Write to the requester'}
        multiline
        minRows={expanded ? 3 : 1}
        maxRows={10}
        fullWidth
        error={!!error}
        helperText={error || (expanded ? 'Ctrl+Enter to send' : undefined)}
        inputProps={{ 'aria-label': internal ? 'Internal note' : 'Reply', maxLength: 5000, 'aria-keyshortcuts': 'Control+Enter' }}
        onKeyDown={(e) => {
          if (isSendShortcut(e)) {
            e.preventDefault();
            send('none');
          }
        }}
        sx={{ bgcolor: 'background.paper', '& .MuiInputBase-root': { fontSize: 14 } }}
      />

      <Box sx={{ display: expanded ? 'flex' : 'none', justifyContent: 'flex-end' }}>
        <ButtonGroup variant="contained" disableElevation ref={splitRef} aria-label="Send options" color="primary">
          <Button
            type="submit"
            disabled={busy}
            startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <SendIcon />}
            sx={{ minHeight: 44, fontWeight: 700, px: 2.5 }}
          >
            {internal ? 'Add note' : 'Send'}
          </Button>
          {(canAsk || canResolve) && (
            <Button
              size="small"
              disabled={busy}
              aria-label="More send options"
              aria-haspopup="menu"
              aria-expanded={!!menuAnchor}
              onClick={() => setMenuAnchor(splitRef.current)}
              sx={{ minHeight: 44, minWidth: 44 }}
            >
              <ArrowDropDownIcon />
            </Button>
          )}
        </ButtonGroup>
        <Menu
          anchorEl={menuAnchor}
          open={!!menuAnchor}
          onClose={() => setMenuAnchor(null)}
          anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
          transformOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        >
          <MenuItem
            onClick={() => {
              setMenuAnchor(null);
              send('none');
            }}
            sx={{ minHeight: 44 }}
          >
            Send
          </MenuItem>
          {canAsk && (
            <MenuItem
              onClick={() => {
                setMenuAnchor(null);
                send('ask');
              }}
              sx={{ minHeight: 44 }}
            >
              Send and ask requester
            </MenuItem>
          )}
          {canResolve && (
            <MenuItem
              onClick={(e) => {
                setMenuAnchor(null);
                setOutcomeAnchor(splitRef.current ?? (e.currentTarget as HTMLElement));
              }}
              sx={{ minHeight: 44 }}
            >
              Send and resolve
            </MenuItem>
          )}
        </Menu>
        <Menu
          anchorEl={outcomeAnchor}
          open={!!outcomeAnchor}
          onClose={() => setOutcomeAnchor(null)}
          anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
          transformOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          MenuListProps={{ 'aria-label': 'Resolve as' }}
        >
          <Typography sx={{ px: 2, py: 1, fontSize: 12, fontWeight: 700, color: 'text.secondary' }}>Resolve as</Typography>
          {resolveOutcomes.map((o) => (
            <MenuItem
              key={o.code}
              onClick={() => {
                setOutcomeAnchor(null);
                send('resolve', o.code);
              }}
              sx={{ minHeight: 44 }}
            >
              {o.label}
            </MenuItem>
          ))}
        </Menu>
      </Box>
    </Box>
  );
});
