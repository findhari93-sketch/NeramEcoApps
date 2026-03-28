// @ts-nocheck
'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Button,
  Chip,
  Paper,
  IconButton,
  Tooltip,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Collapse,
  Snackbar,
} from '@neram/ui';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import AddIcon from '@mui/icons-material/Add';
import RefreshIcon from '@mui/icons-material/Refresh';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import EditIcon from '@mui/icons-material/Edit';
import BlockIcon from '@mui/icons-material/Block';
import GroupIcon from '@mui/icons-material/Group';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import LinkIcon from '@mui/icons-material/Link';
import SaveIcon from '@mui/icons-material/Save';

interface CourseWithStats {
  id: string;
  name: string;
  slug: string;
  course_type: string;
  duration_months: number;
  regular_fee: number;
  is_active: boolean;
  batch_count: number;
  active_batch_count: number;
  enrolled_students: number;
}

interface BatchRow {
  id: string;
  name: string;
  course_id: string;
  start_date: string;
  end_date: string | null;
  capacity: number;
  enrolled_count: number;
  is_active: boolean;
  schedule: any[];
}

interface GroupLinks {
  id?: string;
  course_id: string;
  whatsapp_group_url: string;
  teams_group_chat_url: string;
  teams_group_chat_id: string;
  teams_class_team_url: string;
  teams_class_team_id: string;
}

const EMPTY_GROUP_LINKS: Omit<GroupLinks, 'course_id'> = {
  whatsapp_group_url: '',
  teams_group_chat_url: '',
  teams_group_chat_id: '',
  teams_class_team_url: '',
  teams_class_team_id: '',
};

const COURSE_TYPE_LABELS: Record<string, string> = {
  nata: 'NATA',
  jee_paper2: 'JEE Paper 2',
  both: 'Both',
};

function formatDate(d: string | null): string {
  if (!d) return '-';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatCurrency(n: number): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);
}

export default function CoursesPage() {
  const [courses, setCourses] = useState<CourseWithStats[]>([]);
  const [batches, setBatches] = useState<Record<string, BatchRow[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedCourse, setExpandedCourse] = useState<string | null>(null);
  const [batchLoading, setBatchLoading] = useState<string | null>(null);

  // Create course dialog
  const [courseDialogOpen, setCourseDialogOpen] = useState(false);
  const [courseForm, setCourseForm] = useState({ name: '', course_type: 'nata', regular_fee: '', duration_months: '6' });
  const [courseCreating, setCourseCreating] = useState(false);

  // Create batch dialog
  const [batchDialogOpen, setBatchDialogOpen] = useState(false);
  const [batchForCourse, setBatchForCourse] = useState<string | null>(null);
  const [batchForm, setBatchForm] = useState({ name: '', start_date: '', end_date: '', capacity: '30' });
  const [batchCreating, setBatchCreating] = useState(false);

  // Group links state
  const [groupLinks, setGroupLinks] = useState<Record<string, GroupLinks>>({});
  const [groupLinksForm, setGroupLinksForm] = useState<Record<string, Omit<GroupLinks, 'course_id'>>>({});
  const [groupLinksSaving, setGroupLinksSaving] = useState<string | null>(null);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' });

  // Edit batch dialog
  const [editBatchDialogOpen, setEditBatchDialogOpen] = useState(false);
  const [editBatch, setEditBatch] = useState<BatchRow | null>(null);
  const [editBatchForm, setEditBatchForm] = useState({ name: '', start_date: '', end_date: '', capacity: '' });
  const [editBatchSaving, setEditBatchSaving] = useState(false);

  const fetchCourses = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/courses');
      if (!res.ok) throw new Error('Failed to fetch courses');
      const data = await res.json();
      setCourses(data.data || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchCourses(); }, [fetchCourses]);

  const fetchBatches = async (courseId: string) => {
    setBatchLoading(courseId);
    try {
      const res = await fetch(`/api/batches?courseId=${courseId}`);
      if (!res.ok) throw new Error('Failed to fetch batches');
      const data = await res.json();
      setBatches((prev) => ({ ...prev, [courseId]: data.data || [] }));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBatchLoading(null);
    }
  };

  const fetchGroupLinks = async (courseId: string) => {
    try {
      const res = await fetch(`/api/course-group-links?courseId=${courseId}`);
      if (!res.ok) return;
      const json = await res.json();
      const links = json.data;
      if (links) {
        setGroupLinks((prev) => ({ ...prev, [courseId]: links }));
        setGroupLinksForm((prev) => ({
          ...prev,
          [courseId]: {
            whatsapp_group_url: links.whatsapp_group_url || '',
            teams_group_chat_url: links.teams_group_chat_url || '',
            teams_group_chat_id: links.teams_group_chat_id || '',
            teams_class_team_url: links.teams_class_team_url || '',
            teams_class_team_id: links.teams_class_team_id || '',
          },
        }));
      } else {
        setGroupLinksForm((prev) => ({ ...prev, [courseId]: { ...EMPTY_GROUP_LINKS } }));
      }
    } catch {
      // Silently fail - links are optional
    }
  };

  const saveGroupLinks = async (courseId: string) => {
    const form = groupLinksForm[courseId];
    if (!form) return;
    setGroupLinksSaving(courseId);
    try {
      const res = await fetch('/api/course-group-links', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          course_id: courseId,
          whatsapp_group_url: form.whatsapp_group_url || null,
          teams_group_chat_url: form.teams_group_chat_url || null,
          teams_group_chat_id: form.teams_group_chat_id || null,
          teams_class_team_url: form.teams_class_team_url || null,
          teams_class_team_id: form.teams_class_team_id || null,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Failed to save group links');
      }
      const json = await res.json();
      setGroupLinks((prev) => ({ ...prev, [courseId]: json.data }));
      setSnackbar({ open: true, message: 'Group links saved successfully', severity: 'success' });
    } catch (err: any) {
      setSnackbar({ open: true, message: err.message || 'Failed to save group links', severity: 'error' });
    } finally {
      setGroupLinksSaving(null);
    }
  };

  const updateGroupLinksField = (courseId: string, field: string, value: string) => {
    setGroupLinksForm((prev) => ({
      ...prev,
      [courseId]: {
        ...(prev[courseId] || { ...EMPTY_GROUP_LINKS }),
        [field]: value,
      },
    }));
  };

  const toggleCourse = (courseId: string) => {
    if (expandedCourse === courseId) {
      setExpandedCourse(null);
    } else {
      setExpandedCourse(courseId);
      if (!batches[courseId]) fetchBatches(courseId);
      if (!groupLinksForm[courseId]) fetchGroupLinks(courseId);
    }
  };

  const handleCreateCourse = async () => {
    setCourseCreating(true);
    try {
      const res = await fetch('/api/courses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: courseForm.name,
          course_type: courseForm.course_type,
          regular_fee: Number(courseForm.regular_fee) || 0,
          duration_months: Number(courseForm.duration_months) || 6,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Failed to create course');
      }
      setCourseDialogOpen(false);
      setCourseForm({ name: '', course_type: 'nata', regular_fee: '', duration_months: '6' });
      fetchCourses();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCourseCreating(false);
    }
  };

  const handleCreateBatch = async () => {
    if (!batchForCourse) return;
    setBatchCreating(true);
    try {
      const res = await fetch('/api/batches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: batchForm.name,
          course_id: batchForCourse,
          start_date: batchForm.start_date,
          end_date: batchForm.end_date || null,
          capacity: Number(batchForm.capacity) || 30,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Failed to create batch');
      }
      setBatchDialogOpen(false);
      setBatchForm({ name: '', start_date: '', end_date: '', capacity: '30' });
      fetchBatches(batchForCourse);
      fetchCourses();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBatchCreating(false);
    }
  };

  const handleEditBatch = async () => {
    if (!editBatch) return;
    setEditBatchSaving(true);
    try {
      const res = await fetch(`/api/batches/${editBatch.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editBatchForm.name,
          start_date: editBatchForm.start_date,
          end_date: editBatchForm.end_date || null,
          capacity: Number(editBatchForm.capacity) || 30,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Failed to update batch');
      }
      setEditBatchDialogOpen(false);
      setEditBatch(null);
      fetchBatches(editBatch.course_id);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setEditBatchSaving(false);
    }
  };

  const handleDeactivateBatch = async (batch: BatchRow) => {
    try {
      const res = await fetch(`/api/batches/${batch.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to deactivate batch');
      fetchBatches(batch.course_id);
      fetchCourses();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const openEditBatch = (batch: BatchRow) => {
    setEditBatch(batch);
    setEditBatchForm({
      name: batch.name,
      start_date: batch.start_date,
      end_date: batch.end_date || '',
      capacity: String(batch.capacity),
    });
    setEditBatchDialogOpen(true);
  };

  return (
    <Box>
      {/* Page Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box
            sx={{
              width: 42, height: 42, borderRadius: 1, bgcolor: 'primary.main',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <MenuBookIcon sx={{ color: 'white', fontSize: 22 }} />
          </Box>
          <Box>
            <Typography variant="h5" fontWeight={700} sx={{ lineHeight: 1.2 }}>
              Courses & Batches
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {loading ? 'Loading...' : `${courses.length} courses`}
            </Typography>
          </Box>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Tooltip title="Refresh">
            <span>
              <IconButton size="small" onClick={fetchCourses} disabled={loading}>
                <RefreshIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          <Button
            variant="contained"
            size="small"
            startIcon={<AddIcon />}
            onClick={() => setCourseDialogOpen(true)}
            sx={{ textTransform: 'none' }}
          >
            Add Course
          </Button>
        </Box>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2, borderRadius: 1 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      {/* Course Cards */}
      {loading ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {[1, 2].map((i) => <Skeleton key={i} variant="rectangular" height={80} sx={{ borderRadius: 1 }} />)}
        </Box>
      ) : courses.length === 0 ? (
        <Paper elevation={0} sx={{ p: 4, textAlign: 'center', border: '1px solid', borderColor: 'grey.200', borderRadius: 1 }}>
          <Typography color="text.secondary" sx={{ mb: 2 }}>No courses yet. Create your first course to get started.</Typography>
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCourseDialogOpen(true)} sx={{ textTransform: 'none' }}>
            Create Course
          </Button>
        </Paper>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {courses.map((course) => (
            <Paper
              key={course.id}
              elevation={0}
              sx={{ border: '1px solid', borderColor: expandedCourse === course.id ? 'primary.main' : 'grey.200', borderRadius: 1, overflow: 'hidden' }}
            >
              {/* Course Header Row */}
              <Box
                sx={{ display: 'flex', alignItems: 'center', gap: 2, px: 2, py: 1.5, cursor: 'pointer', '&:hover': { bgcolor: 'grey.50' } }}
                onClick={() => toggleCourse(course.id)}
              >
                <IconButton size="small">
                  {expandedCourse === course.id ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                </IconButton>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant="subtitle1" fontWeight={600} noWrap>{course.name}</Typography>
                    <Chip
                      label={COURSE_TYPE_LABELS[course.course_type] || course.course_type}
                      size="small"
                      sx={{ height: 22, fontSize: 11, fontWeight: 600 }}
                    />
                    {!course.is_active && <Chip label="Inactive" size="small" color="default" sx={{ height: 22, fontSize: 11 }} />}
                  </Box>
                </Box>
                <Box sx={{ display: 'flex', gap: 3, alignItems: 'center', flexShrink: 0 }}>
                  <Box sx={{ textAlign: 'center' }}>
                    <Typography variant="caption" color="text.secondary">Fee</Typography>
                    <Typography variant="body2" fontWeight={600}>{formatCurrency(course.regular_fee)}</Typography>
                  </Box>
                  <Box sx={{ textAlign: 'center' }}>
                    <Typography variant="caption" color="text.secondary">Duration</Typography>
                    <Typography variant="body2" fontWeight={600}>{course.duration_months}mo</Typography>
                  </Box>
                  <Box sx={{ textAlign: 'center' }}>
                    <Typography variant="caption" color="text.secondary">Batches</Typography>
                    <Typography variant="body2" fontWeight={600}>{course.active_batch_count}/{course.batch_count}</Typography>
                  </Box>
                  <Box sx={{ textAlign: 'center' }}>
                    <Typography variant="caption" color="text.secondary">Students</Typography>
                    <Typography variant="body2" fontWeight={600}>{course.enrolled_students}</Typography>
                  </Box>
                </Box>
              </Box>

              {/* Expanded Batch Section */}
              <Collapse in={expandedCourse === course.id}>
                <Box sx={{ borderTop: '1px solid', borderTopColor: 'grey.200', px: 2, py: 1.5, bgcolor: 'grey.50' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                    <Typography variant="subtitle2" fontWeight={600} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <GroupIcon sx={{ fontSize: 18 }} /> Batches
                    </Typography>
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<AddIcon />}
                      onClick={(e) => {
                        e.stopPropagation();
                        setBatchForCourse(course.id);
                        setBatchDialogOpen(true);
                      }}
                      sx={{ textTransform: 'none', fontSize: 12 }}
                    >
                      Add Batch
                    </Button>
                  </Box>

                  {batchLoading === course.id ? (
                    <Skeleton variant="rectangular" height={60} sx={{ borderRadius: 1 }} />
                  ) : !batches[course.id] || batches[course.id].length === 0 ? (
                    <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
                      No batches yet. Add a batch to start enrolling students.
                    </Typography>
                  ) : (
                    <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid', borderColor: 'grey.200' }}>
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell sx={{ fontWeight: 600, fontSize: 12, py: 0.75 }}>Batch Name</TableCell>
                            <TableCell sx={{ fontWeight: 600, fontSize: 12, py: 0.75 }}>Start Date</TableCell>
                            <TableCell sx={{ fontWeight: 600, fontSize: 12, py: 0.75 }}>End Date</TableCell>
                            <TableCell sx={{ fontWeight: 600, fontSize: 12, py: 0.75 }} align="center">Enrolled / Capacity</TableCell>
                            <TableCell sx={{ fontWeight: 600, fontSize: 12, py: 0.75 }}>Status</TableCell>
                            <TableCell sx={{ fontWeight: 600, fontSize: 12, py: 0.75 }} align="center">Actions</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {batches[course.id].map((batch) => (
                            <TableRow key={batch.id} hover sx={{ opacity: batch.is_active ? 1 : 0.5 }}>
                              <TableCell sx={{ py: 0.5, fontSize: 13 }}>{batch.name}</TableCell>
                              <TableCell sx={{ py: 0.5, fontSize: 13 }}>{formatDate(batch.start_date)}</TableCell>
                              <TableCell sx={{ py: 0.5, fontSize: 13 }}>{formatDate(batch.end_date)}</TableCell>
                              <TableCell align="center" sx={{ py: 0.5 }}>
                                <Chip
                                  label={`${batch.enrolled_count} / ${batch.capacity}`}
                                  size="small"
                                  color={batch.enrolled_count >= batch.capacity ? 'error' : 'default'}
                                  variant="outlined"
                                  sx={{ fontSize: 12, fontWeight: 600, height: 22 }}
                                />
                              </TableCell>
                              <TableCell sx={{ py: 0.5 }}>
                                <Chip
                                  label={batch.is_active ? 'Active' : 'Inactive'}
                                  size="small"
                                  color={batch.is_active ? 'success' : 'default'}
                                  sx={{ fontSize: 11, height: 22 }}
                                />
                              </TableCell>
                              <TableCell align="center" sx={{ py: 0.5 }}>
                                <Tooltip title="Edit">
                                  <IconButton size="small" onClick={() => openEditBatch(batch)}>
                                    <EditIcon sx={{ fontSize: 16 }} />
                                  </IconButton>
                                </Tooltip>
                                {batch.is_active && (
                                  <Tooltip title="Deactivate">
                                    <IconButton size="small" color="error" onClick={() => handleDeactivateBatch(batch)}>
                                      <BlockIcon sx={{ fontSize: 16 }} />
                                    </IconButton>
                                  </Tooltip>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  )}
                </Box>

                {/* Group Links Section */}
                <Box sx={{ borderTop: '1px solid', borderTopColor: 'grey.200', px: 2, py: 1.5, bgcolor: 'grey.50' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1.5 }}>
                    <LinkIcon sx={{ fontSize: 18 }} />
                    <Typography variant="subtitle2" fontWeight={600}>
                      Group Links
                    </Typography>
                  </Box>

                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                    {/* WhatsApp Group URL */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <TextField
                        label="WhatsApp Group URL"
                        size="small"
                        fullWidth
                        value={groupLinksForm[course.id]?.whatsapp_group_url || ''}
                        onChange={(e) => updateGroupLinksField(course.id, 'whatsapp_group_url', e.target.value)}
                        placeholder="https://chat.whatsapp.com/..."
                      />
                      {groupLinksForm[course.id]?.whatsapp_group_url && (
                        <CheckCircleIcon sx={{ color: 'success.main', fontSize: 22, flexShrink: 0 }} />
                      )}
                    </Box>

                    {/* Teams Group Chat */}
                    <Box sx={{ display: 'flex', gap: 1 }}>
                      <TextField
                        label="Teams Group Chat URL"
                        size="small"
                        sx={{ flex: 2 }}
                        value={groupLinksForm[course.id]?.teams_group_chat_url || ''}
                        onChange={(e) => updateGroupLinksField(course.id, 'teams_group_chat_url', e.target.value)}
                        placeholder="https://teams.microsoft.com/..."
                        InputProps={{
                          endAdornment: groupLinksForm[course.id]?.teams_group_chat_url ? (
                            <CheckCircleIcon sx={{ color: 'success.main', fontSize: 20 }} />
                          ) : null,
                        }}
                      />
                      <TextField
                        label="Chat ID"
                        size="small"
                        sx={{ flex: 1 }}
                        value={groupLinksForm[course.id]?.teams_group_chat_id || ''}
                        onChange={(e) => updateGroupLinksField(course.id, 'teams_group_chat_id', e.target.value)}
                        placeholder="19:abc123..."
                        InputProps={{
                          endAdornment: groupLinksForm[course.id]?.teams_group_chat_id ? (
                            <CheckCircleIcon sx={{ color: 'success.main', fontSize: 20 }} />
                          ) : null,
                        }}
                      />
                    </Box>

                    {/* Teams Class Team */}
                    <Box sx={{ display: 'flex', gap: 1 }}>
                      <TextField
                        label="Teams Class Team URL"
                        size="small"
                        sx={{ flex: 2 }}
                        value={groupLinksForm[course.id]?.teams_class_team_url || ''}
                        onChange={(e) => updateGroupLinksField(course.id, 'teams_class_team_url', e.target.value)}
                        placeholder="https://teams.microsoft.com/..."
                        InputProps={{
                          endAdornment: groupLinksForm[course.id]?.teams_class_team_url ? (
                            <CheckCircleIcon sx={{ color: 'success.main', fontSize: 20 }} />
                          ) : null,
                        }}
                      />
                      <TextField
                        label="Team ID"
                        size="small"
                        sx={{ flex: 1 }}
                        value={groupLinksForm[course.id]?.teams_class_team_id || ''}
                        onChange={(e) => updateGroupLinksField(course.id, 'teams_class_team_id', e.target.value)}
                        placeholder="abc-123-..."
                        InputProps={{
                          endAdornment: groupLinksForm[course.id]?.teams_class_team_id ? (
                            <CheckCircleIcon sx={{ color: 'success.main', fontSize: 20 }} />
                          ) : null,
                        }}
                      />
                    </Box>

                    {/* Save Button */}
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 0.5 }}>
                      <Button
                        variant="contained"
                        size="small"
                        startIcon={<SaveIcon />}
                        onClick={() => saveGroupLinks(course.id)}
                        disabled={groupLinksSaving === course.id}
                        sx={{ textTransform: 'none', fontWeight: 600 }}
                      >
                        {groupLinksSaving === course.id ? 'Saving...' : 'Save Links'}
                      </Button>
                    </Box>
                  </Box>
                </Box>
              </Collapse>
            </Paper>
          ))}
        </Box>
      )}

      {/* Create Course Dialog */}
      <Dialog open={courseDialogOpen} onClose={() => !courseCreating && setCourseDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Create Course</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
          <TextField
            label="Course Name"
            size="small"
            fullWidth
            value={courseForm.name}
            onChange={(e) => setCourseForm((p) => ({ ...p, name: e.target.value }))}
          />
          <TextField
            label="Course Type"
            size="small"
            fullWidth
            select
            value={courseForm.course_type}
            onChange={(e) => setCourseForm((p) => ({ ...p, course_type: e.target.value }))}
          >
            <MenuItem value="nata">NATA</MenuItem>
            <MenuItem value="jee_paper2">JEE Paper 2</MenuItem>
            <MenuItem value="both">Both</MenuItem>
          </TextField>
          <TextField
            label="Regular Fee (₹)"
            size="small"
            fullWidth
            type="number"
            value={courseForm.regular_fee}
            onChange={(e) => setCourseForm((p) => ({ ...p, regular_fee: e.target.value }))}
          />
          <TextField
            label="Duration (months)"
            size="small"
            fullWidth
            type="number"
            value={courseForm.duration_months}
            onChange={(e) => setCourseForm((p) => ({ ...p, duration_months: e.target.value }))}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCourseDialogOpen(false)} disabled={courseCreating}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleCreateCourse}
            disabled={courseCreating || !courseForm.name}
          >
            {courseCreating ? 'Creating...' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Create Batch Dialog */}
      <Dialog open={batchDialogOpen} onClose={() => !batchCreating && setBatchDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Create Batch</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
          <TextField
            label="Batch Name"
            size="small"
            fullWidth
            value={batchForm.name}
            onChange={(e) => setBatchForm((p) => ({ ...p, name: e.target.value }))}
            placeholder="e.g., NATA Batch 1 - March 2026"
          />
          <TextField
            label="Start Date"
            size="small"
            fullWidth
            type="date"
            InputLabelProps={{ shrink: true }}
            value={batchForm.start_date}
            onChange={(e) => setBatchForm((p) => ({ ...p, start_date: e.target.value }))}
          />
          <TextField
            label="End Date (optional)"
            size="small"
            fullWidth
            type="date"
            InputLabelProps={{ shrink: true }}
            value={batchForm.end_date}
            onChange={(e) => setBatchForm((p) => ({ ...p, end_date: e.target.value }))}
          />
          <TextField
            label="Capacity"
            size="small"
            fullWidth
            type="number"
            value={batchForm.capacity}
            onChange={(e) => setBatchForm((p) => ({ ...p, capacity: e.target.value }))}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBatchDialogOpen(false)} disabled={batchCreating}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleCreateBatch}
            disabled={batchCreating || !batchForm.name || !batchForm.start_date}
          >
            {batchCreating ? 'Creating...' : 'Create Batch'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit Batch Dialog */}
      <Dialog open={editBatchDialogOpen} onClose={() => !editBatchSaving && setEditBatchDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Edit Batch</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
          <TextField
            label="Batch Name"
            size="small"
            fullWidth
            value={editBatchForm.name}
            onChange={(e) => setEditBatchForm((p) => ({ ...p, name: e.target.value }))}
          />
          <TextField
            label="Start Date"
            size="small"
            fullWidth
            type="date"
            InputLabelProps={{ shrink: true }}
            value={editBatchForm.start_date}
            onChange={(e) => setEditBatchForm((p) => ({ ...p, start_date: e.target.value }))}
          />
          <TextField
            label="End Date (optional)"
            size="small"
            fullWidth
            type="date"
            InputLabelProps={{ shrink: true }}
            value={editBatchForm.end_date}
            onChange={(e) => setEditBatchForm((p) => ({ ...p, end_date: e.target.value }))}
          />
          <TextField
            label="Capacity"
            size="small"
            fullWidth
            type="number"
            value={editBatchForm.capacity}
            onChange={(e) => setEditBatchForm((p) => ({ ...p, capacity: e.target.value }))}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditBatchDialogOpen(false)} disabled={editBatchSaving}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleEditBatch}
            disabled={editBatchSaving || !editBatchForm.name}
          >
            {editBatchSaving ? 'Saving...' : 'Save Changes'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
        message={snackbar.message}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </Box>
  );
}
