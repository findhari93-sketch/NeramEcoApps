'use client';

import { useCallback, useEffect, useMemo, useState, type MouseEvent } from 'react';
import {
  Box,
  Drawer,
  Typography,
  IconButton,
  Button,
  Alert,
  AlertTitle,
  CircularProgress,
  Divider,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tooltip,
  ToggleButton,
  ToggleButtonGroup,
} from '@neram/ui';
import { describeBlockedReason, UNDO_WINDOW_DAYS } from '@neram/database/duplicate-evidence';
import { formatPhoneForDisplay } from '@neram/database/phone';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CloseIcon from '@mui/icons-material/Close';
import MergeTypeIcon from '@mui/icons-material/MergeType';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import CallMergeIcon from '@mui/icons-material/CallMerge';
import BlockIcon from '@mui/icons-material/Block';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import PersonOffOutlinedIcon from '@mui/icons-material/PersonOffOutlined';
import PauseCircleOutlineIcon from '@mui/icons-material/PauseCircleOutline';
import RefreshIcon from '@mui/icons-material/Refresh';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import UndoIcon from '@mui/icons-material/Undo';
import { formatIstDate, humanizeKey } from '@/lib/ops-format';
import { OpsSkeleton, StatusChip, FOCUS_RING, TARGET_44, SignInChips } from '@/components/ops/OpsUi';
import { EvidenceLine, RelationChip } from './PairCard';
import type { DuplicatePreviewResponse, DuplicateRelation, PreviewRow } from './types';

type Phase = 'review' | 'merging' | 'done' | 'undoing' | 'undone';

const ROWS: Array<{ key: keyof PreviewRow | 'signin'; label: string }> = [
  { key: 'name', label: 'Name' },
  { key: 'email', label: 'Email' },
  { key: 'personal_email', label: 'Personal email' },
  { key: 'phone', label: 'Phone' },
  { key: 'date_of_birth', label: 'Date of birth' },
  { key: 'academic_year', label: 'Batch' },
  { key: 'signin', label: 'Sign-in' },
];

const RELATION_CHOICES: Array<{ value: DuplicateRelation; label: string; help: string }> = [
  { value: 'self', label: 'The same person', help: 'Missing details on the kept record are filled in from the other one.' },
  { value: 'parent', label: 'A parent', help: 'The student keeps their own details. The parent’s number and email are saved on the student as parent contacts.' },
  { value: 'unknown', label: 'Not sure', help: 'The student keeps their own details. The other number and email are saved on the student as family contacts.' },
];

function cellValue(row: Partial<PreviewRow> | undefined, key: keyof PreviewRow | 'signin') {
  if (!row) return null;
  if (key === 'signin') return <SignInChips person={row} />;
  const v = row[key];
  if (v === null || v === undefined || v === '') return null;
  if (key === 'phone') return formatPhoneForDisplay(String(v));
  return String(v);
}

function Column({
  title,
  icon,
  tone,
  row,
  emphasis,
}: {
  title: string;
  icon: typeof CheckCircleOutlineIcon;
  tone: 'success' | 'warning' | 'info';
  row: Partial<PreviewRow> | undefined;
  emphasis?: boolean;
}) {
  return (
    <Box
      component="section"
      aria-label={title}
      sx={{
        flex: 1,
        minWidth: 0,
        border: '1px solid',
        borderColor: emphasis ? 'primary.main' : 'divider',
        borderRadius: 1.5,
        p: 1.5,
        bgcolor: emphasis ? 'action.hover' : 'background.paper',
      }}
    >
      <Box sx={{ mb: 1 }}>
        <StatusChip icon={icon} label={title} tone={tone} />
      </Box>
      {ROWS.map(({ key, label }) => {
        const v = cellValue(row, key);
        return (
          <Box key={key} sx={{ mb: 1 }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontWeight: 600 }}>
              {label}
            </Typography>
            {typeof v === 'string' || v === null ? (
              <Typography variant="body2" sx={{ overflowWrap: 'anywhere', color: v ? 'text.primary' : 'text.secondary' }}>
                {v || 'Not set'}
              </Typography>
            ) : (
              v
            )}
          </Box>
        );
      })}
    </Box>
  );
}

/**
 * The merge review: why the pair matched, who the other record is (the person
 * can correct the guess), Keep / Folded in / After columns, what moves, then one
 * Merge button. Every merge can be undone for 30 days, so there is no typed
 * confirmation; Undo is offered straight after.
 */
export default function ReviewDrawer({
  candidateId,
  onClose,
  onMerged,
  onUndone,
  onDismissRequest,
  onOpenRecord,
}: {
  candidateId: string | null;
  onClose: () => void;
  onMerged: (result: { logId: string | null; names: string }) => void;
  onUndone: () => void;
  onDismissRequest: (candidateId: string, names: string) => void;
  /** Leave the queue for the kept record, without leaving this pair in the history. */
  onOpenRecord: (userId: string) => void;
}) {
  const open = !!candidateId;
  const [data, setData] = useState<DuplicatePreviewResponse | null>(null);
  const [relation, setRelation] = useState<DuplicateRelation | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [phase, setPhase] = useState<Phase>('review');
  const [actionError, setActionError] = useState('');
  const [result, setResult] = useState<{ winnerId: string; logId: string | null; movedRows: number } | null>(null);
  const [showAllCounts, setShowAllCounts] = useState(false);

  const load = useCallback(async (id: string, rel: DuplicateRelation | null) => {
    setLoading(true);
    setLoadError('');
    try {
      const res = await fetch(`/api/duplicates/${id}${rel ? `?relation=${rel}` : ''}`, { cache: 'no-store' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Could not load this pair.');
      setData(body as DuplicatePreviewResponse);
      setRelation((body as DuplicatePreviewResponse).relation);
    } catch (e: any) {
      setLoadError(e?.message || 'Could not load this pair.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!candidateId) return;
    setData(null);
    setRelation(null);
    setPhase('review');
    setActionError('');
    setResult(null);
    setShowAllCounts(false);
    load(candidateId, null);
  }, [candidateId, load]);

  const counts = useMemo(
    () => [...(data?.preview.referenceCounts || [])].filter((r) => r.rows > 0).sort((a, b) => b.rows - a.rows),
    [data],
  );
  const totalRows = counts.reduce((s, r) => s + r.rows, 0);
  const visibleCounts = showAllCounts ? counts : counts.slice(0, 8);

  const label = (r: PreviewRow) => (r.name && r.name !== 'User' ? r.name : formatPhoneForDisplay(r.phone) || r.email || 'an unnamed record');
  const names = data ? `${label(data.preview.winner)} and ${label(data.preview.loser)}` : 'These two records';
  const busy = phase === 'merging' || phase === 'undoing';
  const canMerge = !!data && !data.refused && data.candidate.status === 'open' && phase === 'review' && !loading;
  const blocked = data && data.candidate.status === 'open' && !data.candidate.auto_ok ? describeBlockedReason(data.candidate.blocked_reason) : null;

  const changeRelation = (next: DuplicateRelation | null) => {
    if (!next || !candidateId || next === relation) return;
    setRelation(next);
    load(candidateId, next);
  };

  const merge = async () => {
    if (!data || !candidateId || !canMerge) return;
    setPhase('merging');
    setActionError('');
    try {
      const res = await fetch(`/api/duplicates/${candidateId}/merge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expectedLoserId: data.loserId, relation }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'The merge did not complete. Nothing was changed.');
      const moved = Array.isArray(body.summary) ? body.summary.reduce((s: number, r: any) => s + (r.rows || 0), 0) : 0;
      setResult({ winnerId: body.winnerId || data.winnerId, logId: body.logId ?? null, movedRows: moved });
      setPhase('done');
      onMerged({ logId: body.logId ?? null, names });
    } catch (e: any) {
      setActionError(e?.message || 'The merge did not complete. Nothing was changed.');
      setPhase('review');
    }
  };

  const undo = async () => {
    if (!result?.logId) return;
    setPhase('undoing');
    setActionError('');
    try {
      const res = await fetch(`/api/duplicates/merges/${result.logId}/undo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: 'Undone straight after merging' }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'The undo did not complete.');
      setPhase('undone');
      onUndone();
    } catch (e: any) {
      setActionError(e?.message || 'The undo did not complete.');
      setPhase('done');
    }
  };

  const closeIfIdle = () => {
    if (!busy) onClose();
  };

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={closeIfIdle}
      PaperProps={{
        sx: { width: { xs: '100%', md: 760 }, maxWidth: '100%' },
        role: 'dialog',
        'aria-labelledby': 'review-drawer-title',
      } as any}
    >
      <Box
        sx={{
          position: 'sticky',
          top: 0,
          zIndex: 1,
          bgcolor: 'background.paper',
          borderBottom: '1px solid',
          borderColor: 'divider',
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          pl: { xs: 2, md: 3 },
          pr: 1,
          py: 0.5,
        }}
      >
        <Typography id="review-drawer-title" variant="h6" component="h2" fontWeight={700} sx={{ flex: 1, minWidth: 0 }} noWrap>
          Review pair
        </Typography>
        <Tooltip title="Close">
          <span>
            <IconButton onClick={closeIfIdle} disabled={busy} aria-label="Close" sx={{ width: 44, height: 44, ...FOCUS_RING }}>
              <CloseIcon />
            </IconButton>
          </span>
        </Tooltip>
      </Box>

      <Box sx={{ p: { xs: 2, md: 3 } }}>
        {loading && !data && (
          <Box aria-busy="true" aria-label="Loading the pair">
            <OpsSkeleton variant="rounded" height={64} sx={{ mb: 2 }} />
            <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: 1.5 }}>
              {[0, 1, 2].map((i) => (
                <OpsSkeleton key={i} variant="rounded" height={280} sx={{ flex: 1 }} />
              ))}
            </Box>
            <OpsSkeleton variant="rounded" height={120} sx={{ mt: 2 }} />
          </Box>
        )}

        {loadError && !loading && (
          <>
            <Alert
              severity="error"
              action={
                candidateId ? (
                  <Button color="inherit" startIcon={<RefreshIcon />} onClick={() => load(candidateId, relation)} sx={{ textTransform: 'none', ...TARGET_44 }}>
                    Try again
                  </Button>
                ) : undefined
              }
            >
              {loadError}
            </Alert>
            <Button variant="outlined" onClick={onClose} startIcon={<ArrowBackIcon />} sx={{ mt: 2, ...TARGET_44, ...FOCUS_RING, textTransform: 'none' }}>
              Back to the list
            </Button>
          </>
        )}

        {data && (phase === 'done' || phase === 'undoing' || phase === 'undone') && (
          <Box role="status">
            {phase === 'undone' ? (
              <Alert severity="info" icon={<UndoIcon />} sx={{ mb: 2 }}>
                <AlertTitle>Merge undone</AlertTitle>
                Both records are back as they were. The pair is in Needs review and will not merge on its own again.
              </Alert>
            ) : (
              <Alert severity="success" icon={<CheckCircleOutlineIcon />} sx={{ mb: 2 }}>
                <AlertTitle>Merged into one record</AlertTitle>
                {result && result.movedRows > 0 ? `${result.movedRows} linked rows moved to the kept record. ` : ''}
                You can undo this for {UNDO_WINDOW_DAYS} days from the Merged tabs.
              </Alert>
            )}
            {actionError && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {actionError}
              </Alert>
            )}
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              {result?.winnerId && phase !== 'undone' && (
                <Button
                  component="a"
                  href={`/crm/${result.winnerId}`}
                  onClick={(e: MouseEvent) => {
                    if (e.metaKey || e.ctrlKey || e.shiftKey) return;
                    e.preventDefault();
                    onOpenRecord(result.winnerId);
                  }}
                  variant="contained"
                  startIcon={<OpenInNewIcon />}
                  sx={{ ...TARGET_44, ...FOCUS_RING, textTransform: 'none' }}
                >
                  Open the kept record
                </Button>
              )}
              {result?.logId && phase !== 'undone' && (
                <Button
                  variant="outlined"
                  color="warning"
                  onClick={undo}
                  disabled={phase === 'undoing'}
                  startIcon={phase === 'undoing' ? <CircularProgress size={16} color="inherit" /> : <UndoIcon />}
                  sx={{ ...TARGET_44, ...FOCUS_RING, textTransform: 'none' }}
                >
                  {phase === 'undoing' ? 'Undoing' : 'Undo merge'}
                </Button>
              )}
              <Button
                variant="outlined"
                onClick={onClose}
                disabled={phase === 'undoing'}
                startIcon={<ArrowBackIcon />}
                sx={{ ...TARGET_44, ...FOCUS_RING, textTransform: 'none' }}
              >
                Back to the list
              </Button>
            </Box>
          </Box>
        )}

        {data && (phase === 'review' || phase === 'merging') && (
          <Box sx={{ opacity: loading ? 0.6 : 1, transition: 'opacity 150ms', '@media (prefers-reduced-motion: reduce)': { transition: 'none' } }} aria-busy={loading}>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 1.5, alignItems: 'center' }}>
              <RelationChip relation={data.candidate.relation_guess} />
              <Typography variant="caption" color="text.secondary">
                Found {formatIstDate(data.candidate.detected_at)}
              </Typography>
            </Box>

            <Box sx={{ p: 1.5, borderRadius: 1.5, bgcolor: 'action.hover', mb: 2, display: 'grid', gap: 1 }}>
              <EvidenceLine pair={data.candidate} />
              {blocked && (
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
                  <PauseCircleOutlineIcon aria-hidden fontSize="small" sx={{ color: 'warning.dark', mt: '2px' }} />
                  <Typography variant="body2">
                    <Box component="span" sx={{ fontWeight: 700 }}>
                      Why it waited for you:{' '}
                    </Box>
                    {blocked}
                  </Typography>
                </Box>
              )}
            </Box>

            {data.candidate.status !== 'open' && (
              <Alert severity="info" sx={{ mb: 2 }}>
                This pair is already closed ({data.candidate.status === 'merged' ? 'merged' : 'marked as different people'}).
              </Alert>
            )}

            {data.refused && (
              <Alert severity="error" icon={<BlockIcon />} sx={{ mb: 2 }}>
                <AlertTitle>Merge refused</AlertTitle>
                The two records are linked to different Microsoft accounts, so they belong to two people. Mark them as different
                people instead.
              </Alert>
            )}

            {data.candidate.status === 'open' && !data.refused && (
              <Box component="fieldset" sx={{ border: 0, p: 0, m: 0, mb: 2 }}>
                <Typography component="legend" variant="subtitle2" fontWeight={700} sx={{ mb: 0.75 }}>
                  The other record belongs to
                </Typography>
                <ToggleButtonGroup
                  exclusive
                  value={relation}
                  onChange={(_, v) => changeRelation(v)}
                  aria-label="Who the other record belongs to"
                  disabled={busy || loading}
                  sx={{ flexWrap: 'wrap', gap: 0.5, '& .MuiToggleButton-root': { borderRadius: '8px !important', border: '1px solid', borderColor: 'divider' } }}
                >
                  {RELATION_CHOICES.map((c) => (
                    <ToggleButton key={c.value} value={c.value} sx={{ ...TARGET_44, ...FOCUS_RING, textTransform: 'none', px: 2 }}>
                      {c.label}
                    </ToggleButton>
                  ))}
                </ToggleButtonGroup>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
                  {RELATION_CHOICES.find((c) => c.value === relation)?.help}
                </Typography>
              </Box>
            )}

            {data.preview.warnings
              .filter((w) => !(data.refused && /refused/i.test(w)))
              .map((w, i) => (
                <Alert key={i} severity="info" icon={<InfoOutlinedIcon />} sx={{ mb: 1 }}>
                  {w}
                </Alert>
              ))}

            <Typography variant="subtitle2" component="h3" fontWeight={700} sx={{ mt: 2, mb: 1 }}>
              What the merge does
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: 1.5 }}>
              <Column title="Keep" icon={CheckCircleOutlineIcon} tone="success" row={data.preview.winner} />
              <Column title="Folded in" icon={CallMergeIcon} tone="warning" row={data.preview.loser} />
              <Column title="After merge" icon={MergeTypeIcon} tone="info" row={{ ...data.preview.winner, ...data.preview.afterMerge }} emphasis />
            </Box>

            <Typography variant="subtitle2" component="h3" fontWeight={700} sx={{ mt: 3, mb: 0.5 }}>
              What moves to the kept record
            </Typography>
            {counts.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                The folded-in record has no linked rows. Nothing needs to move.
              </Typography>
            ) : (
              <>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  About {totalRows} {totalRows === 1 ? 'row' : 'rows'} across {counts.length} {counts.length === 1 ? 'table' : 'tables'}.
                </Typography>
                <Box sx={{ overflowX: 'auto', border: '1px solid', borderColor: 'divider', borderRadius: 1.5 }}>
                  <Table size="small" aria-label="Rows that will move">
                    <TableHead>
                      <TableRow>
                        <TableCell>Table</TableCell>
                        <TableCell>Column</TableCell>
                        <TableCell align="right">Rows</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {visibleCounts.map((r) => (
                        <TableRow key={`${r.table}.${r.column}`}>
                          <TableCell sx={{ overflowWrap: 'anywhere' }}>{humanizeKey(r.table)}</TableCell>
                          <TableCell sx={{ color: 'text.secondary', overflowWrap: 'anywhere' }}>{r.column}</TableCell>
                          <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                            {r.rows}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Box>
                {counts.length > 8 && (
                  <Button onClick={() => setShowAllCounts((v) => !v)} sx={{ mt: 0.5, textTransform: 'none', ...TARGET_44, ...FOCUS_RING }}>
                    {showAllCounts ? 'Show fewer' : `Show all ${counts.length} tables`}
                  </Button>
                )}
              </>
            )}

            <Divider sx={{ my: 3 }} />

            {actionError && (
              <Alert
                severity="error"
                sx={{ mb: 2 }}
                action={
                  candidateId ? (
                    <Button color="inherit" onClick={() => load(candidateId, relation)} sx={{ textTransform: 'none', ...TARGET_44 }}>
                      Reload the pair
                    </Button>
                  ) : undefined
                }
              >
                {actionError}
              </Alert>
            )}

            {data.candidate.status === 'open' && (
              <Box
                sx={{
                  display: 'flex',
                  flexDirection: { xs: 'column-reverse', sm: 'row' },
                  gap: 1,
                  justifyContent: 'space-between',
                  alignItems: { sm: 'center' },
                }}
              >
                <Button
                  variant="outlined"
                  color="inherit"
                  startIcon={<PersonOffOutlinedIcon />}
                  onClick={() => candidateId && onDismissRequest(candidateId, names)}
                  disabled={busy}
                  sx={{ ...TARGET_44, ...FOCUS_RING, textTransform: 'none' }}
                >
                  Not the same person
                </Button>
                {!data.refused && (
                  <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: { xs: 'stretch', sm: 'flex-end' }, gap: 0.5 }}>
                    <Button
                      variant="contained"
                      onClick={merge}
                      disabled={!canMerge}
                      startIcon={phase === 'merging' ? <CircularProgress size={16} color="inherit" /> : <MergeTypeIcon />}
                      sx={{ minHeight: 48, px: 3, textTransform: 'none', ...FOCUS_RING }}
                    >
                      {phase === 'merging' ? 'Merging' : 'Merge records'}
                    </Button>
                    <Typography variant="caption" color="text.secondary">
                      You can undo a merge for {UNDO_WINDOW_DAYS} days.
                    </Typography>
                  </Box>
                )}
              </Box>
            )}
          </Box>
        )}
      </Box>
    </Drawer>
  );
}
