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
  IconButton,
  Alert,
  Snackbar,
  Tabs,
  Tab,
} from '@neram/ui';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import AddIcon from '@mui/icons-material/Add';
import RemoveCircleOutlineIcon from '@mui/icons-material/RemoveCircleOutline';
import DataTable from '@/components/DataTable';
import type {
  JobPosting,
  JobPostingStatus,
  EmploymentType,
  JobTargetAudience,
  ScreeningQuestion,
  ScreeningQuestionType,
  ContractTerms,
} from '@neram/database';

// ============================================
// Constants
// ============================================

const DEPARTMENTS = [
  { value: 'Academics', label: 'Academics' },
  { value: 'Technology', label: 'Technology' },
  { value: 'Marketing', label: 'Marketing' },
  { value: 'Student Success', label: 'Student Success' },
  { value: 'Content', label: 'Content' },
  { value: 'Operations', label: 'Operations' },
];

const EMPLOYMENT_TYPES: { value: EmploymentType; label: string }[] = [
  { value: 'full_time', label: 'Full-time' },
  { value: 'part_time', label: 'Part-time' },
  { value: 'contract', label: 'Contract' },
  { value: 'internship', label: 'Internship' },
];

const TARGET_AUDIENCES: { value: JobTargetAudience; label: string }[] = [
  { value: 'college_students', label: 'College Students' },
  { value: 'experienced', label: 'Experienced' },
  { value: 'any', label: 'Any' },
];

const STATUS_OPTIONS: { value: JobPostingStatus; label: string }[] = [
  { value: 'draft', label: 'Draft' },
  { value: 'published', label: 'Published' },
  { value: 'closed', label: 'Closed' },
  { value: 'archived', label: 'Archived' },
];

const QUESTION_TYPES: { value: ScreeningQuestionType; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'select', label: 'Select' },
  { value: 'multi_select', label: 'Multi-Select' },
  { value: 'boolean', label: 'Boolean' },
];

const STATUS_TAB_FILTERS: { label: string; value: JobPostingStatus | 'all' }[] = [
  { label: 'All', value: 'all' },
  { label: 'Draft', value: 'draft' },
  { label: 'Published', value: 'published' },
  { label: 'Closed', value: 'closed' },
  { label: 'Archived', value: 'archived' },
];

const STATUS_COLORS: Record<JobPostingStatus, 'default' | 'warning' | 'success' | 'error' | 'info'> = {
  draft: 'default',
  published: 'success',
  closed: 'warning',
  archived: 'error',
};

const EMPLOYMENT_TYPE_LABELS: Record<EmploymentType, string> = {
  full_time: 'Full-time',
  part_time: 'Part-time',
  contract: 'Contract',
  internship: 'Internship',
};

// ============================================
// Default form state
// ============================================

interface JobPostingForm {
  title: string;
  slug: string;
  department: string;
  employment_type: EmploymentType;
  target_audience: JobTargetAudience;
  location: string;
  experience_required: string;
  schedule_details: string;
  description: string;
  skills_required: string[];
  screening_questions: ScreeningQuestion[];
  contract_terms: ContractTerms;
  status: JobPostingStatus;
  display_priority: number;
}

const DEFAULT_FORM: JobPostingForm = {
  title: '',
  slug: '',
  department: '',
  employment_type: 'full_time',
  target_audience: 'any',
  location: '',
  experience_required: '',
  schedule_details: '',
  description: '',
  skills_required: [],
  screening_questions: [],
  contract_terms: {
    min_duration_months: undefined,
    probation_period_months: undefined,
    early_termination_note: '',
    remuneration_note: 'Remuneration will be discussed during the interview process based on role, experience, and availability.',
    additional_terms: [],
  },
  status: 'draft',
  display_priority: 0,
};

// ============================================
// Component
// ============================================

export default function CareersPage() {
  const [postings, setPostings] = useState<JobPosting[]>([]);
  const [loading, setLoading] = useState(true);
  const [tabFilter, setTabFilter] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [dialogTab, setDialogTab] = useState(0);
  const [form, setForm] = useState<JobPostingForm>({ ...DEFAULT_FORM });
  const [skillInput, setSkillInput] = useState('');
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false, message: '', severity: 'success',
  });
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // Fetch postings
  const fetchPostings = useCallback(async () => {
    setLoading(true);
    try {
      const statusValue = STATUS_TAB_FILTERS[tabFilter].value;
      const url = statusValue === 'all' ? '/api/careers' : `/api/careers?status=${statusValue}`;
      const res = await fetch(url);
      if (res.ok) {
        const json = await res.json();
        setPostings(json.data || []);
      }
    } catch {
      setSnackbar({ open: true, message: 'Failed to load job postings', severity: 'error' });
    } finally {
      setLoading(false);
    }
  }, [tabFilter]);

  useEffect(() => {
    fetchPostings();
  }, [fetchPostings]);

  // Slug generation
  const generateSlug = (title: string) => {
    return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  };

  // Open dialog for create
  const handleCreate = () => {
    setEditingId(null);
    setForm({ ...DEFAULT_FORM, contract_terms: { ...DEFAULT_FORM.contract_terms, additional_terms: [] } });
    setDialogTab(0);
    setSkillInput('');
    setDialogOpen(true);
  };

  // Open dialog for edit
  const handleEdit = (posting: JobPosting) => {
    setEditingId(posting.id);
    setForm({
      title: posting.title,
      slug: posting.slug,
      department: posting.department,
      employment_type: posting.employment_type,
      target_audience: posting.target_audience || 'any',
      location: posting.location,
      experience_required: posting.experience_required || '',
      schedule_details: posting.schedule_details || '',
      description: posting.description || '',
      skills_required: posting.skills_required || [],
      screening_questions: posting.screening_questions || [],
      contract_terms: {
        min_duration_months: posting.contract_terms?.min_duration_months,
        probation_period_months: posting.contract_terms?.probation_period_months,
        early_termination_note: posting.contract_terms?.early_termination_note || '',
        remuneration_note: posting.contract_terms?.remuneration_note || DEFAULT_FORM.contract_terms.remuneration_note,
        additional_terms: posting.contract_terms?.additional_terms || [],
      },
      status: posting.status,
      display_priority: posting.display_priority || 0,
    });
    setDialogTab(0);
    setSkillInput('');
    setDialogOpen(true);
  };

  // Save (create or update)
  const handleSave = async () => {
    if (!form.title || !form.department || !form.employment_type || !form.location) {
      setSnackbar({ open: true, message: 'Please fill in all required fields (Title, Department, Type, Location)', severity: 'error' });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        slug: form.slug || generateSlug(form.title),
        experience_required: form.experience_required || null,
        schedule_details: form.schedule_details || null,
      };

      const url = editingId ? `/api/careers/${editingId}` : '/api/careers';
      const method = editingId ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to save');
      }

      setSnackbar({ open: true, message: editingId ? 'Job posting updated' : 'Job posting created', severity: 'success' });
      setDialogOpen(false);
      fetchPostings();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Failed to save job posting';
      setSnackbar({ open: true, message: msg, severity: 'error' });
    } finally {
      setSaving(false);
    }
  };

  // Delete
  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/careers/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
      setSnackbar({ open: true, message: 'Job posting deleted', severity: 'success' });
      setDeleteConfirm(null);
      fetchPostings();
    } catch {
      setSnackbar({ open: true, message: 'Failed to delete job posting', severity: 'error' });
    }
  };

  // Skills chip input
  const handleSkillKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && skillInput.trim()) {
      e.preventDefault();
      if (!form.skills_required.includes(skillInput.trim())) {
        setForm({ ...form, skills_required: [...form.skills_required, skillInput.trim()] });
      }
      setSkillInput('');
    }
  };

  const removeSkill = (skill: string) => {
    setForm({ ...form, skills_required: form.skills_required.filter(s => s !== skill) });
  };

  // Screening questions helpers
  const addQuestion = () => {
    const newQ: ScreeningQuestion = {
      id: `q_${form.screening_questions.length}`,
      question: '',
      type: 'text',
      required: false,
      options: [],
    };
    setForm({ ...form, screening_questions: [...form.screening_questions, newQ] });
  };

  const updateQuestion = (index: number, updates: Partial<ScreeningQuestion>) => {
    const questions = [...form.screening_questions];
    questions[index] = { ...questions[index], ...updates };
    setForm({ ...form, screening_questions: questions });
  };

  const removeQuestion = (index: number) => {
    const questions = form.screening_questions.filter((_, i) => i !== index);
    // Re-index IDs
    const reindexed = questions.map((q, i) => ({ ...q, id: `q_${i}` }));
    setForm({ ...form, screening_questions: reindexed });
  };

  const addQuestionOption = (qIndex: number) => {
    const questions = [...form.screening_questions];
    const opts = [...(questions[qIndex].options || []), ''];
    questions[qIndex] = { ...questions[qIndex], options: opts };
    setForm({ ...form, screening_questions: questions });
  };

  const updateQuestionOption = (qIndex: number, optIndex: number, value: string) => {
    const questions = [...form.screening_questions];
    const opts = [...(questions[qIndex].options || [])];
    opts[optIndex] = value;
    questions[qIndex] = { ...questions[qIndex], options: opts };
    setForm({ ...form, screening_questions: questions });
  };

  const removeQuestionOption = (qIndex: number, optIndex: number) => {
    const questions = [...form.screening_questions];
    const opts = (questions[qIndex].options || []).filter((_, i) => i !== optIndex);
    questions[qIndex] = { ...questions[qIndex], options: opts };
    setForm({ ...form, screening_questions: questions });
  };

  // Contract terms helpers
  const addAdditionalTerm = () => {
    setForm({
      ...form,
      contract_terms: {
        ...form.contract_terms,
        additional_terms: [...(form.contract_terms.additional_terms || []), ''],
      },
    });
  };

  const updateAdditionalTerm = (index: number, value: string) => {
    const terms = [...(form.contract_terms.additional_terms || [])];
    terms[index] = value;
    setForm({ ...form, contract_terms: { ...form.contract_terms, additional_terms: terms } });
  };

  const removeAdditionalTerm = (index: number) => {
    const terms = (form.contract_terms.additional_terms || []).filter((_, i) => i !== index);
    setForm({ ...form, contract_terms: { ...form.contract_terms, additional_terms: terms } });
  };

  // Table columns
  const columns = [
    { field: 'title', headerName: 'Title', width: 220 },
    { field: 'department', headerName: 'Department', width: 130 },
    {
      field: 'employment_type',
      headerName: 'Type',
      width: 120,
      renderCell: ({ value }: { row: any; value: any }) => (
        <Chip label={EMPLOYMENT_TYPE_LABELS[value as EmploymentType] || value} size="small" variant="outlined" />
      ),
    },
    { field: 'location', headerName: 'Location', width: 130 },
    {
      field: 'status',
      headerName: 'Status',
      width: 110,
      renderCell: ({ value }: { row: any; value: any }) => (
        <Chip
          label={value}
          size="small"
          color={STATUS_COLORS[value as JobPostingStatus] || 'default'}
        />
      ),
    },
    { field: 'display_priority', headerName: 'Priority', width: 80 },
    {
      field: 'actions',
      headerName: 'Actions',
      width: 120,
      renderCell: ({ row }: { row: any; value: any }) => (
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          <IconButton size="small" onClick={(e: React.MouseEvent) => { e.stopPropagation(); handleEdit(row); }}>
            <EditIcon fontSize="small" />
          </IconButton>
          <IconButton size="small" color="error" onClick={(e: React.MouseEvent) => { e.stopPropagation(); setDeleteConfirm(row.id); }}>
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Box>
      ),
    },
  ];

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h5" fontWeight={700}>Careers - Job Postings</Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button variant="outlined" href="/careers/applications">
            View Applications
          </Button>
          <Button variant="contained" startIcon={<AddIcon />} onClick={handleCreate}>
            Add Job Posting
          </Button>
        </Box>
      </Box>

      {/* Status filter tabs */}
      <Tabs value={tabFilter} onChange={(_, v) => setTabFilter(v)} sx={{ mb: 2 }}>
        {STATUS_TAB_FILTERS.map((tab) => (
          <Tab key={tab.value} label={tab.label} />
        ))}
      </Tabs>

      {/* Data table */}
      <DataTable
        rows={postings}
        columns={columns}
        loading={loading}
        onRowClick={handleEdit}
      />

      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteConfirm} onClose={() => setDeleteConfirm(null)} maxWidth="xs">
        <DialogTitle>Delete Job Posting?</DialogTitle>
        <DialogContent>
          <Typography>This action cannot be undone. Applications linked to this posting will also be affected.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirm(null)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={() => deleteConfirm && handleDelete(deleteConfirm)}>Delete</Button>
        </DialogActions>
      </Dialog>

      {/* Create / Edit dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>{editingId ? 'Edit Job Posting' : 'Create Job Posting'}</DialogTitle>
        <DialogContent>
          <Tabs value={dialogTab} onChange={(_, v) => setDialogTab(v)} sx={{ mb: 2 }}>
            <Tab label="Basic Info" />
            <Tab label="Screening Questions" />
            <Tab label="Contract Terms" />
            <Tab label="Settings" />
          </Tabs>

          {/* Tab 1: Basic Info */}
          {dialogTab === 0 && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
              <TextField
                label="Title"
                required
                value={form.title}
                onChange={(e) => {
                  const title = e.target.value;
                  setForm({
                    ...form,
                    title,
                    slug: !editingId ? generateSlug(title) : form.slug,
                  });
                }}
                fullWidth
              />
              <TextField
                label="Slug"
                value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.target.value })}
                fullWidth
                helperText="URL-friendly identifier. Auto-generated from title for new postings."
              />
              <Box sx={{ display: 'flex', gap: 2 }}>
                <TextField
                  label="Department"
                  select
                  required
                  value={form.department}
                  onChange={(e) => setForm({ ...form, department: e.target.value })}
                  fullWidth
                >
                  {DEPARTMENTS.map((d) => (
                    <MenuItem key={d.value} value={d.value}>{d.label}</MenuItem>
                  ))}
                </TextField>
                <TextField
                  label="Employment Type"
                  select
                  required
                  value={form.employment_type}
                  onChange={(e) => setForm({ ...form, employment_type: e.target.value as EmploymentType })}
                  fullWidth
                >
                  {EMPLOYMENT_TYPES.map((t) => (
                    <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>
                  ))}
                </TextField>
              </Box>
              <Box sx={{ display: 'flex', gap: 2 }}>
                <TextField
                  label="Target Audience"
                  select
                  value={form.target_audience}
                  onChange={(e) => setForm({ ...form, target_audience: e.target.value as JobTargetAudience })}
                  fullWidth
                >
                  {TARGET_AUDIENCES.map((a) => (
                    <MenuItem key={a.value} value={a.value}>{a.label}</MenuItem>
                  ))}
                </TextField>
                <TextField
                  label="Location"
                  required
                  value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                  fullWidth
                />
              </Box>
              <Box sx={{ display: 'flex', gap: 2 }}>
                <TextField
                  label="Experience Required"
                  value={form.experience_required}
                  onChange={(e) => setForm({ ...form, experience_required: e.target.value })}
                  fullWidth
                />
                <TextField
                  label="Schedule Details"
                  value={form.schedule_details}
                  onChange={(e) => setForm({ ...form, schedule_details: e.target.value })}
                  fullWidth
                  helperText="e.g., Flexible, 15-20 hours per week"
                />
              </Box>
              <TextField
                label="Description"
                multiline
                rows={6}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                fullWidth
              />
              {/* Skills chip input */}
              <Box>
                <TextField
                  label="Skills Required"
                  value={skillInput}
                  onChange={(e) => setSkillInput(e.target.value)}
                  onKeyDown={handleSkillKeyDown}
                  fullWidth
                  helperText="Type a skill and press Enter to add"
                />
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 1 }}>
                  {form.skills_required.map((skill) => (
                    <Chip
                      key={skill}
                      label={skill}
                      onDelete={() => removeSkill(skill)}
                      size="small"
                    />
                  ))}
                </Box>
              </Box>
            </Box>
          )}

          {/* Tab 2: Screening Questions */}
          {dialogTab === 1 && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
              {form.screening_questions.length === 0 && (
                <Typography color="text.secondary" variant="body2">
                  No screening questions yet. Add questions that applicants must answer.
                </Typography>
              )}
              {form.screening_questions.map((q, qIdx) => (
                <Box
                  key={q.id}
                  sx={{
                    p: 2,
                    border: '1px solid',
                    borderColor: 'divider',
                    borderRadius: 1,
                    position: 'relative',
                  }}
                >
                  <IconButton
                    size="small"
                    color="error"
                    onClick={() => removeQuestion(qIdx)}
                    sx={{ position: 'absolute', top: 4, right: 4 }}
                  >
                    <RemoveCircleOutlineIcon fontSize="small" />
                  </IconButton>
                  <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
                    Question {qIdx + 1} (ID: {q.id})
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 2, mb: 1 }}>
                    <TextField
                      label="Question"
                      value={q.question}
                      onChange={(e) => updateQuestion(qIdx, { question: e.target.value })}
                      fullWidth
                      size="small"
                    />
                    <TextField
                      label="Type"
                      select
                      value={q.type}
                      onChange={(e) => updateQuestion(qIdx, { type: e.target.value as ScreeningQuestionType })}
                      sx={{ minWidth: 140 }}
                      size="small"
                    >
                      {QUESTION_TYPES.map((t) => (
                        <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>
                      ))}
                    </TextField>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={q.required}
                        onChange={(e) => updateQuestion(qIdx, { required: e.target.checked })}
                      />
                      <Typography variant="body2">Required</Typography>
                    </label>
                  </Box>
                  {/* Options (only for select/multi_select) */}
                  {(q.type === 'select' || q.type === 'multi_select') && (
                    <Box sx={{ pl: 1 }}>
                      <Typography variant="caption" color="text.secondary">Options:</Typography>
                      {(q.options || []).map((opt, optIdx) => (
                        <Box key={optIdx} sx={{ display: 'flex', gap: 1, mt: 0.5, alignItems: 'center' }}>
                          <TextField
                            value={opt}
                            onChange={(e) => updateQuestionOption(qIdx, optIdx, e.target.value)}
                            size="small"
                            fullWidth
                            placeholder={`Option ${optIdx + 1}`}
                          />
                          <IconButton size="small" color="error" onClick={() => removeQuestionOption(qIdx, optIdx)}>
                            <RemoveCircleOutlineIcon fontSize="small" />
                          </IconButton>
                        </Box>
                      ))}
                      <Button size="small" onClick={() => addQuestionOption(qIdx)} sx={{ mt: 0.5 }}>
                        + Add Option
                      </Button>
                    </Box>
                  )}
                </Box>
              ))}
              <Button variant="outlined" startIcon={<AddIcon />} onClick={addQuestion}>
                Add Question
              </Button>
            </Box>
          )}

          {/* Tab 3: Contract Terms */}
          {dialogTab === 2 && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
              <Box sx={{ display: 'flex', gap: 2 }}>
                <TextField
                  label="Minimum Contract Duration (months)"
                  type="number"
                  value={form.contract_terms.min_duration_months ?? ''}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      contract_terms: {
                        ...form.contract_terms,
                        min_duration_months: e.target.value ? Number(e.target.value) : undefined,
                      },
                    })
                  }
                  fullWidth
                />
                <TextField
                  label="Probation Period (months)"
                  type="number"
                  value={form.contract_terms.probation_period_months ?? ''}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      contract_terms: {
                        ...form.contract_terms,
                        probation_period_months: e.target.value ? Number(e.target.value) : undefined,
                      },
                    })
                  }
                  fullWidth
                />
              </Box>
              <TextField
                label="Early Termination Note"
                multiline
                rows={3}
                value={form.contract_terms.early_termination_note || ''}
                onChange={(e) =>
                  setForm({
                    ...form,
                    contract_terms: { ...form.contract_terms, early_termination_note: e.target.value },
                  })
                }
                fullWidth
                placeholder="Describe the impact of early termination"
              />
              <TextField
                label="Remuneration Note"
                multiline
                rows={3}
                value={form.contract_terms.remuneration_note || ''}
                onChange={(e) =>
                  setForm({
                    ...form,
                    contract_terms: { ...form.contract_terms, remuneration_note: e.target.value },
                  })
                }
                fullWidth
              />
              {/* Additional terms */}
              <Box>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>Additional Terms</Typography>
                {(form.contract_terms.additional_terms || []).map((term, idx) => (
                  <Box key={idx} sx={{ display: 'flex', gap: 1, mb: 1, alignItems: 'center' }}>
                    <TextField
                      value={term}
                      onChange={(e) => updateAdditionalTerm(idx, e.target.value)}
                      size="small"
                      fullWidth
                      placeholder={`Term ${idx + 1}`}
                    />
                    <IconButton size="small" color="error" onClick={() => removeAdditionalTerm(idx)}>
                      <RemoveCircleOutlineIcon fontSize="small" />
                    </IconButton>
                  </Box>
                ))}
                <Button size="small" variant="outlined" onClick={addAdditionalTerm}>
                  + Add Term
                </Button>
              </Box>
            </Box>
          )}

          {/* Tab 4: Settings */}
          {dialogTab === 3 && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
              <TextField
                label="Status"
                select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as JobPostingStatus })}
                fullWidth
              >
                {STATUS_OPTIONS.map((s) => (
                  <MenuItem key={s.value} value={s.value}>{s.label}</MenuItem>
                ))}
              </TextField>
              <TextField
                label="Display Priority"
                type="number"
                value={form.display_priority}
                onChange={(e) => setForm({ ...form, display_priority: Number(e.target.value) || 0 })}
                fullWidth
                helperText="Higher number = higher priority in listing"
              />
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)} disabled={saving}>Cancel</Button>
          <Button variant="contained" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : editingId ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setSnackbar({ ...snackbar, open: false })}
          severity={snackbar.severity}
          variant="filled"
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
