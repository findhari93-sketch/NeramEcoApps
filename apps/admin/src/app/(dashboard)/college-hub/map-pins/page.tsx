'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
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
  LinearProgress,
  Link as MuiLink,
  Paper,
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
  Typography,
} from '@mui/material';
import PlaceIcon from '@mui/icons-material/Place';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import EditLocationAltIcon from '@mui/icons-material/EditLocationAlt';
import { HubPageHeader, TableSkeletonRows } from '@/components/college-hub/hub-ui';
import { googleMapsUrl, parseLatLng } from '@/lib/college-map-pins/geo';

interface PinRow {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  geo_suggested_lat: number | null;
  geo_suggested_lng: number | null;
  geo_suggested_source: string | null;
  geo_suggested_label: string | null;
}

interface Counts {
  total: number;
  with_pin: number;
  suggested: number;
  missing: number;
}

type Show = 'all' | 'suggested' | 'missing';

function SetPinDialog({ college, onClose, onDone }: { college: PinRow; onClose: () => void; onDone: (msg: string) => void }) {
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const parsed = parseLatLng(value);
  const searchUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([college.name, college.city, college.state].filter(Boolean).join(', '))}`;

  const submit = async () => {
    if (!parsed) return setError('Paste coordinates like 9.925201, 78.119775');
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/college-hub/map-pins', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ college_id: college.id, action: 'set', latitude: parsed.lat, longitude: parsed.lng }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Could not save');
      onDone(`Pin set for ${college.name}.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onClose={() => !saving && onClose()} maxWidth="sm" fullWidth>
      <DialogTitle>Enter coordinates for {college.name}</DialogTitle>
      <DialogContent>
        <Stack gap={2} sx={{ pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <Typography variant="body2" color="text.secondary">
            Find the campus in{' '}
            <MuiLink href={searchUrl} target="_blank" rel="noopener noreferrer">
              Google Maps
            </MuiLink>
            , right-click the main gate and click the numbers at the top of the menu to copy them. Paste them here.
          </Typography>
          <TextField
            label="Latitude, longitude"
            size="small"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoFocus
            error={Boolean(value) && !parsed}
            helperText={
              value && !parsed
                ? 'That does not look like coordinates. Example: 9.925201, 78.119775'
                : parsed
                  ? `Latitude ${parsed.lat}, longitude ${parsed.lng}`
                  : 'Example: 9.925201, 78.119775. A Google Maps link also works.'
            }
          />
          {parsed && (
            <Button
              href={googleMapsUrl(parsed.lat, parsed.lng)}
              target="_blank"
              rel="noopener noreferrer"
              endIcon={<OpenInNewIcon fontSize="small" />}
              sx={{ alignSelf: 'flex-start', minHeight: 40 }}
            >
              Check this spot on the map
            </Button>
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={submit}
          disabled={saving || !parsed}
          startIcon={saving ? <CircularProgress size={16} color="inherit" /> : undefined}
        >
          {saving ? 'Saving...' : 'Save pin'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default function MapPinsPage() {
  const [rows, setRows] = useState<PinRow[]>([]);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [setFor, setSetFor] = useState<PinRow | null>(null);
  const [show, setShow] = useState<Show>('all');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/college-hub/map-pins', { cache: 'no-store' });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Could not load map pins');
      setRows(j.data ?? []);
      setCounts(j.counts ?? null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (row: PinRow, action: 'accept' | 'dismiss') => {
    setBusy(row.id);
    try {
      const res = await fetch('/api/college-hub/map-pins', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ college_id: row.id, action }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Could not save');
      setToast(action === 'accept' ? `Pin accepted for ${row.name}.` : `Suggestion dismissed for ${row.name}.`);
      load();
    } catch (e) {
      setToast((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const visible = useMemo(
    () =>
      rows.filter((r) =>
        show === 'all' ? true : show === 'suggested' ? r.geo_suggested_lat !== null : r.geo_suggested_lat === null,
      ),
    [rows, show],
  );

  const pct = counts && counts.total ? Math.round((counts.with_pin / counts.total) * 100) : 0;

  return (
    <Box>
      <HubPageHeader
        icon={<PlaceIcon />}
        title="Map pins"
        description="The pin puts a map and travel distances on the public college page. A helper script suggests pins from OpenStreetMap. Check each one on the map before accepting it, because a wrong pin is worse than none."
      />

      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        {counts ? (
          <>
            <Typography variant="h6" component="p">
              {counts.with_pin} of {counts.total} colleges have a map pin
            </Typography>
            <LinearProgress variant="determinate" value={pct} sx={{ my: 1.5, height: 8, borderRadius: 4 }} aria-label={`${pct}% of colleges have a pin`} />
            <Stack direction="row" gap={1} flexWrap="wrap" role="group" aria-label="Show">
              {(
                [
                  ['all', `Without a pin (${counts.suggested + counts.missing})`],
                  ['suggested', `Suggested, needs a check (${counts.suggested})`],
                  ['missing', `No suggestion (${counts.missing})`],
                ] as [Show, string][]
              ).map(([k, label]) => (
                <Chip
                  key={k}
                  label={label}
                  onClick={() => setShow(k)}
                  color={show === k ? 'primary' : 'default'}
                  variant={show === k ? 'filled' : 'outlined'}
                  aria-pressed={show === k}
                  sx={{ minHeight: 36 }}
                />
              ))}
            </Stack>
          </>
        ) : (
          <>
            <Skeleton variant="text" width={320} height={32} />
            <Skeleton variant="rounded" height={8} sx={{ my: 1.5 }} />
            <Skeleton variant="text" width={420} />
          </>
        )}
      </Paper>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} action={<Button onClick={load}>Retry</Button>}>
          {error}
        </Alert>
      )}

      <TableContainer component={Paper} variant="outlined" sx={{ overflowX: 'auto' }}>
        <Table size="small" sx={{ minWidth: 960 }}>
          <TableHead>
            <TableRow>
              <TableCell>College</TableCell>
              <TableCell>Suggested place</TableCell>
              <TableCell>Coordinates</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading && <TableSkeletonRows cols={4} />}
            {!loading &&
              visible.map((r) => {
                const hasSuggestion = r.geo_suggested_lat !== null && r.geo_suggested_lng !== null;
                return (
                  <TableRow key={r.id} hover>
                    <TableCell sx={{ maxWidth: 260 }}>
                      <Typography variant="body2" fontWeight={600}>
                        {r.name}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {[r.city, r.state].filter(Boolean).join(', ')}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ maxWidth: 360 }}>
                      {hasSuggestion ? (
                        <>
                          <Typography variant="body2">{r.geo_suggested_label}</Typography>
                          <Typography variant="caption" color="text.secondary">
                            From {r.geo_suggested_source === 'nominatim' ? 'OpenStreetMap' : r.geo_suggested_source}
                          </Typography>
                        </>
                      ) : (
                        <Typography variant="body2" color="text.secondary">
                          No suggestion
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      {hasSuggestion ? (
                        <MuiLink
                          href={googleMapsUrl(r.geo_suggested_lat as number, r.geo_suggested_lng as number)}
                          target="_blank"
                          rel="noopener noreferrer"
                          sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, minHeight: 44 }}
                        >
                          Check on map ({r.geo_suggested_lat}, {r.geo_suggested_lng})
                          <OpenInNewIcon sx={{ fontSize: 16 }} />
                        </MuiLink>
                      ) : (
                        <Typography variant="body2" color="text.secondary">
                          None
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell align="right">
                      <Stack direction="row" gap={1} justifyContent="flex-end" flexWrap="wrap">
                        {busy === r.id ? (
                          <CircularProgress size={20} aria-label="Saving" sx={{ m: 1.5 }} />
                        ) : (
                          <>
                            {hasSuggestion && (
                              <>
                                <Button size="small" variant="contained" color="success" startIcon={<CheckIcon />} onClick={() => act(r, 'accept')} sx={{ minHeight: 40 }}>
                                  Accept
                                </Button>
                                <Button size="small" color="inherit" startIcon={<CloseIcon />} onClick={() => act(r, 'dismiss')} sx={{ minHeight: 40 }}>
                                  Dismiss
                                </Button>
                              </>
                            )}
                            <Button size="small" variant="outlined" startIcon={<EditLocationAltIcon />} onClick={() => setSetFor(r)} sx={{ minHeight: 40 }}>
                              Enter coordinates
                            </Button>
                          </>
                        )}
                      </Stack>
                    </TableCell>
                  </TableRow>
                );
              })}
            {!loading && !error && visible.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} sx={{ py: 6, textAlign: 'center' }}>
                  <Typography color="text.secondary">
                    {rows.length === 0 ? 'Every active college has a map pin.' : 'Nothing in this list.'}
                  </Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 2 }}>
        To fetch more suggestions, run <code>scripts/college-geocode.ts</code> from apps/admin (see the note at the top of the
        script). It only fills suggestions, never the pin itself.
      </Typography>

      {setFor && (
        <SetPinDialog
          college={setFor}
          onClose={() => setSetFor(null)}
          onDone={(msg) => {
            setSetFor(null);
            setToast(msg);
            load();
          }}
        />
      )}

      <Snackbar open={Boolean(toast)} autoHideDuration={5000} onClose={() => setToast('')} message={toast} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }} />
    </Box>
  );
}
