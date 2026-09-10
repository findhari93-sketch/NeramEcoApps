'use client';

/**
 * Write to the students you just selected, in every place they look.
 *
 * One press reaches four surfaces: their Teams 1:1 chat, their Teams activity
 * feed, the Nexus bell, and one combined post in the class channel naming
 * everyone it is for. It can reopen the run in the same press, which is the
 * whole "you missed it, here is another go" loop in one action.
 *
 * Three things this screen refuses to do:
 *   - Send without a confirmation. It is outward-facing and cannot be recalled.
 *   - Say "sent". It reports real per-channel counts, because a Teams tier that
 *     silently reached nobody is exactly the failure a green tick would hide.
 *   - Drop a recipient quietly. A dormant student is named, with a switch, so
 *     skipping them is the teacher's decision rather than the system's.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  IconButton,
  Paper,
  Switch,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  useMediaQuery,
  useTheme,
} from '@neram/ui';
import CloseIcon from '@mui/icons-material/Close';
import SendIcon from '@mui/icons-material/Send';
import LockOpenOutlinedIcon from '@mui/icons-material/LockOpenOutlined';
import {
  TEMPLATE_LABELS,
  TEST_MESSAGE_TEMPLATES,
  fillConstants,
  renderTestMessage,
  type TestMessageContext,
  type TestMessageTemplate,
} from '@/lib/test-message-templates';

export interface MessageRecipient {
  id: string;
  name: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  placementId: string;
  recipients: MessageRecipient[];
  testTitle: string;
  passMark: number | null;
  dueLabel: string | null;
  /** Pre-select a template, e.g. 'regraded' straight after a re-grade. */
  initialTemplate?: TestMessageTemplate;
  authFetch: (url: string, init?: RequestInit) => Promise<any>;
  onSent: () => void;
}

interface SendCounts {
  total: number;
  chat: number;
  teams: number;
  inapp: number;
  email: number;
  failed: number;
  group?: { channel: boolean; chat: boolean; errors: string[]; unconfigured: boolean };
}

export default function TestMessageDialog({
  open,
  onClose,
  placementId,
  recipients,
  testTitle,
  passMark,
  dueLabel,
  initialTemplate,
  authFetch,
  onSent,
}: Props) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));

  const [template, setTemplate] = useState<TestMessageTemplate>(initialTemplate || 'redo');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [alsoReopen, setAlsoReopen] = useState(false);
  const [includeDormant, setIncludeDormant] = useState(false);
  const [channels, setChannels] = useState({ chat: true, activity: true, group: true });
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [counts, setCounts] = useState<SendCounts | null>(null);
  const [reopened, setReopened] = useState(0);

  const ctx: TestMessageContext = useMemo(
    () => ({ testTitle, passMark, dueLabel, reopening: alsoReopen }),
    [testTitle, passMark, dueLabel, alsoReopen],
  );

  // Re-render whenever the template or the reopen checkbox changes, unless the
  // teacher has taken the wheel. Editing the body switches to Custom, which is
  // what stops a checkbox silently rewriting words somebody typed.
  useEffect(() => {
    if (!open || template === 'custom') return;
    const rendered = renderTestMessage(template, ctx);
    setSubject(rendered.subject);
    setBody(rendered.body);
  }, [open, template, ctx]);

  useEffect(() => {
    if (!open) return;
    setTemplate(initialTemplate || 'redo');
    setConfirming(false);
    setCounts(null);
    setError(null);
    setReopened(0);
    setAlsoReopen(false);
  }, [open, initialTemplate]);

  /** Exactly what a student will read, so nothing is a surprise after sending. */
  const previewBody = useMemo(
    () =>
      fillConstants(body, ctx)
        .replace(/\{name\}/g, recipients[0]?.name?.split(/\s+/)[0] || 'there')
        .replace(/\{score\}/g, 'their score'),
    [body, ctx, recipients],
  );

  async function send() {
    setSending(true);
    setError(null);
    try {
      const json = await authFetch(`/api/tests/runs/${placementId}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student_ids: recipients.map((r) => r.id),
          template,
          subject,
          body,
          channels: { ...channels, inapp: true },
          also_reopen: alsoReopen,
          include_dormant: includeDormant,
        }),
      });
      setCounts(json.data?.counts || null);
      setReopened(json.data?.reopened || 0);
      onSent();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send that message');
      setConfirming(false);
    } finally {
      setSending(false);
    }
  }

  const canSend = Boolean(subject.trim() && body.trim() && recipients.length > 0);

  return (
    <Dialog
      open={open}
      onClose={sending ? undefined : onClose}
      fullScreen={fullScreen}
      maxWidth="sm"
      fullWidth
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, pr: 1 }}>
        <Typography component="span" sx={{ fontWeight: 700, flex: 1 }}>
          {counts
            ? 'Sent'
            : `Message ${recipients.length} student${recipients.length === 1 ? '' : 's'}`}
        </Typography>
        <IconButton onClick={onClose} disabled={sending} aria-label="Close" sx={{ minWidth: 44, minHeight: 44 }}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers sx={{ px: { xs: 1.5, sm: 3 } }}>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {counts ? (
          /* ── The honest receipt ─────────────────────────────────────────── */
          <Box>
            <Typography variant="body2" sx={{ mb: 2 }}>
              {counts.total} recipient{counts.total === 1 ? '' : 's'}. Here is where it actually
              landed.
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
              <Chip label={`Teams chat ${counts.chat}`} color={counts.chat ? 'success' : 'default'} />
              <Chip label={`Teams alert ${counts.teams}`} color={counts.teams ? 'success' : 'default'} />
              <Chip label={`Nexus bell ${counts.inapp}`} color={counts.inapp ? 'success' : 'default'} />
              {counts.email > 0 && <Chip label={`Email ${counts.email}`} color="info" />}
              {counts.failed > 0 && <Chip label={`Reached nobody ${counts.failed}`} color="error" />}
            </Box>

            {counts.group && (
              <Alert severity={counts.group.channel || counts.group.chat ? 'success' : 'warning'} sx={{ mb: 2 }}>
                {counts.group.unconfigured
                  ? 'This classroom has no Teams channel or group chat set up, so the group post was skipped.'
                  : counts.group.channel || counts.group.chat
                    ? `Posted to the class ${[counts.group.channel && 'channel', counts.group.chat && 'group chat']
                        .filter(Boolean)
                        .join(' and ')}.`
                    : `The group post did not land. ${counts.group.errors.join('; ')}`}
              </Alert>
            )}

            {reopened > 0 && (
              <Alert severity="success" sx={{ mb: 2 }}>
                Reopened the test for {reopened} student{reopened === 1 ? '' : 's'}.
              </Alert>
            )}

            {counts.failed > 0 && (
              <Alert severity="warning">
                {counts.failed} student{counts.failed === 1 ? '' : 's'} could not be reached on any
                channel. They usually have no Microsoft account and no email on file yet.
              </Alert>
            )}
          </Box>
        ) : confirming ? (
          /* ── The confirmation, because this cannot be recalled ───────────── */
          <Box>
            <Alert severity="info" sx={{ mb: 2 }}>
              This goes out now and cannot be taken back.
            </Alert>
            <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2, mb: 2 }}>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>
                SUBJECT
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
                {fillConstants(subject, ctx)}
              </Typography>
              <Divider sx={{ my: 1 }} />
              <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                {previewBody}
              </Typography>
            </Paper>

            <Typography variant="body2" sx={{ fontWeight: 700, mb: 0.5 }}>
              Going to
            </Typography>
            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mb: 2 }}>
              {recipients.map((r) => (
                <Chip key={r.id} size="small" label={r.name || 'Unknown'} />
              ))}
            </Box>

            {channels.group && (
              <Alert severity="warning">
                The class channel post names every one of these students. Everyone in the classroom
                will see who it is for.
              </Alert>
            )}
          </Box>
        ) : (
          /* ── Compose ─────────────────────────────────────────────────────── */
          <Box>
            <ToggleButtonGroup
              size="small"
              exclusive
              value={template}
              onChange={(_, v) => v && setTemplate(v)}
              sx={{ mb: 2, flexWrap: 'wrap' }}
            >
              {TEST_MESSAGE_TEMPLATES.map((t) => (
                <ToggleButton key={t} value={t} sx={{ textTransform: 'none', px: 1.5, minHeight: 44 }}>
                  {TEMPLATE_LABELS[t]}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>

            <TextField
              label="Subject"
              value={subject}
              onChange={(e) => {
                setSubject(e.target.value);
                setTemplate('custom');
              }}
              fullWidth
              size="small"
              sx={{ mb: 1.5 }}
            />
            <TextField
              label="Message"
              value={body}
              onChange={(e) => {
                setBody(e.target.value);
                setTemplate('custom');
              }}
              multiline
              minRows={6}
              fullWidth
              helperText="{name} and {score} are filled in per student. {test}, {pass_mark} and {due} are filled in once."
              sx={{ mb: 2 }}
            />

            <Typography variant="body2" sx={{ fontWeight: 700, mb: 0.5 }}>
              Where it goes
            </Typography>
            <Box sx={{ mb: 1 }}>
              <FormControlLabel
                control={
                  <Switch
                    checked={channels.chat}
                    onChange={(e) => setChannels((c) => ({ ...c, chat: e.target.checked }))}
                  />
                }
                label="Teams chat, as a message from you"
                sx={{ display: 'flex', minHeight: 44 }}
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={channels.activity}
                    onChange={(e) => setChannels((c) => ({ ...c, activity: e.target.checked }))}
                  />
                }
                label="Teams activity alert"
                sx={{ display: 'flex', minHeight: 44 }}
              />
              <FormControlLabel
                control={<Switch checked disabled />}
                label="Nexus notification, always"
                sx={{ display: 'flex', minHeight: 44 }}
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={channels.group}
                    onChange={(e) => setChannels((c) => ({ ...c, group: e.target.checked }))}
                  />
                }
                label="One post in the class Teams group, naming them"
                sx={{ display: 'flex', minHeight: 44 }}
              />
            </Box>

            <Divider sx={{ my: 1.5 }} />

            <FormControlLabel
              control={
                <Switch checked={alsoReopen} onChange={(e) => setAlsoReopen(e.target.checked)} />
              }
              label={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <LockOpenOutlinedIcon sx={{ fontSize: 18 }} />
                  <Typography variant="body2">Reopen the test for them as well</Typography>
                </Box>
              }
              sx={{ display: 'flex', minHeight: 44 }}
            />
            <FormControlLabel
              control={
                <Switch
                  checked={includeDormant}
                  onChange={(e) => setIncludeDormant(e.target.checked)}
                />
              }
              label={
                <Typography variant="body2">
                  Include students marked dormant, who are skipped by default
                </Typography>
              }
              sx={{ display: 'flex', minHeight: 44 }}
            />
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ px: { xs: 1.5, sm: 3 }, py: 1.5, gap: 1 }}>
        {counts ? (
          <>
            <Box sx={{ flex: 1 }} />
            <Button variant="contained" onClick={onClose} sx={{ minHeight: 48, textTransform: 'none' }}>
              Done
            </Button>
          </>
        ) : confirming ? (
          <>
            <Button onClick={() => setConfirming(false)} disabled={sending} sx={{ minHeight: 48 }}>
              Back
            </Button>
            <Box sx={{ flex: 1 }} />
            <Button
              variant="contained"
              onClick={send}
              disabled={sending}
              startIcon={sending ? <CircularProgress size={16} color="inherit" /> : <SendIcon />}
              sx={{ minHeight: 48, textTransform: 'none' }}
            >
              {sending ? 'Sending' : 'Send it'}
            </Button>
          </>
        ) : (
          <>
            <Button onClick={onClose} sx={{ minHeight: 48 }}>
              Cancel
            </Button>
            <Box sx={{ flex: 1 }} />
            <Button
              variant="contained"
              onClick={() => setConfirming(true)}
              disabled={!canSend}
              sx={{ minHeight: 48, textTransform: 'none' }}
            >
              Review and send
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}
