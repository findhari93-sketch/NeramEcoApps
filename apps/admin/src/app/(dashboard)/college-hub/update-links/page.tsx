'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  FormGroup,
  FormHelperText,
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
  Snackbar,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AddLinkIcon from '@mui/icons-material/AddLink';
import LinkIcon from '@mui/icons-material/Link';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckIcon from '@mui/icons-material/Check';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import EventRepeatIcon from '@mui/icons-material/EventRepeat';
import BlockIcon from '@mui/icons-material/Block';
import RateReviewIcon from '@mui/icons-material/RateReview';
import { useMicrosoftAuth } from '@neram/auth';
import CollegeSearchField, { type CollegeSearchOption } from '@/components/college-hub/CollegeSearchField';
import { HubPageHeader, TableSkeletonRows, formatDate, formatDateTime } from '@/components/college-hub/hub-ui';
import {
  DEFAULT_UPDATE_LINK_DAYS,
  DEFAULT_UPDATE_LINK_SECTIONS,
  EXTEND_DAYS,
  LINK_STATUS_LABEL,
  UPDATE_LINK_DAYS,
  UPDATE_LINK_SECTIONS,
  UPDATE_LINK_SECTION_LABEL,
  formatIndianMobile,
  isUpdateLinkSection,
  normaliseIndianMobile,
  type LinkStatus,
  type UpdateLinkDays,
  type UpdateLinkSection,
} from '@/lib/college-update-links/helpers';

interface LinkCollege {
  id: string;
  name: string;
  slug: string | null;
  state_slug: string | null;
  city: string | null;
}

interface UpdateLink {
  id: string;
  college_id: string;
  sections: string[];
  recipient_name: string | null;
  recipient_phone: string | null;
  note: string | null;
  created_by: string | null;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
  revoked_by: string | null;
  first_opened_at: string | null;
  last_opened_at: string | null;
  open_count: number;
  submitted_at: string | null;
  submit_count: number;
  status: LinkStatus;
  college: LinkCollege | null;
  pending_reviews: number;
}

interface Prefill {
  college: CollegeSearchOption | null;
  recipient_name: string;
  recipient_phone: string;
  sections: UpdateLinkSection[];
  replace_link_id: string | null;
}

interface Created {
  url: string;
  message: string;
  whatsapp_url: string;
  collegeName: string;
}

type Filter = 'all' | 'waiting' | 'submitted' | 'closed';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'waiting', label: 'Waiting' },
  { key: 'submitted', label: 'Submitted' },
  { key: 'closed', label: 'Expired or cancelled' },
];

function inFilter(status: LinkStatus, f: Filter): boolean {
  if (f === 'all') return true;
  if (f === 'waiting') return status === 'not_opened' || status === 'opened';
  if (f === 'submitted') return status === 'submitted';
  return status === 'expired' || status === 'cancelled';
}

const STATUS_COLOR: Record<LinkStatus, 'default' | 'info' | 'success' | 'warning'> = {
  not_opened: 'default',
  opened: 'info',
  submitted: 'success',
  expired: 'warning',
  cancelled: 'default',
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const EMPTY_PREFILL: Prefill = {
  college: null,
  recipient_name: '',
  recipient_phone: '',
  sections: DEFAULT_UPDATE_LINK_SECTIONS,
  replace_link_id: null,
};

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  return (
    <Button
      size="small"
      variant="outlined"
      startIcon={state === 'copied' ? <CheckIcon /> : <ContentCopyIcon />}
      onClick={async () => {
        const ok = await copyText(text);
        setState(ok ? 'copied' : 'failed');
        setTimeout(() => setState('idle'), 2500);
      }}
      sx={{ minHeight: 40, whiteSpace: 'nowrap' }}
    >
      {state === 'copied' ? 'Copied' : state === 'failed' ? 'Select and copy' : label}
    </Button>
  );
}

function CreateLinkDialog({
  prefill,
  onClose,
  onCreated,
}: {
  prefill: Prefill;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { user } = useMicrosoftAuth();
  const [college, setCollege] = useState<CollegeSearchOption | null>(prefill.college);
  const [name, setName] = useState(prefill.recipient_name);
  const [phone, setPhone] = useState(prefill.recipient_phone);
  const [sections, setSections] = useState<UpdateLinkSection[]>(prefill.sections);
  const [days, setDays] = useState<UpdateLinkDays>(DEFAULT_UPDATE_LINK_DAYS);
  const [note, setNote] = useState('');
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState<Created | null>(null);

  const phoneError = phone.trim() !== '' && !normaliseIndianMobile(phone);
  const sectionsError = sections.length === 0;
  const collegeError = !college;

  const toggle = (s: UpdateLinkSection) =>
    setSections((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : UPDATE_LINK_SECTIONS.filter((x) => x === s || cur.includes(x))));

  const submit = async () => {
    setTouched(true);
    if (collegeError || phoneError || sectionsError || !college) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/college-hub/update-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          college_id: college.id,
          recipient_name: name,
          recipient_phone: phone,
          sections,
          expires_in_days: days,
          note,
          replace_link_id: prefill.replace_link_id,
          staff_name: user?.name || user?.email,
          staff_email: user?.email,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Could not make the link');
      setCreated({ url: j.url, message: j.message, whatsapp_url: j.whatsapp_url, collegeName: college.name });
      onCreated();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onClose={() => !saving && onClose()} maxWidth="sm" fullWidth aria-labelledby="create-link-title">
      <DialogTitle id="create-link-title">
        {created ? `Link ready for ${created.collegeName}` : prefill.replace_link_id ? 'Make a new link' : 'Create update link'}
      </DialogTitle>
      {created ? (
        <>
          <DialogContent>
            <Stack gap={2.5} sx={{ pt: 1 }}>
              <Alert severity="success">
                Nothing is sent until you press send in WhatsApp. This link is shown only now, so copy it before you close.
              </Alert>
              <Stack direction="row" gap={1} alignItems="flex-start">
                <TextField
                  label="Link"
                  value={created.url}
                  size="small"
                  fullWidth
                  InputProps={{
                    readOnly: true,
                    startAdornment: (
                      <InputAdornment position="start">
                        <LinkIcon fontSize="small" />
                      </InputAdornment>
                    ),
                  }}
                  onFocus={(e) => e.target.select()}
                />
                <CopyButton text={created.url} label="Copy" />
              </Stack>
              <Box>
                <TextField
                  label="Message"
                  value={created.message}
                  multiline
                  minRows={5}
                  fullWidth
                  size="small"
                  InputProps={{ readOnly: true }}
                  onFocus={(e) => e.target.select()}
                />
                <Stack direction="row" justifyContent="flex-end" sx={{ mt: 1 }}>
                  <CopyButton text={created.message} label="Copy message" />
                </Stack>
              </Box>
            </Stack>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
            <Button onClick={onClose} sx={{ minHeight: 44 }}>
              Done
            </Button>
            <Button
              variant="contained"
              color="success"
              startIcon={<WhatsAppIcon />}
              href={created.whatsapp_url}
              target="_blank"
              rel="noopener noreferrer"
              sx={{ minHeight: 44 }}
            >
              Open in WhatsApp
            </Button>
          </DialogActions>
        </>
      ) : (
        <>
          <DialogContent>
            <Stack gap={2.5} sx={{ pt: 1 }}>
              {error && <Alert severity="error">{error}</Alert>}
              {prefill.replace_link_id && (
                <Alert severity="info">The old link stops working as soon as the new one is made.</Alert>
              )}
              <CollegeSearchField
                value={college}
                onChange={setCollege}
                required
                disabled={saving || Boolean(prefill.replace_link_id)}
                helperText={touched && collegeError ? 'Choose a college.' : undefined}
              />
              <Stack direction={{ xs: 'column', sm: 'row' }} gap={2}>
                <TextField
                  label="Contact name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  size="small"
                  fullWidth
                  disabled={saving}
                  placeholder="For example: Dr Kumar"
                  inputProps={{ maxLength: 120 }}
                />
                <TextField
                  label="Their WhatsApp number (optional)"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  size="small"
                  fullWidth
                  disabled={saving}
                  type="tel"
                  inputMode="tel"
                  placeholder="98765 43210"
                  error={phoneError}
                  helperText={phoneError ? 'Enter a 10 digit Indian mobile number.' : 'Leave empty to pick the chat in WhatsApp.'}
                  inputProps={{ maxLength: 20 }}
                />
              </Stack>

              <FormControl component="fieldset" error={touched && sectionsError} disabled={saving}>
                <FormLabel component="legend">What should they check?</FormLabel>
                <FormGroup sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
                  {UPDATE_LINK_SECTIONS.map((s) => (
                    <FormControlLabel
                      key={s}
                      control={<Checkbox checked={sections.includes(s)} onChange={() => toggle(s)} />}
                      label={UPDATE_LINK_SECTION_LABEL[s]}
                      sx={{ minHeight: 44 }}
                    />
                  ))}
                </FormGroup>
                {touched && sectionsError && <FormHelperText>Pick at least one section.</FormHelperText>}
              </FormControl>

              <FormControl component="fieldset" disabled={saving}>
                <FormLabel component="legend">Link works for</FormLabel>
                <RadioGroup row value={String(days)} onChange={(e) => setDays(Number(e.target.value) as UpdateLinkDays)}>
                  {UPDATE_LINK_DAYS.map((d) => (
                    <FormControlLabel key={d} value={String(d)} control={<Radio />} label={`${d} days`} sx={{ minHeight: 44 }} />
                  ))}
                </RadioGroup>
              </FormControl>

              <TextField
                label="Note for our team (optional)"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                size="small"
                multiline
                minRows={2}
                disabled={saving}
                helperText="Only Neram staff see this."
                inputProps={{ maxLength: 1000 }}
              />
            </Stack>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={onClose} disabled={saving} sx={{ minHeight: 44 }}>
              Cancel
            </Button>
            <Button
              variant="contained"
              onClick={submit}
              disabled={saving}
              startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <AddLinkIcon />}
              sx={{ minHeight: 44 }}
            >
              {saving ? 'Making link...' : 'Make link'}
            </Button>
          </DialogActions>
        </>
      )}
    </Dialog>
  );
}

export default function UpdateLinksPage() {
  const { user } = useMicrosoftAuth();
  const [links, setLinks] = useState<UpdateLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [toast, setToast] = useState('');
  const [dialog, setDialog] = useState<{ key: number; prefill: Prefill } | null>(null);
  const [menu, setMenu] = useState<{ anchor: HTMLElement; link: UpdateLink } | null>(null);
  const [cancelling, setCancelling] = useState<UpdateLink | null>(null);
  const [acting, setActing] = useState(false);
  const [actError, setActError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/college-hub/update-links', { cache: 'no-store' });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Could not load links');
      setLinks(j.data ?? []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openDialog = (prefill: Prefill) => setDialog({ key: Date.now(), prefill });

  // Shortcuts from Accounts and Plans land here as ?college_id=<id>: open the dialog for that college.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('college_id');
    if (!id || !UUID_RE.test(id)) return;
    window.history.replaceState(null, '', window.location.pathname);
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/college-hub/update-links?college_id=${encodeURIComponent(id)}`, { cache: 'no-store' });
        const j = await res.json();
        if (!alive || !res.ok || !j.college) return;
        const last = (j.data ?? [])[0] as UpdateLink | undefined;
        openDialog({
          ...EMPTY_PREFILL,
          college: { id: j.college.id, name: j.college.name, city: j.college.city },
          recipient_name: last?.recipient_name ?? '',
          recipient_phone: last?.recipient_phone ? formatIndianMobile(last.recipient_phone) : '',
        });
      } catch {
        // The page still works; staff can pick the college by hand.
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: 0, waiting: 0, submitted: 0, closed: 0 };
    for (const l of links) for (const f of FILTERS) if (inFilter(l.status, f.key)) c[f.key] += 1;
    return c;
  }, [links]);

  const visible = useMemo(() => links.filter((l) => inFilter(l.status, filter)), [links, filter]);

  const remake = (l: UpdateLink) =>
    openDialog({
      college: l.college ? { id: l.college.id, name: l.college.name, city: l.college.city } : { id: l.college_id, name: 'College' },
      recipient_name: l.recipient_name ?? '',
      recipient_phone: l.recipient_phone ? formatIndianMobile(l.recipient_phone) : '',
      sections: l.sections.filter(isUpdateLinkSection),
      replace_link_id: l.status === 'cancelled' ? null : l.id,
    });

  const patch = async (l: UpdateLink, action: 'extend' | 'cancel') => {
    setActing(true);
    setActError('');
    try {
      const res = await fetch('/api/college-hub/update-links', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: l.id, action, staff_name: user?.name || user?.email, staff_email: user?.email }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Could not save');
      const name = l.college?.name ?? 'the college';
      setToast(action === 'extend' ? `The link for ${name} now works until ${formatDate(j.link.expires_at)}.` : `The link for ${name} is cancelled.`);
      setCancelling(null);
      load();
    } catch (e) {
      if (action === 'cancel') setActError((e as Error).message);
      else setToast((e as Error).message);
    } finally {
      setActing(false);
    }
  };

  const menuLink = menu?.link;
  const menuOpen = menuLink && menuLink.status !== 'cancelled';

  return (
    <Box>
      <HubPageHeader
        icon={<LinkIcon />}
        title="Update links"
        description="Send a college a link to check and update its details on WhatsApp. No login needed. Every change comes to Content reviews before it goes live."
        actions={
          <Button variant="contained" startIcon={<AddLinkIcon />} onClick={() => openDialog(EMPTY_PREFILL)} sx={{ minHeight: 44 }}>
            Create link
          </Button>
        }
      />

      <Paper variant="outlined" sx={{ mb: 2 }}>
        <Tabs value={filter} onChange={(_, v) => setFilter(v)} aria-label="Filter links" variant="scrollable" allowScrollButtonsMobile>
          {FILTERS.map((f) => (
            <Tab key={f.key} value={f.key} label={loading ? f.label : `${f.label} (${counts[f.key]})`} sx={{ minHeight: 48 }} />
          ))}
        </Tabs>
      </Paper>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} action={<Button onClick={load}>Retry</Button>}>
          {error}
        </Alert>
      )}

      <TableContainer component={Paper} variant="outlined" sx={{ overflowX: 'auto' }}>
        <Table size="small" sx={{ minWidth: 1180 }} aria-label="Update links">
          <TableHead>
            <TableRow>
              <TableCell>College</TableCell>
              <TableCell>Sent to</TableCell>
              <TableCell>Sections</TableCell>
              <TableCell>Created</TableCell>
              <TableCell>Expires</TableCell>
              <TableCell>Status</TableCell>
              <TableCell align="right">Opens</TableCell>
              <TableCell align="right">Submits</TableCell>
              <TableCell>Reviews</TableCell>
              <TableCell align="right">
                <Box component="span" sx={{ position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
                  Actions
                </Box>
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading && <TableSkeletonRows cols={10} rows={4} />}
            {!loading && !error && visible.length === 0 && (
              <TableRow>
                <TableCell colSpan={10} sx={{ py: 5, textAlign: 'center' }}>
                  <Typography color="text.secondary">
                    {links.length === 0 ? 'No links yet. Create one to ask a college to check its details.' : 'No links in this list.'}
                  </Typography>
                </TableCell>
              </TableRow>
            )}
            {!loading &&
              visible.map((l) => (
                <TableRow key={l.id} hover>
                  <TableCell sx={{ maxWidth: 240 }}>
                    <Typography variant="body2" fontWeight={600}>
                      {l.college?.name ?? 'Unknown college'}
                    </Typography>
                    {l.college?.city && (
                      <Typography variant="caption" color="text.secondary">
                        {l.college.city}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">{l.recipient_name || 'No name'}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {l.recipient_phone ? formatIndianMobile(l.recipient_phone) : 'No number'}
                    </Typography>
                  </TableCell>
                  <TableCell sx={{ maxWidth: 260 }}>
                    <Stack direction="row" gap={0.5} flexWrap="wrap">
                      {l.sections.map((s) => (
                        <Chip key={s} size="small" variant="outlined" label={isUpdateLinkSection(s) ? UPDATE_LINK_SECTION_LABEL[s] : s} />
                      ))}
                    </Stack>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">{formatDate(l.created_at)}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      by {l.created_by || 'staff'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">{formatDate(l.expires_at)}</Typography>
                  </TableCell>
                  <TableCell>
                    <Tooltip
                      title={
                        l.status === 'cancelled'
                          ? `Cancelled by ${l.revoked_by || 'staff'} on ${formatDateTime(l.revoked_at)}`
                          : l.submitted_at
                            ? `Last sent ${formatDateTime(l.submitted_at)}`
                            : ''
                      }
                    >
                      <Chip size="small" label={LINK_STATUS_LABEL[l.status]} color={STATUS_COLOR[l.status]} variant={l.status === 'cancelled' ? 'outlined' : 'filled'} />
                    </Tooltip>
                  </TableCell>
                  <TableCell align="right">
                    <Typography variant="body2">{l.open_count}</Typography>
                    {l.last_opened_at && (
                      <Typography variant="caption" color="text.secondary" component="div">
                        last {formatDate(l.last_opened_at)}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell align="right">{l.submit_count}</TableCell>
                  <TableCell>
                    {l.pending_reviews > 0 ? (
                      <Button
                        component={Link}
                        href="/college-hub/content-reviews"
                        size="small"
                        startIcon={<RateReviewIcon />}
                        sx={{ minHeight: 40, whiteSpace: 'nowrap' }}
                      >
                        {l.pending_reviews} to review
                      </Button>
                    ) : (
                      <Typography variant="body2" color="text.secondary">
                        None
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell align="right">
                    <IconButton
                      aria-label={`Actions for the link to ${l.college?.name ?? 'this college'}`}
                      onClick={(e) => setMenu({ anchor: e.currentTarget, link: l })}
                      sx={{ width: 44, height: 44 }}
                    >
                      <MoreVertIcon />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </TableContainer>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
        We only keep a fingerprint of each link, so a link cannot be shown again. Use Make a new link to send it again.
      </Typography>

      <Menu anchorEl={menu?.anchor} open={Boolean(menu)} onClose={() => setMenu(null)}>
        <MenuItem
          onClick={() => {
            if (menuLink) remake(menuLink);
            setMenu(null);
          }}
          sx={{ minHeight: 44 }}
        >
          <ListItemIcon>
            <AddLinkIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Make a new link</ListItemText>
        </MenuItem>
        {menuOpen && menuLink && [
          <MenuItem
            key="extend"
            disabled={acting}
            onClick={() => {
              setMenu(null);
              patch(menuLink, 'extend');
            }}
            sx={{ minHeight: 44 }}
          >
            <ListItemIcon>
              <EventRepeatIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>Extend {EXTEND_DAYS} days</ListItemText>
          </MenuItem>,
          <MenuItem
            key="cancel"
            onClick={() => {
              setCancelling(menuLink);
              setActError('');
              setMenu(null);
            }}
            sx={{ minHeight: 44, color: 'error.main' }}
          >
            <ListItemIcon>
              <BlockIcon fontSize="small" color="error" />
            </ListItemIcon>
            <ListItemText>Cancel link</ListItemText>
          </MenuItem>,
        ]}
      </Menu>

      {dialog && <CreateLinkDialog key={dialog.key} prefill={dialog.prefill} onClose={() => setDialog(null)} onCreated={load} />}

      <Dialog open={Boolean(cancelling)} onClose={() => !acting && setCancelling(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Cancel this link?</DialogTitle>
        <DialogContent>
          <Stack gap={2}>
            {actError && <Alert severity="error">{actError}</Alert>}
            <Typography variant="body2">
              The link for {cancelling?.college?.name ?? 'this college'} stops working straight away. Changes they already sent stay in
              Content reviews.
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setCancelling(null)} disabled={acting} sx={{ minHeight: 44 }}>
            Keep link
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={() => cancelling && patch(cancelling, 'cancel')}
            disabled={acting}
            startIcon={acting ? <CircularProgress size={16} color="inherit" /> : <BlockIcon />}
            sx={{ minHeight: 44 }}
          >
            {acting ? 'Cancelling...' : 'Cancel link'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={Boolean(toast)} autoHideDuration={5000} onClose={() => setToast('')} message={toast} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }} />
    </Box>
  );
}
