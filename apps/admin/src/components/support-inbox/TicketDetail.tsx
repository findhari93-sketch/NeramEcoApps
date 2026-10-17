'use client';

/**
 * The detail pane: header (number, status, priority, category, assignee), the
 * action bar (only the moves ticketActionsFor() offers for this status, plus
 * Copy for Claude Code and Copy images), then the report, requester and
 * timeline, with the composer pinned at the bottom.
 */
import { forwardRef, useState } from 'react';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  ListItemIcon,
  Menu,
  MenuItem,
  TextField,
  Tooltip,
  Typography,
} from '@neram/ui';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CodeIcon from '@mui/icons-material/Code';
import CollectionsIcon from '@mui/icons-material/Collections';
import PersonAddAltIcon from '@mui/icons-material/PersonAddAlt';
import PersonOffOutlinedIcon from '@mui/icons-material/PersonOffOutlined';
import CheckIcon from '@mui/icons-material/Check';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import type { SupportTicketDetail, SupportTicketResolutionCode } from '@neram/database';
import {
  TICKET_CATEGORY_LABEL,
  TICKET_OUTCOME_LABEL,
  TICKET_SOURCE_LABEL,
  canTicketMove,
  ticketActionsFor,
  ticketClosesInText,
  type TicketMove,
} from '@neram/database/support-ticket-status';
import { formatIst } from '@/lib/support-inbox/report-markdown';
import { OpsSkeleton } from '@/components/ops/OpsUi';
import type { StaffOption, TicketRequesterSummary } from './api';
import { TicketStatusChip, initialsOf } from './bits';
import { ReportPanel } from './ReportPanel';
import { RequesterCard } from './RequesterCard';
import { TicketTimeline } from './TicketTimeline';
import { TicketComposer, type ComposerMode, type SendThen } from './TicketComposer';
import { TicketStepDialog, type StepMove, type StepPayload } from './TicketStepDialog';

const DIALOG_MOVES: TicketMove[] = ['resolve', 'close', 'request_info', 'reopen'];
const PRIORITY_LABEL: Record<string, string> = { low: 'Low', medium: 'Medium', high: 'High' };

export interface DetailHandlers {
  /** true when done; an error to show in the dialog (400); or 'closed' when the dialog should shut (409, reloaded). */
  onMove: (move: TicketMove, payload?: StepPayload) => Promise<true | 'closed' | { error: string }>;
  onField: (field: 'priority' | 'category', value: string) => void;
  onAssign: (assignee: string | null) => void;
  onSend: (input: { content: string; internal: boolean; then: SendThen; resolution_code?: SupportTicketResolutionCode }) => Promise<boolean>;
  onCopyForClaude: () => void;
  onCopyImages: () => void;
  onCopyNumber: () => void;
  onOpenTicket: (ticketNumber: string) => void;
  onBack?: () => void;
}

export function TicketDetailSkeleton() {
  return (
    <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 2 }} aria-busy="true" aria-label="Loading ticket">
      <OpsSkeleton width="30%" height={28} />
      <OpsSkeleton width="70%" height={22} />
      <Box sx={{ display: 'flex', gap: 1 }}>
        <OpsSkeleton variant="rounded" width={110} height={44} />
        <OpsSkeleton variant="rounded" width={110} height={44} />
        <OpsSkeleton variant="rounded" width={160} height={44} />
      </Box>
      <OpsSkeleton variant="rounded" height={220} />
      <OpsSkeleton variant="rounded" height={160} />
    </Box>
  );
}

export const TicketDetail = forwardRef<
  HTMLTextAreaElement,
  {
    ticket: SupportTicketDetail;
    requester: TicketRequesterSummary | null;
    staff: StaffOption[];
    meId: string | null;
    busy: boolean;
    composerMode: ComposerMode;
    onComposerMode: (m: ComposerMode) => void;
    backHref: string;
    now: number;
    wide: boolean;
    handlers: DetailHandlers;
  }
>(function TicketDetail({ ticket, requester, staff, meId, busy, composerMode, onComposerMode, backHref, now, wide, handlers }, composerRef) {
  const [step, setStep] = useState<StepMove | null>(null);
  const [stepError, setStepError] = useState<string | null>(null);
  const [assignAnchor, setAssignAnchor] = useState<HTMLElement | null>(null);

  const actions = ticketActionsFor(ticket.status);
  const closesIn =
    ticket.status === 'waiting_on_student' || ticket.status === 'awaiting_confirmation' ? ticketClosesInText(ticket.auto_close_at, now) : null;
  const canAssign = canTicketMove(ticket.status, 'assign', 'staff');
  const shots = (ticket.screenshot_urls || []).length;

  const run = async (move: TicketMove) => {
    if ((DIALOG_MOVES as string[]).includes(move)) {
      setStepError(null);
      setStep(move as StepMove);
      return;
    }
    await handlers.onMove(move);
  };

  const submitStep = async (payload: StepPayload) => {
    if (!step) return;
    setStepError(null);
    const result = await handlers.onMove(step, payload);
    if (result === true || result === 'closed') setStep(null);
    else setStepError(result.error);
  };

  const header = (
    <Box sx={{ px: 2, pt: 1.5, pb: 1.25, borderBottom: 1, borderColor: 'divider', display: 'flex', flexDirection: 'column', gap: 1.25 }}>
      {handlers.onBack && (
        <Button
          component="a"
          href={backHref}
          onClick={(e: React.MouseEvent) => {
            e.preventDefault();
            handlers.onBack?.();
          }}
          startIcon={<ArrowBackIcon />}
          aria-keyshortcuts="Escape"
          sx={{ alignSelf: 'flex-start', minHeight: 44, fontWeight: 600 }}
        >
          Back to tickets
        </Button>
      )}

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <Tooltip title="Copy ticket number">
          <Button
            onClick={handlers.onCopyNumber}
            endIcon={<ContentCopyIcon sx={{ fontSize: '16px !important' }} />}
            sx={{ minHeight: 44, fontFamily: 'monospace', fontWeight: 700, fontSize: 15, px: 1 }}
            aria-label={`Copy ticket number ${ticket.ticket_number}`}
          >
            {ticket.ticket_number}
          </Button>
        </Tooltip>
        <TicketStatusChip status={ticket.status} />
        {ticket.resolution_code && (ticket.status === 'closed' || ticket.status === 'awaiting_confirmation' || ticket.status === 'resolved') && (
          <Chip size="small" variant="outlined" label={`Outcome: ${TICKET_OUTCOME_LABEL[ticket.resolution_code] ?? ticket.resolution_code}`} sx={{ fontWeight: 600, height: 26 }} />
        )}
        {ticket.duplicate_of_number && (
          <Chip
            size="small"
            variant="outlined"
            clickable
            onClick={() => handlers.onOpenTicket(ticket.duplicate_of_number!)}
            label={`Duplicate of ${ticket.duplicate_of_number}`}
            sx={{ fontWeight: 600, height: 26 }}
          />
        )}
        {ticket.reopen_count > 0 && <Chip size="small" color="error" variant="outlined" label={`Reopened ${ticket.reopen_count}x`} sx={{ fontWeight: 600, height: 26 }} />}
      </Box>

      <Typography component="h2" sx={{ fontSize: 18, fontWeight: 700, lineHeight: 1.35, m: 0, wordBreak: 'break-word' }}>
        {ticket.subject}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {TICKET_SOURCE_LABEL[ticket.source_app || ''] || 'Unknown app'} · raised {formatIst(ticket.created_at)} IST
        {closesIn ? ` · ${closesIn}` : ''}
      </Typography>

      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
        <TextField
          select
          size="small"
          label="Priority"
          value={ticket.priority}
          onChange={(e) => handlers.onField('priority', e.target.value)}
          disabled={busy}
          sx={{ minWidth: 130, '& .MuiInputBase-root': { minHeight: 44 } }}
        >
          {Object.entries(PRIORITY_LABEL).map(([v, l]) => (
            <MenuItem key={v} value={v} sx={{ minHeight: 44 }}>
              {l}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          size="small"
          label="Category"
          value={ticket.category}
          onChange={(e) => handlers.onField('category', e.target.value)}
          disabled={busy}
          sx={{ minWidth: 170, '& .MuiInputBase-root': { minHeight: 44 } }}
        >
          {Object.entries(TICKET_CATEGORY_LABEL).map(([v, l]) => (
            <MenuItem key={v} value={v} sx={{ minHeight: 44 }}>
              {l}
            </MenuItem>
          ))}
        </TextField>
        <Tooltip title={canAssign ? '' : 'Reopen the ticket to change who owns it'}>
          <span>
            <Button
              variant="outlined"
              color="inherit"
              disabled={!canAssign || busy}
              onClick={(e) => setAssignAnchor(e.currentTarget)}
              aria-haspopup="menu"
              aria-expanded={!!assignAnchor}
              startIcon={
                ticket.assignee_name ? (
                  <Avatar sx={{ width: 24, height: 24, fontSize: 11, bgcolor: 'primary.main' }}>{initialsOf(ticket.assignee_name)}</Avatar>
                ) : (
                  <PersonAddAltIcon />
                )
              }
              endIcon={<ArrowDropDownIcon />}
              sx={{ minHeight: 44, textTransform: 'none', fontWeight: 600, borderColor: 'divider' }}
            >
              {ticket.assignee_name ? ticket.assignee_name : 'Unassigned'}
            </Button>
          </span>
        </Tooltip>
        <Menu anchorEl={assignAnchor} open={!!assignAnchor} onClose={() => setAssignAnchor(null)} PaperProps={{ sx: { maxHeight: 420, minWidth: 260 } }}>
          {meId && ticket.assigned_to !== meId && (
            <MenuItem
              onClick={() => {
                setAssignAnchor(null);
                handlers.onAssign('me');
              }}
              sx={{ minHeight: 44, fontWeight: 700 }}
            >
              <ListItemIcon>
                <PersonAddAltIcon fontSize="small" />
              </ListItemIcon>
              Assign to me
            </MenuItem>
          )}
          {ticket.assigned_to && (
            <MenuItem
              onClick={() => {
                setAssignAnchor(null);
                handlers.onAssign(null);
              }}
              sx={{ minHeight: 44 }}
            >
              <ListItemIcon>
                <PersonOffOutlinedIcon fontSize="small" />
              </ListItemIcon>
              Unassign
            </MenuItem>
          )}
          <Divider />
          {staff.length === 0 && (
            <MenuItem disabled sx={{ minHeight: 44 }}>
              Loading staff
            </MenuItem>
          )}
          {staff.map((s) => (
            <MenuItem
              key={s.id}
              selected={s.id === ticket.assigned_to}
              onClick={() => {
                setAssignAnchor(null);
                if (s.id !== ticket.assigned_to) handlers.onAssign(s.id);
              }}
              sx={{ minHeight: 44, gap: 1 }}
            >
              <Avatar src={s.avatar_url || undefined} alt="" sx={{ width: 26, height: 26, fontSize: 11 }}>
                {initialsOf(s.name)}
              </Avatar>
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography noWrap sx={{ fontSize: 14 }}>
                  {s.name}
                  {s.id === meId ? ' (you)' : ''}
                </Typography>
              </Box>
              {s.id === ticket.assigned_to && <CheckIcon fontSize="small" aria-hidden />}
            </MenuItem>
          ))}
        </Menu>
      </Box>

      <Box role="toolbar" aria-label="Ticket actions" sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
        {actions.map((a) => (
          <Button
            key={a.move}
            variant={a.primary ? 'contained' : 'outlined'}
            disableElevation
            disabled={busy}
            onClick={() => run(a.move)}
            startIcon={busy && a.primary ? <CircularProgress size={16} color="inherit" /> : undefined}
            sx={{ minHeight: 44, fontWeight: 700 }}
          >
            {a.label}
          </Button>
        ))}
        <Box sx={{ flex: 1 }} />
        <Tooltip title="Ticket, page, likely file, device and console as one prompt">
          <Button variant="outlined" color="secondary" startIcon={<CodeIcon />} onClick={handlers.onCopyForClaude} sx={{ minHeight: 44, fontWeight: 600 }}>
            Copy for Claude Code
          </Button>
        </Tooltip>
        <Tooltip title={shots ? `Put ${shots === 1 ? 'the screenshot' : `all ${shots} screenshots`} on the clipboard as one image` : 'No screenshots on this ticket'}>
          <span>
            <Button variant="outlined" color="secondary" startIcon={<CollectionsIcon />} onClick={handlers.onCopyImages} disabled={!shots} sx={{ minHeight: 44, fontWeight: 600 }}>
              Copy images{shots ? ` (${shots})` : ''}
            </Button>
          </span>
        </Tooltip>
      </Box>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      {header}
      <Box sx={{ flex: 1, p: 2, display: 'grid', gridTemplateColumns: wide ? 'minmax(0,1fr) 300px' : 'minmax(0,1fr)', gap: 2, alignItems: 'start' }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
          {!wide && <RequesterCard requester={requester} onOpenTicket={handlers.onOpenTicket} />}
          {ticket.status === 'waiting_on_student' && (
            <Alert severity="info">Waiting for the requester to reply{closesIn ? `, ${closesIn} as No reply` : ''}. Their reply puts it back in progress.</Alert>
          )}
          {ticket.status === 'awaiting_confirmation' && (
            <Alert severity="success">Resolved. Waiting for the requester to confirm{closesIn ? `, ${closesIn} on its own` : ''}.</Alert>
          )}
          <ReportPanel ticket={ticket} />
          <TicketTimeline ticket={ticket} now={now} />
        </Box>
        {wide && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, position: 'sticky', top: 16 }}>
            <RequesterCard requester={requester} onOpenTicket={handlers.onOpenTicket} />
          </Box>
        )}
      </Box>
      <TicketComposer
        ref={composerRef}
        ticketId={ticket.id}
        status={ticket.status}
        mode={composerMode}
        onMode={onComposerMode}
        busy={busy}
        onSend={handlers.onSend}
      />
      <TicketStepDialog
        move={step}
        ticketNumber={ticket.ticket_number}
        busy={busy}
        error={stepError}
        onCancel={() => setStep(null)}
        onSubmit={submitStep}
      />
    </Box>
  );
});
