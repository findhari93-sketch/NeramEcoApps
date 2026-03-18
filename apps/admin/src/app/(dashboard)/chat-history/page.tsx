'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Box,
  Typography,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  IconButton,
  Alert,
  Snackbar,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  InputAdornment,
  Tooltip,
  CircularProgress,
  Divider,
} from '@neram/ui';
import ThumbUpIcon from '@mui/icons-material/ThumbUp';
import ThumbUpOutlinedIcon from '@mui/icons-material/ThumbUpOutlined';
import EditNoteIcon from '@mui/icons-material/EditNote';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import SearchIcon from '@mui/icons-material/Search';
import ForumIcon from '@mui/icons-material/Forum';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import DataTable from '@/components/DataTable';

interface Conversation {
  id: string;
  session_id: string;
  user_id: string | null;
  lead_name: string | null;
  user_message: string;
  ai_response: string | null;
  source: string;
  thumbs_up: boolean | null;
  admin_correction: string | null;
  promoted_to_kb: boolean;
  created_at: string;
}

export default function ChatHistoryPage() {
  const [rows, setRows] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [correctionText, setCorrectionText] = useState('');
  const [refinedText, setRefinedText] = useState('');
  const [saving, setSaving] = useState(false);
  const [refining, setRefining] = useState(false);
  const [promotingKb, setPromotingKb] = useState(false);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false, message: '', severity: 'success',
  });

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showSnackbar = (message: string, severity: 'success' | 'error') => {
    setSnackbar({ open: true, message, severity });
  };

  const fetchData = useCallback(async (p: number, ps: number, q: string, src: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(p + 1),
        limit: String(ps),
        ...(q ? { search: q } : {}),
        ...(src ? { source: src } : {}),
      });
      const res = await fetch(`/api/chatbot-logs?${params}`);
      const json = await res.json();
      setRows(json.conversations || []);
      setTotal(json.total || 0);
    } catch {
      showSnackbar('Failed to load chat history', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(page, pageSize, search, sourceFilter);
  }, [page, pageSize, sourceFilter, fetchData]);

  const handleSearchChange = (value: string) => {
    setSearch(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setPage(0);
      fetchData(0, pageSize, value, sourceFilter);
    }, 500);
  };

  const handleThumbsUp = async (row: Conversation) => {
    const newValue = row.thumbs_up ? null : true;
    // Optimistic update
    setRows((prev) => prev.map((r) => r.id === row.id ? { ...r, thumbs_up: newValue } : r));
    try {
      const res = await fetch(`/api/chatbot-logs/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ thumbs_up: newValue }),
      });
      if (!res.ok) throw new Error('Failed');
    } catch {
      // Revert
      setRows((prev) => prev.map((r) => r.id === row.id ? { ...r, thumbs_up: row.thumbs_up } : r));
      showSnackbar('Failed to update rating', 'error');
    }
  };

  const openCorrection = (row: Conversation) => {
    setSelected(row);
    setCorrectionText(row.admin_correction || '');
    setDialogOpen(true);
  };

  const handleSaveCorrection = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/chatbot-logs/${selected.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ admin_correction: correctionText.trim() || null }),
      });
      if (!res.ok) throw new Error('Failed');
      const json = await res.json();
      setRows((prev) => prev.map((r) => r.id === selected.id ? { ...r, ...json.data } : r));
      setSelected((s) => s ? { ...s, admin_correction: correctionText.trim() || null } : s);
      showSnackbar('Correction saved', 'success');
    } catch {
      showSnackbar('Failed to save correction', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleRefineWithAI = async () => {
    if (!selected || !correctionText.trim()) return;
    setRefining(true);
    try {
      const res = await fetch('/api/aintra/refine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: selected.user_message,
          rawAnswer: correctionText.trim(),
        }),
      });
      if (!res.ok) throw new Error('Refine failed');
      const json = await res.json();
      setRefinedText(json.refined || '');
      showSnackbar('Answer refined by AI', 'success');
    } catch {
      showSnackbar('Failed to refine - you can still add manually', 'error');
    } finally {
      setRefining(false);
    }
  };

  const handleAddToKb = async () => {
    if (!selected) return;
    const answerToAdd = refinedText.trim() || selected.admin_correction;
    if (!answerToAdd) return;
    setPromotingKb(true);
    try {
      // Create KB item
      const kbRes = await fetch('/api/aintra/kb', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: selected.user_message,
          answer: answerToAdd,
          category: 'General',
          is_active: true,
          display_order: 0,
        }),
      });
      if (!kbRes.ok) throw new Error('KB create failed');

      // Mark as promoted
      const patchRes = await fetch(`/api/chatbot-logs/${selected.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ promoted_to_kb: true }),
      });
      if (!patchRes.ok) throw new Error('Promote failed');

      setRows((prev) => prev.map((r) => r.id === selected.id ? { ...r, promoted_to_kb: true } : r));
      setSelected((s) => s ? { ...s, promoted_to_kb: true } : s);
      showSnackbar('Added to Aintra Knowledge Base!', 'success');
    } catch {
      showSnackbar('Failed to add to KB', 'error');
    } finally {
      setPromotingKb(false);
    }
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })
      + ' ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  };

  const columns = [
    {
      field: 'created_at',
      headerName: 'Time',
      width: 150,
      renderCell: (params: any) => (
        <Typography variant="caption" color="text.secondary">{formatDate(params.value)}</Typography>
      ),
    },
    {
      field: 'lead_name',
      headerName: 'User',
      width: 150,
      renderCell: (params: any) => (
        <Typography variant="body2" color={params.value ? 'text.primary' : 'text.disabled'}>
          {params.value || 'Unknown'}
        </Typography>
      ),
    },
    {
      field: 'source',
      headerName: 'Source',
      width: 100,
      renderCell: (params: any) => (
        <Chip
          label={params.value === 'nata_chatbot' ? 'NATA' : 'General'}
          size="small"
          color={params.value === 'nata_chatbot' ? 'secondary' : 'primary'}
          variant="outlined"
        />
      ),
    },
    {
      field: 'user_message',
      headerName: 'Question',
      flex: 2,
      renderCell: (params: any) => (
        <Typography variant="body2" sx={{ py: 1, lineHeight: 1.4 }}>
          {params.value?.length > 100 ? `${params.value.slice(0, 100)}…` : params.value}
        </Typography>
      ),
    },
    {
      field: 'ai_response',
      headerName: 'AI Answer',
      flex: 3,
      renderCell: (params: any) => (
        <Typography variant="body2" color="text.secondary" sx={{ py: 1, lineHeight: 1.4 }}>
          {params.value
            ? params.value.length > 120 ? `${params.value.slice(0, 120)}…` : params.value
            : '—'}
        </Typography>
      ),
    },
    {
      field: 'thumbs_up',
      headerName: 'Rating',
      width: 80,
      sortable: false,
      renderCell: (params: any) => (
        <Tooltip title={params.value ? 'Unmark good answer' : 'Mark as good answer'} arrow>
          <IconButton size="small" onClick={() => handleThumbsUp(params.row)}>
            {params.value
              ? <ThumbUpIcon fontSize="small" sx={{ color: 'success.main' }} />
              : <ThumbUpOutlinedIcon fontSize="small" sx={{ color: 'text.disabled' }} />}
          </IconButton>
        </Tooltip>
      ),
    },
    {
      field: 'admin_correction',
      headerName: 'Correction',
      width: 110,
      sortable: false,
      renderCell: (params: any) => (
        <Tooltip title="Add or view correction" arrow>
          <Chip
            label={params.value ? 'View' : 'Add'}
            size="small"
            icon={<EditNoteIcon />}
            color={params.value ? 'warning' : 'default'}
            variant={params.value ? 'filled' : 'outlined'}
            onClick={() => openCorrection(params.row)}
            sx={{ cursor: 'pointer' }}
          />
        </Tooltip>
      ),
    },
    {
      field: 'promoted_to_kb',
      headerName: 'In KB',
      width: 70,
      sortable: false,
      renderCell: (params: any) => (
        params.value
          ? <Tooltip title="Added to Aintra KB" arrow><CheckCircleIcon fontSize="small" sx={{ color: 'success.main' }} /></Tooltip>
          : <Typography variant="body2" color="text.disabled">—</Typography>
      ),
    },
  ];

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <ForumIcon color="primary" />
          <Box>
            <Typography variant="h5" fontWeight={700}>Chat History</Typography>
            <Typography variant="body2" color="text.secondary">
              All user conversations with Aintra — rate, correct, and train.
            </Typography>
          </Box>
        </Box>
        <Typography variant="body2" color="text.secondary">{total} conversations</Typography>
      </Box>

      {/* Filters */}
      <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
        <TextField
          size="small"
          placeholder="Search questions…"
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
          sx={{ flex: 1, maxWidth: 400 }}
          InputProps={{
            startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment>,
          }}
        />
        <FormControl size="small" sx={{ minWidth: 140 }}>
          <InputLabel>Source</InputLabel>
          <Select
            value={sourceFilter}
            label="Source"
            onChange={(e) => { setSourceFilter(e.target.value); setPage(0); }}
          >
            <MenuItem value="">All</MenuItem>
            <MenuItem value="general_chatbot">General</MenuItem>
            <MenuItem value="nata_chatbot">NATA</MenuItem>
          </Select>
        </FormControl>
      </Box>

      {/* Table */}
      <DataTable
        rows={rows}
        columns={columns}
        loading={loading}
        getRowId={(row: Conversation) => row.id}
        rowHeight={64}
        paginationMode="server"
        rowCount={total}
        paginationModel={{ page, pageSize }}
        onPaginationModelChange={(model: any) => {
          setPage(model.page);
          setPageSize(model.pageSize);
        }}
        pageSizeOptions={[25, 50, 100]}
      />

      {/* Correction Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Answer Correction</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
          {selected && (
            <>
              <Box sx={{ p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
                <Typography variant="caption" color="text.secondary" fontWeight={600}>USER QUESTION</Typography>
                <Typography variant="body2" sx={{ mt: 0.5 }}>{selected.user_message}</Typography>
              </Box>
              {selected.ai_response && (
                <Box sx={{ p: 2, bgcolor: 'primary.50', borderRadius: 1 }}>
                  <Typography variant="caption" color="primary.main" fontWeight={600}>AINTRA'S ANSWER</Typography>
                  <Typography variant="body2" sx={{ mt: 0.5, whiteSpace: 'pre-wrap' }}>
                    {selected.ai_response.slice(0, 600)}{selected.ai_response.length > 600 ? '…' : ''}
                  </Typography>
                </Box>
              )}
              <TextField
                label="Better / Corrected Answer"
                value={correctionText}
                onChange={(e) => setCorrectionText(e.target.value)}
                multiline
                rows={5}
                fullWidth
                placeholder="Write the accurate answer here. This can be promoted to Aintra's knowledge base."
              />
              {selected.admin_correction && !selected.promoted_to_kb && !refinedText && (
                <Alert severity="info">
                  Correction saved. Click <strong>Refine with AI</strong> to polish it, then <strong>Add to Aintra KB</strong>.
                </Alert>
              )}
              {selected.promoted_to_kb && (
                <Alert severity="success">This correction has already been added to Aintra's Knowledge Base.</Alert>
              )}
            </>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
          <Button onClick={() => setDialogOpen(false)} disabled={saving || promotingKb || refining}>Close</Button>
          <Button variant="outlined" onClick={handleSaveCorrection} disabled={saving || promotingKb || refining || !correctionText.trim()}>
            {saving ? 'Saving…' : 'Save Correction'}
          </Button>
          {(selected?.admin_correction || correctionText.trim()) && !selected?.promoted_to_kb && (
            <Button
              variant="contained"
              color="success"
              onClick={handleAddToKb}
              disabled={promotingKb || saving || refining}
              startIcon={promotingKb ? <CircularProgress size={16} color="inherit" /> : undefined}
            >
              {promotingKb ? 'Adding...' : refinedText ? 'Add Refined Answer to KB' : 'Add to Aintra KB'}
            </Button>
          )}
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert
          onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
          severity={snackbar.severity}
          variant="filled"
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
