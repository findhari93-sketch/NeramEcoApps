'use client';

/**
 * AssignmentNudgeDialog — teacher messages selected students about one or more
 * assignments, from a template (nudge / not-submitted / congratulate / custom)
 * or free text. It goes as the teacher's own Teams chat, with the Teams activity
 * feed as a fallback and the Nexus bell always; the
 * selected assignment link(s) are auto-attached server-side. Mirrors
 * StudyNudgeDialog so the two flows feel identical.
 */
import { useEffect, useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Box, Typography, TextField, Button, Alert,
  CircularProgress, Divider, ToggleButton, ToggleButtonGroup, IconButton, Chip, useMediaQuery,
} from '@neram/ui';
import SendIcon from '@mui/icons-material/Send';
import CloseIcon from '@mui/icons-material/Close';

interface Recipient {
  id: string;
  name: string | null;
}

interface AssignmentNudgeDialogProps {
  open: boolean;
  /** Assignments to attach as links. Titles feed the templates. */
  assignments: { id: string; title: string }[];
  recipients: Recipient[];
  getToken: () => Promise<string | null>;
  onClose: () => void;
}

type TemplateKey = 'nudge' | 'not_submitted' | 'congratulate' | 'custom';

function label(assignments: { title: string }[]): string {
  if (assignments.length === 0) return 'your assignments';
  if (assignments.length === 1) return `"${assignments[0].title}"`;
  return `${assignments.length} assignments`;
}

function templateFor(key: TemplateKey, what: string): { subject: string; body: string } {
  switch (key) {
    case 'congratulate':
      return {
        subject: 'Great work on your assignment',
        body: `Hi,\n\nWell done on ${what}. Keep up the consistency, every submission builds your rank and your skills.\n\n- Neram Classes`,
      };
    case 'not_submitted':
      return {
        subject: 'You have an assignment to submit',
        body: `Hi,\n\nYou have not submitted ${what} yet. Please complete and upload your work soon so we can review it. Reply here if you are stuck.\n\n- Neram Classes`,
      };
    case 'nudge':
      return {
        subject: 'A quick reminder',
        body: `Hi,\n\nJust a reminder about ${what}. Try to finish it before the deadline so you stay on track and keep your streak going.\n\n- Neram Classes`,
      };
    default:
      return { subject: 'About your assignments', body: '' };
  }
}

/** Where it landed, in plain words. Every student also gets it on the Nexus bell. */
function teamsLine(r: { total: number; chat: number; teams: number; failed: number }): string {
  const reached = r.total - r.failed;
  if (r.chat === reached && reached > 0) return 'Sent as your Teams chat, and saved to their Nexus notifications.';
  const parts = [
    r.chat ? `${r.chat} in your Teams chat` : '',
    r.teams ? `${r.teams} as a Teams alert` : '',
    reached - r.chat - r.teams > 0 ? `${reached - r.chat - r.teams} on the Nexus bell only` : '',
  ].filter(Boolean);
  return `${parts.join(', ')}.`;
}

export default function AssignmentNudgeDialog({
  open,
  assignments,
  recipients,
  getToken,
  onClose,
}: AssignmentNudgeDialogProps) {
  const fullScreen = useMediaQuery('(max-width:599px)');
  const [template, setTemplate] = useState<TemplateKey>('not_submitted');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState<{
    total: number;
    chat: number;
    teams: number;
    inapp: number;
    failed: number;
  } | null>(null);

  const what = label(assignments);

  useEffect(() => {
    if (open) {
      const t = templateFor('not_submitted', what);
      setTemplate('not_submitted');
      setSubject(t.subject);
      setBody(t.body);
      setError('');
      setResults(null);
    }
  }, [open, what]);

  const pickTemplate = (key: TemplateKey) => {
    setTemplate(key);
    const t = templateFor(key, what);
    setSubject(t.subject);
    if (key !== 'custom') setBody(t.body);
  };

  const send = async () => {
    if (sending || !body.trim() || recipients.length === 0) return;
    setSending(true);
    setError('');
    try {
      const token = await getToken();
      const res = await fetch('/api/assignments/nudge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          studentIds: recipients.map((r) => r.id),
          assignmentIds: assignments.map((a) => a.id),
          subject,
          body,
          template,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to send');
      const total = data.counts?.total ?? (data.results || []).length;
      setResults({
        total,
        chat: data.counts?.chat ?? 0,
        teams: data.counts?.teams ?? data.viaTeams ?? 0,
        inapp: data.counts?.inapp ?? 0,
        failed: data.counts?.failed ?? 0,
      });
    } catch (e: any) {
      setError(e?.message || 'Failed to send the message');
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={() => !sending && onClose()}
      maxWidth="sm"
      fullWidth
      fullScreen={fullScreen}
      PaperProps={{ sx: { borderRadius: fullScreen ? 0 : 2 } }}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5, pb: 1 }}>
        <SendIcon color="primary" />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="h6" fontWeight={700}>
            Message students
          </Typography>
          <Typography variant="caption" color="text.secondary" noWrap>
            {recipients.length} recipient{recipients.length === 1 ? '' : 's'} · {what}
          </Typography>
        </Box>
        <IconButton onClick={() => !sending && onClose()} aria-label="Close" sx={{ width: 40, height: 40 }}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <Divider />

      <DialogContent sx={{ pt: 2 }}>
        {results ? (
          <Box sx={{ py: 1 }}>
            <Alert severity={results.failed >= results.total && results.total > 0 ? 'warning' : 'success'} sx={{ mb: 2 }}>
              {results.failed > 0
                ? `Reminder sent to ${results.total - results.failed} of ${results.total} student${results.total === 1 ? '' : 's'}.`
                : `Reminder sent to ${results.total} student${results.total === 1 ? '' : 's'}.`}
            </Alert>
            <Typography variant="body2" color="text.secondary">
              {teamsLine(results)}
            </Typography>
            {results.failed > 0 && (
              <Typography variant="caption" color="warning.main" sx={{ display: 'block', mt: 1 }}>
                {results.failed} could not be reached on any channel.
              </Typography>
            )}
          </Box>
        ) : (
          <>
            {error && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {error}
              </Alert>
            )}
            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700 }}>
              Template
            </Typography>
            <ToggleButtonGroup
              value={template}
              exclusive
              size="small"
              onChange={(_, v) => v && pickTemplate(v)}
              sx={{ mt: 0.5, mb: 2, flexWrap: 'wrap', '& .MuiToggleButton-root': { textTransform: 'none', minHeight: 38 } }}
            >
              <ToggleButton value="not_submitted">Not submitted</ToggleButton>
              <ToggleButton value="nudge">Reminder</ToggleButton>
              <ToggleButton value="congratulate">Congratulate</ToggleButton>
              <ToggleButton value="custom">Custom</ToggleButton>
            </ToggleButtonGroup>

            <TextField
              label="Subject"
              fullWidth
              size="small"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              sx={{ mb: 1.5 }}
            />
            <TextField
              label="Message"
              fullWidth
              multiline
              minRows={6}
              value={body}
              onChange={(e) => {
                setBody(e.target.value);
                setTemplate('custom');
              }}
            />
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
              The assignment link{assignments.length === 1 ? '' : 's'} will be added automatically.
            </Typography>
            <Chip
              size="small"
              label={`Sending to ${recipients.length} student${recipients.length === 1 ? '' : 's'}`}
              sx={{ mt: 1 }}
            />
          </>
        )}
      </DialogContent>

      <Divider />
      <DialogActions sx={{ p: 2, gap: 1 }}>
        {results ? (
          <Button variant="contained" onClick={onClose} sx={{ textTransform: 'none', minWidth: 120 }}>
            Done
          </Button>
        ) : (
          <>
            <Button onClick={onClose} disabled={sending} sx={{ textTransform: 'none' }}>
              Cancel
            </Button>
            <Button
              variant="contained"
              onClick={send}
              disabled={sending || !body.trim() || recipients.length === 0}
              startIcon={sending ? <CircularProgress size={16} color="inherit" /> : <SendIcon />}
              sx={{ textTransform: 'none', minWidth: 150 }}
            >
              {sending ? 'Sending...' : `Send to ${recipients.length}`}
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}
