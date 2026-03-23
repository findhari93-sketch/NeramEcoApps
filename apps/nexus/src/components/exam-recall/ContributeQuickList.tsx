'use client';

import { useState, useCallback } from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  Stack,
  Select,
  MenuItem,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
} from '@neram/ui';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import SendIcon from '@mui/icons-material/Send';

interface ContributeQuickListProps {
  examDate: string;
  sessionNumber: number;
  classroomId: string;
  onSubmit: (dumps: any[]) => Promise<void>;
}

const TOPIC_OPTIONS = [
  { value: 'visual_reasoning', label: 'Visual Reasoning' },
  { value: 'logical_derivation', label: 'Logical Derivation' },
  { value: 'gk_architecture', label: 'GK / Architecture' },
  { value: 'language', label: 'Language' },
  { value: 'design_sensitivity', label: 'Design Sensitivity' },
  { value: 'numerical_ability', label: 'Numerical Ability' },
  { value: 'drawing', label: 'Drawing' },
];

interface DumpRow {
  topic: string;
  count: string;
  details: string;
}

function createEmptyRow(): DumpRow {
  return { topic: 'visual_reasoning', count: '', details: '' };
}

export default function ContributeQuickList({
  examDate,
  sessionNumber,
  classroomId,
  onSubmit,
}: ContributeQuickListProps) {
  const [rows, setRows] = useState<DumpRow[]>([createEmptyRow()]);
  const [submitting, setSubmitting] = useState(false);

  const addRow = useCallback(() => {
    setRows((prev) => [...prev, createEmptyRow()]);
  }, []);

  const removeRow = useCallback((index: number) => {
    setRows((prev) => prev.length > 1 ? prev.filter((_, i) => i !== index) : prev);
  }, []);

  const updateRow = useCallback((index: number, field: keyof DumpRow, value: string) => {
    setRows((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  }, []);

  const handleSubmit = async () => {
    const validRows = rows.filter((r) => r.topic);
    if (validRows.length === 0 || submitting) return;
    setSubmitting(true);
    try {
      await onSubmit(
        validRows.map((r) => ({
          exam_date: examDate,
          session_number: sessionNumber,
          classroom_id: classroomId,
          topic_category: r.topic,
          estimated_count: r.count ? parseInt(r.count, 10) : null,
          brief_details: r.details.trim() || null,
        }))
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Stack spacing={2}>
      <Typography variant="subtitle1" fontWeight={600}>
        Quick Topic Dump
      </Typography>
      <Typography variant="body2" color="text.secondary">
        List the topics you saw and roughly how many questions per topic.
      </Typography>

      {/* Mobile: stack layout, Desktop: table */}
      <Box sx={{ display: { xs: 'none', md: 'block' } }}>
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 600 }}>Topic</TableCell>
                <TableCell sx={{ fontWeight: 600, width: 80 }}>Count</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Details</TableCell>
                <TableCell sx={{ width: 48 }} />
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row, i) => (
                <TableRow key={i}>
                  <TableCell sx={{ py: 0.5 }}>
                    <Select
                      size="small"
                      value={row.topic}
                      onChange={(e) => updateRow(i, 'topic', e.target.value)}
                      fullWidth
                      sx={{ minWidth: 140 }}
                    >
                      {TOPIC_OPTIONS.map((t) => (
                        <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>
                      ))}
                    </Select>
                  </TableCell>
                  <TableCell sx={{ py: 0.5 }}>
                    <TextField
                      size="small"
                      type="number"
                      value={row.count}
                      onChange={(e) => updateRow(i, 'count', e.target.value)}
                      inputProps={{ min: 0, max: 100 }}
                      sx={{ width: 70 }}
                    />
                  </TableCell>
                  <TableCell sx={{ py: 0.5 }}>
                    <TextField
                      size="small"
                      value={row.details}
                      onChange={(e) => updateRow(i, 'details', e.target.value)}
                      placeholder="Brief notes..."
                      fullWidth
                    />
                  </TableCell>
                  <TableCell sx={{ py: 0.5 }}>
                    <IconButton
                      size="small"
                      onClick={() => removeRow(i)}
                      disabled={rows.length <= 1}
                    >
                      <DeleteOutlineIcon sx={{ fontSize: '1.1rem' }} />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>

      {/* Mobile layout */}
      <Box sx={{ display: { xs: 'block', md: 'none' } }}>
        <Stack spacing={1.5}>
          {rows.map((row, i) => (
            <Box
              key={i}
              sx={{
                p: 1.5,
                borderRadius: 2,
                border: '1px solid',
                borderColor: 'grey.200',
              }}
            >
              <Stack spacing={1}>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Typography variant="caption" fontWeight={600}>Row {i + 1}</Typography>
                  <IconButton
                    size="small"
                    onClick={() => removeRow(i)}
                    disabled={rows.length <= 1}
                  >
                    <DeleteOutlineIcon sx={{ fontSize: '1rem' }} />
                  </IconButton>
                </Stack>
                <Select
                  size="small"
                  value={row.topic}
                  onChange={(e) => updateRow(i, 'topic', e.target.value)}
                  fullWidth
                >
                  {TOPIC_OPTIONS.map((t) => (
                    <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>
                  ))}
                </Select>
                <Stack direction="row" spacing={1}>
                  <TextField
                    size="small"
                    type="number"
                    label="Count"
                    value={row.count}
                    onChange={(e) => updateRow(i, 'count', e.target.value)}
                    sx={{ width: 80 }}
                  />
                  <TextField
                    size="small"
                    label="Details"
                    value={row.details}
                    onChange={(e) => updateRow(i, 'details', e.target.value)}
                    fullWidth
                  />
                </Stack>
              </Stack>
            </Box>
          ))}
        </Stack>
      </Box>

      <Stack direction="row" spacing={1.5}>
        <Button
          variant="outlined"
          size="small"
          startIcon={<AddIcon />}
          onClick={addRow}
          sx={{ textTransform: 'none' }}
        >
          Add Topic
        </Button>
        <Button
          variant="contained"
          size="small"
          startIcon={<SendIcon />}
          onClick={handleSubmit}
          disabled={submitting}
          sx={{ textTransform: 'none', fontWeight: 600 }}
        >
          {submitting ? 'Submitting...' : 'Submit All'}
        </Button>
      </Stack>
    </Stack>
  );
}
