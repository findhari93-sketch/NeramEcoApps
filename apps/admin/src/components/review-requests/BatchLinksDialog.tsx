'use client';

/**
 * "Add a batch": review links for a whole batch in one go.
 *
 * Everything we already hold is filled in from records (name, photo, phone,
 * city, exam year, and any result or college on file). Staff only add what is
 * missing, usually the AIR or percentile, in an editable table, then create
 * every link at once. Students who already have a live link are shown but not
 * selected, so nobody gets a second one.
 *
 * Desktop-first like the rest of Admin: a dense table that scrolls inside the
 * dialog, sticky header, 44px controls, validation on blur.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  InputAdornment,
  MenuItem,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
  UserAvatar,
} from '@neram/ui';
import SearchIcon from '@mui/icons-material/Search';
import { REVIEW_PROGRESS_LABELS, type ReviewRequestProgress } from '@neram/database';
import { rowsNeedingResults, type BatchRow } from '@/lib/review-requests-view';

export interface DialogCentre {
  id: string;
  name: string;
  city: string | null;
  center_type: string | null;
  has_google: boolean;
}

export interface CreatedLink {
  id: string;
  student_name: string;
  reused: boolean;
  url: string;
  message: string;
  phone: string | null;
}

type Mode = 'offline' | 'hybrid' | 'online';
type EditRow = BatchRow & { mode: Mode; rankText: string; percentileText: string; error?: string };

const MODES: Array<{ value: Mode; label: string }> = [
  { value: 'offline', label: 'Classroom' },
  { value: 'hybrid', label: 'Hybrid' },
  { value: 'online', label: 'Online' },
];
const EXAMS = [
  { value: 'NATA', label: 'NATA' },
  { value: 'JEE_PAPER_2', label: 'JEE P2' },
  { value: 'BOTH', label: 'Both' },
];
const POST_CHUNK = 100;
const btnSx = { textTransform: 'none', fontWeight: 600, minHeight: 44 } as const;
const cellInputSx = { '& .MuiInputBase-root': { minHeight: 40, fontSize: 14 }, '& .MuiInputBase-input': { py: 1 } } as const;

function toEdit(r: BatchRow, mode: Mode): EditRow {
  return {
    ...r,
    mode,
    rankText: r.airRank ? String(r.airRank) : '',
    percentileText: r.percentile != null ? String(r.percentile) : '',
  };
}

/** The row's result fields, checked the way the server will check them. */
function checkRow(r: EditRow): string | undefined {
  if (r.rankText && !/^\d{1,7}$/.test(r.rankText)) return 'AIR must be a whole number.';
  if (r.percentileText) {
    const p = Number(r.percentileText);
    if (!Number.isFinite(p) || p < 0 || p > 100) return 'Percentile is between 0 and 100.';
  }
  return undefined;
}

export default function BatchLinksDialog({
  open,
  centres,
  onClose,
  onCreated,
  onUseStudentResults,
}: {
  open: boolean;
  centres: DialogCentre[];
  onClose: () => void;
  onCreated: (links: CreatedLink[]) => void;
  onUseStudentResults: () => void;
}) {
  const [batch, setBatch] = useState<string | null>(null);
  const [batches, setBatches] = useState<string[]>([]);
  const [rows, setRows] = useState<EditRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [defaultMode, setDefaultMode] = useState<Mode>('offline');
  const [defaultCentre, setDefaultCentre] = useState('');
  const [search, setSearch] = useState('');
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(
    async (which: string | null) => {
      setLoading(true);
      setError('');
      try {
        const res = await fetch(`/api/review-requests/batch${which ? `?batch=${encodeURIComponent(which)}` : ''}`, { cache: 'no-store' });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || 'Could not load this batch.');
        setBatch(body.batch);
        setBatches(body.batches || []);
        const next = ((body.rows || []) as BatchRow[]).map((r) => toEdit(r, defaultMode));
        setRows(next);
        // Everyone without a live link is selected; those with one never are.
        setSelected(new Set(next.filter((r) => !r.existingRequest).map((r) => r.userId)));
      } catch (e: any) {
        setError(e.message || 'Could not load this batch.');
        setRows([]);
      } finally {
        setLoading(false);
      }
    },
    [defaultMode],
  );

  useEffect(() => {
    if (open) {
      setSearch('');
      setOnlyMissing(false);
      void load(batch);
    }
    // Only when the dialog opens; batch changes load through the select.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const update = (userId: string, patch: Partial<EditRow>) =>
    setRows((rs) => rs.map((r) => (r.userId === userId ? { ...r, ...patch } : r)));

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (!q || r.name.toLowerCase().includes(q) || (r.city || '').toLowerCase().includes(q)) &&
        (!onlyMissing || (!r.rankText && !r.percentileText)),
    );
  }, [rows, search, onlyMissing]);

  const selectable = visible.filter((r) => !r.existingRequest);
  const allVisibleSelected = selectable.length > 0 && selectable.every((r) => selected.has(r.userId));
  const chosen = rows.filter((r) => selected.has(r.userId) && !r.existingRequest);
  const missing = rowsNeedingResults(
    chosen.map((r) => ({ airRank: r.rankText ? Number(r.rankText) : null, percentile: r.percentileText ? Number(r.percentileText) : null })),
  ).length;
  const withErrors = chosen.filter((r) => checkRow(r));

  const toggleAll = () =>
    setSelected((s) => {
      const n = new Set(s);
      if (allVisibleSelected) selectable.forEach((r) => n.delete(r.userId));
      else selectable.forEach((r) => n.add(r.userId));
      return n;
    });

  const create = async () => {
    if (withErrors.length) {
      setRows((rs) => rs.map((r) => ({ ...r, error: selected.has(r.userId) ? checkRow(r) : undefined })));
      setError(`Fix ${withErrors.length} row${withErrors.length === 1 ? '' : 's'} first.`);
      return;
    }
    setSaving(true);
    setError('');
    const items = chosen.map((r) => ({
      userId: r.userId,
      studentResultId: r.studentResultId,
      studentName: r.name,
      photoUrl: r.photoUrl,
      examType: r.examType,
      examYear: r.examYear,
      airRank: r.rankText || null,
      percentile: r.percentileText || null,
      collegeAdmitted: r.collegeAdmitted,
      centerId: r.centreId || defaultCentre || null,
      city: r.city,
      learningMode: r.mode,
      phone: r.phone,
    }));
    const created: CreatedLink[] = [];
    try {
      for (let i = 0; i < items.length; i += POST_CHUNK) {
        const part = items.slice(i, i + POST_CHUNK);
        const res = await fetch('/api/review-requests', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: part }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          const bad = typeof body.row === 'number' ? part[body.row]?.studentName : null;
          throw new Error(`${body.error || 'Could not create the links.'}${bad ? ` (${bad})` : ''}`);
        }
        created.push(...(body.created || []));
      }
      onCreated(created);
    } catch (e: any) {
      // Links made before the failure are real; show them rather than lose them.
      if (created.length) onCreated(created);
      setError(e.message || 'Could not create the links.');
    } finally {
      setSaving(false);
    }
  };

  const centreLabel = (c: DialogCentre) => `${c.city || c.name}${c.center_type === 'headquarters' ? ' (HQ)' : ''}${c.has_google ? '' : ' (no Google link)'}`;

  return (
    <Dialog open={open} onClose={saving ? undefined : onClose} fullWidth maxWidth="xl" aria-labelledby="batch-links-title">
      <DialogTitle id="batch-links-title" sx={{ pb: 1 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={2} sx={{ flexWrap: 'wrap', gap: 1 }}>
          <Box>
            <Typography component="span" variant="h6" sx={{ fontWeight: 700 }}>
              Review links for a batch
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Names, photos, phones, cities and exam years come from their records. Add the AIR or percentile where it is missing.
            </Typography>
          </Box>
          <Button onClick={onUseStudentResults} sx={btnSx} disabled={saving}>
            Use Student Results instead
          </Button>
        </Stack>
      </DialogTitle>

      <DialogContent dividers sx={{ pt: 2 }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '160px 200px 240px 1fr auto' }, gap: 1.5, alignItems: 'center', mb: 2 }}>
          <TextField select label="Batch" value={batch || ''} onChange={(e) => void load(e.target.value)} disabled={loading || saving}>
            {batches.map((b) => (
              <MenuItem key={b} value={b}>
                {b}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            label="How they studied (all)"
            value={defaultMode}
            onChange={(e) => {
              const m = e.target.value as Mode;
              setDefaultMode(m);
              setRows((rs) => rs.map((r) => ({ ...r, mode: m })));
            }}
            helperText="Change any row below"
          >
            {MODES.map((m) => (
              <MenuItem key={m.value} value={m.value}>
                {m.label}
              </MenuItem>
            ))}
          </TextField>
          <TextField select label="Centre where unknown" value={defaultCentre} onChange={(e) => setDefaultCentre(e.target.value)} helperText="Used when a row has no centre">
            <MenuItem value="">
              <em>None</em>
            </MenuItem>
            {centres.map((c) => (
              <MenuItem key={c.id} value={c.id}>
                {centreLabel(c)}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            size="small"
            placeholder="Search name or city"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            inputProps={{ 'aria-label': 'Search name or city' }}
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
          />
          <Chip
            label="Missing a result"
            clickable
            color={onlyMissing ? 'primary' : 'default'}
            variant={onlyMissing ? 'filled' : 'outlined'}
            aria-pressed={onlyMissing}
            onClick={() => setOnlyMissing((v) => !v)}
            sx={{ minHeight: 40, fontWeight: 600 }}
          />
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }} role="alert">
            {error}
          </Alert>
        )}

        <TableContainer sx={{ maxHeight: '58vh', overflow: 'auto', border: '1px solid', borderColor: 'grey.200', borderRadius: 1 }}>
          <Table stickyHeader size="small" aria-label={`Students in batch ${batch || ''}`}>
            <TableHead>
              <TableRow sx={{ '& th': { fontWeight: 700, bgcolor: 'grey.50', whiteSpace: 'nowrap' } }}>
                <TableCell padding="checkbox">
                  <Checkbox
                    checked={allVisibleSelected}
                    indeterminate={!allVisibleSelected && selectable.some((r) => selected.has(r.userId))}
                    onChange={toggleAll}
                    disabled={!selectable.length}
                    inputProps={{ 'aria-label': 'Select every student shown' }}
                  />
                </TableCell>
                <TableCell>Student</TableCell>
                <TableCell>Exam</TableCell>
                <TableCell>Year</TableCell>
                <TableCell>AIR</TableCell>
                <TableCell>Percentile</TableCell>
                <TableCell sx={{ minWidth: 200 }}>College</TableCell>
                <TableCell>Studied</TableCell>
                <TableCell sx={{ minWidth: 170 }}>Centre</TableCell>
                <TableCell>Link</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading &&
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 10 }).map((__, j) => (
                      <TableCell key={j}>
                        <Skeleton />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              {!loading && visible.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10} sx={{ py: 5, textAlign: 'center' }}>
                    <Typography sx={{ fontWeight: 600 }}>
                      {rows.length ? 'No student matches.' : `No students in batch ${batch || ''}.`}
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
              {!loading &&
                visible.map((r) => {
                  const taken = Boolean(r.existingRequest);
                  const noResult = !r.rankText && !r.percentileText;
                  const missingSx = noResult && !taken ? { '& .MuiInputBase-root': { bgcolor: 'rgba(237,108,2,0.06)' } } : {};
                  return (
                    <TableRow key={r.userId} hover selected={selected.has(r.userId)} sx={{ opacity: taken ? 0.6 : 1 }}>
                      <TableCell padding="checkbox">
                        <Checkbox
                          checked={selected.has(r.userId)}
                          disabled={taken || saving}
                          onChange={() =>
                            setSelected((s) => {
                              const n = new Set(s);
                              if (n.has(r.userId)) n.delete(r.userId);
                              else n.add(r.userId);
                              return n;
                            })
                          }
                          inputProps={{ 'aria-label': `Select ${r.name}` }}
                        />
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 180 }}>
                          <UserAvatar name={r.name} src={r.photoUrl} size={32} clickable={false} />
                          <Box sx={{ minWidth: 0 }}>
                            <Typography variant="body2" sx={{ fontWeight: 600 }}>
                              {r.name}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {[r.city, r.isAlumni ? 'Alumni' : null, r.phone ? null : 'No phone'].filter(Boolean).join(' · ')}
                            </Typography>
                          </Box>
                        </Box>
                      </TableCell>
                      <TableCell>
                        <TextField select size="small" value={r.examType} onChange={(e) => update(r.userId, { examType: e.target.value as BatchRow['examType'] })} disabled={taken} sx={{ ...cellInputSx, minWidth: 96 }} inputProps={{ 'aria-label': `Exam for ${r.name}` }}>
                          {EXAMS.map((x) => (
                            <MenuItem key={x.value} value={x.value}>
                              {x.label}
                            </MenuItem>
                          ))}
                        </TextField>
                      </TableCell>
                      <TableCell>
                        <TextField
                          size="small"
                          value={r.examYear ?? ''}
                          onChange={(e) => update(r.userId, { examYear: e.target.value ? Number(e.target.value.replace(/\D/g, '').slice(0, 4)) : null })}
                          disabled={taken}
                          sx={{ ...cellInputSx, width: 80 }}
                          inputProps={{ inputMode: 'numeric', 'aria-label': `Exam year for ${r.name}` }}
                        />
                      </TableCell>
                      <TableCell>
                        <TextField
                          size="small"
                          value={r.rankText}
                          placeholder={noResult ? 'Add' : ''}
                          onChange={(e) => update(r.userId, { rankText: e.target.value.replace(/\D/g, ''), error: undefined })}
                          onBlur={() => update(r.userId, { error: checkRow(r) })}
                          error={Boolean(r.error)}
                          disabled={taken}
                          sx={{ ...cellInputSx, ...missingSx, width: 96 }}
                          inputProps={{ inputMode: 'numeric', 'aria-label': `All India Rank for ${r.name}` }}
                        />
                      </TableCell>
                      <TableCell>
                        <TextField
                          size="small"
                          value={r.percentileText}
                          placeholder={noResult ? 'or this' : ''}
                          onChange={(e) => update(r.userId, { percentileText: e.target.value.replace(/[^\d.]/g, ''), error: undefined })}
                          onBlur={() => update(r.userId, { error: checkRow(r) })}
                          error={Boolean(r.error)}
                          disabled={taken}
                          sx={{ ...cellInputSx, ...missingSx, width: 96 }}
                          inputProps={{ inputMode: 'decimal', 'aria-label': `Percentile for ${r.name}` }}
                        />
                        {r.error && (
                          <Typography variant="caption" color="error" role="alert" sx={{ display: 'block' }}>
                            {r.error}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        <TextField
                          size="small"
                          fullWidth
                          value={r.collegeAdmitted || ''}
                          onChange={(e) => update(r.userId, { collegeAdmitted: e.target.value || null })}
                          disabled={taken}
                          sx={cellInputSx}
                          inputProps={{ maxLength: 120, 'aria-label': `College for ${r.name}` }}
                        />
                      </TableCell>
                      <TableCell>
                        <TextField select size="small" value={r.mode} onChange={(e) => update(r.userId, { mode: e.target.value as Mode })} disabled={taken} sx={{ ...cellInputSx, minWidth: 112 }} inputProps={{ 'aria-label': `How ${r.name} studied` }}>
                          {MODES.map((m) => (
                            <MenuItem key={m.value} value={m.value}>
                              {m.label}
                            </MenuItem>
                          ))}
                        </TextField>
                      </TableCell>
                      <TableCell>
                        <TextField
                          select
                          size="small"
                          fullWidth
                          value={r.centreId || ''}
                          onChange={(e) => update(r.userId, { centreId: e.target.value || null })}
                          disabled={taken}
                          sx={cellInputSx}
                          inputProps={{ 'aria-label': `Centre for ${r.name}` }}
                          SelectProps={{ displayEmpty: true }}
                        >
                          <MenuItem value="">
                            <em>{defaultCentre ? 'Default centre' : 'None'}</em>
                          </MenuItem>
                          {centres.map((c) => (
                            <MenuItem key={c.id} value={c.id}>
                              {centreLabel(c)}
                            </MenuItem>
                          ))}
                        </TextField>
                      </TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>
                        {r.existingRequest ? (
                          <Typography variant="body2" color="text.secondary">
                            Has a link: {REVIEW_PROGRESS_LABELS[r.existingRequest.progress as ReviewRequestProgress] || r.existingRequest.progress}
                          </Typography>
                        ) : (
                          <Typography variant="body2" color={noResult ? 'warning.dark' : 'text.secondary'}>
                            {noResult ? 'Needs a result' : 'Ready'}
                          </Typography>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
            </TableBody>
          </Table>
        </TableContainer>
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2, justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
        <Typography variant="body2" color="text.secondary" aria-live="polite">
          {chosen.length} selected
          {missing ? `, ${missing} without a result (they can still be sent)` : ''}
          {rows.some((r) => r.existingRequest) ? `. ${rows.filter((r) => r.existingRequest).length} already have a link.` : ''}
        </Typography>
        <Stack direction="row" spacing={1}>
          <Button onClick={onClose} disabled={saving} sx={btnSx}>
            Cancel
          </Button>
          <Button variant="contained" onClick={create} disabled={saving || loading || chosen.length === 0} sx={{ ...btnSx, boxShadow: 'none' }}>
            {saving ? 'Creating...' : `Create ${chosen.length || ''} link${chosen.length === 1 ? '' : 's'}`}
          </Button>
        </Stack>
      </DialogActions>
    </Dialog>
  );
}
