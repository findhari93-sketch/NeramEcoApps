'use client';

/**
 * DownloadGrantDialog — teacher/admin grants selected students a time-limited download window for a
 * study-material file or folder (e.g. a printout request). Reuses the study-materials
 * /download-grants API. Mobile-first (full-screen on phones, large tap targets).
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Box, Typography, TextField, Button, Alert,
  CircularProgress, Divider, Checkbox, ToggleButton, ToggleButtonGroup, Chip, IconButton,
  InputAdornment, Stack, useMediaQuery,
} from '@neram/ui';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import SearchIcon from '@mui/icons-material/Search';
import CloseIcon from '@mui/icons-material/Close';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import LockClockOutlinedIcon from '@mui/icons-material/LockClockOutlined';

export interface GrantTarget {
  kind: 'file' | 'folder';
  id: string;
  name: string;
  /** For a file, its parent folder id — enables the "This folder" scope option. */
  folderId?: string | null;
}

interface StudentRow {
  id: string;
  name: string;
  email: string | null;
}

interface GrantRow {
  id: string;
  student_name: string | null;
  scope: 'file' | 'folder' | 'all';
  reason: string | null;
  expires_at: string;
}

interface DownloadGrantDialogProps {
  open: boolean;
  target: GrantTarget | null;
  classroomId: string | null;
  authFetch: (url: string, init?: RequestInit) => Promise<Response>;
  onClose: () => void;
}

type ScopeValue = 'file' | 'folder' | 'all';
type DurationValue = '1' | '7' | 'custom';

function expiryLabel(iso: string): string {
  const ms = Date.parse(iso) - Date.now();
  if (ms <= 0) return 'expired';
  const days = Math.floor(ms / 86_400_000);
  const hours = Math.floor((ms % 86_400_000) / 3_600_000);
  if (days >= 1) return `${days}d ${hours}h left`;
  const mins = Math.floor((ms % 3_600_000) / 60_000);
  return hours >= 1 ? `${hours}h ${mins}m left` : `${mins}m left`;
}

export default function DownloadGrantDialog({
  open,
  target,
  classroomId,
  authFetch,
  onClose,
}: DownloadGrantDialogProps) {
  const fullScreen = useMediaQuery('(max-width:599px)');

  const [scope, setScope] = useState<ScopeValue>('file');
  const [duration, setDuration] = useState<DurationValue>('7');
  const [customUntil, setCustomUntil] = useState('');
  const [reason, setReason] = useState('');

  const [students, setStudents] = useState<StudentRow[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [grants, setGrants] = useState<GrantRow[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const loadGrants = useCallback(async () => {
    if (!target) return;
    try {
      const param = target.kind === 'file' ? `fileId=${target.id}` : `folderId=${target.id}`;
      const res = await authFetch(`/api/study-materials/download-grants?${param}`);
      if (res.ok) {
        const body = await res.json();
        setGrants(body.grants || []);
      }
    } catch {
      /* non-fatal: the list just stays empty */
    }
  }, [target, authFetch]);

  // Reset + load roster and current grants whenever the dialog opens for a target.
  useEffect(() => {
    if (!open || !target) return;
    setScope(target.kind === 'file' ? 'file' : 'folder');
    setDuration('7');
    setCustomUntil('');
    setReason('');
    setSelected(new Set());
    setSearch('');
    setError('');
    loadGrants();

    if (!classroomId) {
      setStudents([]);
      return;
    }
    setLoadingStudents(true);
    authFetch(`/api/students?classroom=${classroomId}`)
      .then((r) => (r.ok ? r.json() : { students: [] }))
      .then((b) => setStudents(b.students || []))
      .catch(() => setStudents([]))
      .finally(() => setLoadingStudents(false));
  }, [open, target, classroomId, authFetch, loadGrants]);

  const filtered = students.filter((s) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      (s.name || '').toLowerCase().includes(q) || (s.email || '').toLowerCase().includes(q)
    );
  });

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const scopeOptions: { value: ScopeValue; label: string }[] =
    target?.kind === 'file'
      ? [
          { value: 'file', label: 'This file' },
          ...(target.folderId ? [{ value: 'folder' as ScopeValue, label: 'This folder' }] : []),
          { value: 'all', label: 'All materials' },
        ]
      : [
          { value: 'folder', label: 'This folder' },
          { value: 'all', label: 'All materials' },
        ];

  const durationLabel =
    duration === '1' ? '1 day' : duration === '7' ? '1 week' : 'custom date';

  const submit = async () => {
    if (!target || selected.size === 0 || submitting) return;
    if (duration === 'custom' && (!customUntil || Number.isNaN(Date.parse(customUntil)))) {
      setError('Pick a valid expiry date.');
      return;
    }
    setSubmitting(true);
    setError('');

    const fileId = scope === 'file' ? target.id : undefined;
    const folderId =
      scope === 'folder' ? (target.kind === 'folder' ? target.id : target.folderId) : undefined;
    const payloadBase: Record<string, unknown> = { scope, fileId, folderId, reason: reason.trim() };
    if (duration === 'custom') payloadBase.expiresAt = new Date(customUntil).toISOString();
    else payloadBase.durationDays = duration === '1' ? 1 : 7;

    try {
      const results = await Promise.all(
        [...selected].map((studentId) =>
          authFetch('/api/study-materials/download-grants', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...payloadBase, studentId }),
          }),
        ),
      );
      const failed = results.filter((r) => !r.ok).length;
      if (failed) {
        setError(`${failed} of ${results.length} grant${results.length === 1 ? '' : 's'} failed.`);
      }
      setSelected(new Set());
      await loadGrants();
    } catch (e: any) {
      setError(e?.message || 'Failed to grant download access');
    } finally {
      setSubmitting(false);
    }
  };

  const revoke = async (id: string) => {
    try {
      const res = await authFetch(`/api/study-materials/download-grants?id=${id}`, { method: 'DELETE' });
      if (res.ok) setGrants((g) => g.filter((x) => x.id !== id));
    } catch {
      /* ignore */
    }
  };

  return (
    <Dialog
      open={open}
      onClose={() => !submitting && onClose()}
      maxWidth="sm"
      fullWidth
      fullScreen={fullScreen}
      PaperProps={{ sx: { borderRadius: fullScreen ? 0 : 2 } }}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5, pb: 1 }}>
        <DownloadOutlinedIcon color="primary" />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="h6" fontWeight={700}>Grant download access</Typography>
          <Typography variant="caption" color="text.secondary" noWrap>
            {target?.name}
          </Typography>
        </Box>
        <IconButton onClick={() => !submitting && onClose()} aria-label="Close" sx={{ width: 40, height: 40 }}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <Divider />

      <DialogContent sx={{ pt: 2 }}>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        {/* Scope */}
        <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700 }}>
          What can they download?
        </Typography>
        <ToggleButtonGroup
          value={scope}
          exclusive
          size="small"
          onChange={(_, v) => v && setScope(v)}
          sx={{ mt: 0.5, mb: 2, flexWrap: 'wrap', '& .MuiToggleButton-root': { textTransform: 'none', minHeight: 40 } }}
        >
          {scopeOptions.map((o) => (
            <ToggleButton key={o.value} value={o.value}>{o.label}</ToggleButton>
          ))}
        </ToggleButtonGroup>

        {/* Duration */}
        <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700 }}>
          For how long?
        </Typography>
        <ToggleButtonGroup
          value={duration}
          exclusive
          size="small"
          onChange={(_, v) => v && setDuration(v)}
          sx={{ mt: 0.5, mb: duration === 'custom' ? 1 : 2, flexWrap: 'wrap', '& .MuiToggleButton-root': { textTransform: 'none', minHeight: 40 } }}
        >
          <ToggleButton value="1">1 day</ToggleButton>
          <ToggleButton value="7">1 week</ToggleButton>
          <ToggleButton value="custom">Custom</ToggleButton>
        </ToggleButtonGroup>
        {duration === 'custom' && (
          <TextField
            type="datetime-local"
            size="small"
            fullWidth
            label="Access until"
            InputLabelProps={{ shrink: true }}
            value={customUntil}
            onChange={(e) => setCustomUntil(e.target.value)}
            sx={{ mb: 2 }}
          />
        )}

        {/* Students */}
        <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700 }}>
          Who gets it? {selected.size > 0 && `(${selected.size} selected)`}
        </Typography>
        {!classroomId ? (
          <Alert severity="info" sx={{ mt: 1 }}>No active classroom, cannot list students.</Alert>
        ) : (
          <>
            <TextField
              size="small"
              fullWidth
              placeholder="Search students..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              sx={{ mt: 1, mb: 1 }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment>
                ),
              }}
            />
            <Box sx={{ maxHeight: 220, overflow: 'auto', border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
              {loadingStudents ? (
                <Box sx={{ p: 3, display: 'flex', justifyContent: 'center' }}><CircularProgress size={22} /></Box>
              ) : filtered.length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>No students found.</Typography>
              ) : (
                filtered.map((s) => (
                  <Box
                    key={s.id}
                    onClick={() => toggle(s.id)}
                    sx={{
                      display: 'flex', alignItems: 'center', gap: 1, px: 1, py: 0.5, cursor: 'pointer',
                      minHeight: 48, '&:hover': { bgcolor: 'action.hover' },
                      borderBottom: '1px solid', borderColor: 'divider',
                    }}
                  >
                    <Checkbox checked={selected.has(s.id)} tabIndex={-1} size="small" />
                    <Box sx={{ minWidth: 0 }}>
                      <Typography variant="body2" fontWeight={600} noWrap>{s.name}</Typography>
                      {s.email && <Typography variant="caption" color="text.secondary" noWrap>{s.email}</Typography>}
                    </Box>
                  </Box>
                ))
              )}
            </Box>
          </>
        )}

        {/* Reason */}
        <TextField
          size="small"
          fullWidth
          label="Reason (optional)"
          placeholder="e.g. requested a printout"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          sx={{ mt: 2 }}
        />

        {/* Active grants */}
        {grants.length > 0 && (
          <Box sx={{ mt: 3 }}>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700 }}>
              Active grants on this {target?.kind}
            </Typography>
            <Stack spacing={1} sx={{ mt: 1 }}>
              {grants.map((g) => (
                <Box
                  key={g.id}
                  sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}
                >
                  <LockClockOutlinedIcon fontSize="small" color="action" />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" fontWeight={600} noWrap>{g.student_name || 'Student'}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {g.scope === 'all' ? 'All materials' : g.scope === 'folder' ? 'This folder' : 'This file'}
                      {g.reason ? ` · ${g.reason}` : ''}
                    </Typography>
                  </Box>
                  <Chip size="small" label={expiryLabel(g.expires_at)} />
                  <IconButton size="small" onClick={() => revoke(g.id)} aria-label="Revoke grant">
                    <DeleteOutlineIcon fontSize="small" color="error" />
                  </IconButton>
                </Box>
              ))}
            </Stack>
          </Box>
        )}
      </DialogContent>

      <Divider />
      <DialogActions sx={{ p: 2, gap: 1 }}>
        <Button onClick={onClose} disabled={submitting} sx={{ textTransform: 'none' }}>Cancel</Button>
        <Button
          variant="contained"
          onClick={submit}
          disabled={submitting || selected.size === 0}
          startIcon={submitting ? <CircularProgress size={16} color="inherit" /> : <DownloadOutlinedIcon />}
          sx={{ textTransform: 'none', minWidth: 180 }}
        >
          {submitting ? 'Granting...' : `Grant to ${selected.size || 0} · ${durationLabel}`}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
