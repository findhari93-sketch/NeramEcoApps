'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Menu, MenuItem,
  Skeleton, Stack, TextField, Typography, useMediaQuery, useTheme,
} from '@mui/material';
import PersonAddAlt1OutlinedIcon from '@mui/icons-material/PersonAddAlt1Outlined';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { useCollegeDashboard } from '../context';
import { Card, PageHeader, formatDay } from '../ui';
import { ROLE_HELP, ROLE_LABEL, can, type CollegeRole } from '@/lib/college-dashboard/permissions';

interface Person {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  designation: string | null;
  role: CollegeRole;
  is_active: boolean;
  invited_at: string | null;
  accepted_at: string | null;
  last_login_at: string | null;
  is_me: boolean;
}

type InviteResult = { invite_link: string; email: { sent: boolean; reason?: string } };

function status(p: Person): { label: string; color: 'default' | 'success' | 'warning' } {
  if (!p.is_active) return { label: 'Switched off', color: 'default' };
  if (!p.accepted_at) return { label: 'Invite sent', color: 'warning' };
  return { label: 'Active', color: 'success' };
}

function LinkBox({ result, name }: { result: InviteResult; name: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Alert severity={result.email.sent ? 'success' : 'info'} sx={{ '& .MuiAlert-message': { minWidth: 0, width: '100%' } }}>
      <Typography sx={{ fontSize: 14.5, mb: 1 }}>
        {result.email.sent ? `We emailed ${name} a link to set up their account.` : `The email was not sent (${result.email.reason}). Share this link with ${name} yourself.`} The link works once, for 24 hours.
      </Typography>
      <Stack direction="row" gap={1} alignItems="center">
        <Box component="code" sx={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12.5, bgcolor: 'background.paper', p: 1, borderRadius: 1 }}>
          {result.invite_link}
        </Box>
        <Button
          size="small"
          startIcon={<ContentCopyIcon />}
          onClick={() => void navigator.clipboard.writeText(result.invite_link).then(() => setCopied(true))}
          sx={{ minHeight: 40, flexShrink: 0 }}
        >
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </Stack>
    </Alert>
  );
}

function InviteDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const { api } = useCollegeDashboard();
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down('sm'));
  const [form, setForm] = useState({ name: '', email: '', designation: '', phone: '', role: 'editor' as CollegeRole });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<InviteResult | null>(null);

  const close = () => {
    setForm({ name: '', email: '', designation: '', phone: '', role: 'editor' });
    setError('');
    setResult(null);
    onClose();
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const r = await api<InviteResult>('/api/college-dashboard/team', { body: form });
    setBusy(false);
    if (!r.ok) return setError(r.data.error ?? 'Could not send the invite.');
    setResult(r.data);
    onDone();
  };

  return (
    <Dialog open={open} onClose={close} fullScreen={phone} fullWidth maxWidth="sm">
      <form onSubmit={submit} noValidate>
        <DialogTitle>Invite a teammate</DialogTitle>
        <DialogContent>
          {result ? (
            <LinkBox result={result} name={form.name} />
          ) : (
            <Stack gap={2} sx={{ pt: 1 }}>
              {error && <Alert severity="error">{error}</Alert>}
              <TextField label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoComplete="off" required fullWidth autoFocus />
              <TextField label="Work email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required fullWidth />
              <TextField label="Role at the college (optional)" value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} placeholder="For example Admissions officer" fullWidth />
              <TextField label="Phone (optional)" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} inputProps={{ inputMode: 'tel' }} fullWidth />
              <TextField select label="Access" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as CollegeRole })} fullWidth>
                {(['owner', 'editor', 'viewer'] as CollegeRole[]).map((r) => (
                  <MenuItem key={r} value={r} sx={{ minHeight: 48, display: 'block' }}>
                    <Typography sx={{ fontWeight: 600 }}>{ROLE_LABEL[r]}</Typography>
                    <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>{ROLE_HELP[r]}</Typography>
                  </MenuItem>
                ))}
              </TextField>
            </Stack>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={close} sx={{ minHeight: 44 }}>{result ? 'Done' : 'Cancel'}</Button>
          {!result && (
            <Button type="submit" variant="contained" disabled={busy} sx={{ minHeight: 44 }}>
              {busy ? 'Sending' : 'Send invite'}
            </Button>
          )}
        </DialogActions>
      </form>
    </Dialog>
  );
}

export default function CollegeTeamPage() {
  const { api, collegeAdmin } = useCollegeDashboard();
  const [people, setPeople] = useState<Person[] | null>(null);
  const [error, setError] = useState('');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [menu, setMenu] = useState<{ anchor: HTMLElement; person: Person } | null>(null);
  const [resent, setResent] = useState<{ result: InviteResult; name: string } | null>(null);
  const isOwner = can(collegeAdmin?.role, 'manage_team');

  const load = useCallback(async () => {
    const r = await api<{ people: Person[] }>('/api/college-dashboard/team');
    if (r.ok) setPeople(r.data.people);
    else setError(r.data.error ?? 'Could not load your team.');
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (person: Person, body: Record<string, unknown>) => {
    setMenu(null);
    setError('');
    const r = await api<InviteResult>('/api/college-dashboard/team', { method: 'PATCH', body: { id: person.id, ...body } });
    if (!r.ok) return setError(r.data.error ?? 'Could not save.');
    if (body.action === 'resend') setResent({ result: r.data, name: person.name });
    await load();
  };

  return (
    <Stack gap={2}>
      <PageHeader
        title="Your team"
        intro="Everyone at your college who can use this dashboard. Owners can invite people and change access."
        action={
          isOwner && (
            <Button variant="contained" startIcon={<PersonAddAlt1OutlinedIcon />} onClick={() => setInviteOpen(true)} sx={{ minHeight: 44 }}>
              Invite a teammate
            </Button>
          )
        }
      />
      {!isOwner && <Alert severity="info">Only owners can invite people. Ask an owner, or write to support@neramclasses.com and we will add them.</Alert>}
      {error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}
      {resent && <LinkBox result={resent.result} name={resent.name} />}
      {!people && !error && <Skeleton variant="rounded" height={160} />}
      {people && (
        <Card sx={{ p: 0 }}>
          <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
            {people.map((p) => {
              const st = status(p);
              return (
                <Box component="li" key={p.id} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 2, py: 1.5, borderTop: '1px solid', borderColor: 'divider', '&:first-of-type': { borderTop: 0 }, opacity: p.is_active ? 1 : 0.65 }}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Stack direction="row" gap={1} alignItems="center" flexWrap="wrap">
                      <Typography sx={{ fontWeight: 700 }}>{p.name}{p.is_me ? ' (you)' : ''}</Typography>
                      <Chip size="small" label={ROLE_LABEL[p.role]} variant="outlined" />
                      <Chip size="small" label={st.label} color={st.color} variant={st.color === 'default' ? 'outlined' : 'filled'} />
                    </Stack>
                    <Typography sx={{ fontSize: 14, color: 'text.secondary', overflowWrap: 'anywhere' }}>
                      {[p.designation, p.email].filter(Boolean).join(' · ')}
                    </Typography>
                    <Typography sx={{ fontSize: 12.5, color: 'text.secondary' }}>
                      {p.last_login_at ? `Last signed in ${formatDay(p.last_login_at)}` : p.invited_at ? `Invited ${formatDay(p.invited_at)}` : ''}
                    </Typography>
                  </Box>
                  {isOwner && !p.is_me && (
                    <IconButton aria-label={`Options for ${p.name}`} onClick={(e) => setMenu({ anchor: e.currentTarget, person: p })} sx={{ width: 44, height: 44 }}>
                      <MoreVertIcon />
                    </IconButton>
                  )}
                </Box>
              );
            })}
          </Box>
        </Card>
      )}

      <Menu anchorEl={menu?.anchor} open={!!menu} onClose={() => setMenu(null)}>
        {menu && !menu.person.accepted_at && menu.person.is_active && (
          <MenuItem onClick={() => void act(menu.person, { action: 'resend' })} sx={{ minHeight: 44 }}>Send a new invite link</MenuItem>
        )}
        {menu && menu.person.accepted_at && menu.person.is_active && (
          <MenuItem onClick={() => void act(menu.person, { action: 'resend' })} sx={{ minHeight: 44 }}>Send a sign-in link</MenuItem>
        )}
        {menu &&
          (['owner', 'editor', 'viewer'] as CollegeRole[])
            .filter((r) => r !== menu.person.role)
            .map((r) => (
              <MenuItem key={r} onClick={() => void act(menu.person, { action: 'set_role', role: r })} sx={{ minHeight: 44 }}>
                Make {ROLE_LABEL[r].toLowerCase()}
              </MenuItem>
            ))}
        {menu && (
          <MenuItem
            onClick={() => void act(menu.person, { action: menu.person.is_active ? 'deactivate' : 'reactivate' })}
            sx={{ minHeight: 44, color: menu.person.is_active ? 'error.main' : undefined }}
          >
            {menu.person.is_active ? 'Switch off access' : 'Switch access back on'}
          </MenuItem>
        )}
      </Menu>

      <InviteDialog open={inviteOpen} onClose={() => setInviteOpen(false)} onDone={() => void load()} />
    </Stack>
  );
}
