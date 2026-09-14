'use client';

import { useEffect, useState } from 'react';
import { Alert, Box, Button, Typography } from '@neram/ui';
import ChatOutlinedIcon from '@mui/icons-material/ChatOutlined';
import { useAuthSWR } from '@/lib/nexus-swr';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { patchQuery, readSearch } from '@/lib/list-url-state';

interface SenderStatus {
  available: boolean;
  sender: { isMe: boolean; name: string | null; working: boolean; problem: string | null } | null;
}

const RETURN_MESSAGES: Record<string, string> = {
  cancelled: 'Connecting Teams was cancelled. Nothing changed.',
  wrong_account: 'You signed in with a different Microsoft account. Sign in with your own Neram account.',
  not_your_class: 'You no longer teach this class, so reminders cannot come from your Teams.',
  missing_chat_permission: 'Microsoft did not allow sending chats. Ask the admin to check the app permissions.',
  expired: 'That took too long. Press Connect Teams again.',
  not_configured: 'Teams sending is not set up on this server yet.',
};

/**
 * Whose Teams the class's automatic reminders come from.
 *
 * Reminders are only useful in Teams, where students are, and a Teams chat can
 * only be sent by a signed-in person. So one teacher connects once; after that
 * the 18:00 reminders go as that teacher's own chat, the same chat a manual
 * message arrives in, and a student can reply to a person. One short row, so it
 * never pushes the list down on a phone.
 */
export default function TeamsSenderCard({ classroomId }: { classroomId: string }) {
  const { getToken } = useNexusAuthContext();
  const { data, mutate } = useAuthSWR<SenderStatus>(`/api/teams/sender?classroom=${encodeURIComponent(classroomId)}`);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ severity: 'success' | 'warning' | 'error'; text: string } | null>(null);

  // Back from Microsoft with ?teams=connected or ?teams=error&reason=...
  useEffect(() => {
    const params = new URLSearchParams(readSearch());
    const result = params.get('teams');
    if (!result) return;
    if (result === 'connected') {
      setNotice({ severity: 'success', text: 'Teams connected. Automatic reminders now go out as your Teams chat.' });
    } else {
      const reason = params.get('reason') || '';
      setNotice({ severity: 'warning', text: RETURN_MESSAGES[reason] || 'Teams could not be connected. Please try again.' });
    }
    patchQuery({ teams: null, reason: null });
  }, []);

  const connect = async () => {
    setBusy(true);
    try {
      const token = await getToken();
      const search = new URLSearchParams(readSearch());
      search.delete('teams');
      search.delete('reason');
      const returnTo = `${window.location.pathname}${search.toString() ? `?${search}` : ''}`;
      const res = await fetch('/api/teams/sender/start', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ classroom_id: classroomId, return_to: returnTo }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.url) throw new Error(body.error || 'Could not start connecting Teams');
      window.location.assign(body.url);
    } catch (e) {
      setNotice({ severity: 'error', text: e instanceof Error ? e.message : 'Could not start connecting Teams' });
      setBusy(false);
    }
  };

  const disconnect = async () => {
    setBusy(true);
    try {
      const token = await getToken();
      const res = await fetch(`/api/teams/sender?classroom=${encodeURIComponent(classroomId)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Could not disconnect Teams');
      setNotice({ severity: 'success', text: 'Disconnected. Reminders now reach the Nexus bell only.' });
      await mutate();
    } catch (e) {
      setNotice({ severity: 'error', text: e instanceof Error ? e.message : 'Could not disconnect Teams' });
    } finally {
      setBusy(false);
    }
  };

  if (!data || !data.available) return notice ? <Alert severity={notice.severity} sx={{ mb: 1.5 }}>{notice.text}</Alert> : null;

  const s = data.sender;
  let line: string;
  let action: { label: string; onClick: () => void; primary: boolean } | null;
  if (!s) {
    line = 'Reminders reach the Nexus bell only. Connect Teams to send them as your Teams chat.';
    action = { label: 'Connect Teams', onClick: connect, primary: true };
  } else if (!s.working) {
    line = `${s.isMe ? 'Your' : `${s.name || 'A teacher'}'s`} Teams connection stopped, so reminders reach the Nexus bell only.`;
    action = { label: s.isMe ? 'Reconnect Teams' : 'Use my Teams', onClick: connect, primary: true };
  } else if (s.isMe) {
    line = 'Reminders go out as your Teams chat.';
    action = { label: 'Disconnect', onClick: disconnect, primary: false };
  } else {
    line = `Reminders go out as ${s.name || 'another teacher'}'s Teams chat.`;
    action = { label: 'Use my Teams', onClick: connect, primary: false };
  }

  return (
    <Box sx={{ mb: 1.5 }} data-testid="teams-sender-card">
      {notice && (
        <Alert severity={notice.severity} onClose={() => setNotice(null)} sx={{ mb: 1 }} role="status">
          {notice.text}
        </Alert>
      )}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1.25,
          flexWrap: 'wrap',
          p: 1,
          pl: 1.5,
          borderRadius: 2,
          border: 1,
          borderColor: s && !s.working ? 'warning.main' : 'divider',
          bgcolor: 'background.paper',
        }}
      >
        <ChatOutlinedIcon aria-hidden sx={{ color: s?.working ? 'success.main' : 'text.secondary', fontSize: 22 }} />
        <Typography variant="body2" sx={{ flex: '1 1 200px', minWidth: 0 }}>
          {line}
        </Typography>
        {action && (
          <Button
            variant={action.primary ? 'contained' : 'text'}
            onClick={action.onClick}
            disabled={busy}
            sx={{ minHeight: 44, flexShrink: 0 }}
            data-testid="teams-sender-action"
          >
            {busy ? 'Please wait...' : action.label}
          </Button>
        )}
      </Box>
    </Box>
  );
}
