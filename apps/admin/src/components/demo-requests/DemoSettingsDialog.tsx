'use client';

import { useEffect, useState } from 'react';
import {
  Alert,
  Autocomplete,
  Avatar,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  TextField,
  Typography,
} from '@neram/ui';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import CloseIcon from '@mui/icons-material/Close';
import { resolveDemoSettings, type DemoHost, type DemoWindowDef } from '@neram/database/demo-schedule';

interface StaffOption {
  name: string;
  email: string;
  avatar_url: string | null;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * Everything the booking card and the Confirm form read from
 * site_settings.demo_class. Saved with a merge, so the sample-video URL and
 * other keys stay untouched.
 */
export default function DemoSettingsDialog({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hosts, setHosts] = useState<DemoHost[]>([]);
  const [defaultTutor, setDefaultTutor] = useState('');
  const [defaultOrganizer, setDefaultOrganizer] = useState('');
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [windows, setWindows] = useState<DemoWindowDef[]>([]);
  const [daysAhead, setDaysAhead] = useState(7);
  const [closed, setClosed] = useState<number[]>([]);
  const [duration, setDuration] = useState(45);
  const [drawingWhatsApp, setDrawingWhatsApp] = useState('');
  const [callbackPromise, setCallbackPromise] = useState('');
  const [youtube, setYoutube] = useState('');
  const [followUpOwners, setFollowUpOwners] = useState<string[]>([]);
  const [followUpManager, setFollowUpManager] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    fetch('/api/settings/demo-class')
      .then((r) => r.json())
      .then((d) => {
        const s = resolveDemoSettings(d.settings);
        setHosts(s.hosts.length ? s.hosts : [{ upn: '', name: '', notifyNewRequests: true }]);
        setDefaultTutor(s.defaultTutorUpn || '');
        setDefaultOrganizer(s.defaultOrganizerUpn || '');
        setWindows(s.schedule.windows);
        setDaysAhead(s.schedule.daysAhead);
        setClosed(s.schedule.closedWeekdays);
        setDuration(s.schedule.durationMinutes);
        setDrawingWhatsApp(s.drawingWhatsApp);
        setCallbackPromise(s.callbackPromise);
        setYoutube(s.youtubeUrl || '');
        setFollowUpOwners(s.followUpOwnerUpns);
        setFollowUpManager(s.followUpManagerUpn);
      })
      .catch(() => setError('Could not load the settings.'))
      .finally(() => setLoading(false));
    // The picker list; typing an address still works if this fails.
    fetch('/api/demo-requests/staff')
      .then((r) => (r.ok ? r.json() : { staff: [] }))
      .then((d) => setStaff(d.staff ?? []))
      .catch(() => setStaff([]));
  }, [open]);

  const staffName = (upn: string) => staff.find((o) => o.email === upn)?.name || upn;
  const moveOwner = (i: number, by: -1 | 1) => {
    const j = i + by;
    if (j < 0 || j >= followUpOwners.length) return;
    const next = [...followUpOwners];
    [next[i], next[j]] = [next[j], next[i]];
    setFollowUpOwners(next);
  };

  const setHost = (i: number, patch: Partial<DemoHost>) => setHosts(hosts.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  const save = async () => {
    const cleanHosts = hosts.filter((h) => h.upn.trim());
    if (cleanHosts.some((h) => !/^[^@\s]+@[^@\s]+$/.test(h.upn.trim()))) {
      setError('Each host needs a full Microsoft address, like hari@neramclasses.com.');
      return;
    }
    if (windows.some((w) => !(w.start < w.end))) {
      setError('Each time window must end after it starts.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/settings/demo-class', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hosts: cleanHosts.map((h) => ({
            upn: h.upn.trim().toLowerCase(),
            name: h.name.trim() || h.upn.split('@')[0],
            notifyNewRequests: h.notifyNewRequests,
          })),
          defaultTutorUpn: defaultTutor.trim().toLowerCase() || null,
          defaultOrganizerUpn: defaultOrganizer.trim().toLowerCase() || null,
          windows,
          daysAhead,
          closedWeekdays: closed,
          durationMinutes: duration,
          drawingWhatsApp: drawingWhatsApp.replace(/\D/g, ''),
          callbackPromise: callbackPromise.trim(),
          youtube_video_url: youtube.trim(),
          followUpOwnerUpns: followUpOwners,
          followUpManagerUpn: followUpManager,
        }),
      });
      if (!res.ok) throw new Error();
      onSaved();
      onClose();
    } catch {
      setError('Saving failed. Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={saving ? undefined : onClose} fullWidth maxWidth="md" aria-labelledby="demo-settings-title">
      <DialogTitle id="demo-settings-title">Demo settings</DialogTitle>
      <DialogContent dividers>
        {loading ? (
          <Box sx={{ py: 6, display: 'flex', justifyContent: 'center' }}>
            <CircularProgress aria-label="Loading settings" />
          </Box>
        ) : (
          <Box sx={{ display: 'grid', gap: 3 }}>
            <section>
              <Typography variant="subtitle1" fontWeight={700}>
                Demo team
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                Everyone who can be on a demo. At Confirm you tick who joins, pick the tutor (students see that name) and
                the organizer (whose calendar holds the Teams meeting). The usual ones are picked for you.
              </Typography>
              {hosts.map((h, i) => (
                <Box
                  key={i}
                  sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1.5fr 1fr auto auto auto 44px' }, gap: 1, mb: 1.5, alignItems: 'center' }}
                >
                  <Autocomplete
                    freeSolo
                    options={staff.filter((o) => o.email === h.upn.trim().toLowerCase() || !hosts.some((x) => x.upn.trim().toLowerCase() === o.email))}
                    getOptionLabel={(o) => (typeof o === 'string' ? o : o.email)}
                    filterOptions={(opts, { inputValue }) => {
                      const q = inputValue.trim().toLowerCase();
                      return q ? opts.filter((o) => o.name.toLowerCase().includes(q) || o.email.includes(q)) : opts;
                    }}
                    value={h.upn}
                    inputValue={h.upn}
                    onInputChange={(_, v, reason) => reason !== 'reset' && setHost(i, { upn: v })}
                    onChange={(_, v) => {
                      if (!v) return setHost(i, { upn: '' });
                      if (typeof v === 'string') return setHost(i, { upn: v });
                      setHost(i, { upn: v.email, name: h.name.trim() || v.name.split(' ')[0] });
                    }}
                    renderOption={(props, o) => (
                      <Box component="li" {...props} key={o.email} sx={{ display: 'flex', gap: 1.5, alignItems: 'center', minHeight: 48 }}>
                        <Avatar src={o.avatar_url ?? undefined} alt="" sx={{ width: 32, height: 32 }}>
                          {o.name.charAt(0)}
                        </Avatar>
                        <Box sx={{ minWidth: 0 }}>
                          <Typography variant="body2" fontWeight={600} noWrap>
                            {o.name}
                          </Typography>
                          <Typography variant="caption" color="text.secondary" noWrap component="div">
                            {o.email}
                          </Typography>
                        </Box>
                      </Box>
                    )}
                    renderInput={(params) => (
                      <TextField {...params} label="Person (search our staff)" placeholder="Type a name" size="small" />
                    )}
                    noOptionsText="No staff match. You can type their Microsoft address."
                  />
                  <TextField
                    label="Name students see"
                    value={h.name}
                    onChange={(e) => setHost(i, { name: e.target.value })}
                    size="small"
                  />
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={h.notifyNewRequests}
                        onChange={(e) => setHost(i, { notifyNewRequests: e.target.checked })}
                      />
                    }
                    label="Ping on new requests"
                  />
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={!!h.upn && defaultTutor.toLowerCase() === h.upn.trim().toLowerCase()}
                        onChange={(e) => setDefaultTutor(e.target.checked ? h.upn.trim().toLowerCase() : '')}
                      />
                    }
                    label="Usual tutor"
                  />
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={!!h.upn && defaultOrganizer.toLowerCase() === h.upn.trim().toLowerCase()}
                        onChange={(e) => setDefaultOrganizer(e.target.checked ? h.upn.trim().toLowerCase() : '')}
                      />
                    }
                    label="Usual organizer"
                  />
                  <IconButton aria-label={`Remove ${h.name || 'member'}`} onClick={() => setHosts(hosts.filter((_, j) => j !== i))} sx={{ width: 44, height: 44 }}>
                    <DeleteIcon />
                  </IconButton>
                </Box>
              ))}
              <Button
                startIcon={<AddIcon />}
                onClick={() => setHosts([...hosts, { upn: '', name: '', notifyNewRequests: false }])}
                sx={{ minHeight: 44 }}
              >
                Add person
              </Button>
            </section>

            <section>
              <Typography variant="subtitle1" fontWeight={700}>
                Follow-ups
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                Who calls students after a demo. The first person in the list is tried first; if they are away or disabled,
                the next one gets it, then the manager.
              </Typography>
              <Box component="ol" sx={{ listStyle: 'none', p: 0, m: 0, display: 'grid', gap: 1 }}>
                {followUpOwners.map((upn, i) => (
                  <Box
                    component="li"
                    key={upn}
                    sx={{ display: 'flex', alignItems: 'center', gap: 1, border: 1, borderColor: 'divider', borderRadius: 1, px: 1.5, minHeight: 52 }}
                  >
                    <Typography variant="body2" fontWeight={700} sx={{ width: 24 }}>
                      {i + 1}
                    </Typography>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="body2" fontWeight={600} noWrap>
                        {staffName(upn)}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" noWrap component="div">
                        {upn}
                      </Typography>
                    </Box>
                    <IconButton aria-label={`Move ${staffName(upn)} up`} disabled={i === 0} onClick={() => moveOwner(i, -1)} sx={{ width: 44, height: 44 }}>
                      <ArrowUpwardIcon />
                    </IconButton>
                    <IconButton aria-label={`Move ${staffName(upn)} down`} disabled={i === followUpOwners.length - 1} onClick={() => moveOwner(i, 1)} sx={{ width: 44, height: 44 }}>
                      <ArrowDownwardIcon />
                    </IconButton>
                    <IconButton aria-label={`Remove ${staffName(upn)} from follow-up owners`} onClick={() => setFollowUpOwners(followUpOwners.filter((x) => x !== upn))} sx={{ width: 44, height: 44 }}>
                      <CloseIcon />
                    </IconButton>
                  </Box>
                ))}
                {!followUpOwners.length && (
                  <Typography variant="body2" color="text.secondary">
                    No owners yet. Demo follow-ups go to the manager until you add someone.
                  </Typography>
                )}
              </Box>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2, mt: 2 }}>
                <Autocomplete
                  options={staff.filter((o) => !followUpOwners.includes(o.email))}
                  getOptionLabel={(o) => o.name}
                  value={null}
                  onChange={(_, v) => v && setFollowUpOwners([...followUpOwners, v.email])}
                  renderInput={(params) => <TextField {...params} label="Add a follow-up owner" placeholder="Type a name" size="small" />}
                  noOptionsText="No staff match."
                />
                <Autocomplete
                  options={staff}
                  getOptionLabel={(o) => o.name}
                  isOptionEqualToValue={(o, v) => o.email === v.email}
                  value={followUpManager ? staff.find((o) => o.email === followUpManager) ?? { name: followUpManager, email: followUpManager, avatar_url: null } : null}
                  onChange={(_, v) => setFollowUpManager(v ? v.email : null)}
                  renderInput={(params) => <TextField {...params} label="Follow-up manager (gets the team summary)" size="small" />}
                  noOptionsText="No staff match."
                />
              </Box>
            </section>

            <section>
              <Typography variant="subtitle1" fontWeight={700}>
                Time windows students pick from
              </Typography>
              <Box sx={{ display: 'grid', gap: 1, mt: 1 }}>
                {windows.map((w, i) => (
                  <Box key={w.id} sx={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: 1 }}>
                    <TextField
                      label={`${w.id} label`}
                      value={w.label}
                      onChange={(e) => setWindows(windows.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
                      size="small"
                    />
                    <TextField
                      label="From"
                      type="time"
                      value={w.start}
                      onChange={(e) => setWindows(windows.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)))}
                      size="small"
                      InputLabelProps={{ shrink: true }}
                    />
                    <TextField
                      label="To"
                      type="time"
                      value={w.end}
                      onChange={(e) => setWindows(windows.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)))}
                      size="small"
                      InputLabelProps={{ shrink: true }}
                    />
                  </Box>
                ))}
              </Box>
              <Box sx={{ display: 'flex', gap: 2, mt: 2, flexWrap: 'wrap' }}>
                <TextField
                  label="Days offered"
                  type="number"
                  value={daysAhead}
                  onChange={(e) => setDaysAhead(Math.max(1, Math.min(21, Number(e.target.value) || 7)))}
                  size="small"
                  sx={{ width: 140 }}
                />
                <TextField
                  label="Demo length (min)"
                  type="number"
                  value={duration}
                  onChange={(e) => setDuration(Math.max(15, Math.min(180, Number(e.target.value) || 45)))}
                  size="small"
                  sx={{ width: 160 }}
                />
              </Box>
              <Typography variant="body2" sx={{ mt: 2, mb: 0.5 }}>
                No demos on:
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap' }}>
                {WEEKDAYS.map((d, i) => (
                  <FormControlLabel
                    key={d}
                    control={
                      <Checkbox
                        checked={closed.includes(i)}
                        onChange={(e) => setClosed(e.target.checked ? [...closed, i] : closed.filter((x) => x !== i))}
                      />
                    }
                    label={d}
                  />
                ))}
              </Box>
            </section>

            <section>
              <Typography variant="subtitle1" fontWeight={700}>
                What students are told
              </Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2, mt: 1 }}>
                <TextField
                  label="WhatsApp number for drawings"
                  value={drawingWhatsApp}
                  onChange={(e) => setDrawingWhatsApp(e.target.value)}
                  helperText="With country code, e.g. 919176137043. The number your team answers on a phone."
                  size="small"
                />
                <TextField
                  label="We call you..."
                  value={callbackPromise}
                  onChange={(e) => setCallbackPromise(e.target.value)}
                  helperText='Shown as "We usually call within 2 working hours"'
                  size="small"
                />
                <TextField
                  label="Sample class video (YouTube URL)"
                  value={youtube}
                  onChange={(e) => setYoutube(e.target.value)}
                  size="small"
                  sx={{ gridColumn: { sm: '1 / -1' } }}
                />
              </Box>
            </section>
          </Box>
        )}
        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} disabled={saving} sx={{ minHeight: 44 }}>
          Back
        </Button>
        <Button variant="contained" onClick={save} disabled={saving || loading} sx={{ minHeight: 44 }}>
          {saving ? 'Saving' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
