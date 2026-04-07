'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Button,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  Switch,
  FormControlLabel,
  IconButton,
  Alert,
  Snackbar,
  Tabs,
  Tab,
  Avatar,
  CircularProgress,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  InputAdornment,
  Tooltip,
} from '@neram/ui';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import AddIcon from '@mui/icons-material/Add';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import SearchIcon from '@mui/icons-material/Search';
import FileUploadIcon from '@mui/icons-material/FileUpload';
import StarIcon from '@mui/icons-material/Star';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import type { StudentResult, StudentResultExamType } from '@neram/database';

// ============================================
// CONSTANTS
// ============================================

const EXAM_TYPE_OPTIONS: { value: StudentResultExamType; label: string }[] = [
  { value: 'nata', label: 'NATA' },
  { value: 'jee_paper2', label: 'JEE Paper 2' },
  { value: 'tnea', label: 'TNEA' },
  { value: 'other', label: 'Other' },
];

const EXAM_TYPE_LABELS: Record<string, string> = {
  nata: 'NATA',
  jee_paper2: 'JEE Paper 2',
  tnea: 'TNEA',
  other: 'Other',
};

const EXAM_TYPE_COLORS: Record<string, 'primary' | 'secondary' | 'success' | 'warning' | 'info'> = {
  nata: 'primary',
  jee_paper2: 'secondary',
  tnea: 'success',
  other: 'info',
};

const TAB_FILTERS: (StudentResultExamType | 'all')[] = ['all', 'nata', 'jee_paper2', 'tnea', 'other'];
const TAB_LABELS = ['All', 'NATA', 'JEE Paper 2', 'TNEA', 'Other'];

const ROWS_PER_PAGE_OPTIONS = [10, 25, 50];

const emptyForm = {
  student_name: '',
  exam_type: 'nata' as StudentResultExamType,
  exam_year: new Date().getFullYear(),
  score: '',
  max_score: '',
  rank: '',
  percentile: '',
  college_name: '',
  college_city: '',
  course_name: '',
  student_quote: '',
  is_featured: false,
  is_published: false,
  photo_url: '',
  scorecard_url: '',
  scorecard_watermarked_url: '',
};

// ============================================
// COMPONENT
// ============================================

export default function StudentResultsPage() {
  // Data state
  const [results, setResults] = useState<StudentResult[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  // Filters & pagination
  const [tabIndex, setTabIndex] = useState(0);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);

  // Form dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<StudentResult | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Upload state
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [uploadingScorecard, setUploadingScorecard] = useState(false);

  // Bulk import dialog
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [csvText, setCsvText] = useState('');
  const [bulkImporting, setBulkImporting] = useState(false);
  const [bulkResult, setBulkResult] = useState<{
    total: number;
    success: number;
    failed: number;
    details: { row: number; success: boolean; error?: string; name?: string }[];
  } | null>(null);

  // Delete confirmation
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingItem, setDeletingItem] = useState<StudentResult | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Snackbar
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: 'success' | 'error' | 'info';
  }>({ open: false, message: '', severity: 'success' });

  // ============================================
  // DEBOUNCED SEARCH
  // ============================================

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(0);
    }, 400);
    return () => clearTimeout(timer);
  }, [search]);

  // ============================================
  // DATA FETCHING
  // ============================================

  const fetchResults = useCallback(async () => {
    try {
      setLoading(true);
      const examType = TAB_FILTERS[tabIndex];
      const params = new URLSearchParams();

      if (examType !== 'all') params.set('exam_type', examType);
      if (debouncedSearch) params.set('search', debouncedSearch);
      params.set('limit', String(rowsPerPage));
      params.set('offset', String(page * rowsPerPage));

      const res = await fetch(`/api/admin/student-results?${params.toString()}`);
      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || 'Failed to fetch');
      }

      setResults(json.data || []);
      setTotal(json.total || 0);
    } catch (error) {
      console.error('Error fetching student results:', error);
      setSnackbar({ open: true, message: 'Failed to load student results', severity: 'error' });
    } finally {
      setLoading(false);
    }
  }, [tabIndex, debouncedSearch, page, rowsPerPage]);

  useEffect(() => {
    fetchResults();
  }, [fetchResults]);

  // ============================================
  // INLINE TOGGLE (publish/featured)
  // ============================================

  const handleToggle = async (id: string, field: 'is_published' | 'is_featured', value: boolean) => {
    try {
      const res = await fetch(`/api/admin/student-results/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Update failed');
      }

      // Optimistic update
      setResults((prev) =>
        prev.map((r) => (r.id === id ? { ...r, [field]: value } : r))
      );

      const label = field === 'is_published' ? 'Published' : 'Featured';
      setSnackbar({
        open: true,
        message: `${label} status updated`,
        severity: 'success',
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Update failed';
      setSnackbar({ open: true, message: msg, severity: 'error' });
    }
  };

  // ============================================
  // FORM DIALOG
  // ============================================

  const handleOpenDialog = (item?: StudentResult) => {
    if (item) {
      setEditingItem(item);
      setForm({
        student_name: item.student_name,
        exam_type: item.exam_type,
        exam_year: item.exam_year,
        score: item.score != null ? String(item.score) : '',
        max_score: item.max_score != null ? String(item.max_score) : '',
        rank: item.rank != null ? String(item.rank) : '',
        percentile: item.percentile != null ? String(item.percentile) : '',
        college_name: item.college_name || '',
        college_city: item.college_city || '',
        course_name: item.course_name || '',
        student_quote: item.student_quote || '',
        is_featured: item.is_featured,
        is_published: item.is_published,
        photo_url: item.photo_url || '',
        scorecard_url: item.scorecard_url || '',
        scorecard_watermarked_url: item.scorecard_watermarked_url || '',
      });
    } else {
      setEditingItem(null);
      setForm(emptyForm);
    }
    setErrors({});
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingItem(null);
    setForm(emptyForm);
    setErrors({});
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!form.student_name.trim()) newErrors.student_name = 'Student name is required';
    if (!form.exam_type) newErrors.exam_type = 'Exam type is required';
    if (!form.exam_year || isNaN(Number(form.exam_year))) {
      newErrors.exam_year = 'Valid exam year is required';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;

    try {
      setSaving(true);
      const payload = {
        student_name: form.student_name.trim(),
        exam_type: form.exam_type,
        exam_year: Number(form.exam_year),
        score: form.score ? parseFloat(form.score) : null,
        max_score: form.max_score ? parseFloat(form.max_score) : null,
        rank: form.rank ? parseInt(form.rank, 10) : null,
        percentile: form.percentile ? parseFloat(form.percentile) : null,
        college_name: form.college_name.trim() || null,
        college_city: form.college_city.trim() || null,
        course_name: form.course_name.trim() || null,
        student_quote: form.student_quote.trim() || null,
        is_featured: form.is_featured,
        is_published: form.is_published,
        photo_url: form.photo_url || null,
        scorecard_url: form.scorecard_url || null,
        scorecard_watermarked_url: form.scorecard_watermarked_url || null,
      };

      const url = editingItem
        ? `/api/admin/student-results/${editingItem.id}`
        : '/api/admin/student-results';
      const method = editingItem ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || 'Save failed');
      }

      setSnackbar({
        open: true,
        message: editingItem ? 'Student result updated' : 'Student result created',
        severity: 'success',
      });
      handleCloseDialog();
      fetchResults();
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Save failed';
      setSnackbar({ open: true, message: msg, severity: 'error' });
    } finally {
      setSaving(false);
    }
  };

  // ============================================
  // FILE UPLOADS
  // ============================================

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setSnackbar({ open: true, message: 'Invalid file type. Use JPEG, PNG, or WebP.', severity: 'error' });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setSnackbar({ open: true, message: 'File too large. Maximum 5MB.', severity: 'error' });
      return;
    }

    try {
      setUploadingPhoto(true);
      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', 'photo');

      const res = await fetch('/api/admin/student-results/upload', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || `Upload failed (HTTP ${res.status})`);
      }

      const { photo_url } = await res.json();
      setForm((prev) => ({ ...prev, photo_url }));
      setSnackbar({ open: true, message: 'Photo uploaded', severity: 'success' });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Photo upload failed';
      setSnackbar({ open: true, message: msg, severity: 'error' });
    } finally {
      setUploadingPhoto(false);
      e.target.value = '';
    }
  };

  const handleScorecardUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setSnackbar({ open: true, message: 'Invalid file type. Use JPEG, PNG, or WebP.', severity: 'error' });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setSnackbar({ open: true, message: 'File too large. Maximum 5MB.', severity: 'error' });
      return;
    }

    try {
      setUploadingScorecard(true);
      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', 'scorecard');

      const res = await fetch('/api/admin/student-results/upload', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || `Upload failed (HTTP ${res.status})`);
      }

      const { scorecard_url, scorecard_watermarked_url } = await res.json();
      setForm((prev) => ({ ...prev, scorecard_url, scorecard_watermarked_url }));
      setSnackbar({ open: true, message: 'Scorecard uploaded and watermarked', severity: 'success' });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Scorecard upload failed';
      setSnackbar({ open: true, message: msg, severity: 'error' });
    } finally {
      setUploadingScorecard(false);
      e.target.value = '';
    }
  };

  // ============================================
  // DELETE
  // ============================================

  const handleDeleteClick = (item: StudentResult) => {
    setDeletingItem(item);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!deletingItem) return;

    try {
      setDeleting(true);
      const res = await fetch(`/api/admin/student-results/${deletingItem.id}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || 'Delete failed');
      }

      setSnackbar({ open: true, message: 'Student result deleted', severity: 'success' });
      setDeleteDialogOpen(false);
      setDeletingItem(null);
      fetchResults();
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Delete failed';
      setSnackbar({ open: true, message: msg, severity: 'error' });
    } finally {
      setDeleting(false);
    }
  };

  // ============================================
  // BULK IMPORT
  // ============================================

  const handleBulkImport = async () => {
    if (!csvText.trim()) {
      setSnackbar({ open: true, message: 'Please paste CSV data', severity: 'error' });
      return;
    }

    try {
      setBulkImporting(true);
      setBulkResult(null);

      const res = await fetch('/api/admin/student-results/bulk-import', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: csvText,
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || 'Bulk import failed');
      }

      setBulkResult(json);

      if (json.failed === 0) {
        setSnackbar({
          open: true,
          message: `Successfully imported ${json.success} results`,
          severity: 'success',
        });
      } else {
        setSnackbar({
          open: true,
          message: `Imported ${json.success} of ${json.total} (${json.failed} failed)`,
          severity: 'info',
        });
      }

      fetchResults();
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Bulk import failed';
      setSnackbar({ open: true, message: msg, severity: 'error' });
    } finally {
      setBulkImporting(false);
    }
  };

  const handleCloseBulkDialog = () => {
    setBulkDialogOpen(false);
    setCsvText('');
    setBulkResult(null);
  };

  // ============================================
  // RENDER
  // ============================================

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" fontWeight={700}>
          Student Results
        </Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="outlined"
            startIcon={<FileUploadIcon />}
            onClick={() => setBulkDialogOpen(true)}
          >
            Bulk Import
          </Button>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => handleOpenDialog()}
          >
            Add New
          </Button>
        </Box>
      </Box>

      {/* Tabs */}
      <Tabs
        value={tabIndex}
        onChange={(_e, newVal) => {
          setTabIndex(newVal);
          setPage(0);
        }}
        sx={{ mb: 2 }}
      >
        {TAB_LABELS.map((label, idx) => (
          <Tab key={TAB_FILTERS[idx]} label={label} />
        ))}
      </Tabs>

      {/* Search */}
      <TextField
        placeholder="Search by student name..."
        size="small"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        sx={{ mb: 2, width: 360 }}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon fontSize="small" />
            </InputAdornment>
          ),
        }}
      />

      {/* Data table */}
      <Paper variant="outlined">
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell width={60}>Photo</TableCell>
                <TableCell>Student Name</TableCell>
                <TableCell width={120}>Exam Type</TableCell>
                <TableCell width={80} align="center">Year</TableCell>
                <TableCell width={100} align="center">Score</TableCell>
                <TableCell width={80} align="center">Rank</TableCell>
                <TableCell>College</TableCell>
                <TableCell width={90} align="center">Published</TableCell>
                <TableCell width={90} align="center">Featured</TableCell>
                <TableCell width={100} align="center">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={10} align="center" sx={{ py: 6 }}>
                    <CircularProgress size={32} />
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                      Loading results...
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : results.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} align="center" sx={{ py: 6 }}>
                    <Typography variant="body2" color="text.secondary">
                      No student results found. Click "Add New" to create one.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                results.map((row) => (
                  <TableRow
                    key={row.id}
                    hover
                    sx={{ '&:last-child td': { borderBottom: 0 } }}
                  >
                    <TableCell>
                      <Avatar
                        src={row.photo_url || undefined}
                        alt={row.student_name}
                        sx={{ width: 40, height: 40 }}
                      >
                        {row.student_name.charAt(0).toUpperCase()}
                      </Avatar>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" fontWeight={600}>
                        {row.student_name}
                      </Typography>
                      {row.college_city && (
                        <Typography variant="caption" color="text.secondary">
                          {row.college_city}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={EXAM_TYPE_LABELS[row.exam_type] || row.exam_type}
                        color={EXAM_TYPE_COLORS[row.exam_type] || 'default'}
                        size="small"
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell align="center">{row.exam_year}</TableCell>
                    <TableCell align="center">
                      {row.score != null ? (
                        <Typography variant="body2">
                          {row.score}
                          {row.max_score != null && (
                            <Typography component="span" variant="caption" color="text.secondary">
                              /{row.max_score}
                            </Typography>
                          )}
                        </Typography>
                      ) : (
                        <Typography variant="caption" color="text.disabled">N/A</Typography>
                      )}
                    </TableCell>
                    <TableCell align="center">
                      {row.rank != null ? (
                        <Typography variant="body2" fontWeight={600}>
                          #{row.rank}
                        </Typography>
                      ) : (
                        <Typography variant="caption" color="text.disabled">N/A</Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" noWrap sx={{ maxWidth: 180 }}>
                        {row.college_name || ''}
                      </Typography>
                    </TableCell>
                    <TableCell align="center">
                      <Switch
                        checked={row.is_published}
                        onChange={(e) => handleToggle(row.id, 'is_published', e.target.checked)}
                        size="small"
                        color="success"
                      />
                    </TableCell>
                    <TableCell align="center">
                      <Tooltip title={row.is_featured ? 'Remove from featured' : 'Mark as featured'}>
                        <IconButton
                          size="small"
                          onClick={() => handleToggle(row.id, 'is_featured', !row.is_featured)}
                          color={row.is_featured ? 'warning' : 'default'}
                        >
                          {row.is_featured ? <StarIcon /> : <StarBorderIcon />}
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                    <TableCell align="center">
                      <Tooltip title="Edit">
                        <IconButton size="small" onClick={() => handleOpenDialog(row)}>
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Delete">
                        <IconButton size="small" color="error" onClick={() => handleDeleteClick(row)}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>

        <TablePagination
          component="div"
          count={total}
          page={page}
          onPageChange={(_e, newPage) => setPage(newPage)}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={(e) => {
            setRowsPerPage(parseInt(e.target.value, 10));
            setPage(0);
          }}
          rowsPerPageOptions={ROWS_PER_PAGE_OPTIONS}
        />
      </Paper>

      {/* ============================================ */}
      {/* CREATE / EDIT DIALOG                         */}
      {/* ============================================ */}
      <Dialog
        open={dialogOpen}
        onClose={handleCloseDialog}
        maxWidth="md"
        fullWidth
        PaperProps={{ sx: { maxHeight: '90vh' } }}
      >
        <DialogTitle>
          {editingItem ? 'Edit Student Result' : 'Add Student Result'}
        </DialogTitle>
        <DialogContent dividers>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2, pt: 1 }}>
            {/* Student Name */}
            <TextField
              label="Student Name"
              value={form.student_name}
              onChange={(e) => setForm((prev) => ({ ...prev, student_name: e.target.value }))}
              error={!!errors.student_name}
              helperText={errors.student_name}
              required
              fullWidth
            />

            {/* Exam Type */}
            <TextField
              label="Exam Type"
              select
              value={form.exam_type}
              onChange={(e) => setForm((prev) => ({ ...prev, exam_type: e.target.value as StudentResultExamType }))}
              error={!!errors.exam_type}
              helperText={errors.exam_type}
              required
              fullWidth
            >
              {EXAM_TYPE_OPTIONS.map((opt) => (
                <MenuItem key={opt.value} value={opt.value}>
                  {opt.label}
                </MenuItem>
              ))}
            </TextField>

            {/* Exam Year */}
            <TextField
              label="Exam Year"
              type="number"
              value={form.exam_year}
              onChange={(e) => setForm((prev) => ({ ...prev, exam_year: parseInt(e.target.value, 10) || 0 }))}
              error={!!errors.exam_year}
              helperText={errors.exam_year}
              required
              fullWidth
              inputProps={{ min: 2000, max: 2099 }}
            />

            {/* Score */}
            <TextField
              label="Score"
              type="number"
              value={form.score}
              onChange={(e) => setForm((prev) => ({ ...prev, score: e.target.value }))}
              fullWidth
              inputProps={{ step: 0.1 }}
            />

            {/* Max Score */}
            <TextField
              label="Max Score"
              type="number"
              value={form.max_score}
              onChange={(e) => setForm((prev) => ({ ...prev, max_score: e.target.value }))}
              fullWidth
              inputProps={{ step: 0.1 }}
            />

            {/* Rank */}
            <TextField
              label="Rank"
              type="number"
              value={form.rank}
              onChange={(e) => setForm((prev) => ({ ...prev, rank: e.target.value }))}
              fullWidth
              inputProps={{ min: 1 }}
            />

            {/* Percentile */}
            <TextField
              label="Percentile"
              type="number"
              value={form.percentile}
              onChange={(e) => setForm((prev) => ({ ...prev, percentile: e.target.value }))}
              fullWidth
              inputProps={{ step: 0.01, min: 0, max: 100 }}
            />

            {/* College Name */}
            <TextField
              label="College Name"
              value={form.college_name}
              onChange={(e) => setForm((prev) => ({ ...prev, college_name: e.target.value }))}
              fullWidth
            />

            {/* College City */}
            <TextField
              label="College City"
              value={form.college_city}
              onChange={(e) => setForm((prev) => ({ ...prev, college_city: e.target.value }))}
              fullWidth
            />

            {/* Course Name */}
            <TextField
              label="Course Name"
              value={form.course_name}
              onChange={(e) => setForm((prev) => ({ ...prev, course_name: e.target.value }))}
              fullWidth
            />

            {/* Student Quote (full width) */}
            <TextField
              label="Student Quote"
              value={form.student_quote}
              onChange={(e) => setForm((prev) => ({ ...prev, student_quote: e.target.value }))}
              fullWidth
              multiline
              rows={3}
              sx={{ gridColumn: { md: '1 / -1' } }}
              placeholder="Optional testimonial or quote from the student"
            />

            {/* Photo Upload */}
            <Box sx={{ gridColumn: { md: '1 / -1' } }}>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Student Photo
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                {form.photo_url && (
                  <Avatar
                    src={form.photo_url}
                    alt="Student photo"
                    sx={{ width: 64, height: 64 }}
                  />
                )}
                <Button
                  variant="outlined"
                  component="label"
                  startIcon={uploadingPhoto ? <CircularProgress size={16} /> : <CloudUploadIcon />}
                  disabled={uploadingPhoto}
                >
                  {uploadingPhoto ? 'Uploading...' : form.photo_url ? 'Change Photo' : 'Upload Photo'}
                  <input
                    type="file"
                    hidden
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handlePhotoUpload}
                  />
                </Button>
                {form.photo_url && (
                  <Button
                    size="small"
                    color="error"
                    onClick={() => setForm((prev) => ({ ...prev, photo_url: '' }))}
                  >
                    Remove
                  </Button>
                )}
              </Box>
            </Box>

            {/* Scorecard Upload */}
            <Box sx={{ gridColumn: { md: '1 / -1' } }}>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Scorecard Image (will be watermarked automatically)
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                {form.scorecard_watermarked_url && (
                  <Box
                    component="img"
                    src={form.scorecard_watermarked_url}
                    alt="Watermarked scorecard"
                    sx={{
                      width: 100,
                      height: 70,
                      objectFit: 'cover',
                      borderRadius: 1,
                      border: '1px solid',
                      borderColor: 'divider',
                    }}
                  />
                )}
                <Button
                  variant="outlined"
                  component="label"
                  startIcon={uploadingScorecard ? <CircularProgress size={16} /> : <CloudUploadIcon />}
                  disabled={uploadingScorecard}
                >
                  {uploadingScorecard ? 'Processing...' : form.scorecard_url ? 'Change Scorecard' : 'Upload Scorecard'}
                  <input
                    type="file"
                    hidden
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handleScorecardUpload}
                  />
                </Button>
                {form.scorecard_url && (
                  <Button
                    size="small"
                    color="error"
                    onClick={() =>
                      setForm((prev) => ({
                        ...prev,
                        scorecard_url: '',
                        scorecard_watermarked_url: '',
                      }))
                    }
                  >
                    Remove
                  </Button>
                )}
              </Box>
            </Box>

            {/* Switches */}
            <Box sx={{ gridColumn: { md: '1 / -1' }, display: 'flex', gap: 3 }}>
              <FormControlLabel
                control={
                  <Switch
                    checked={form.is_published}
                    onChange={(e) => setForm((prev) => ({ ...prev, is_published: e.target.checked }))}
                    color="success"
                  />
                }
                label="Published"
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={form.is_featured}
                    onChange={(e) => setForm((prev) => ({ ...prev, is_featured: e.target.checked }))}
                    color="warning"
                  />
                }
                label="Featured"
              />
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog} disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            variant="contained"
            disabled={saving}
            startIcon={saving ? <CircularProgress size={16} /> : undefined}
          >
            {saving ? 'Saving...' : editingItem ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ============================================ */}
      {/* DELETE CONFIRMATION DIALOG                   */}
      {/* ============================================ */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Delete Student Result</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete the result for{' '}
            <strong>{deletingItem?.student_name}</strong>? This will also remove
            associated photos and scorecards. This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)} disabled={deleting}>
            Cancel
          </Button>
          <Button
            onClick={handleDeleteConfirm}
            color="error"
            variant="contained"
            disabled={deleting}
            startIcon={deleting ? <CircularProgress size={16} /> : <DeleteIcon />}
          >
            {deleting ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ============================================ */}
      {/* BULK IMPORT DIALOG                           */}
      {/* ============================================ */}
      <Dialog open={bulkDialogOpen} onClose={handleCloseBulkDialog} maxWidth="md" fullWidth>
        <DialogTitle>Bulk Import Student Results</DialogTitle>
        <DialogContent dividers>
          <Alert severity="info" sx={{ mb: 2 }}>
            Paste CSV data with these columns (header row required):
            <br />
            <code>
              student_name, exam_type, exam_year, score, max_score, rank, percentile,
              college_name, college_city, course_name, student_quote
            </code>
            <br />
            <br />
            Valid exam types: <strong>nata, jee_paper2, tnea, other</strong>.
            All imported records will be set as unpublished by default.
          </Alert>

          <TextField
            label="CSV Data"
            multiline
            rows={12}
            fullWidth
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            placeholder={`student_name,exam_type,exam_year,score,max_score,rank,percentile,college_name,college_city,course_name,student_quote\nRahul Kumar,nata,2025,142,200,350,92.5,SPA Delhi,New Delhi,B.Arch,"Great coaching!"`}
            sx={{ fontFamily: 'monospace', fontSize: 13 }}
          />

          {bulkResult && (
            <Box sx={{ mt: 2 }}>
              <Alert severity={bulkResult.failed === 0 ? 'success' : 'warning'} sx={{ mb: 1 }}>
                Imported: {bulkResult.success} / {bulkResult.total}
                {bulkResult.failed > 0 && ` (${bulkResult.failed} failed)`}
              </Alert>

              {bulkResult.details.filter((d) => !d.success).length > 0 && (
                <Box sx={{ maxHeight: 200, overflow: 'auto' }}>
                  <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Failed rows:</Typography>
                  {bulkResult.details
                    .filter((d) => !d.success)
                    .map((d) => (
                      <Typography key={d.row} variant="caption" display="block" color="error.main">
                        Row {d.row}{d.name ? ` (${d.name})` : ''}: {d.error}
                      </Typography>
                    ))}
                </Box>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseBulkDialog} disabled={bulkImporting}>
            {bulkResult ? 'Close' : 'Cancel'}
          </Button>
          {!bulkResult && (
            <Button
              onClick={handleBulkImport}
              variant="contained"
              disabled={bulkImporting || !csvText.trim()}
              startIcon={bulkImporting ? <CircularProgress size={16} /> : <FileUploadIcon />}
            >
              {bulkImporting ? 'Importing...' : 'Import'}
            </Button>
          )}
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          severity={snackbar.severity}
          onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
          variant="filled"
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
