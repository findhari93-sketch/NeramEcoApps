// @ts-nocheck
'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Paper,
  Chip,
  TextField,
  Button,
  IconButton,
  Tooltip,
  Alert,
  Tab,
  Tabs,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  CircularProgress,
  Snackbar,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Drawer,
  LinearProgress,
  Checkbox,
  FormControlLabel,
  Switch,
  MenuItem,
  Select,
  InputLabel,
  FormControl,
} from '@neram/ui';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import SearchIcon from '@mui/icons-material/Search';
import RefreshIcon from '@mui/icons-material/Refresh';
import VisibilityIcon from '@mui/icons-material/Visibility';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CloseIcon from '@mui/icons-material/Close';
import PlaylistAddCheckIcon from '@mui/icons-material/PlaylistAddCheck';
import SchoolIcon from '@mui/icons-material/School';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import InitializeIcon from '@mui/icons-material/PlaylistAdd';
import { useAdminProfile } from '@/contexts/AdminProfileContext';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OnboardingStep {
  id: string;
  step_key: string;
  title: string;
  description: string | null;
  icon_name: string | null;
  action_type: 'link' | 'in_app' | 'manual';
  action_config: any;
  display_order: number;
  is_required: boolean;
  is_active: boolean;
  applies_to: string[];
  created_at: string;
  updated_at: string;
}

interface StudentProgressOverview {
  student_profile_id: string;
  student_name: string;
  phone: string | null;
  course_name: string | null;
  batch_name: string | null;
  completed_count: number;
  total_count: number;
}

interface StudentProgressDetail {
  id: string;
  step_id: string;
  step_key: string;
  title: string;
  description: string | null;
  icon_name: string | null;
  is_required: boolean;
  is_completed: boolean;
  completed_by: string | null;
  completed_by_role: 'student' | 'admin' | null;
  completed_at: string | null;
  admin_notes: string | null;
}

interface Batch {
  id: string;
  name: string;
}

const EMPTY_STEP: Omit<OnboardingStep, 'id' | 'created_at' | 'updated_at'> = {
  step_key: '',
  title: '',
  description: '',
  icon_name: '',
  action_type: 'manual',
  action_config: '',
  display_order: 0,
  is_required: true,
  is_active: true,
  applies_to: ['regular'],
};

const ACTION_TYPE_OPTIONS = [
  { value: 'link', label: 'External Link' },
  { value: 'in_app', label: 'In-App Action' },
  { value: 'manual', label: 'Manual / Admin Verified' },
];

const ENROLLMENT_TYPE_OPTIONS = [
  { value: 'regular', label: 'Regular' },
  { value: 'direct', label: 'Direct' },
];

const COMPLETION_FILTER_OPTIONS = [
  { value: 'all', label: 'All Students' },
  { value: 'complete', label: 'Fully Completed' },
  { value: 'incomplete', label: 'Incomplete' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ---------------------------------------------------------------------------
// Tab Panel
// ---------------------------------------------------------------------------

function TabPanel({ children, value, index }: { children: React.ReactNode; value: number; index: number }) {
  return (
    <Box role="tabpanel" hidden={value !== index} sx={{ pt: 2 }}>
      {value === index && children}
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function StudentOnboardingPage() {
  const { supabaseUserId } = useAdminProfile();
  const [tabValue, setTabValue] = useState(0);
  const [snackbar, setSnackbar] = useState({ open: false, message: '' });

  return (
    <Box>
      {/* Page Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box
            sx={{
              width: 42,
              height: 42,
              borderRadius: 1,
              bgcolor: '#7B1FA2',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <PlaylistAddCheckIcon sx={{ color: 'white', fontSize: 22 }} />
          </Box>
          <Box>
            <Typography variant="h5" fontWeight={700} sx={{ lineHeight: 1.2 }}>
              Student Onboarding
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Manage onboarding steps and track student progress
            </Typography>
          </Box>
        </Box>
      </Box>

      {/* Tabs */}
      <Paper
        elevation={0}
        sx={{ borderRadius: 1, border: '1px solid', borderColor: 'grey.200', mb: 2 }}
      >
        <Tabs
          value={tabValue}
          onChange={(_, v) => setTabValue(v)}
          sx={{ borderBottom: 1, borderColor: 'divider', px: 2 }}
        >
          <Tab label="Step Definitions" sx={{ textTransform: 'none', fontWeight: 600 }} />
          <Tab label="Student Progress" sx={{ textTransform: 'none', fontWeight: 600 }} />
        </Tabs>
      </Paper>

      <TabPanel value={tabValue} index={0}>
        <StepDefinitionsTab
          snackbar={snackbar}
          setSnackbar={setSnackbar}
        />
      </TabPanel>

      <TabPanel value={tabValue} index={1}>
        <StudentProgressTab
          adminUserId={supabaseUserId}
          snackbar={snackbar}
          setSnackbar={setSnackbar}
        />
      </TabPanel>

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={() => setSnackbar({ open: false, message: '' })}
        message={snackbar.message}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </Box>
  );
}

// ===========================================================================
// TAB 1: Step Definitions
// ===========================================================================

function StepDefinitionsTab({
  snackbar,
  setSnackbar,
}: {
  snackbar: { open: boolean; message: string };
  setSnackbar: (s: { open: boolean; message: string }) => void;
}) {
  const [steps, setSteps] = useState<OnboardingStep[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingStep, setEditingStep] = useState<OnboardingStep | null>(null);
  const [formData, setFormData] = useState({ ...EMPTY_STEP });
  const [saving, setSaving] = useState(false);

  // Delete confirmation
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchSteps = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/onboarding-steps');
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Failed to fetch steps (HTTP ${res.status})`);
      }
      const data = await res.json();
      setSteps(data.data || data || []);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch steps');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSteps();
  }, [fetchSteps]);

  // Open Add dialog
  const handleAdd = () => {
    setEditingStep(null);
    const maxOrder = steps.length > 0 ? Math.max(...steps.map((s) => s.display_order)) : 0;
    setFormData({ ...EMPTY_STEP, display_order: maxOrder + 1 });
    setDialogOpen(true);
  };

  // Open Edit dialog
  const handleEdit = (step: OnboardingStep) => {
    setEditingStep(step);
    setFormData({
      step_key: step.step_key,
      title: step.title,
      description: step.description || '',
      icon_name: step.icon_name || '',
      action_type: step.action_type,
      action_config: typeof step.action_config === 'object' ? JSON.stringify(step.action_config) : (step.action_config || ''),
      display_order: step.display_order,
      is_required: step.is_required,
      is_active: step.is_active,
      applies_to: step.applies_to || ['regular'],
    });
    setDialogOpen(true);
  };

  // Save (create or update)
  const handleSave = async () => {
    if (!formData.step_key.trim() || !formData.title.trim()) {
      setSnackbar({ open: true, message: 'Step Key and Title are required' });
      return;
    }

    setSaving(true);
    try {
      // Parse action_config as JSON if possible
      let actionConfig = formData.action_config;
      if (typeof actionConfig === 'string' && actionConfig.trim()) {
        try {
          actionConfig = JSON.parse(actionConfig);
        } catch {
          // Keep as string if not valid JSON
        }
      }

      const body = {
        step_key: formData.step_key.trim(),
        title: formData.title.trim(),
        description: formData.description?.trim() || null,
        icon_name: formData.icon_name?.trim() || null,
        action_type: formData.action_type,
        action_config: actionConfig || null,
        display_order: formData.display_order,
        is_required: formData.is_required,
        is_active: formData.is_active,
        applies_to: formData.applies_to,
      };

      let res;
      if (editingStep) {
        res = await fetch(`/api/onboarding-steps/${editingStep.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      } else {
        res = await fetch('/api/onboarding-steps', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      }

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to save step');
      }

      setSnackbar({ open: true, message: editingStep ? 'Step updated successfully' : 'Step created successfully' });
      setDialogOpen(false);
      setEditingStep(null);
      fetchSteps();
    } catch (err: any) {
      setSnackbar({ open: true, message: err.message || 'Failed to save step' });
    } finally {
      setSaving(false);
    }
  };

  // Delete
  const handleDeleteClick = (stepId: string) => {
    setDeleteTargetId(stepId);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!deleteTargetId) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/onboarding-steps/${deleteTargetId}`, { method: 'DELETE' });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to delete step');
      }
      setSnackbar({ open: true, message: 'Step deleted successfully' });
      setDeleteDialogOpen(false);
      setDeleteTargetId(null);
      fetchSteps();
    } catch (err: any) {
      setSnackbar({ open: true, message: err.message || 'Failed to delete step' });
    } finally {
      setDeleting(false);
    }
  };

  // Toggle applies_to chip
  const toggleAppliesTo = (value: string) => {
    setFormData((prev) => {
      const current = prev.applies_to || [];
      if (current.includes(value)) {
        return { ...prev, applies_to: current.filter((v) => v !== value) };
      }
      return { ...prev, applies_to: [...current, value] };
    });
  };

  return (
    <Box>
      {/* Top bar */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
        <Typography variant="subtitle1" fontWeight={600}>
          Onboarding Step Templates
        </Typography>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          <Tooltip title="Refresh">
            <span>
              <IconButton size="small" onClick={fetchSteps} disabled={loading}>
                <RefreshIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={handleAdd}
            sx={{ borderRadius: 1, fontWeight: 600, textTransform: 'none' }}
          >
            Add Step
          </Button>
        </Box>
      </Box>

      {/* Error */}
      {error && (
        <Alert severity="error" sx={{ mb: 2, borderRadius: 1 }}>
          {error}
        </Alert>
      )}

      {/* Table */}
      <Paper
        elevation={0}
        sx={{ borderRadius: 1, border: '1px solid', borderColor: 'grey.200', overflow: 'hidden' }}
      >
        {loading && steps.length === 0 ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 300 }}>
            <CircularProgress />
          </Box>
        ) : steps.length === 0 ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: 250, gap: 2 }}>
            <PlaylistAddCheckIcon sx={{ fontSize: 48, color: 'grey.400' }} />
            <Typography color="text.secondary">No onboarding steps defined yet</Typography>
            <Button
              variant="outlined"
              startIcon={<AddIcon />}
              onClick={handleAdd}
              sx={{ borderRadius: 1, textTransform: 'none' }}
            >
              Add Your First Step
            </Button>
          </Box>
        ) : (
          <TableContainer sx={{ maxHeight: 600 }}>
            <Table stickyHeader size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600, width: 50 }}>#</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Key</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Title</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Type</TableCell>
                  <TableCell sx={{ fontWeight: 600 }} align="center">Required</TableCell>
                  <TableCell sx={{ fontWeight: 600 }} align="center">Active</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Applies To</TableCell>
                  <TableCell sx={{ fontWeight: 600 }} align="center">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {steps
                  .sort((a, b) => a.display_order - b.display_order)
                  .map((step) => (
                    <TableRow key={step.id} hover>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <DragIndicatorIcon sx={{ fontSize: 16, color: 'grey.400' }} />
                          <Typography variant="body2" fontWeight={500}>
                            {step.display_order}
                          </Typography>
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" fontFamily="monospace" sx={{ fontSize: '0.8rem' }}>
                          {step.step_key}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" fontWeight={500}>
                          {step.title}
                        </Typography>
                        {step.description && (
                          <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block', maxWidth: 250 }}>
                            {step.description}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={ACTION_TYPE_OPTIONS.find((o) => o.value === step.action_type)?.label || step.action_type}
                          size="small"
                          variant="outlined"
                          sx={{ fontWeight: 500, fontSize: '0.75rem' }}
                        />
                      </TableCell>
                      <TableCell align="center">
                        <Chip
                          label={step.is_required ? 'Yes' : 'No'}
                          size="small"
                          color={step.is_required ? 'error' : 'default'}
                          variant={step.is_required ? 'filled' : 'outlined'}
                          sx={{ fontWeight: 500, fontSize: '0.75rem', minWidth: 40 }}
                        />
                      </TableCell>
                      <TableCell align="center">
                        <Chip
                          label={step.is_active ? 'Active' : 'Inactive'}
                          size="small"
                          color={step.is_active ? 'success' : 'default'}
                          variant={step.is_active ? 'filled' : 'outlined'}
                          sx={{ fontWeight: 500, fontSize: '0.75rem' }}
                        />
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', gap: 0.5 }}>
                          {(step.applies_to || []).map((type) => (
                            <Chip
                              key={type}
                              label={type}
                              size="small"
                              variant="outlined"
                              color={type === 'regular' ? 'primary' : 'secondary'}
                              sx={{ fontSize: '0.7rem', textTransform: 'capitalize' }}
                            />
                          ))}
                        </Box>
                      </TableCell>
                      <TableCell align="center">
                        <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center' }}>
                          <Tooltip title="Edit Step">
                            <IconButton size="small" onClick={() => handleEdit(step)}>
                              <EditIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Delete Step">
                            <IconButton size="small" color="error" onClick={() => handleDeleteClick(step.id)}>
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </Box>
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 600 }}>
          {editingStep ? 'Edit Onboarding Step' : 'Add Onboarding Step'}
        </DialogTitle>
        <DialogContent dividers>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <TextField
              label="Step Key"
              value={formData.step_key}
              onChange={(e) => setFormData((p) => ({ ...p, step_key: e.target.value }))}
              required
              size="small"
              placeholder="e.g. join_whatsapp_group"
              helperText="Unique identifier (snake_case)"
            />
            <TextField
              label="Title"
              value={formData.title}
              onChange={(e) => setFormData((p) => ({ ...p, title: e.target.value }))}
              required
              size="small"
              placeholder="e.g. Join WhatsApp Group"
            />
            <TextField
              label="Description"
              value={formData.description}
              onChange={(e) => setFormData((p) => ({ ...p, description: e.target.value }))}
              size="small"
              multiline
              rows={2}
              placeholder="Brief description of this step"
            />
            <TextField
              label="Icon Name"
              value={formData.icon_name}
              onChange={(e) => setFormData((p) => ({ ...p, icon_name: e.target.value }))}
              size="small"
              placeholder="e.g. WhatsApp, Laptop, Groups, Person"
              helperText="MUI icon name for display in student app"
            />
            <TextField
              select
              label="Action Type"
              value={formData.action_type}
              onChange={(e) => setFormData((p) => ({ ...p, action_type: e.target.value as any }))}
              size="small"
            >
              {ACTION_TYPE_OPTIONS.map((opt) => (
                <MenuItem key={opt.value} value={opt.value}>
                  {opt.label}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="Action Config (JSON)"
              value={formData.action_config}
              onChange={(e) => setFormData((p) => ({ ...p, action_config: e.target.value }))}
              size="small"
              multiline
              rows={2}
              placeholder='e.g. {"url": "https://chat.whatsapp.com/..."} or {"route": "/setup-profile"}'
              helperText="JSON object with url, route, or other config"
            />
            <TextField
              label="Display Order"
              type="number"
              value={formData.display_order}
              onChange={(e) => setFormData((p) => ({ ...p, display_order: parseInt(e.target.value, 10) || 0 }))}
              size="small"
            />
            <Box sx={{ display: 'flex', gap: 3 }}>
              <FormControlLabel
                control={
                  <Switch
                    checked={formData.is_required}
                    onChange={(e) => setFormData((p) => ({ ...p, is_required: e.target.checked }))}
                  />
                }
                label="Required"
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={formData.is_active}
                    onChange={(e) => setFormData((p) => ({ ...p, is_active: e.target.checked }))}
                  />
                }
                label="Active"
              />
            </Box>
            <Box>
              <Typography variant="body2" fontWeight={500} sx={{ mb: 1 }}>
                Applies To
              </Typography>
              <Box sx={{ display: 'flex', gap: 1 }}>
                {ENROLLMENT_TYPE_OPTIONS.map((opt) => (
                  <Chip
                    key={opt.value}
                    label={opt.label}
                    onClick={() => toggleAppliesTo(opt.value)}
                    color={formData.applies_to?.includes(opt.value) ? 'primary' : 'default'}
                    variant={formData.applies_to?.includes(opt.value) ? 'filled' : 'outlined'}
                    sx={{ cursor: 'pointer' }}
                  />
                ))}
              </Box>
            </Box>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setDialogOpen(false)} sx={{ textTransform: 'none' }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={saving}
            startIcon={saving ? <CircularProgress size={16} /> : null}
            sx={{ textTransform: 'none', fontWeight: 600 }}
          >
            {saving ? 'Saving...' : editingStep ? 'Update Step' : 'Create Step'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => { setDeleteDialogOpen(false); setDeleteTargetId(null); }} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 600 }}>Delete Onboarding Step</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            Are you sure you want to delete this onboarding step? This will also remove all student progress records for this step. This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => { setDeleteDialogOpen(false); setDeleteTargetId(null); }} sx={{ textTransform: 'none' }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={confirmDelete}
            disabled={deleting}
            startIcon={deleting ? <CircularProgress size={16} /> : <DeleteIcon />}
            sx={{ textTransform: 'none', fontWeight: 600 }}
          >
            {deleting ? 'Deleting...' : 'Delete Permanently'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

// ===========================================================================
// TAB 2: Student Progress
// ===========================================================================

function StudentProgressTab({
  adminUserId,
  snackbar,
  setSnackbar,
}: {
  adminUserId: string | null;
  snackbar: { open: boolean; message: string };
  setSnackbar: (s: { open: boolean; message: string }) => void;
}) {
  const [students, setStudents] = useState<StudentProgressOverview[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [searchDebounce, setSearchDebounce] = useState<NodeJS.Timeout | null>(null);
  const [batchFilter, setBatchFilter] = useState('');
  const [completionFilter, setCompletionFilter] = useState('all');
  const [batches, setBatches] = useState<Batch[]>([]);

  // Pagination
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(20);

  // Drawer
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [selectedStudentName, setSelectedStudentName] = useState('');
  const [selectedStudentPhone, setSelectedStudentPhone] = useState('');
  const [selectedStudentCourse, setSelectedStudentCourse] = useState('');
  const [selectedStudentBatch, setSelectedStudentBatch] = useState('');
  const [progressDetails, setProgressDetails] = useState<StudentProgressDetail[]>([]);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [initializing, setInitializing] = useState(false);

  // Fetch batches
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/batches');
        if (res.ok) {
          const data = await res.json();
          setBatches(data.data || data || []);
        }
      } catch {
        // Silent fail
      }
    })();
  }, []);

  // Fetch students
  const fetchStudents = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      params.set('page', String(page + 1));
      params.set('limit', String(rowsPerPage));
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (batchFilter) params.set('batchId', batchFilter);
      if (completionFilter && completionFilter !== 'all') params.set('completionFilter', completionFilter);

      const res = await fetch(`/api/onboarding-steps/students?${params.toString()}`);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Failed to fetch students (HTTP ${res.status})`);
      }
      const data = await res.json();
      setStudents(data.data || []);
      setTotalCount(data.pagination?.total || 0);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch students');
    } finally {
      setLoading(false);
    }
  }, [page, rowsPerPage, debouncedSearch, batchFilter, completionFilter]);

  useEffect(() => {
    fetchStudents();
  }, [fetchStudents]);

  // Search debounce
  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    if (searchDebounce) clearTimeout(searchDebounce);
    const timeout = setTimeout(() => {
      setDebouncedSearch(value);
      setPage(0);
    }, 400);
    setSearchDebounce(timeout);
  };

  // Open drawer for a student
  const openDrawer = async (student: StudentProgressOverview) => {
    setSelectedStudentId(student.student_profile_id);
    setSelectedStudentName(student.student_name);
    setSelectedStudentPhone(student.phone || '');
    setSelectedStudentCourse(student.course_name || '');
    setSelectedStudentBatch(student.batch_name || '');
    setDrawerOpen(true);
    setDrawerLoading(true);

    try {
      const res = await fetch(`/api/onboarding-steps/students/${student.student_profile_id}`);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to fetch progress');
      }
      const data = await res.json();
      setProgressDetails(data.data || data || []);
    } catch (err: any) {
      setSnackbar({ open: true, message: err.message || 'Failed to fetch progress' });
      setProgressDetails([]);
    } finally {
      setDrawerLoading(false);
    }
  };

  // Toggle step complete/incomplete
  const toggleStep = async (progress: StudentProgressDetail) => {
    if (!selectedStudentId || !adminUserId) return;
    const action = progress.is_completed ? 'incomplete' : 'complete';
    try {
      const res = await fetch(`/api/onboarding-steps/students/${selectedStudentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          progressId: progress.id,
          action,
          adminUserId,
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to update step');
      }
      // Refresh drawer
      const refreshRes = await fetch(`/api/onboarding-steps/students/${selectedStudentId}`);
      if (refreshRes.ok) {
        const data = await refreshRes.json();
        setProgressDetails(data.data || data || []);
      }
      setSnackbar({ open: true, message: `Step marked as ${action === 'complete' ? 'completed' : 'incomplete'}` });
      // Also refresh table counts
      fetchStudents();
    } catch (err: any) {
      setSnackbar({ open: true, message: err.message || 'Failed to update step' });
    }
  };

  // Save admin notes for a step
  const saveAdminNotes = async (progressId: string, notes: string) => {
    if (!selectedStudentId || !adminUserId) return;
    try {
      const res = await fetch(`/api/onboarding-steps/students/${selectedStudentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          progressId,
          adminNotes: notes,
          adminUserId,
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to save notes');
      }
      setSnackbar({ open: true, message: 'Notes saved' });
    } catch (err: any) {
      setSnackbar({ open: true, message: err.message || 'Failed to save notes' });
    }
  };

  // Initialize steps for a student
  const handleInitialize = async () => {
    if (!selectedStudentId || !adminUserId) return;
    setInitializing(true);
    try {
      const res = await fetch(`/api/onboarding-steps/students/${selectedStudentId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: adminUserId }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to initialize steps');
      }
      setSnackbar({ open: true, message: 'Onboarding steps initialized' });
      // Refresh drawer
      const refreshRes = await fetch(`/api/onboarding-steps/students/${selectedStudentId}`);
      if (refreshRes.ok) {
        const data = await refreshRes.json();
        setProgressDetails(data.data || data || []);
      }
      fetchStudents();
    } catch (err: any) {
      setSnackbar({ open: true, message: err.message || 'Failed to initialize steps' });
    } finally {
      setInitializing(false);
    }
  };

  const getProgressPercent = (completed: number, total: number) => {
    if (total === 0) return 0;
    return Math.round((completed / total) * 100);
  };

  return (
    <Box>
      {/* Error */}
      {error && (
        <Alert severity="error" sx={{ mb: 2, borderRadius: 1 }}>
          {error}
        </Alert>
      )}

      {/* Filters */}
      <Paper
        elevation={0}
        sx={{
          p: 2,
          mb: 2,
          borderRadius: 1,
          border: '1px solid',
          borderColor: 'grey.200',
          display: 'flex',
          gap: 2,
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        <TextField
          size="small"
          placeholder="Search by name or phone..."
          value={searchQuery}
          onChange={(e) => handleSearchChange(e.target.value)}
          sx={{ minWidth: 280, flex: 1 }}
          InputProps={{
            startAdornment: (
              <Box sx={{ display: 'flex', alignItems: 'center', mr: 1 }}>
                <SearchIcon fontSize="small" color="action" />
              </Box>
            ),
          }}
        />
        <TextField
          select
          size="small"
          value={batchFilter}
          onChange={(e) => { setBatchFilter(e.target.value); setPage(0); }}
          sx={{ minWidth: 180 }}
          label="Batch"
        >
          <MenuItem value="">All Batches</MenuItem>
          {batches.map((b) => (
            <MenuItem key={b.id} value={b.id}>{b.name}</MenuItem>
          ))}
        </TextField>
        <TextField
          select
          size="small"
          value={completionFilter}
          onChange={(e) => { setCompletionFilter(e.target.value); setPage(0); }}
          sx={{ minWidth: 160 }}
          label="Completion"
        >
          {COMPLETION_FILTER_OPTIONS.map((opt) => (
            <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
          ))}
        </TextField>
        <Tooltip title="Refresh">
          <span>
            <IconButton size="small" onClick={fetchStudents} disabled={loading}>
              <RefreshIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
      </Paper>

      {/* Table */}
      <Paper
        elevation={0}
        sx={{ borderRadius: 1, border: '1px solid', borderColor: 'grey.200', overflow: 'hidden' }}
      >
        {loading && students.length === 0 ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 400 }}>
            <CircularProgress />
          </Box>
        ) : students.length === 0 ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: 300, gap: 2 }}>
            <SchoolIcon sx={{ fontSize: 48, color: 'grey.400' }} />
            <Typography color="text.secondary">No students found</Typography>
          </Box>
        ) : (
          <>
            <TableContainer sx={{ maxHeight: 600 }}>
              <Table stickyHeader size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600 }}>Student Name</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Phone</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Course</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Batch</TableCell>
                    <TableCell sx={{ fontWeight: 600, minWidth: 200 }}>Progress</TableCell>
                    <TableCell sx={{ fontWeight: 600 }} align="center">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {students.map((student) => {
                    const percent = getProgressPercent(student.completed_count, student.total_count);
                    const isComplete = student.total_count > 0 && student.completed_count === student.total_count;
                    return (
                      <TableRow
                        key={student.student_profile_id}
                        hover
                        onClick={() => openDrawer(student)}
                        sx={{ cursor: 'pointer', '&:last-child td': { borderBottom: 0 } }}
                      >
                        <TableCell>
                          <Typography variant="body2" fontWeight={500}>
                            {student.student_name}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">{student.phone || '-'}</Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">{student.course_name || '-'}</Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">{student.batch_name || '-'}</Typography>
                        </TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                            <Box sx={{ flex: 1 }}>
                              <LinearProgress
                                variant="determinate"
                                value={percent}
                                sx={{
                                  height: 8,
                                  borderRadius: 4,
                                  bgcolor: 'grey.200',
                                  '& .MuiLinearProgress-bar': {
                                    borderRadius: 4,
                                    bgcolor: isComplete ? 'success.main' : percent > 50 ? 'info.main' : 'warning.main',
                                  },
                                }}
                              />
                            </Box>
                            <Typography variant="body2" fontWeight={600} sx={{ whiteSpace: 'nowrap', minWidth: 36 }}>
                              {student.completed_count}/{student.total_count}
                            </Typography>
                            {isComplete && (
                              <CheckCircleIcon sx={{ fontSize: 16, color: 'success.main' }} />
                            )}
                          </Box>
                        </TableCell>
                        <TableCell align="center">
                          <Tooltip title="View Progress">
                            <IconButton size="small" onClick={(e) => { e.stopPropagation(); openDrawer(student); }}>
                              <VisibilityIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
            <TablePagination
              rowsPerPageOptions={[10, 20, 50]}
              component="div"
              count={totalCount}
              rowsPerPage={rowsPerPage}
              page={page}
              onPageChange={(_, newPage) => setPage(newPage)}
              onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
            />
          </>
        )}
      </Paper>

      {/* Student Progress Drawer */}
      <Drawer
        anchor="right"
        open={drawerOpen}
        onClose={() => { setDrawerOpen(false); setSelectedStudentId(null); }}
        PaperProps={{ sx: { width: { xs: '100%', sm: 480 }, p: 0 } }}
      >
        {/* Drawer Header */}
        <Box
          sx={{
            p: 2.5,
            borderBottom: '1px solid',
            borderColor: 'grey.200',
            bgcolor: 'grey.50',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <Box>
              <Typography variant="h6" fontWeight={700}>
                {selectedStudentName}
              </Typography>
              {selectedStudentPhone && (
                <Typography variant="body2" color="text.secondary">
                  {selectedStudentPhone}
                </Typography>
              )}
              <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                {selectedStudentCourse && (
                  <Chip label={selectedStudentCourse} size="small" variant="outlined" />
                )}
                {selectedStudentBatch && (
                  <Chip label={selectedStudentBatch} size="small" variant="outlined" color="primary" />
                )}
              </Box>
            </Box>
            <IconButton size="small" onClick={() => { setDrawerOpen(false); setSelectedStudentId(null); }}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>
        </Box>

        {/* Drawer Content */}
        <Box sx={{ p: 2.5, overflowY: 'auto', flex: 1 }}>
          {drawerLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
              <CircularProgress />
            </Box>
          ) : progressDetails.length === 0 ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, py: 6 }}>
              <PlaylistAddCheckIcon sx={{ fontSize: 48, color: 'grey.400' }} />
              <Typography color="text.secondary" align="center">
                No onboarding steps initialized for this student.
              </Typography>
              <Button
                variant="contained"
                startIcon={initializing ? <CircularProgress size={16} /> : <InitializeIcon />}
                onClick={handleInitialize}
                disabled={initializing}
                sx={{ textTransform: 'none', fontWeight: 600 }}
              >
                {initializing ? 'Initializing...' : 'Initialize Steps'}
              </Button>
            </Box>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {/* Summary */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
                <Typography variant="body2" fontWeight={600}>
                  Progress:
                </Typography>
                <Box sx={{ flex: 1 }}>
                  <LinearProgress
                    variant="determinate"
                    value={getProgressPercent(
                      progressDetails.filter((p) => p.is_completed).length,
                      progressDetails.length
                    )}
                    sx={{
                      height: 8,
                      borderRadius: 4,
                      bgcolor: 'grey.200',
                      '& .MuiLinearProgress-bar': { borderRadius: 4 },
                    }}
                  />
                </Box>
                <Typography variant="body2" fontWeight={600}>
                  {progressDetails.filter((p) => p.is_completed).length}/{progressDetails.length}
                </Typography>
              </Box>

              {/* Step Cards */}
              {progressDetails.map((progress) => (
                <StepProgressCard
                  key={progress.id}
                  progress={progress}
                  onToggle={() => toggleStep(progress)}
                  onSaveNotes={(notes) => saveAdminNotes(progress.id, notes)}
                />
              ))}
            </Box>
          )}
        </Box>
      </Drawer>
    </Box>
  );
}

// ===========================================================================
// Step Progress Card (inside Drawer)
// ===========================================================================

function StepProgressCard({
  progress,
  onToggle,
  onSaveNotes,
}: {
  progress: StudentProgressDetail;
  onToggle: () => void;
  onSaveNotes: (notes: string) => void;
}) {
  const [notes, setNotes] = useState(progress.admin_notes || '');
  const [notesDirty, setNotesDirty] = useState(false);

  useEffect(() => {
    setNotes(progress.admin_notes || '');
    setNotesDirty(false);
  }, [progress.admin_notes]);

  const handleNotesChange = (value: string) => {
    setNotes(value);
    setNotesDirty(value !== (progress.admin_notes || ''));
  };

  const handleSaveNotes = () => {
    onSaveNotes(notes);
    setNotesDirty(false);
  };

  return (
    <Paper
      elevation={0}
      sx={{
        p: 2,
        borderRadius: 1,
        border: '1px solid',
        borderColor: progress.is_completed ? 'success.light' : 'grey.200',
        bgcolor: progress.is_completed ? 'success.50' : 'background.paper',
        transition: 'all 0.2s',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
        <Checkbox
          checked={progress.is_completed}
          onChange={onToggle}
          sx={{ mt: -0.5, ml: -0.5 }}
          color="success"
        />
        <Box sx={{ flex: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="body2" fontWeight={600} sx={{ textDecoration: progress.is_completed ? 'line-through' : 'none' }}>
              {progress.title}
            </Typography>
            {progress.is_required && (
              <Chip label="Required" size="small" color="error" variant="outlined" sx={{ fontSize: '0.65rem', height: 20 }} />
            )}
          </Box>
          {progress.description && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
              {progress.description}
            </Typography>
          )}

          {/* Completion info */}
          {progress.is_completed && (
            <Box sx={{ mt: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <CheckCircleIcon sx={{ fontSize: 14, color: 'success.main' }} />
              <Typography variant="caption" color="success.dark">
                Completed by {progress.completed_by_role === 'admin' ? 'Admin' : 'Student'}
                {progress.completed_at && ` on ${formatDateTime(progress.completed_at)}`}
              </Typography>
            </Box>
          )}

          {/* Admin Notes */}
          <Box sx={{ mt: 1.5 }}>
            <TextField
              size="small"
              placeholder="Admin notes..."
              value={notes}
              onChange={(e) => handleNotesChange(e.target.value)}
              multiline
              rows={1}
              fullWidth
              sx={{
                '& .MuiOutlinedInput-root': {
                  fontSize: '0.8rem',
                },
              }}
            />
            {notesDirty && (
              <Button
                size="small"
                onClick={handleSaveNotes}
                sx={{ mt: 0.5, textTransform: 'none', fontSize: '0.75rem' }}
              >
                Save Notes
              </Button>
            )}
          </Box>
        </Box>
      </Box>
    </Paper>
  );
}
