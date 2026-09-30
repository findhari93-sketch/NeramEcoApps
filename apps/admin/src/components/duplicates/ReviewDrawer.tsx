'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent, type MouseEvent } from 'react';
import {
  Box,
  Drawer,
  Typography,
  IconButton,
  Button,
  Alert,
  AlertTitle,
  TextField,
  CircularProgress,
  Divider,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tooltip,
} from '@neram/ui';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CloseIcon from '@mui/icons-material/Close';
import MergeTypeIcon from '@mui/icons-material/MergeType';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import BlockIcon from '@mui/icons-material/Block';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import PersonOffOutlinedIcon from '@mui/icons-material/PersonOffOutlined';
import RefreshIcon from '@mui/icons-material/Refresh';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { formatIstDate, humanizeKey, isTypedConfirmation } from '@/lib/ops-format';
import { OpsSkeleton, StatusChip, FOCUS_RING, TARGET_44, SignInChips } from '@/components/ops/OpsUi';
import { ReasonChip, ConfidenceChip } from './PairCard';
import type { DuplicatePreviewResponse, PreviewRow } from './types';

type Phase = 'review' | 'merging' | 'done';

const ROWS: Array<{ key: keyof PreviewRow | 'signin'; label: string }> = [
  { key: 'name', label: 'Name' },
  { key: 'email', label: 'Email' },
  { key: 'personal_email', label: 'Personal email' },
  { key: 'phone', label: 'Phone' },
  { key: 'date_of_birth', label: 'Date of birth' },
  { key: 'academic_year', label: 'Batch' },
  { key: 'signin', label: 'Sign-in' },
];

function cellValue(row: Partial<PreviewRow> | undefined, key: keyof PreviewRow | 'signin') {
  if (!row) return null;
  if (key === 'signin') return <SignInChips person={row} />;
  const v = row[key];
  if (v === null || v === undefined || v === '') return null;
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
  tone: 'success' | 'error' | 'info';
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
 * The merge review. KEEP / DELETE / AFTER columns, the warnings, what moves,
 * then a typed MERGE before the destructive button is enabled.
 */
export default function ReviewDrawer({
  candidateId,
  onClose,
  onMerged,
  onDismissRequest,
  onOpenRecord,
}: {
  candidateId: string | null;
  onClose: () => void;
  onMerged: () => void;
  onDismissRequest: (candidateId: string, names: string) => void;
  /** Leave the queue for the kept record, without leaving this pair in the history. */
  onOpenRecord: (userId: string) => void;
}) {
  const open = !!candidateId;
  const [data, setData] = useState<DuplicatePreviewResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [typed, setTyped] = useState('');
  const [phase, setPhase] = useState<Phase>('review');
  const [mergeError, setMergeError] = useState('');
  const [mergedWinnerId, setMergedWinnerId] = useState<string | null>(null);
  const [movedRows, setMovedRows] = useState(0);
  const [showAllCounts, setShowAllCounts] = useState(false);

  const load = useCallback(async (id: string) => {
    setLoading(true);
    setLoadError('');
    setData(null);
    try {
      const res = await fetch(`/api/duplicates/${id}`, { cache: 'no-store' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Could not load this pair.');
      setData(body as DuplicatePreviewResponse);
    } catch (e: any) {
      setLoadError(e?.message || 'Could not load this pair.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!candidateId) return;
    setTyped('');
    setPhase('review');
    setMergeError('');
    setMergedWinnerId(null);
    setShowAllCounts(false);
    load(candidateId);
  }, [candidateId, load]);

  const counts = useMemo(
    () => [...(data?.preview.referenceCounts || [])].filter((r) => r.rows > 0).sort((a, b) => b.rows - a.rows),
    [data],
  );
  const totalRows = counts.reduce((s, r) => s + r.rows, 0);
  const visibleCounts = showAllCounts ? counts : counts.slice(0, 8);

  const names = data
    ? `${data.preview.winner.name || data.preview.winner.email || 'Record one'} and ${data.preview.loser.name || data.preview.loser.email || 'record two'}`
    : 'These two records';

  const canMerge = !!data && !data.refused && data.candidate.status === 'open' && isTypedConfirmation(typed) && phase === 'review';

  const merge = async () => {
    if (!data || !candidateId || !canMerge) return;
    setPhase('merging');
    setMergeError('');
    try {
      const res = await fetch(`/api/duplicates/${candidateId}/merge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expectedLoserId: data.loserId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'The merge did not complete. Nothing was changed.');
      setMergedWinnerId(body.winnerId || data.winnerId);
      setMovedRows(Array.isArray(body.summary) ? body.summary.reduce((s: number, r: any) => s + (r.rows || 0), 0) : 0);
      setPhase('done');
      onMerged();
    } catch (e: any) {
      setMergeError(e?.message || 'The merge did not complete. Nothing was changed.');
      setPhase('review');
    }
  };

  const closeIfIdle = () => {
    if (phase !== 'merging') onClose();
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
            <IconButton
              onClick={closeIfIdle}
              disabled={phase === 'merging'}
              aria-label="Close"
              sx={{ width: 44, height: 44, ...FOCUS_RING }}
            >
              <CloseIcon />
            </IconButton>
          </span>
        </Tooltip>
      </Box>

      <Box sx={{ p: { xs: 2, md: 3 } }}>
        {loading && (
          <Box aria-busy="true" aria-label="Loading the pair">
            <OpsSkeleton variant="rounded" width={220} height={26} sx={{ mb: 2 }} />
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
                  <Button color="inherit" startIcon={<RefreshIcon />} onClick={() => load(candidateId)} sx={{ textTransform: 'none', ...TARGET_44 }}>
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

        {data && !loading && phase === 'done' && (
          <Box role="status">
            <Alert severity="success" icon={<CheckCircleOutlineIcon />} sx={{ mb: 2 }}>
              <AlertTitle>Merged into one record</AlertTitle>
              {movedRows > 0 ? `${movedRows} linked rows moved to the kept record. ` : ''}The other record was deleted and the merge
              was logged.
            </Alert>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              {mergedWinnerId && (
                <Button
                  component="a"
                  href={`/crm/${mergedWinnerId}`}
                  onClick={(e: MouseEvent) => {
                    if (e.metaKey || e.ctrlKey || e.shiftKey) return;
                    e.preventDefault();
                    onOpenRecord(mergedWinnerId);
                  }}
                  variant="contained"
                  startIcon={<OpenInNewIcon />}
                  sx={{ ...TARGET_44, ...FOCUS_RING, textTransform: 'none' }}
                >
                  Open the kept record
                </Button>
              )}
              <Button variant="outlined" onClick={onClose} startIcon={<ArrowBackIcon />} sx={{ ...TARGET_44, ...FOCUS_RING, textTransform: 'none' }}>
                Back to the list
              </Button>
            </Box>
          </Box>
        )}

        {data && !loading && phase !== 'done' && (
          <>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2, alignItems: 'center' }}>
              <ReasonChip reason={data.candidate.reason} />
              <ConfidenceChip confidence={data.candidate.confidence} />
              <Typography variant="caption" color="text.secondary">
                Found {formatIstDate(data.candidate.detected_at)}
              </Typography>
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

            {data.preview.warnings
              .filter((w) => !(data.refused && /refused/i.test(w)))
              .map((w, i) => (
                <Alert key={i} severity="warning" icon={<WarningAmberIcon />} sx={{ mb: 1 }}>
                  {w}
                </Alert>
              ))}

            <Typography variant="subtitle2" component="h3" fontWeight={700} sx={{ mt: 2, mb: 1 }}>
              What the merge does
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: 1.5 }}>
              <Column title="Keep" icon={CheckCircleOutlineIcon} tone="success" row={data.preview.winner} />
              <Column title="Delete" icon={DeleteOutlineIcon} tone="error" row={data.preview.loser} />
              <Column title="After merge" icon={MergeTypeIcon} tone="info" row={{ ...data.preview.winner, ...data.preview.afterMerge }} emphasis />
            </Box>

            <Typography variant="subtitle2" component="h3" fontWeight={700} sx={{ mt: 3, mb: 0.5 }}>
              What will move to the kept record
            </Typography>
            {counts.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                The record being deleted has no linked rows. Nothing needs to move.
              </Typography>
            ) : (
              <>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  {totalRows} {totalRows === 1 ? 'row' : 'rows'} across {counts.length} {counts.length === 1 ? 'table' : 'tables'}.
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
                  <Button
                    onClick={() => setShowAllCounts((v) => !v)}
                    sx={{ mt: 0.5, textTransform: 'none', ...TARGET_44, ...FOCUS_RING }}
                  >
                    {showAllCounts ? 'Show fewer' : `Show all ${counts.length} tables`}
                  </Button>
                )}
              </>
            )}

            <Divider sx={{ my: 3 }} />

            {mergeError && (
              <Alert
                severity="error"
                sx={{ mb: 2 }}
                action={
                  candidateId ? (
                    <Button color="inherit" onClick={() => load(candidateId)} sx={{ textTransform: 'none', ...TARGET_44 }}>
                      Reload the pair
                    </Button>
                  ) : undefined
                }
              >
                {mergeError}
              </Alert>
            )}

            {!data.refused && data.candidate.status === 'open' && (
              <Box
                component="form"
                onSubmit={(e: FormEvent) => {
                  e.preventDefault();
                  merge();
                }}
                sx={{ p: 2, borderRadius: 1.5, border: '1px solid', borderColor: 'error.main' }}
              >
                <Typography variant="subtitle2" component="h3" fontWeight={700} sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                  <WarningAmberIcon aria-hidden fontSize="small" color="error" />
                  This cannot be undone
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 1.5 }}>
                  The Delete record is removed after its data moves to the Keep record. Type MERGE to confirm.
                </Typography>
                <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 1, alignItems: { sm: 'flex-start' } }}>
                  <TextField
                    label="Type MERGE"
                    value={typed}
                    onChange={(e) => setTyped(e.target.value)}
                    disabled={phase === 'merging'}
                    autoComplete="off"
                    inputProps={{ 'aria-describedby': 'merge-confirm-help', spellCheck: false }}
                    sx={{ flex: 1, minWidth: 0 }}
                  />
                  <Button
                    type="submit"
                    variant="contained"
                    color="error"
                    disabled={!canMerge}
                    startIcon={phase === 'merging' ? <CircularProgress size={16} color="inherit" /> : <MergeTypeIcon />}
                    sx={{ minHeight: 56, px: 3, textTransform: 'none', ...FOCUS_RING }}
                  >
                    {phase === 'merging' ? 'Merging' : 'Merge records'}
                  </Button>
                </Box>
                <Typography id="merge-confirm-help" variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                  {isTypedConfirmation(typed) ? 'Ready. The Merge button is on.' : 'The Merge button turns on when you type MERGE.'}
                </Typography>
              </Box>
            )}

            {data.candidate.status === 'open' && (
              <Box sx={{ mt: 2, display: 'flex', justifyContent: 'flex-end' }}>
                <Button
                  variant="outlined"
                  color="inherit"
                  startIcon={<PersonOffOutlinedIcon />}
                  onClick={() => candidateId && onDismissRequest(candidateId, names)}
                  disabled={phase === 'merging'}
                  sx={{ ...TARGET_44, ...FOCUS_RING, textTransform: 'none' }}
                >
                  Not the same person
                </Button>
              </Box>
            )}
          </>
        )}
      </Box>
    </Drawer>
  );
}
