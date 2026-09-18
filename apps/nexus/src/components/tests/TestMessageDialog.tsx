'use client';

/**
 * Reopen a test for the students you selected and tell them, or just tell them,
 * in every place they look.
 *
 * One press reaches four surfaces: their Teams 1:1 chat, their Teams activity
 * feed, the Nexus bell, and one combined post in the class channel naming
 * everyone it is for.
 *
 * TWO MODES, ONE SHEET. "Reopen" leads with when it closes and always sends the
 * message with it: on 11 Sept a separate Reopen button used three days nobody
 * picked and told students only through the bell, so a reopen without a word is
 * no longer something the screen offers. "Message" is for students who do not
 * need the door opened (a changed score, a count), with an optional reopen.
 *
 * Three things this screen refuses to do:
 *   - Send without a confirmation. It is outward-facing and cannot be recalled.
 *   - Say "sent". It reports real per-channel counts and why a channel failed,
 *     because a Teams tier that silently reached nobody is exactly the failure a
 *     green tick would hide.
 *   - Drop a recipient quietly. A dormant student is named, with a switch, so
 *     leaving them out is the teacher's decision rather than the system's.
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
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import LockOpenOutlinedIcon from '@mui/icons-material/LockOpenOutlined';
import LinkOutlinedIcon from '@mui/icons-material/LinkOutlined';
import ReopenUntilPicker from '@/components/tests/ReopenUntilPicker';
import DeliveryReceipt, { type DeliveryReceiptData } from '@/components/tests/DeliveryReceipt';
import { useStudentStageFacts } from '@/components/students/StudentStageFactsProvider';
import {
  DEFAULT_REOPEN_PRESET,
  endOfIstDay,
  formatReopenUntil,
  presetDate,
  reopenUntilProblem,
} from '@/lib/reopen-deadline';
import {
  TELL_WHY_LINK_LABEL,
  TEMPLATE_LABELS,
  TEST_MESSAGE_TEMPLATES,
  fillConstants,
  renderTestMessage,
  templateLinksToWhy,
  type TestMessageContext,
  type TestMessageTemplate,
} from '@/lib/test-message-templates';

export interface MessageRecipient {
  id: string;
  name: string | null;
  /**
   * Their catch-up for this run's classes is still open, so "Catch up first" is
   * a message that says something true to them. Without at least one of these
   * the template is not offered: it names classes the recipient does not owe.
   */
  behind?: boolean;
}

export interface MessageSentSummary {
  reopened: number;
  closesAt: string | null;
  /** Students reached on at least one channel. */
  reached: number;
  skipped: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** 'reopen' opens the door and tells them; 'message' only tells them, unless switched. */
  mode?: 'reopen' | 'message';
  placementId: string;
  recipients: MessageRecipient[];
  testTitle: string;
  passMark: number | null;
  dueLabel: string | null;
  /** Pre-select a template, e.g. 'regraded' straight after a re-grade. */
  initialTemplate?: TestMessageTemplate;
  /** Must carry the teacher's Graph token, or the Teams chat and class post cannot go out. */
  authFetch: (url: string, init?: RequestInit) => Promise<any>;
  onSent: (summary: MessageSentSummary) => void;
}

/** The class post choice, remembered on this device. */
const GROUP_POST_KEY = 'nexus.reopen.groupPost';

function readGroupPost(): boolean {
  try {
    return window.localStorage.getItem(GROUP_POST_KEY) !== 'false';
  } catch {
    return true;
  }
}

function writeGroupPost(value: boolean) {
  try {
    window.localStorage.setItem(GROUP_POST_KEY, value ? 'true' : 'false');
  } catch {
    // Private windows and blocked storage: the default simply applies next time.
  }
}

const defaultClose = () => endOfIstDay(presetDate(DEFAULT_REOPEN_PRESET));

export default function TestMessageDialog({
  open,
  onClose,
  mode = 'message',
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
  const { factsFor } = useStudentStageFacts();

  const [template, setTemplate] = useState<TestMessageTemplate>(initialTemplate || 'redo');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [editing, setEditing] = useState(false);
  const [alsoReopen, setAlsoReopen] = useState(false);
  const [closesAt, setClosesAt] = useState<string>(defaultClose);
  // Chosen with the founder: a hand-picked dormant student is included, named,
  // and can be left out with one switch.
  const [includeDormant, setIncludeDormant] = useState(true);
  const [channels, setChannels] = useState({ chat: true, activity: true, group: true });
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<DeliveryReceiptData | null>(null);

  const reopening = mode === 'reopen' || alsoReopen;

  const ctx: TestMessageContext = useMemo(
    () => ({
      testTitle,
      passMark,
      dueLabel,
      reopening,
      until: reopening ? formatReopenUntil(closesAt) : null,
    }),
    [testTitle, passMark, dueLabel, reopening, closesAt],
  );

  // Re-render whenever the template, the reopen switch or the date changes,
  // unless the teacher has taken the wheel. Editing the words switches to Write
  // my own, which is what stops a switch silently rewriting what somebody typed.
  useEffect(() => {
    if (!open || template === 'custom') return;
    const rendered = renderTestMessage(template, ctx);
    setSubject(rendered.subject);
    setBody(rendered.body);
  }, [open, template, ctx]);

  useEffect(() => {
    if (!open) return;
    setTemplate(initialTemplate || 'redo');
    setEditing(false);
    setConfirming(false);
    setReceipt(null);
    setError(null);
    setAlsoReopen(false);
    setClosesAt(defaultClose());
    setIncludeDormant(true);
    setChannels({ chat: true, activity: true, group: readGroupPost() });
  }, [open, initialTemplate]);

  const dormant = useMemo(() => recipients.filter((r) => factsFor(r.id)?.dormant), [recipients, factsFor]);
  const goingTo = includeDormant ? recipients : recipients.filter((r) => !factsFor(r.id)?.dormant);

  // "No need to retake" only makes sense straight after a count, so it is not
  // offered as a starting point anywhere else.
  const templates = TEST_MESSAGE_TEMPLATES.filter((t) => {
    if (t === 'counted') return initialTemplate === 'counted';
    if (t === 'catchup') return initialTemplate === 'catchup' || recipients.some((r) => r.behind);
    return true;
  });

  /** Exactly what a student will read, so nothing is a surprise after sending. */
  const previewSubject = fillConstants(subject, ctx);
  const previewBody = useMemo(
    () =>
      fillConstants(body, ctx)
        .replace(/\{name\}/g, goingTo[0]?.name?.split(/\s+/)[0] || 'there')
        .replace(/\{score\}/g, 'their score')
        .replace(/\{date\}/g, 'the day they did it'),
    [body, ctx, goingTo],
  );

  const deadlineProblem = reopening ? reopenUntilProblem(closesAt) : null;
  const canSend = Boolean(subject.trim() && body.trim() && goingTo.length > 0 && !deadlineProblem);

  /**
   * The link the route puts under a "Tell me why" chat message. Shown where the
   * message is previewed, so the teacher knows students get something to press,
   * and so an edit that turns the message into "Write my own" visibly drops it.
   */
  const whyLinkNote = templateLinksToWhy(template) ? (
    <Box data-testid="why-link-note" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 1 }}>
      <LinkOutlinedIcon aria-hidden sx={{ fontSize: 16, color: 'primary.main' }} />
      <Typography variant="body2" sx={{ color: 'primary.main', fontWeight: 600 }}>
        {TELL_WHY_LINK_LABEL}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        (a link to their card)
      </Typography>
    </Box>
  ) : null;

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
          also_reopen: reopening,
          ...(reopening ? { closes_at: closesAt } : {}),
          include_dormant: includeDormant,
        }),
      });
      const data: DeliveryReceiptData = json.data;
      setReceipt(data);
      const skipped = data?.counts?.skipped ?? 0;
      onSent({
        reopened: data?.reopened ?? 0,
        closesAt: data?.closes_at ?? null,
        reached: (data?.counts?.total ?? 0) - (data?.counts?.failed ?? 0),
        skipped,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send that message');
      setConfirming(false);
    } finally {
      setSending(false);
    }
  }

  const n = recipients.length;
  const who = `${n} student${n === 1 ? '' : 's'}`;
  const title = receipt
    ? reopening
      ? 'Reopened and sent'
      : 'Sent'
    : mode === 'reopen'
      ? `Reopen for ${who}`
      : `Message ${who}`;

  const sectionLabel = { fontWeight: 700, mb: 0.75, display: 'block' } as const;

  return (
    <Dialog open={open} onClose={sending ? undefined : onClose} fullScreen={fullScreen} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, pr: 1 }}>
        <Typography component="span" sx={{ fontWeight: 700, flex: 1 }}>
          {title}
        </Typography>
        <IconButton onClick={onClose} disabled={sending} aria-label="Close" sx={{ width: 44, height: 44 }}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers sx={{ px: { xs: 1.5, sm: 3 } }}>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {receipt ? (
          <DeliveryReceipt data={receipt} />
        ) : confirming ? (
          /* The confirmation, because this cannot be recalled. */
          <Box>
            <Alert severity="info" sx={{ mb: 2 }}>
              {reopening
                ? `This reopens the test until ${formatReopenUntil(closesAt)} and sends the message now. It cannot be taken back.`
                : 'This goes out now and cannot be taken back.'}
            </Alert>
            <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2, mb: 2 }}>
              <Typography variant="body2" sx={{ fontWeight: 700, mb: 1 }}>
                {previewSubject}
              </Typography>
              <Divider sx={{ my: 1 }} />
              <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                {previewBody}
              </Typography>
              {whyLinkNote}
            </Paper>

            <Typography variant="body2" sx={sectionLabel}>
              Going to {goingTo.length}
            </Typography>
            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mb: 2 }}>
              {goingTo.map((r) => (
                <Chip key={r.id} size="small" label={r.name || 'Unknown'} />
              ))}
            </Box>

            {channels.group && (
              <Alert severity="warning">
                The class post names every one of these students. Everyone in the classroom will see
                who it is for.
              </Alert>
            )}
          </Box>
        ) : (
          /* Compose, one flat page. */
          <Box>
            {mode === 'message' && (
              <FormControlLabel
                control={<Switch checked={alsoReopen} onChange={(e) => setAlsoReopen(e.target.checked)} />}
                label={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <LockOpenOutlinedIcon sx={{ fontSize: 18 }} />
                    <Typography variant="body2">Reopen the test for them as well</Typography>
                  </Box>
                }
                sx={{ display: 'flex', minHeight: 44, mb: 1 }}
              />
            )}

            {reopening && (
              <Box sx={{ mb: 2.5 }}>
                <Typography variant="body2" sx={sectionLabel}>
                  Open until
                </Typography>
                <ReopenUntilPicker value={closesAt} onChange={setClosesAt} />
                {deadlineProblem && (
                  <Typography variant="body2" color="error" sx={{ mt: 0.5 }}>
                    {deadlineProblem}
                  </Typography>
                )}
              </Box>
            )}

            {dormant.length > 0 && (
              <Alert severity="info" sx={{ mb: 2.5, alignItems: 'center' }}>
                <Typography variant="body2" sx={{ mb: 0.5 }}>
                  {dormant.length === 1 ? '1 is' : `${dormant.length} are`} marked dormant:{' '}
                  {dormant.map((d) => d.name || 'Unknown').join(', ')}.
                </Typography>
                <FormControlLabel
                  control={
                    <Switch checked={includeDormant} onChange={(e) => setIncludeDormant(e.target.checked)} />
                  }
                  label={<Typography variant="body2">Include them</Typography>}
                  sx={{ minHeight: 44, ml: 0 }}
                />
              </Alert>
            )}

            <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.75 }}>
              <Typography variant="body2" sx={{ fontWeight: 700, flex: 1 }}>
                Message
              </Typography>
              <Button
                size="small"
                startIcon={<EditOutlinedIcon />}
                onClick={() => setEditing((v) => !v)}
                aria-expanded={editing}
                sx={{ textTransform: 'none', minHeight: 44 }}
              >
                {editing ? 'Done editing' : 'Edit'}
              </Button>
            </Box>

            {editing ? (
              <Box sx={{ mb: 2.5 }}>
                <ToggleButtonGroup
                  size="small"
                  exclusive
                  value={template}
                  onChange={(_, v) => v && setTemplate(v)}
                  sx={{ mb: 1.5, flexWrap: 'wrap' }}
                  aria-label="Start from"
                >
                  {templates.map((t) => (
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
                  InputProps={{ sx: { fontSize: 16 } }}
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
                  InputProps={{ sx: { fontSize: 16 } }}
                  helperText="{name}, {score} and {date} are filled in per student. {test}, {pass_mark}, {due} and {until} are filled in once."
                />
              </Box>
            ) : (
              <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2, mb: 2.5 }}>
                <Typography variant="body2" sx={{ fontWeight: 700, mb: 0.75 }}>
                  {previewSubject || 'No subject yet'}
                </Typography>
                <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                  {previewBody || 'Press Edit to write the message.'}
                </Typography>
                {whyLinkNote}
              </Paper>
            )}

            <Typography variant="body2" sx={sectionLabel}>
              Where it goes
            </Typography>
            <Box>
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
                    onChange={(e) => {
                      const value = e.target.checked;
                      setChannels((c) => ({ ...c, group: value }));
                      writeGroupPost(value);
                    }}
                  />
                }
                label="One post in the class Teams group, naming them"
                sx={{ display: 'flex', minHeight: 44 }}
              />
            </Box>
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ px: { xs: 1.5, sm: 3 }, py: 1.5, gap: 1 }}>
        {receipt ? (
          <>
            <Box sx={{ flex: 1 }} />
            <Button variant="contained" onClick={onClose} sx={{ minHeight: 48, textTransform: 'none' }}>
              Done
            </Button>
          </>
        ) : confirming ? (
          <>
            <Button onClick={() => setConfirming(false)} disabled={sending} sx={{ minHeight: 48, textTransform: 'none' }}>
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
              {sending ? 'Sending' : reopening ? 'Reopen and send' : 'Send it'}
            </Button>
          </>
        ) : (
          <>
            <Button onClick={onClose} sx={{ minHeight: 48, textTransform: 'none' }}>
              Cancel
            </Button>
            <Box sx={{ flex: 1 }} />
            <Button
              variant="contained"
              onClick={() => setConfirming(true)}
              disabled={!canSend}
              sx={{ minHeight: 48, textTransform: 'none' }}
            >
              Review
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}
