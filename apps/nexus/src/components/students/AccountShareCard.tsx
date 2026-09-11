'use client';

import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Tooltip,
  Typography,
  alpha,
} from '@neram/ui';
import CheckIcon from '@mui/icons-material/Check';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import RemoveCircleOutlineIcon from '@mui/icons-material/RemoveCircleOutline';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import { buildLoginMessage, whatsAppShareUrl, type ShareKind } from '@/lib/student-account-rules';
import type { AccountSteps, StepState } from '@/lib/student-account-provisioning';

const STEP_LABEL: Record<keyof AccountSteps, string> = {
  account: 'Microsoft account',
  license: 'Student license',
  record: 'Nexus record',
  classroom: 'Added to this class',
  teams: 'Class Team',
};

const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

/** WhatsApp's dark teal. The brand green fails contrast with white text. */
const WHATSAPP = '#075E54';

export interface AccountShareCardProps {
  kind: ShareKind;
  firstName: string;
  upn: string;
  password: string;
  phone?: string | null;
  steps?: AccountSteps;
  onDone: () => void;
  /** Tells the parent whether the password has been copied or sent yet. */
  onSharedChange?: (shared: boolean) => void;
}

function spacedPhone(local: string): string {
  return `${local.slice(0, 5)} ${local.slice(5)}`;
}

/**
 * The login ID and temporary password, shown once.
 *
 * Nexus never stores the password, so this screen is the only chance to hand it
 * over. Copy each value, copy the whole message, or send it straight to the
 * student on WhatsApp. Closing before any of those asks first.
 */
export default function AccountShareCard({
  kind,
  firstName,
  upn,
  password,
  phone,
  steps,
  onDone,
  onSharedChange,
}: AccountShareCardProps) {
  const [shared, setShared] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [copyFailed, setCopyFailed] = useState(false);
  const [confirmingClose, setConfirmingClose] = useState(false);

  const message = buildLoginMessage({ kind, firstName, upn, password });

  const markShared = () => {
    if (shared) return;
    setShared(true);
    onSharedChange?.(true);
  };

  const copy = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      setCopyFailed(false);
      markShared();
    } catch {
      setCopied(null);
      setCopyFailed(true);
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, maxWidth: 560 }}>
      <Box>
        <Typography variant="h6" sx={{ fontWeight: 800 }}>
          {kind === 'reset' ? 'New password ready' : 'Account created'}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Send these to {firstName || 'the student'} now.
        </Typography>
      </Box>

      <Alert severity="warning" variant="outlined">
        Shown only once. Nexus does not save this password, so copy or send it before you close.
      </Alert>

      <CredentialRow label="Login ID" value={upn} copied={copied === 'login'} onCopy={() => void copy('login', upn)} />
      <CredentialRow
        label="Temporary password"
        value={password}
        mono
        copied={copied === 'password'}
        onCopy={() => void copy('password', password)}
      />

      {copyFailed && (
        <Typography variant="body2" color="error.main">
          Could not copy. Press and hold the text to copy it by hand.
        </Typography>
      )}

      <Box sx={{ display: 'flex', gap: 1, flexDirection: { xs: 'column', sm: 'row' } }}>
        <Button
          component="a"
          href={whatsAppShareUrl(message, phone)}
          target="_blank"
          rel="noopener noreferrer"
          variant="contained"
          startIcon={<WhatsAppIcon />}
          onClick={markShared}
          sx={{
            flex: 1,
            minHeight: 48,
            fontWeight: 700,
            textTransform: 'none',
            bgcolor: WHATSAPP,
            color: '#FFFFFF',
            '&:hover': { bgcolor: '#054A42' },
          }}
        >
          {phone ? `Send on WhatsApp to ${spacedPhone(phone)}` : 'Send on WhatsApp'}
        </Button>
        <Button
          variant="outlined"
          startIcon={copied === 'message' ? <CheckIcon /> : <ContentCopyOutlinedIcon />}
          onClick={() => void copy('message', message)}
          sx={{ flex: 1, minHeight: 48, fontWeight: 700, textTransform: 'none' }}
        >
          {copied === 'message' ? 'Message copied' : 'Copy message'}
        </Button>
      </Box>

      {steps && (
        <Box component="ul" aria-label="What was set up" sx={{ listStyle: 'none', p: 0, m: 0, display: 'grid', gap: 1 }}>
          {(Object.keys(STEP_LABEL) as (keyof AccountSteps)[]).map((key) => (
            <StepRow key={key} label={STEP_LABEL[key]} state={steps[key]} />
          ))}
        </Box>
      )}

      {/* Announced to screen readers, since the copy icon changing is easy to miss. */}
      <Box
        role="status"
        aria-live="polite"
        sx={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }}
      >
        {copied === 'login' ? 'Login ID copied' : copied === 'password' ? 'Password copied' : copied === 'message' ? 'Message copied' : ''}
      </Box>

      {confirmingClose ? (
        <Alert severity="error" variant="outlined">
          <Typography variant="body2" sx={{ fontWeight: 700 }}>
            Close without sharing? The password cannot be shown again.
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, mt: 1, flexWrap: 'wrap' }}>
            <Button onClick={() => setConfirmingClose(false)} sx={{ minHeight: 48 }}>
              Go back
            </Button>
            <Button color="error" variant="contained" onClick={onDone} sx={{ minHeight: 48 }}>
              Close anyway
            </Button>
          </Box>
        </Alert>
      ) : (
        <Button
          variant={shared ? 'contained' : 'text'}
          onClick={() => (shared ? onDone() : setConfirmingClose(true))}
          sx={{ minHeight: 48, fontWeight: 700 }}
        >
          Done
        </Button>
      )}
    </Box>
  );
}

function CredentialRow({
  label,
  value,
  mono = false,
  copied,
  onCopy,
}: {
  label: string;
  value: string;
  mono?: boolean;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        p: 1.5,
        borderRadius: 2,
        border: 1,
        borderColor: 'divider',
        bgcolor: (t) => alpha(t.palette.primary.main, 0.03),
      }}
    >
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>
          {label}
        </Typography>
        <Typography
          sx={{
            fontWeight: 700,
            fontSize: '1.05rem',
            wordBreak: 'break-all',
            userSelect: 'all',
            ...(mono ? { fontFamily: MONO, letterSpacing: '0.05em' } : {}),
          }}
        >
          {value}
        </Typography>
      </Box>
      <Tooltip title={copied ? 'Copied' : `Copy ${label.toLowerCase()}`} arrow>
        <IconButton onClick={onCopy} aria-label={`Copy ${label.toLowerCase()}`} sx={{ width: 48, height: 48, flexShrink: 0 }}>
          {copied ? <CheckIcon color="success" /> : <ContentCopyOutlinedIcon />}
        </IconButton>
      </Tooltip>
    </Box>
  );
}

function StepRow({ label, state }: { label: string; state: StepState }) {
  const look =
    state.status === 'done'
      ? { Icon: CheckCircleIcon, color: 'success.main', word: 'Done' }
      : state.status === 'failed'
        ? { Icon: ErrorOutlineIcon, color: 'error.main', word: 'Needs attention' }
        : { Icon: RemoveCircleOutlineIcon, color: 'text.disabled', word: 'Skipped' };
  const { Icon } = look;

  return (
    <Box component="li" sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
      <Icon aria-hidden sx={{ color: look.color, fontSize: '1.2rem', mt: 0.25 }} />
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="body2" sx={{ fontWeight: 700 }}>
          {label}: <Box component="span" sx={{ fontWeight: 500 }}>{look.word}</Box>
        </Typography>
        {state.message && (
          <Typography variant="body2" color="text.secondary">
            {state.message}
          </Typography>
        )}
      </Box>
    </Box>
  );
}

/** Asked when a sheet holding an uncopied password is closed by swipe, backdrop or the X. */
export function UnsharedPasswordDialog({
  open,
  onKeep,
  onDiscard,
}: {
  open: boolean;
  onKeep: () => void;
  onDiscard: () => void;
}) {
  return (
    <Dialog open={open} onClose={onKeep} aria-labelledby="unshared-password-title">
      <DialogTitle id="unshared-password-title" sx={{ fontWeight: 800 }}>
        Close without sharing?
      </DialogTitle>
      <DialogContent>
        <Typography variant="body2">
          The temporary password is not saved anywhere, so it cannot be shown again. You would have to reset it.
        </Typography>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
        <Button onClick={onKeep} sx={{ minHeight: 48 }}>
          Go back
        </Button>
        <Button onClick={onDiscard} color="error" variant="contained" sx={{ minHeight: 48 }}>
          Close anyway
        </Button>
      </DialogActions>
    </Dialog>
  );
}
