'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
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
  FormControl,
  FormControlLabel,
  FormLabel,
  IconButton,
  InputAdornment,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Paper,
  Radio,
  RadioGroup,
  Skeleton,
  Snackbar,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import ManageAccountsIcon from '@mui/icons-material/ManageAccounts';
import AddLinkIcon from '@mui/icons-material/AddLink';
import PersonAddAlt1Icon from '@mui/icons-material/PersonAddAlt1';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import SendIcon from '@mui/icons-material/Send';
import BadgeIcon from '@mui/icons-material/Badge';
import PersonOffIcon from '@mui/icons-material/PersonOff';
import HowToRegIcon from '@mui/icons-material/HowToReg';
import SearchIcon from '@mui/icons-material/Search';
import InboxIcon from '@mui/icons-material/Inbox';
import { useMicrosoftAuth } from '@neram/auth';
import CollegeSearchField, { type CollegeSearchOption } from '@/components/college-hub/CollegeSearchField';
import { HubPageHeader, TierChip, formatDate, formatDateTime } from '@/components/college-hub/hub-ui';
import {
  COLLEGE_ROLES,
  ROLE_DESCRIPTION,
  ROLE_LABEL,
  accountStatus,
  removesLastOwner,
  type AccountStatus,
  type CollegeRole,
} from '@/lib/college-accounts/invite';

interface AccountRow {
  id: string;
  college_id: string;
  name: string;
  email: string;
  phone: string | null;
  designation: string | null;
  role: string;
  is_active: boolean;
  invited_at: string | null;
  invited_by: string | null;
  accepted_at: string | null;
  last_login_at: string | null;
  created_at: string;
  college_name: string;
  college_slug: string;
  college_tier: string;
}

interface AccountRequest {
  id: string;
  college_name: string;
  college_id: string | null;
  name: string;
  email: string;
  phone: string | null;
  designation: string | null;
  message: string | null;
  created_at: string;
  colleges: { name: string; slug: string } | null;
}

interface InviteResult {
  name: string;
  invite_link: string;
  email_note: string;
  email_sent: boolean;
}

const STATUS_LABEL: Record<AccountStatus, string> = {
  invited: 'Invited, waiting',
  active: 'Active',
  deactivated: 'Deactivated',
};
const STATUS_COLOR: Record<AccountStatus, 'warning' | 'success' | 'default'> = {
  invited: 'warning',
  active: 'success',
  deactivated: 'default',
};

function roleLabel(role: string): string {
  return (ROLE_LABEL as Record<string, string>)[role] ?? role;
}

async function send(method: string, url: string, body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error((json.error as string) || `Request failed (${res.status})`);
  return json;
}

function RolePicker({ value, onChange }: { value: CollegeRole; onChange: (r: CollegeRole) => void }) {
  return (
    <FormControl>
      <FormLabel id="role-label" sx={{ mb: 0.5 }}>
        Role
      </FormLabel>
      <RadioGroup aria-labelledby="role-label" value={value} onChange={(e) => onChange(e.target.value as CollegeRole)}>
        {COLLEGE_ROLES.map((r) => (
          <FormControlLabel
            key={r}
            value={r}
            control={<Radio />}
            sx={{ alignItems: 'flex-start', mb: 0.5, '& .MuiRadio-root': { mt: -0.5 } }}
            label={
              <Box>
                <Typography variant="body2" fontWeight={600}>
                  {ROLE_LABEL[r]}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {ROLE_DESCRIPTION[r]}
                </Typography>
              </Box>
            }
          />
        ))}
      </RadioGroup>
    </FormControl>
  );
}

interface InvitePrefill {
  college: CollegeSearchOption | null;
  name?: string;
  email?: string;
  phone?: string;
  designation?: string;
  request_id?: string;
}

function InviteDialog({
  prefill,
  onClose,
  onDone,
}: {
  prefill: InvitePrefill | null;
  onClose: () => void;
  onDone: (r: InviteResult) => void;
}) {
  const { user } = useMicrosoftAuth();
  const [college, setCollege] = useState<CollegeSearchOption | null>(null);
  const [form, setForm] = useState({ name: '', email: '', phone: '', designation: '' });
  const [role, setRole] = useState<CollegeRole>('owner');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!prefill) return;
    setCollege(prefill.college);
    setForm({
      name: prefill.name ?? '',
      email: prefill.email ?? '',
      phone: prefill.phone ?? '',
      designation: prefill.designation ?? '',
    });
    setRole(prefill.request_id ? 'owner' : prefill.college ? 'editor' : 'owner');
    setError('');
  }, [prefill]);

  const submit = async () => {
    if (!college) return setError('Choose a college.');
    if (!form.name.trim()) return setError('Enter the person\'s name.');
    if (!form.email.trim()) return setError('Enter their email address.');
    setSaving(true);
    setError('');
    try {
      const j = await send('POST', '/api/college-hub/accounts', {
        college_id: college.id,
        ...form,
        role,
        request_id: prefill?.request_id,
        staff_name: user?.name || user?.email,
        staff_email: user?.email,
      });
      onDone({
        name: form.name.trim(),
        invite_link: j.invite_link as string,
        email_note: j.email_note as string,
        email_sent: Boolean(j.email_sent),
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <Dialog open={Boolean(prefill)} onClose={() => !saving && onClose()} maxWidth="sm" fullWidth>
      <DialogTitle>Invite person</DialogTitle>
      <DialogContent>
        <Stack gap={2} sx={{ pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <CollegeSearchField label="College" required value={college} onChange={setCollege} />
          <TextField label="Name" required size="small" value={form.name} onChange={set('name')} autoComplete="off" />
          <TextField
            label="Email"
            required
            size="small"
            type="email"
            value={form.email}
            onChange={set('email')}
            helperText="They sign in with this email. One email can manage one college."
          />
          <Stack direction={{ xs: 'column', sm: 'row' }} gap={2}>
            <TextField label="Phone" size="small" fullWidth value={form.phone} onChange={set('phone')} inputProps={{ inputMode: 'tel' }} />
            <TextField
              label="Designation"
              size="small"
              fullWidth
              value={form.designation}
              onChange={set('designation')}
              helperText="For example Principal or Admissions head"
            />
          </Stack>
          <RolePicker value={role} onChange={setRole} />
          <Alert severity="info" sx={{ py: 0.5 }}>
            They get an email with a link to set their own password. You also get the link here to share on WhatsApp. It works once
            and expires in 24 hours.
          </Alert>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={submit}
          disabled={saving}
          startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <SendIcon />}
        >
          {saving ? 'Sending...' : 'Send invite'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function ChangeRoleDialog({ account, onClose, onDone }: { account: AccountRow; onClose: () => void; onDone: (msg: string) => void }) {
  const [role, setRole] = useState<CollegeRole>((COLLEGE_ROLES as readonly string[]).includes(account.role) ? (account.role as CollegeRole) : 'editor');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const submit = async () => {
    setSaving(true);
    setError('');
    try {
      await send('PATCH', '/api/college-hub/accounts', { id: account.id, action: 'set_role', role });
      onDone(`${account.name} is now ${ROLE_LABEL[role]}.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog open onClose={() => !saving && onClose()} maxWidth="xs" fullWidth>
      <DialogTitle>Change role</DialogTitle>
      <DialogContent>
        <Stack gap={2} sx={{ pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <Typography variant="body2" color="text.secondary">
            {account.name}, {account.college_name}
          </Typography>
          <RolePicker value={role} onChange={setRole} />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={submit}
          disabled={saving || role === account.role}
          startIcon={saving ? <CircularProgress size={16} color="inherit" /> : undefined}
        >
          {saving ? 'Saving...' : 'Save role'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function DeactivateDialog({
  account,
  lastOwner,
  onClose,
  onDone,
}: {
  account: AccountRow;
  lastOwner: boolean;
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const submit = async () => {
    setSaving(true);
    setError('');
    try {
      await send('PATCH', '/api/college-hub/accounts', { id: account.id, action: 'deactivate' });
      onDone(`${account.name} can no longer sign in.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog open onClose={() => !saving && onClose()} maxWidth="xs" fullWidth>
      <DialogTitle>Deactivate {account.name}?</DialogTitle>
      <DialogContent>
        <Stack gap={2} sx={{ pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <Typography variant="body2">
            They can no longer sign in to the {account.college_name} dashboard. You can reactivate them later.
          </Typography>
          {lastOwner && (
            <Alert severity="warning">
              This is the only active owner. Nobody at the college will be able to manage their team until you add or reactivate
              an owner.
            </Alert>
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button
          variant="contained"
          color="error"
          onClick={submit}
          disabled={saving}
          startIcon={saving ? <CircularProgress size={16} color="inherit" /> : undefined}
        >
          {saving ? 'Saving...' : 'Deactivate'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function InviteResultBanner({ result, onClose }: { result: InviteResult; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(result.invite_link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };
  return (
    <Alert severity={result.email_sent ? 'success' : 'info'} onClose={onClose} sx={{ mb: 2, '& .MuiAlert-message': { width: '100%' } }}>
      <Typography variant="body2" fontWeight={600}>
        Invite ready for {result.name}. {result.email_note}.
      </Typography>
      <Typography variant="caption" color="text.secondary" component="div" sx={{ mb: 1 }}>
        You can also paste this link into WhatsApp. It works once and expires in 24 hours.
      </Typography>
      <TextField
        value={result.invite_link}
        size="small"
        fullWidth
        label="Invite link"
        InputProps={{
          readOnly: true,
          endAdornment: (
            <InputAdornment position="end">
              <Tooltip title={copied ? 'Copied' : 'Copy link'}>
                <IconButton onClick={copy} aria-label="Copy invite link" edge="end" sx={{ width: 44, height: 44 }}>
                  <ContentCopyIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </InputAdornment>
          ),
        }}
        onFocus={(e) => e.target.select()}
      />
      {copied && (
        <Typography variant="caption" color="success.main" role="status">
          Link copied.
        </Typography>
      )}
    </Alert>
  );
}

export default function CollegeAccountsPage() {
  const [rows, setRows] = useState<AccountRow[]>([]);
  const [requests, setRequests] = useState<AccountRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [invite, setInvite] = useState<InvitePrefill | null>(null);
  const [result, setResult] = useState<InviteResult | null>(null);
  const [toast, setToast] = useState('');
  const [menu, setMenu] = useState<{ anchor: HTMLElement; account: AccountRow } | null>(null);
  const [roleFor, setRoleFor] = useState<AccountRow | null>(null);
  const [deactivateFor, setDeactivateFor] = useState<AccountRow | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/college-hub/accounts', { cache: 'no-store' });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Could not load accounts');
      setRows(j.data ?? []);
      setRequests(j.requests ?? []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const groups = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = term
      ? rows.filter((r) => [r.name, r.email, r.college_name, r.designation ?? ''].some((v) => v.toLowerCase().includes(term)))
      : rows;
    const map = new Map<string, { college_id: string; name: string; tier: string; people: AccountRow[] }>();
    for (const r of filtered) {
      const g = map.get(r.college_id) ?? { college_id: r.college_id, name: r.college_name, tier: r.college_tier, people: [] };
      g.people.push(r);
      map.set(r.college_id, g);
    }
    const order: Record<AccountStatus, number> = { active: 0, invited: 1, deactivated: 2 };
    return Array.from(map.values())
      .map((g) => ({
        ...g,
        people: g.people.sort(
          (a, b) =>
            order[accountStatus(a)] - order[accountStatus(b)] ||
            (a.role === 'owner' ? 0 : 1) - (b.role === 'owner' ? 0 : 1) ||
            a.name.localeCompare(b.name),
        ),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [rows, search]);

  const resend = async (a: AccountRow) => {
    setBusyId(a.id);
    try {
      const j = await send('PATCH', '/api/college-hub/accounts', { id: a.id, action: 'resend' });
      setResult({ name: a.name, invite_link: j.invite_link as string, email_note: j.email_note as string, email_sent: Boolean(j.email_sent) });
      window.scrollTo({ top: 0, behavior: 'smooth' });
      load();
    } catch (e) {
      setToast((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const reactivate = async (a: AccountRow) => {
    setBusyId(a.id);
    try {
      await send('PATCH', '/api/college-hub/accounts', { id: a.id, action: 'reactivate' });
      setToast(`${a.name} can sign in again.`);
      load();
    } catch (e) {
      setToast((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const decline = async (r: AccountRequest) => {
    setBusyId(r.id);
    try {
      await send('PATCH', '/api/college-hub/account-requests', { id: r.id, status: 'declined' });
      setToast(`Request from ${r.name} declined.`);
      load();
    } catch (e) {
      setToast((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const isLastOwner = (a: AccountRow) => removesLastOwner(rows, a, { is_active: false });
  const menuAccount = menu?.account;

  return (
    <Box>
      <HubPageHeader
        icon={<ManageAccountsIcon />}
        title="Accounts"
        description="People who sign in to a college dashboard. Invite someone and they get an email link to set their own password. Owners can also invite their own team from the dashboard."
        actions={
          <Button variant="contained" startIcon={<PersonAddAlt1Icon />} onClick={() => setInvite({ college: null })} sx={{ minHeight: 44 }}>
            Invite person
          </Button>
        }
      />

      {result && <InviteResultBanner result={result} onClose={() => setResult(null)} />}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} action={<Button onClick={load}>Retry</Button>}>
          {error}
        </Alert>
      )}

      {requests.length > 0 && (
        <Paper variant="outlined" sx={{ p: 2, mb: 3, borderColor: 'warning.light' }}>
          <Stack direction="row" alignItems="center" gap={1} sx={{ mb: 1.5 }}>
            <InboxIcon color="warning" />
            <Typography variant="h6" component="h2">
              Account requests ({requests.length})
            </Typography>
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Sent from the college dashboard sign-in page. Check the person works at the college before creating an account.
          </Typography>
          <Stack gap={1.5}>
            {requests.map((r) => (
              <Paper key={r.id} variant="outlined" sx={{ p: 1.5 }}>
                <Stack direction={{ xs: 'column', md: 'row' }} gap={2} justifyContent="space-between" alignItems={{ md: 'center' }}>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="body2" fontWeight={600}>
                      {r.name}
                      {r.designation ? `, ${r.designation}` : ''}
                    </Typography>
                    <Typography variant="body2">
                      {r.colleges?.name ?? r.college_name}
                      {!r.college_id && (
                        <Typography component="span" variant="caption" color="warning.main">
                          {' '}
                          (not matched to a college yet)
                        </Typography>
                      )}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" component="div">
                      {r.email}
                      {r.phone ? `, ${r.phone}` : ''}. Asked {formatDateTime(r.created_at)}
                    </Typography>
                    {r.message && (
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, fontStyle: 'italic' }}>
                        &quot;{r.message}&quot;
                      </Typography>
                    )}
                  </Box>
                  <Stack direction="row" gap={1} flexShrink={0}>
                    <Button
                      variant="contained"
                      size="small"
                      sx={{ minHeight: 40 }}
                      startIcon={<HowToRegIcon />}
                      onClick={() =>
                        setInvite({
                          college: r.college_id ? { id: r.college_id, name: r.colleges?.name ?? r.college_name } : null,
                          name: r.name,
                          email: r.email,
                          phone: r.phone ?? '',
                          designation: r.designation ?? '',
                          request_id: r.id,
                        })
                      }
                    >
                      Create account
                    </Button>
                    <Button
                      variant="outlined"
                      size="small"
                      color="inherit"
                      sx={{ minHeight: 40 }}
                      disabled={busyId === r.id}
                      onClick={() => decline(r)}
                    >
                      {busyId === r.id ? 'Declining...' : 'Decline'}
                    </Button>
                  </Stack>
                </Stack>
              </Paper>
            ))}
          </Stack>
        </Paper>
      )}

      <TextField
        label="Search people or colleges"
        size="small"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        sx={{ mb: 2, width: { xs: '100%', sm: 360 } }}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon fontSize="small" />
            </InputAdornment>
          ),
        }}
      />

      {loading && (
        <Stack gap={2}>
          {[0, 1].map((i) => (
            <Skeleton key={i} variant="rounded" height={140} />
          ))}
        </Stack>
      )}

      {!loading && !error && groups.length === 0 && (
        <Paper variant="outlined" sx={{ p: 4, textAlign: 'center' }}>
          <Typography color="text.secondary" sx={{ mb: 1 }}>
            {search ? 'Nobody matches that search.' : 'No college accounts yet.'}
          </Typography>
          {!search && (
            <Button startIcon={<PersonAddAlt1Icon />} onClick={() => setInvite({ college: null })}>
              Invite the first person
            </Button>
          )}
        </Paper>
      )}

      <Stack gap={2.5}>
        {!loading &&
          groups.map((g) => (
            <Paper key={g.college_id} variant="outlined">
              <Stack
                direction={{ xs: 'column', sm: 'row' }}
                alignItems={{ sm: 'center' }}
                justifyContent="space-between"
                gap={1}
                sx={{ px: 2, py: 1.5, bgcolor: 'action.hover' }}
              >
                <Stack direction="row" alignItems="center" gap={1.5} flexWrap="wrap">
                  <Typography variant="subtitle1" component="h2" fontWeight={700}>
                    {g.name}
                  </Typography>
                  <TierChip tier={g.tier} />
                  <Typography variant="caption" color="text.secondary">
                    {g.people.length} {g.people.length === 1 ? 'person' : 'people'}
                  </Typography>
                </Stack>
                <Stack direction="row" gap={1} flexWrap="wrap">
                  <Button
                    size="small"
                    component={Link}
                    href={`/college-hub/update-links?college_id=${g.college_id}`}
                    startIcon={<AddLinkIcon />}
                    sx={{ minHeight: 40 }}
                  >
                    Send update link
                  </Button>
                  <Button
                    size="small"
                    startIcon={<PersonAddAlt1Icon />}
                    onClick={() => setInvite({ college: { id: g.college_id, name: g.name } })}
                    sx={{ minHeight: 40 }}
                  >
                    Invite person
                  </Button>
                </Stack>
              </Stack>
              <TableContainer sx={{ overflowX: 'auto' }}>
                <Table size="small" sx={{ minWidth: 820 }}>
                  <TableHead>
                    <TableRow>
                      <TableCell>Name</TableCell>
                      <TableCell>Email</TableCell>
                      <TableCell>Role</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell>Last sign-in</TableCell>
                      <TableCell align="right">Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {g.people.map((a) => {
                      const status = accountStatus(a);
                      return (
                        <TableRow key={a.id} hover sx={{ opacity: status === 'deactivated' ? 0.7 : 1 }}>
                          <TableCell>
                            <Typography variant="body2" fontWeight={600}>
                              {a.name}
                            </Typography>
                            {a.designation && (
                              <Typography variant="caption" color="text.secondary">
                                {a.designation}
                              </Typography>
                            )}
                          </TableCell>
                          <TableCell sx={{ wordBreak: 'break-all' }}>{a.email}</TableCell>
                          <TableCell>
                            <Chip size="small" variant="outlined" label={roleLabel(a.role)} color={a.role === 'owner' ? 'primary' : 'default'} />
                          </TableCell>
                          <TableCell>
                            <Tooltip title={a.invited_at ? `Invited ${formatDate(a.invited_at)}${a.invited_by ? ` by ${a.invited_by}` : ''}` : ''}>
                              <Chip size="small" label={STATUS_LABEL[status]} color={STATUS_COLOR[status]} />
                            </Tooltip>
                          </TableCell>
                          <TableCell sx={{ whiteSpace: 'nowrap' }}>{a.last_login_at ? formatDateTime(a.last_login_at) : 'Never'}</TableCell>
                          <TableCell align="right">
                            {busyId === a.id ? (
                              <CircularProgress size={20} aria-label="Working" sx={{ m: 1.5 }} />
                            ) : (
                              <IconButton
                                aria-label={`Actions for ${a.name}`}
                                onClick={(e) => setMenu({ anchor: e.currentTarget, account: a })}
                                sx={{ width: 44, height: 44 }}
                              >
                                <MoreVertIcon />
                              </IconButton>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          ))}
      </Stack>

      <Menu anchorEl={menu?.anchor} open={Boolean(menu)} onClose={() => setMenu(null)}>
        {menuAccount?.is_active && (
          <MenuItem
            sx={{ minHeight: 44 }}
            onClick={() => {
              const a = menuAccount;
              setMenu(null);
              resend(a);
            }}
          >
            <ListItemIcon>
              <SendIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText primary={accountStatus(menuAccount) === 'invited' ? 'Resend invite' : 'Send a new sign-in link'} />
          </MenuItem>
        )}
        <MenuItem
          sx={{ minHeight: 44 }}
          onClick={() => {
            setRoleFor(menuAccount ?? null);
            setMenu(null);
          }}
        >
          <ListItemIcon>
            <BadgeIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText primary="Change role" />
        </MenuItem>
        {menuAccount?.is_active ? (
          <MenuItem
            sx={{ minHeight: 44, color: 'error.main' }}
            onClick={() => {
              setDeactivateFor(menuAccount);
              setMenu(null);
            }}
          >
            <ListItemIcon>
              <PersonOffIcon fontSize="small" color="error" />
            </ListItemIcon>
            <ListItemText primary="Deactivate" />
          </MenuItem>
        ) : (
          <MenuItem
            sx={{ minHeight: 44 }}
            onClick={() => {
              const a = menuAccount;
              setMenu(null);
              if (a) reactivate(a);
            }}
          >
            <ListItemIcon>
              <HowToRegIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText primary="Reactivate" />
          </MenuItem>
        )}
      </Menu>

      <InviteDialog
        prefill={invite}
        onClose={() => setInvite(null)}
        onDone={(r) => {
          setInvite(null);
          setResult(r);
          load();
        }}
      />
      {roleFor && (
        <ChangeRoleDialog
          account={roleFor}
          onClose={() => setRoleFor(null)}
          onDone={(msg) => {
            setRoleFor(null);
            setToast(msg);
            load();
          }}
        />
      )}
      {deactivateFor && (
        <DeactivateDialog
          account={deactivateFor}
          lastOwner={isLastOwner(deactivateFor)}
          onClose={() => setDeactivateFor(null)}
          onDone={(msg) => {
            setDeactivateFor(null);
            setToast(msg);
            load();
          }}
        />
      )}

      <Snackbar
        open={Boolean(toast)}
        autoHideDuration={5000}
        onClose={() => setToast('')}
        message={toast}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </Box>
  );
}
