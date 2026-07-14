'use client';

/**
 * StudyNudgeDialog — teacher composes a message to selected students about a study file, from a
 * template (congratulate / nudge / not-opened / custom) or free text, and sends it. Delivery tries
 * a Teams DM and falls back to in-app + email; per-recipient results are shown after sending.
 */

import { useState, useEffect } from 'react';
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

interface StudyNudgeDialogProps {
  open: boolean;
  fileId: string;
  fileTitle: string;
  recipients: Recipient[];
  getToken: () => Promise<string | null>;
  onClose: () => void;
}

type TemplateKey = 'congratulate' | 'nudge' | 'not_opened' | 'custom';

function templateFor(key: TemplateKey, chapter: string): { subject: string; body: string } {
  switch (key) {
    case 'congratulate':
      return {
        subject: `Well done on ${chapter}`,
        body: `Hi,\n\nGreat work completing "${chapter}". Keep up the momentum, every chapter you finish brings you closer to your exam goal.\n\n- Neram Classes`,
      };
    case 'nudge':
      return {
        subject: `Finish ${chapter}`,
        body: `Hi,\n\nYou have started "${chapter}" but have not completed it yet. Try to finish the chapter and pass the test soon. If anything is unclear or you are stuck, reply and we will help.\n\n- Neram Classes`,
      };
    case 'not_opened':
      return {
        subject: `Please start ${chapter}`,
        body: `Hi,\n\nYou have not opened "${chapter}" yet. This chapter is important for your exam. Please go through it and complete the test. If you have any doubts, feel free to reach out to us.\n\n- Neram Classes`,
      };
    default:
      return { subject: `About: ${chapter}`, body: '' };
  }
}

export default function StudyNudgeDialog({ open, fileId, fileTitle, recipients, getToken, onClose }: StudyNudgeDialogProps) {
  const fullScreen = useMediaQuery('(max-width:599px)');
  const [template, setTemplate] = useState<TemplateKey>('nudge');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState<{ viaTeams: number; total: number } | null>(null);

  useEffect(() => {
    if (open) {
      const t = templateFor('nudge', fileTitle);
      setTemplate('nudge');
      setSubject(t.subject);
      setBody(t.body);
      setError('');
      setResults(null);
    }
  }, [open, fileTitle]);

  const pickTemplate = (key: TemplateKey) => {
    setTemplate(key);
    const t = templateFor(key, fileTitle);
    setSubject(t.subject);
    if (key !== 'custom') setBody(t.body);
  };

  const send = async () => {
    if (sending || !body.trim() || recipients.length === 0) return;
    setSending(true);
    setError('');
    try {
      const token = await getToken();
      const res = await fetch(`/api/study-materials/files/${fileId}/nudge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ studentIds: recipients.map((r) => r.id), subject, body }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to send');
      setResults({ viaTeams: data.viaTeams || 0, total: (data.results || []).length });
    } catch (e: any) {
      setError(e?.message || 'Failed to send the message');
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onClose={() => !sending && onClose()} maxWidth="sm" fullWidth fullScreen={fullScreen}
      PaperProps={{ sx: { borderRadius: fullScreen ? 0 : 2 } }}>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5, pb: 1 }}>
        <SendIcon color="primary" />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="h6" fontWeight={700}>Message students</Typography>
          <Typography variant="caption" color="text.secondary" noWrap>
            {recipients.length} recipient{recipients.length === 1 ? '' : 's'} · {fileTitle}
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
            <Alert severity="success" sx={{ mb: 2 }}>
              Message sent to {results.total} student{results.total === 1 ? '' : 's'}.
            </Alert>
            <Typography variant="body2" color="text.secondary">
              {results.viaTeams > 0
                ? `${results.viaTeams} delivered via Microsoft Teams; the rest via in-app notification and email.`
                : 'Delivered via in-app notification and email. (Teams direct messages need a one-time Microsoft admin setup, once enabled, messages will go to Teams automatically.)'}
            </Typography>
          </Box>
        ) : (
          <>
            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700 }}>Template</Typography>
            <ToggleButtonGroup
              value={template} exclusive size="small" onChange={(_, v) => v && pickTemplate(v)}
              sx={{ mt: 0.5, mb: 2, flexWrap: 'wrap', '& .MuiToggleButton-root': { textTransform: 'none', minHeight: 38 } }}
            >
              <ToggleButton value="congratulate">Congratulate</ToggleButton>
              <ToggleButton value="nudge">Nudge</ToggleButton>
              <ToggleButton value="not_opened">Not opened</ToggleButton>
              <ToggleButton value="custom">Custom</ToggleButton>
            </ToggleButtonGroup>

            <TextField label="Subject" fullWidth size="small" value={subject} onChange={(e) => setSubject(e.target.value)} sx={{ mb: 1.5 }} />
            <TextField
              label="Message" fullWidth multiline minRows={6} value={body}
              onChange={(e) => { setBody(e.target.value); setTemplate('custom'); }}
            />
            <Chip size="small" label={`Sending to ${recipients.length} student${recipients.length === 1 ? '' : 's'}`} sx={{ mt: 1.5 }} />
          </>
        )}
      </DialogContent>

      <Divider />
      <DialogActions sx={{ p: 2, gap: 1 }}>
        {results ? (
          <Button variant="contained" onClick={onClose} sx={{ textTransform: 'none', minWidth: 120 }}>Done</Button>
        ) : (
          <>
            <Button onClick={onClose} disabled={sending} sx={{ textTransform: 'none' }}>Cancel</Button>
            <Button
              variant="contained" onClick={send} disabled={sending || !body.trim() || recipients.length === 0}
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
