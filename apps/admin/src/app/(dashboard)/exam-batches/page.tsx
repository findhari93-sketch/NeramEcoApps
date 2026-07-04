// @ts-nocheck
'use client';

/**
 * Exam Batches admin: manage the exam-year cohort registry (users.academic_year).
 * Edit each batch's label, start/closing dates and status, and pick the single
 * "current" batch that every admin user-list defaults to.
 *
 * This is the exam-year cohort ONLY. It is not course-class scheduling
 * (/courses, `batches` table) and not Nexus classroom sections (`nexus_batches`).
 */

import { useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  TextField,
  MenuItem,
  Select,
  Chip,
  IconButton,
  Tooltip,
  Alert,
  Divider,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControlLabel,
  Checkbox,
} from '@neram/ui';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import StarIcon from '@mui/icons-material/Star';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import SaveIcon from '@mui/icons-material/Save';
import AddIcon from '@mui/icons-material/Add';
import SchoolIcon from '@mui/icons-material/School';
import { useBatches } from '@/contexts/BatchContext';
import { useAdminProfile } from '@/contexts/AdminProfileContext';

const STATUSES = ['open', 'active', 'closed'] as const;
const CODE_REGEX = /^[0-9]{4}-[0-9]{2}$/;

const STATUS_COLOR: Record<string, 'success' | 'info' | 'default'> = {
  open: 'info',
  active: 'success',
  closed: 'default',
};

export default function ExamBatchesPage() {
  const { batches, current, needsAssignment, loading, error, refresh } = useBatches();
  const { supabaseUserId } = useAdminProfile();

  const [busyCode, setBusyCode] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  // Per-row local edits, keyed by code. Only fields the admin touched are sent.
  const [edits, setEdits] = useState<Record<string, any>>({});
  // New-batch form
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ code: '', label: '', start_date: '', end_date: '', status: 'open' });
  // Graduate-batch confirmation
  const [gradTarget, setGradTarget] = useState<any | null>(null);
  const [gradOffboardMs, setGradOffboardMs] = useState(false);
  const [grading, setGrading] = useState(false);

  const setEdit = (code: string, field: string, value: any) =>
    setEdits((prev) => ({ ...prev, [code]: { ...prev[code], [field]: value } }));

  const rowValue = (b: any, field: string) => (edits[b.code]?.[field] ?? b[field] ?? '');
  const isDirty = (code: string) => edits[code] && Object.keys(edits[code]).length > 0;

  const post = async (body: any) => {
    const res = await fetch('/api/academic-batches', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, adminId: supabaseUserId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  };

  const patch = async (body: any) => {
    const res = await fetch('/api/academic-batches', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, adminId: supabaseUserId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  };

  const saveRow = async (b: any) => {
    setBusyCode(b.code);
    setNotice(null);
    try {
      await patch({ code: b.code, ...edits[b.code] });
      setEdits((prev) => {
        const next = { ...prev };
        delete next[b.code];
        return next;
      });
      setNotice({ type: 'success', text: `Saved ${b.code}.` });
      refresh();
    } catch (e: any) {
      setNotice({ type: 'error', text: e.message });
    } finally {
      setBusyCode(null);
    }
  };

  const makeCurrent = async (b: any) => {
    if (b.is_current) return;
    setBusyCode(b.code);
    setNotice(null);
    try {
      await patch({ action: 'set-current', code: b.code });
      setNotice({ type: 'success', text: `${b.code} is now the current batch. Every list defaults to it.` });
      refresh();
    } catch (e: any) {
      setNotice({ type: 'error', text: e.message });
    } finally {
      setBusyCode(null);
    }
  };

  const createBatch = async () => {
    if (!CODE_REGEX.test(form.code.trim())) {
      setNotice({ type: 'error', text: 'Code must be in YYYY-YY format, e.g. 2028-29.' });
      return;
    }
    setCreating(true);
    setNotice(null);
    try {
      await post({
        code: form.code.trim(),
        label: form.label || null,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        status: form.status,
      });
      setForm({ code: '', label: '', start_date: '', end_date: '', status: 'open' });
      setNotice({ type: 'success', text: `Created batch ${form.code.trim()}.` });
      refresh();
    } catch (e: any) {
      setNotice({ type: 'error', text: e.message });
    } finally {
      setCreating(false);
    }
  };

  const graduateBatch = async () => {
    if (!gradTarget) return;
    setGrading(true);
    setNotice(null);
    try {
      const res = await fetch('/api/academic-batches/graduate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: gradTarget.code, adminId: supabaseUserId, offboardMicrosoft: gradOffboardMs }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to graduate batch');
      setNotice({
        type: 'success',
        text: `Batch ${gradTarget.code}: graduated ${data.graduated ?? 0} student(s) to alumni and closed the batch.`,
      });
      setGradTarget(null);
      setGradOffboardMs(false);
      refresh();
    } catch (e: any) {
      setNotice({ type: 'error', text: e.message });
    } finally {
      setGrading(false);
    }
  };

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1100 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 0.5 }}>
        <CalendarMonthIcon sx={{ color: '#1976d2' }} />
        <Typography variant="h5" fontWeight={800}>Exam Batches</Typography>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        The exam-year cohort each student and lead belongs to (the year they sit the entrance exam).
        Every admin and Nexus user-list defaults to the current batch. Set the closing date whenever
        the exam board announces it.
      </Typography>

      {current && (
        <Alert severity="info" icon={<StarIcon fontSize="inherit" />} sx={{ mb: 2 }}>
          Current batch: <strong>{current.code}</strong>
          {current.label ? ` (${current.label})` : ''}. New default view everywhere.
          {' '}Needs a batch: <strong>{needsAssignment.student}</strong> students, <strong>{needsAssignment.lead}</strong> leads.
        </Alert>
      )}
      {notice && (
        <Alert severity={notice.type} sx={{ mb: 2 }} onClose={() => setNotice(null)}>
          {notice.text}
        </Alert>
      )}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Paper variant="outlined" sx={{ mb: 3, overflow: 'hidden' }}>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: '90px 1.4fr 150px 150px 130px 120px 120px',
            gap: 1,
            px: 2, py: 1.25,
            bgcolor: 'grey.50',
            fontWeight: 700,
            fontSize: 13,
            color: 'text.secondary',
          }}
        >
          <Box>Code</Box>
          <Box>Label</Box>
          <Box>Start date</Box>
          <Box>Closing date</Box>
          <Box>Status</Box>
          <Box>Current</Box>
          <Box />
        </Box>
        <Divider />
        {loading ? (
          <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress size={24} /></Box>
        ) : batches.length === 0 ? (
          <Box sx={{ p: 4, textAlign: 'center', color: 'text.secondary' }}>No batches yet. Create one below.</Box>
        ) : (
          batches.map((b: any) => (
            <Box
              key={b.code}
              sx={{
                display: 'grid',
                gridTemplateColumns: '90px 1.4fr 150px 150px 130px 120px 120px',
                gap: 1,
                px: 2, py: 1,
                alignItems: 'center',
                borderBottom: '1px solid',
                borderColor: 'divider',
                bgcolor: b.is_current ? 'rgba(25,118,210,0.04)' : 'transparent',
              }}
            >
              <Box sx={{ fontWeight: 700 }}>{b.code}</Box>
              <TextField
                size="small" variant="standard" placeholder="Label"
                value={rowValue(b, 'label')}
                onChange={(e) => setEdit(b.code, 'label', e.target.value)}
              />
              <TextField
                size="small" type="date" variant="standard"
                value={rowValue(b, 'start_date') || ''}
                onChange={(e) => setEdit(b.code, 'start_date', e.target.value)}
              />
              <TextField
                size="small" type="date" variant="standard"
                value={rowValue(b, 'end_date') || ''}
                onChange={(e) => setEdit(b.code, 'end_date', e.target.value)}
              />
              <Select
                size="small" variant="standard"
                value={rowValue(b, 'status') || 'open'}
                onChange={(e) => setEdit(b.code, 'status', e.target.value)}
                renderValue={(v) => <Chip size="small" label={v} color={STATUS_COLOR[v as string] || 'default'} />}
              >
                {STATUSES.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
              </Select>
              <Box>
                {b.is_current ? (
                  <Chip size="small" icon={<StarIcon />} label="Current" color="primary" />
                ) : (
                  <Tooltip title="Make this the current batch">
                    <span>
                      <Button
                        size="small"
                        startIcon={<StarBorderIcon />}
                        disabled={busyCode === b.code}
                        onClick={() => makeCurrent(b)}
                        sx={{ textTransform: 'none' }}
                      >
                        Set
                      </Button>
                    </span>
                  </Tooltip>
                )}
              </Box>
              <Box sx={{ textAlign: 'right' }}>
                <Tooltip title="Save changes">
                  <span>
                    <IconButton
                      size="small"
                      color="primary"
                      disabled={!isDirty(b.code) || busyCode === b.code}
                      onClick={() => saveRow(b)}
                    >
                      {busyCode === b.code ? <CircularProgress size={16} /> : <SaveIcon fontSize="small" />}
                    </IconButton>
                  </span>
                </Tooltip>
                <Tooltip title={b.status === 'closed' ? 'Batch already closed' : 'Graduate this batch to alumni & close it'}>
                  <span>
                    <IconButton
                      size="small"
                      color="secondary"
                      disabled={b.status === 'closed' || busyCode === b.code}
                      onClick={() => { setGradTarget(b); setGradOffboardMs(false); }}
                    >
                      <SchoolIcon fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
              </Box>
            </Box>
          ))
        )}
      </Paper>

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1.5 }}>Add a batch</Typography>
        <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center' }}>
          <TextField
            size="small" label="Code (YYYY-YY)" placeholder="2028-29" sx={{ width: 150 }}
            value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })}
          />
          <TextField
            size="small" label="Label" sx={{ width: 200 }}
            value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })}
          />
          <TextField
            size="small" label="Start date" type="date" InputLabelProps={{ shrink: true }} sx={{ width: 160 }}
            value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })}
          />
          <TextField
            size="small" label="Closing date" type="date" InputLabelProps={{ shrink: true }} sx={{ width: 160 }}
            value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })}
          />
          <Select
            size="small" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}
            sx={{ width: 120 }}
          >
            {STATUSES.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
          </Select>
          <Button
            variant="contained" startIcon={<AddIcon />} disabled={creating}
            onClick={createBatch} sx={{ textTransform: 'none' }}
          >
            {creating ? 'Adding...' : 'Add batch'}
          </Button>
        </Box>
      </Paper>

      {/* Graduate & close confirmation */}
      <Dialog open={!!gradTarget} onClose={() => !grading && setGradTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <SchoolIcon color="secondary" /> Graduate batch {gradTarget?.code}
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 1.5 }}>
            This graduates every <strong>active architecture student</strong> in batch{' '}
            <strong>{gradTarget?.code}</strong> to alumni: it revokes their Nexus access, deactivates
            their enrollments, archives them in the CRM, and marks the batch <strong>closed</strong>.
            Software-course students are not affected. This is reversible from the Alumni screen.
          </Typography>
          <FormControlLabel
            control={<Checkbox checked={gradOffboardMs} onChange={(e) => setGradOffboardMs(e.target.checked)} />}
            label="Also offboard their Microsoft accounts (remove license + disable sign-in)"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setGradTarget(null)} disabled={grading}>Cancel</Button>
          <Button
            variant="contained" color="secondary" onClick={graduateBatch} disabled={grading}
            startIcon={grading ? <CircularProgress size={16} color="inherit" /> : <SchoolIcon />}
          >
            {grading ? 'Graduating...' : 'Graduate & close'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
