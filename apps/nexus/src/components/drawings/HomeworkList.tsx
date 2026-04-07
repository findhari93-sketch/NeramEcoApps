'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Paper, Chip, Button, Skeleton,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField,
  FormControlLabel, Switch,
} from '@neram/ui';
import AddIcon from '@mui/icons-material/Add';
import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import DrawingSubmissionSheet from './DrawingSubmissionSheet';
import type { DrawingHomeworkWithStatus } from '@neram/database/types';

interface HomeworkListProps {
  getToken: () => Promise<string | null>;
  isTeacher?: boolean;
}

export default function HomeworkList({ getToken, isTeacher = false }: HomeworkListProps) {
  const [homework, setHomework] = useState<DrawingHomeworkWithStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [selectedHwId, setSelectedHwId] = useState<string | null>(null);

  // Create form
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [mandatory, setMandatory] = useState(false);
  const [creating, setCreating] = useState(false);

  const fetchHomework = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      const res = await fetch('/api/drawing/homework', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setHomework(data.homework || []);
    } catch {
      setHomework([]);
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => { fetchHomework(); }, [fetchHomework]);

  const handleCreate = async () => {
    if (!title || !dueDate) return;
    setCreating(true);
    try {
      const token = await getToken();
      await fetch('/api/drawing/homework', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          description: description || null,
          assigned_to: 'all_students',
          due_date: new Date(dueDate).toISOString(),
          is_mandatory: mandatory,
        }),
      });
      setCreateOpen(false);
      setTitle('');
      setDescription('');
      setDueDate('');
      setMandatory(false);
      fetchHomework();
    } catch { /* silent */ } finally {
      setCreating(false);
    }
  };

  const isOverdue = (date: string) => new Date(date) < new Date();
  const isCompleted = (hw: DrawingHomeworkWithStatus) => !!hw.my_submission_id;

  if (loading) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} height={80} />)}
      </Box>
    );
  }

  return (
    <Box>
      {/* Teacher: Create button */}
      {isTeacher && (
        <Button
          variant="outlined"
          startIcon={<AddIcon />}
          onClick={() => setCreateOpen(true)}
          sx={{ mb: 2, textTransform: 'none' }}
        >
          Create Homework
        </Button>
      )}

      {homework.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 6 }}>
          <Typography color="text.secondary">
            {isTeacher ? 'No homework created yet' : 'No homework assigned'}
          </Typography>
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {homework.map((hw) => {
            const completed = isCompleted(hw);
            const overdue = isOverdue(hw.due_date) && !completed;
            return (
              <Paper
                key={hw.id}
                variant="outlined"
                sx={{
                  p: 1.5,
                  borderColor: overdue ? 'error.main' : completed ? 'success.main' : 'divider',
                  bgcolor: completed ? 'success.50' : overdue ? 'error.50' : 'background.paper',
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                  <AssignmentOutlinedIcon sx={{ color: completed ? 'success.main' : overdue ? 'error.main' : 'text.secondary', mt: 0.25 }} />
                  <Box sx={{ flex: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                      <Typography variant="body2" fontWeight={600}>{hw.title}</Typography>
                      {hw.is_mandatory && <Chip label="Required" size="small" color="error" sx={{ height: 20, fontSize: '0.6rem' }} />}
                      {completed && <CheckCircleOutlineIcon sx={{ color: 'success.main', fontSize: 18 }} />}
                    </Box>
                    {hw.description && (
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                        {hw.description}
                      </Typography>
                    )}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
                        <AccessTimeIcon sx={{ fontSize: 14, color: overdue ? 'error.main' : 'text.secondary' }} />
                        <Typography variant="caption" color={overdue ? 'error.main' : 'text.secondary'}>
                          {overdue ? 'Overdue' : `Due ${new Date(hw.due_date).toLocaleDateString()}`}
                        </Typography>
                      </Box>
                      {isTeacher && (
                        <Typography variant="caption" color="text.secondary">
                          {hw.submission_count} submission{hw.submission_count !== 1 ? 's' : ''}
                        </Typography>
                      )}
                    </Box>
                  </Box>
                  {!isTeacher && !completed && (
                    <Button
                      variant="contained"
                      size="small"
                      onClick={() => { setSelectedHwId(hw.id); setSubmitOpen(true); }}
                      sx={{ textTransform: 'none', minHeight: 36 }}
                    >
                      Submit
                    </Button>
                  )}
                </Box>
              </Paper>
            );
          })}
        </Box>
      )}

      {/* Create homework dialog */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Create Drawing Homework</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
          <TextField label="Title" fullWidth value={title} onChange={(e) => setTitle(e.target.value)} required />
          <TextField label="Description (optional)" fullWidth multiline rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          <TextField label="Due Date" type="date" fullWidth value={dueDate} onChange={(e) => setDueDate(e.target.value)} InputLabelProps={{ shrink: true }} required />
          <FormControlLabel control={<Switch checked={mandatory} onChange={(e) => setMandatory(e.target.checked)} />} label="Mandatory" />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateOpen(false)} disabled={creating}>Cancel</Button>
          <Button variant="contained" onClick={handleCreate} disabled={!title || !dueDate || creating}>
            {creating ? 'Creating...' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Submission sheet for homework */}
      <DrawingSubmissionSheet
        open={submitOpen}
        onClose={() => setSubmitOpen(false)}
        sourceType="free_practice"
        getToken={getToken}
        onSubmitted={() => { setSubmitOpen(false); fetchHomework(); }}
      />
    </Box>
  );
}
