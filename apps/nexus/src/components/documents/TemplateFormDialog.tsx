'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  MenuItem,
  Box,
  Chip,
  FormControlLabel,
  Switch,
  Typography,
} from '@neram/ui';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';

interface Template {
  id: string;
  name: string;
  description: string | null;
  category: string;
  applicable_standards: string[];
  is_required: boolean;
  unlock_date: string | null;
  linked_exam: string | null;
  exam_state_threshold: string | null;
  max_file_size_mb: number;
  allowed_file_types: string[];
  sort_order: number;
  is_active: boolean;
}

interface TemplateFormDialogProps {
  open: boolean;
  template: Template | null;
  onClose: () => void;
  onSaved: () => void;
}

const CATEGORIES = [
  { value: 'identity', label: 'Identity' },
  { value: 'academic', label: 'Academic' },
  { value: 'exam', label: 'Exam' },
  { value: 'photo', label: 'Photo' },
  { value: 'other', label: 'Other' },
];

const STANDARDS = ['10th', '11th', '12th', 'gap_year'];
const EXAM_STATES = ['still_thinking', 'planning_to_write', 'applied', 'completed'];

export default function TemplateFormDialog({ open, template, onClose, onSaved }: TemplateFormDialogProps) {
  const { getToken } = useNexusAuthContext();
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('identity');
  const [standards, setStandards] = useState<string[]>([]);
  const [isRequired, setIsRequired] = useState(false);
  const [unlockDate, setUnlockDate] = useState('');
  const [linkedExam, setLinkedExam] = useState('');
  const [examThreshold, setExamThreshold] = useState('');
  const [maxSizeMb, setMaxSizeMb] = useState(10);
  const [sortOrder, setSortOrder] = useState(0);

  useEffect(() => {
    if (template) {
      setName(template.name);
      setDescription(template.description || '');
      setCategory(template.category);
      setStandards(template.applicable_standards);
      setIsRequired(template.is_required);
      setUnlockDate(template.unlock_date ? template.unlock_date.slice(0, 16) : '');
      setLinkedExam(template.linked_exam || '');
      setExamThreshold(template.exam_state_threshold || '');
      setMaxSizeMb(template.max_file_size_mb);
      setSortOrder(template.sort_order);
    } else {
      setName('');
      setDescription('');
      setCategory('identity');
      setStandards([]);
      setIsRequired(false);
      setUnlockDate('');
      setLinkedExam('');
      setExamThreshold('');
      setMaxSizeMb(10);
      setSortOrder(0);
    }
  }, [template, open]);

  const toggleStandard = (s: string) => {
    setStandards((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]);
  };

  const handleSave = async () => {
    if (!name.trim() || standards.length === 0) return;
    setSaving(true);
    try {
      const token = await getToken();
      if (!token) return;

      const body = {
        name: name.trim(),
        description: description.trim() || null,
        category,
        applicable_standards: standards,
        is_required: isRequired,
        unlock_date: unlockDate ? new Date(unlockDate).toISOString() : null,
        linked_exam: linkedExam || null,
        exam_state_threshold: examThreshold || null,
        max_file_size_mb: maxSizeMb,
        sort_order: sortOrder,
      };

      const url = template
        ? `/api/documents/templates/${template.id}`
        : '/api/documents/templates';

      const res = await fetch(url, {
        method: template ? 'PATCH' : 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        onSaved();
        onClose();
      }
    } catch (err) {
      console.error('Save template failed:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 700 }}>
        {template ? 'Edit Template' : 'New Template'}
      </DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '8px !important' }}>
        <TextField
          label="Template Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          size="small"
          fullWidth
          required
        />
        <TextField
          label="Description / Instructions"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          size="small"
          fullWidth
          multiline
          rows={2}
        />
        <TextField
          select
          label="Category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          size="small"
          fullWidth
        >
          {CATEGORIES.map((c) => (
            <MenuItem key={c.value} value={c.value}>{c.label}</MenuItem>
          ))}
        </TextField>

        <Box>
          <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
            Applicable Standards *
          </Typography>
          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
            {STANDARDS.map((s) => (
              <Chip
                key={s}
                label={s}
                size="small"
                color={standards.includes(s) ? 'primary' : 'default'}
                variant={standards.includes(s) ? 'filled' : 'outlined'}
                onClick={() => toggleStandard(s)}
                sx={{ cursor: 'pointer' }}
              />
            ))}
          </Box>
        </Box>

        <FormControlLabel
          control={<Switch checked={isRequired} onChange={(e) => setIsRequired(e.target.checked)} />}
          label="Required document"
        />

        <TextField
          label="Unlock Date (optional)"
          type={unlockDate ? 'datetime-local' : 'text'}
          value={unlockDate}
          onFocus={(e) => {
            if (!unlockDate) (e.target as HTMLInputElement).type = 'datetime-local';
          }}
          onBlur={(e) => {
            if (!unlockDate) (e.target as HTMLInputElement).type = 'text';
          }}
          onChange={(e) => setUnlockDate(e.target.value)}
          size="small"
          fullWidth
          placeholder=""
          InputLabelProps={{ shrink: !!unlockDate || undefined }}
        />

        <TextField
          select
          label="Linked Exam (optional)"
          value={linkedExam}
          onChange={(e) => setLinkedExam(e.target.value)}
          size="small"
          fullWidth
        >
          <MenuItem value="">None</MenuItem>
          <MenuItem value="nata">NATA</MenuItem>
          <MenuItem value="jee">JEE</MenuItem>
          <MenuItem value="both">Both</MenuItem>
        </TextField>

        {linkedExam && (
          <TextField
            select
            label="Exam State Threshold"
            value={examThreshold}
            onChange={(e) => setExamThreshold(e.target.value)}
            size="small"
            fullWidth
          >
            {EXAM_STATES.map((s) => (
              <MenuItem key={s} value={s}>{s.replace(/_/g, ' ')}</MenuItem>
            ))}
          </TextField>
        )}

        <Box sx={{ display: 'flex', gap: 2 }}>
          <TextField
            label="Max File Size (MB)"
            type="number"
            value={maxSizeMb}
            onChange={(e) => setMaxSizeMb(Number(e.target.value))}
            size="small"
            sx={{ flex: 1 }}
          />
          <TextField
            label="Sort Order"
            type="number"
            value={sortOrder}
            onChange={(e) => setSortOrder(Number(e.target.value))}
            size="small"
            sx={{ flex: 1 }}
          />
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} sx={{ textTransform: 'none' }}>Cancel</Button>
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={saving || !name.trim() || standards.length === 0}
          sx={{ textTransform: 'none' }}
        >
          {saving ? 'Saving...' : template ? 'Update' : 'Create'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
