'use client';

/**
 * Right pane of Conversations: who this is. Signed-in people get contact
 * buttons and a counsellor note; guests show what the device told us and
 * where they are with sign-in (Aintra is free on a guest's first day, and asks
 * them to sign in when they come back on a later day: no staff action needed).
 */
import { useEffect, useState } from 'react';
import { Box, Button, CircularProgress, TextField, Typography } from '@neram/ui';
import CallIcon from '@mui/icons-material/Call';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import { INTENT_LABELS } from '@/lib/aintra-inbox/intents';
import type { InboxConversation, InboxPerson } from '@/lib/aintra-inbox/types';
import type { Notify } from './Transcript';
import { fmtAgo, fmtDate, Pill, PersonAvatar, SectionLabel, sourceLabelOf, STAGE_TONE } from './ui';

interface Note {
  id: string;
  note: string;
  admin_name: string | null;
  created_at: string;
}

/** wa.me wants digits only, with the country code; Indian 10-digit numbers get 91. */
export function waNumber(phone: string): string | null {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `91${digits}`;
  return digits.length >= 11 ? digits : null;
}

function Facts({ rows }: { rows: [string, string | null | undefined][] }) {
  return (
    <Box component="dl" sx={{ m: 0, px: 2.5, py: 1.5, display: 'grid', gridTemplateColumns: '84px minmax(0,1fr)', rowGap: 1.25, fontSize: 13, borderBottom: 1, borderColor: 'divider' }}>
      {rows.map(([k, v]) => (
        <Box key={k} sx={{ display: 'contents' }}>
          <Box component="dt" sx={{ color: 'text.secondary' }}>
            {k}
          </Box>
          <Box component="dd" sx={{ m: 0, overflowWrap: 'anywhere' }}>
            {v || 'Not known'}
          </Box>
        </Box>
      ))}
    </Box>
  );
}

function Notes({ userId, notify }: { userId: string; notify: Notify }) {
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setNotes(null);
    fetch(`/api/aintra-inbox/notes?userId=${encodeURIComponent(userId)}`)
      .then((r) => (r.ok ? r.json() : { notes: [] }))
      .then((j) => !cancelled && setNotes(j.notes ?? []))
      .catch(() => !cancelled && setNotes([]));
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const save = async () => {
    const note = text.trim();
    if (!note) return;
    setSaving(true);
    try {
      const res = await fetch('/api/aintra-inbox/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, note }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Could not save the note');
      setNotes((n) => [json.note, ...(n ?? [])]);
      setText('');
      notify('Note saved');
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Could not save the note', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box sx={{ px: 2.5, py: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
      <SectionLabel>Counsellor note</SectionLabel>
      <TextField
        multiline
        minRows={3}
        size="small"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="e.g. Called, interested in 1-year program"
        inputProps={{ 'aria-label': 'Counsellor note' }}
      />
      <Button
        variant="outlined"
        size="small"
        onClick={save}
        disabled={!text.trim() || saving}
        startIcon={saving ? <CircularProgress size={14} /> : undefined}
        sx={{ alignSelf: 'flex-end', minHeight: 44 }}
      >
        Save note
      </Button>
      {notes?.map((n) => (
        <Box key={n.id} sx={{ borderTop: 1, borderColor: 'divider', pt: 1 }}>
          <Typography sx={{ fontSize: 13, whiteSpace: 'pre-line' }}>{n.note}</Typography>
          <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>
            {[n.admin_name, fmtAgo(n.created_at)].filter(Boolean).join(', ')}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}

/** Where a guest is with the automatic sign-in on their next day. */
function SignInStatus({ person }: { person: InboxPerson }) {
  if (!person.anonymousId) {
    return (
      <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>
        This chat is from before visitors were tracked across visits, so Aintra cannot recognise them when they come back.
      </Typography>
    );
  }
  if (person.gatedAt) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
        <Pill tone="primary" sx={{ alignSelf: 'flex-start', gap: 0.5 }}>
          <LockOutlinedIcon sx={{ fontSize: 14 }} aria-hidden /> Asked to sign in
        </Pill>
        <Typography sx={{ fontSize: 12, color: 'text.secondary', lineHeight: 1.5 }}>
          Came back on {fmtDate(person.gatedAt)} and was asked to sign in. Aintra answers again once they do.
        </Typography>
      </Box>
    );
  }
  return (
    <Typography sx={{ fontSize: 12, color: 'text.secondary', lineHeight: 1.5 }}>
      Aintra is free on their first day ({fmtDate(person.firstSeen)}). If they come back on a later day, it asks them to sign in
      before answering.
    </Typography>
  );
}

export default function PersonPanel({
  person,
  conversation,
  notify,
}: {
  person: InboxPerson | null;
  conversation: InboxConversation | null;
  notify: Notify;
}) {
  if (!person || !conversation) {
    return (
      <Box component="aside" aria-label="Person" sx={{ p: 3, color: 'text.secondary', fontSize: 13 }}>
        Pick a conversation to see who it is.
      </Box>
    );
  }
  const p = person;
  const source = p.channel ? sourceLabelOf(p.channel) : 'Not recorded';
  const intents = conversation.intents.length ? conversation.intents : p.intents;
  const wa = p.phone ? waNumber(p.phone) : null;

  return (
    <Box component="aside" aria-label={`About ${p.isGuest ? `guest ${p.guestTag}` : p.name}`} sx={{ display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ p: 2.5, display: 'flex', flexDirection: 'column', gap: 1.75, borderBottom: 1, borderColor: 'divider' }}>
        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
          <PersonAvatar isGuest={p.isGuest} userId={p.userId} name={p.name} src={p.avatarUrl} enrolled={p.enrolled} size={48} />
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontWeight: 700, fontSize: 16, lineHeight: 1.25 }}>{p.isGuest ? `Guest ${p.guestTag}` : p.name}</Typography>
            <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>
              {p.isGuest ? 'No account · not contactable' : p.enrolled ? 'Enrolled Neram student' : p.profileLabel ?? 'Signed in'}
            </Typography>
          </Box>
        </Box>
        {p.isGuest ? (
          <>
            <Typography sx={{ fontSize: 13, color: 'text.secondary', lineHeight: 1.5 }}>
              Only device signals are known until they sign in.
            </Typography>
            <SignInStatus person={p} />
          </>
        ) : (
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button
              variant="contained"
              startIcon={<CallIcon />}
              href={p.phone ? `tel:${p.phone.replace(/[^\d+]/g, '')}` : undefined}
              disabled={!p.phone}
              sx={{ flex: 1, minHeight: 44 }}
            >
              Call
            </Button>
            <Button
              component="a"
              variant="outlined"
              startIcon={<WhatsAppIcon />}
              href={wa ? `https://wa.me/${wa}` : undefined}
              target="_blank"
              rel="noopener noreferrer"
              disabled={!wa}
              sx={{ flex: 1, minHeight: 44 }}
            >
              WhatsApp
            </Button>
          </Box>
        )}
      </Box>

      {p.isGuest ? (
        <Facts
          rows={[
            ['Location', p.place],
            ['Came from', source],
            ['Device', p.device],
            ['Visits', `${p.visits} (first seen ${fmtDate(p.firstSeen)})`],
          ]}
        />
      ) : (
        <Facts
          rows={[
            ['Phone', p.phone],
            ['Email', p.email],
            ['Location', p.place],
            ['Came from', source],
            ['Joined', p.joinedAt ? fmtDate(p.joinedAt, true) : null],
            ['Chats', `${p.visits} ${p.visits === 1 ? 'conversation' : 'conversations'}`],
          ]}
        />
      )}

      <Box sx={{ px: 2.5, py: 2, display: 'flex', flexDirection: 'column', gap: 1.25, borderBottom: p.isGuest ? 0 : 1, borderColor: 'divider' }}>
        <SectionLabel>Intent</SectionLabel>
        <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
          {intents.length ? (
            intents.map((i) => (
              <Pill key={i} tone="primary">
                {INTENT_LABELS[i]}
              </Pill>
            ))
          ) : (
            <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>No clear intent yet</Typography>
          )}
        </Box>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>Lead stage</Typography>
          <Typography sx={{ fontWeight: 600, ...STAGE_TONE[p.stage] }}>{p.stage}</Typography>
        </Box>
      </Box>

      {!p.isGuest && p.userId && <Notes userId={p.userId} notify={notify} />}
    </Box>
  );
}
