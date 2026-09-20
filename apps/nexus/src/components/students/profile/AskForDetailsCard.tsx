'use client';

import { useCallback, useState } from 'react';
import { Alert, Box, Button, Stack, Typography } from '@neram/ui';
import LinkOutlinedIcon from '@mui/icons-material/LinkOutlined';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import SendOutlinedIcon from '@mui/icons-material/SendOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';

interface AskForDetailsCardProps {
  studentId: string;
  studentName: string | null;
  firstName: string | null;
  classroomId: string | null;
  getToken: () => Promise<string | null>;
}

/**
 * Ask a student to fill in their own application details, from their profile page.
 *
 * This is the same pair of actions as the Students list sheet, put where staff
 * actually look. A teacher who opens a student and reads "No application on file"
 * has the question in front of them right then; sending them back to the list to
 * find a row menu is how the feature went unused.
 *
 * Both actions need a classroom, because the server checks the student really is in
 * the classroom the caller names. A student in no active classroom is reachable from
 * Admin instead, which sees the whole roster.
 */
export default function AskForDetailsCard({
  studentId,
  studentName,
  firstName,
  classroomId,
  getToken,
}: AskForDetailsCardProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState<'link' | 'nudge' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [sent, setSent] = useState<string | null>(null);

  const whatsappMessage = useCallback(
    (link: string) => {
      const name = (firstName || studentName || '').trim().split(' ')[0];
      const greeting = name ? `Hi ${name},` : 'Hi,';
      return [
        `${greeting} this is Neram Classes.`,
        '',
        'We are missing some of your application details (class, exam year and where you live).',
        'Please fill them in here, it takes about two minutes and needs no password:',
        link,
        '',
        'The link works for 14 days. Reply here if it does not open.',
      ].join('\n');
    },
    [firstName, studentName],
  );

  const getLink = useCallback(
    async (regenerate = false) => {
      if (!classroomId) return;
      setBusy('link');
      setError(null);
      try {
        const token = await getToken();
        const res = await fetch('/api/students/detail-request', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ classroomId, studentId, regenerate }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Could not make a link.');
        setUrl(data.url);
        // Best effort. The link is on screen either way, which is why it is rendered
        // as selectable text rather than only written to the clipboard.
        try {
          await navigator.clipboard.writeText(whatsappMessage(data.url));
          setCopied(true);
          setTimeout(() => setCopied(false), 2500);
        } catch {
          /* the URL below is still readable and selectable */
        }
      } catch (e: any) {
        setError(e.message);
      } finally {
        setBusy(null);
      }
    },
    [classroomId, studentId, getToken, whatsappMessage],
  );

  const sendNudge = useCallback(async () => {
    if (!classroomId) return;
    setBusy('nudge');
    setError(null);
    try {
      const token = await getToken();
      const res = await fetch('/api/students/detail-request/nudge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ classroomId, studentId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not send it.');
      // The route reports which channel actually landed rather than claiming "sent",
      // because a Teams chat to a student who has never signed in silently does nothing.
      setSent(data.summary || 'Sent.');
      if (data.url) setUrl(data.url);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }, [classroomId, studentId, getToken]);

  const copyAgain = useCallback(async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(whatsappMessage(url));
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setError('Could not reach the clipboard. Select the link below and copy it by hand.');
    }
  }, [url, whatsappMessage]);

  if (!classroomId) {
    return (
      <Alert severity="info" sx={{ mt: 2 }}>
        This student is in no active classroom, so they cannot be asked from here. Open
        them in Admin, where the whole roster is visible.
      </Alert>
    );
  }

  return (
    <Box sx={{ mt: 2 }}>
      {error && (
        <Alert severity="error" sx={{ mb: 1.5 }} role="alert">
          {error}
        </Alert>
      )}
      {sent && (
        <Alert severity="success" icon={<CheckCircleOutlineIcon fontSize="inherit" />} sx={{ mb: 1.5 }}>
          {sent}
        </Alert>
      )}
      {copied && !error && (
        <Alert severity="success" sx={{ mb: 1.5 }}>
          Message copied. Paste it into WhatsApp.
        </Alert>
      )}

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ flexWrap: 'wrap' }}>
        <Button
          variant="contained"
          startIcon={<LinkOutlinedIcon />}
          disabled={busy !== null}
          onClick={() => getLink(false)}
          sx={{ textTransform: 'none', minHeight: 48 }}
        >
          {busy === 'link' ? 'Making a link...' : url ? 'Copy link again' : 'Get a link to ask'}
        </Button>

        <Button
          variant="outlined"
          startIcon={<SendOutlinedIcon />}
          disabled={busy !== null}
          onClick={sendNudge}
          sx={{ textTransform: 'none', minHeight: 48 }}
        >
          {busy === 'nudge' ? 'Sending...' : 'Send in Teams and Nexus'}
        </Button>

        {url && (
          <Button
            variant="text"
            startIcon={<ContentCopyIcon />}
            disabled={busy !== null}
            onClick={copyAgain}
            sx={{ textTransform: 'none', minHeight: 48 }}
          >
            Copy message
          </Button>
        )}
      </Stack>

      {url && (
        <Box sx={{ mt: 1.5 }}>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
            Their link, works for 14 days:
          </Typography>
          <Typography
            variant="body2"
            sx={{
              fontFamily: 'monospace',
              fontSize: 12.5,
              wordBreak: 'break-all',
              userSelect: 'all',
              color: 'text.secondary',
            }}
          >
            {url}
          </Typography>
          <Button
            variant="text"
            size="small"
            disabled={busy !== null}
            onClick={() => getLink(true)}
            sx={{ textTransform: 'none', mt: 0.5, px: 0 }}
          >
            Send a new link instead
          </Button>
        </Box>
      )}
    </Box>
  );
}
