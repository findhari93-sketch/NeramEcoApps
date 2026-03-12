'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Paper,
  Chip,
  Skeleton,
  Button,
  TextField,
  MenuItem,
  Switch,
} from '@neram/ui';
import QuizOutlinedIcon from '@mui/icons-material/QuizOutlined';
import AddOutlinedIcon from '@mui/icons-material/AddOutlined';
import TimerOutlinedIcon from '@mui/icons-material/TimerOutlined';
import ExpandMoreOutlinedIcon from '@mui/icons-material/ExpandMoreOutlined';
import ExpandLessOutlinedIcon from '@mui/icons-material/ExpandLessOutlined';
import PeopleOutlinedIcon from '@mui/icons-material/PeopleOutlined';
import HelpOutlineOutlinedIcon from '@mui/icons-material/HelpOutlineOutlined';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';

interface Test {
  id: string;
  title: string;
  description: string | null;
  test_type: 'untimed' | 'timed' | 'per_question_timer' | 'model_test';
  duration_minutes: number | null;
  total_marks: number;
  is_published: boolean;
  questions: { count: number }[];
  attempts: { count: number }[];
  created_at: string;
}

const TEST_TYPES = [
  { value: 'untimed', label: 'Untimed' },
  { value: 'timed', label: 'Timed' },
  { value: 'per_question_timer', label: 'Per-Question Timer' },
  { value: 'model_test', label: 'Model Test' },
];

const TEST_TYPE_COLORS: Record<string, 'default' | 'primary' | 'warning' | 'secondary'> = {
  untimed: 'default',
  timed: 'primary',
  per_question_timer: 'warning',
  model_test: 'secondary',
};

export default function TeacherTests() {
  const { activeClassroom, getToken } = useNexusAuthContext();
  const [tests, setTests] = useState<Test[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [expandedTestId, setExpandedTestId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [testType, setTestType] = useState<string>('untimed');
  const [duration, setDuration] = useState('');
  const [totalMarks, setTotalMarks] = useState('');
  const [passingMarks, setPassingMarks] = useState('');

  const fetchTests = useCallback(async () => {
    if (!activeClassroom) return;
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) return;

      const res = await fetch(
        `/api/tests?classroom=${activeClassroom.id}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) {
        const data = await res.json();
        setTests(data.tests || []);
      }
    } catch (err) {
      console.error('Failed to load tests:', err);
    } finally {
      setLoading(false);
    }
  }, [activeClassroom, getToken]);

  useEffect(() => {
    if (!activeClassroom) return;
    fetchTests();
  }, [activeClassroom, fetchTests]);

  function resetForm() {
    setTitle('');
    setDescription('');
    setTestType('untimed');
    setDuration('');
    setTotalMarks('');
    setPassingMarks('');
    setShowCreateForm(false);
  }

  async function handleCreate() {
    if (!activeClassroom || !title.trim() || !totalMarks) return;
    setCreating(true);
    try {
      const token = await getToken();
      if (!token) return;

      const res = await fetch('/api/tests', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          classroom_id: activeClassroom.id,
          title: title.trim(),
          description: description.trim() || undefined,
          test_type: testType,
          duration_minutes: (testType === 'timed' || testType === 'model_test') && duration
            ? parseInt(duration, 10)
            : undefined,
          total_marks: parseInt(totalMarks, 10),
          passing_marks: passingMarks ? parseInt(passingMarks, 10) : undefined,
        }),
      });

      if (res.ok) {
        resetForm();
        fetchTests();
      }
    } catch (err) {
      console.error('Failed to create test:', err);
    } finally {
      setCreating(false);
    }
  }

  async function handleTogglePublish(test: Test) {
    setTogglingId(test.id);
    try {
      const token = await getToken();
      if (!token) return;

      const res = await fetch('/api/tests', {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          test_id: test.id,
          is_published: !test.is_published,
        }),
      });

      if (res.ok) {
        setTests((prev) =>
          prev.map((t) =>
            t.id === test.id ? { ...t, is_published: !t.is_published } : t
          )
        );
      }
    } catch (err) {
      console.error('Failed to toggle publish:', err);
    } finally {
      setTogglingId(null);
    }
  }

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const getTypeLabel = (type: string) =>
    TEST_TYPES.find((t) => t.value === type)?.label || type;

  const showDuration = testType === 'timed' || testType === 'model_test';

  return (
    <Box>
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          mb: 2,
        }}
      >
        <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }}>
          Tests
        </Typography>
        <Button
          variant="contained"
          size="small"
          startIcon={<AddOutlinedIcon />}
          onClick={() => setShowCreateForm((v) => !v)}
          sx={{ textTransform: 'none', minHeight: 40, borderRadius: 2 }}
        >
          Create
        </Button>
      </Box>

      {/* Create Form */}
      {showCreateForm && (
        <Paper
          variant="outlined"
          sx={{ p: 2, mb: 2, display: 'flex', flexDirection: 'column', gap: 2 }}
        >
          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
            New Test
          </Typography>

          <TextField
            label="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            size="small"
            fullWidth
            required
            inputProps={{ style: { minHeight: 24 } }}
          />

          <TextField
            label="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            size="small"
            fullWidth
            multiline
            rows={2}
            placeholder="Optional description..."
          />

          <TextField
            label="Test Type"
            value={testType}
            onChange={(e) => setTestType(e.target.value)}
            size="small"
            fullWidth
            select
          >
            {TEST_TYPES.map((t) => (
              <MenuItem key={t.value} value={t.value}>
                {t.label}
              </MenuItem>
            ))}
          </TextField>

          {showDuration && (
            <TextField
              label="Duration (minutes)"
              value={duration}
              onChange={(e) => setDuration(e.target.value.replace(/\D/g, ''))}
              size="small"
              fullWidth
              type="number"
              inputProps={{ min: 1, inputMode: 'numeric', style: { minHeight: 24 } }}
            />
          )}

          <Box sx={{ display: 'flex', gap: 1.5 }}>
            <TextField
              label="Total Marks"
              value={totalMarks}
              onChange={(e) => setTotalMarks(e.target.value.replace(/\D/g, ''))}
              size="small"
              fullWidth
              required
              type="number"
              inputProps={{ min: 1, inputMode: 'numeric', style: { minHeight: 24 } }}
            />
            <TextField
              label="Passing Marks"
              value={passingMarks}
              onChange={(e) => setPassingMarks(e.target.value.replace(/\D/g, ''))}
              size="small"
              fullWidth
              type="number"
              inputProps={{ min: 0, inputMode: 'numeric', style: { minHeight: 24 } }}
            />
          </Box>

          <Box sx={{ display: 'flex', gap: 1.5 }}>
            <Button
              variant="outlined"
              fullWidth
              onClick={resetForm}
              sx={{ textTransform: 'none', minHeight: 48 }}
            >
              Cancel
            </Button>
            <Button
              variant="contained"
              fullWidth
              onClick={handleCreate}
              disabled={creating || !title.trim() || !totalMarks}
              sx={{ textTransform: 'none', minHeight: 48 }}
            >
              {creating ? 'Creating...' : 'Create Test'}
            </Button>
          </Box>
        </Paper>
      )}

      {/* Test List */}
      {loading ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} variant="rectangular" height={80} sx={{ borderRadius: 1 }} />
          ))}
        </Box>
      ) : tests.length === 0 ? (
        <Paper sx={{ p: 3, textAlign: 'center' }}>
          <QuizOutlinedIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
          <Typography variant="body2" color="text.secondary">
            No tests created yet. Tap &quot;Create&quot; to add your first test.
          </Typography>
        </Paper>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {tests.map((test) => {
            const isExpanded = expandedTestId === test.id;
            const questionCount = test.questions?.[0]?.count ?? 0;
            const attemptCount = test.attempts?.[0]?.count ?? 0;

            return (
              <Paper
                key={test.id}
                variant="outlined"
                sx={{
                  overflow: 'hidden',
                  border: isExpanded ? '2px solid' : '1px solid',
                  borderColor: isExpanded ? 'primary.main' : 'divider',
                }}
              >
                {/* Card Header - Clickable */}
                <Box
                  onClick={() =>
                    setExpandedTestId(isExpanded ? null : test.id)
                  }
                  sx={{
                    p: 2,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.5,
                    cursor: 'pointer',
                    minHeight: 48,
                    '&:hover': { bgcolor: 'action.hover' },
                    '&:active': { bgcolor: 'action.selected' },
                  }}
                >
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1,
                        mb: 0.5,
                      }}
                    >
                      <Typography
                        variant="body1"
                        sx={{ fontWeight: 600 }}
                        noWrap
                      >
                        {test.title}
                      </Typography>
                      <Chip
                        label={test.is_published ? 'Published' : 'Draft'}
                        size="small"
                        color={test.is_published ? 'success' : 'default'}
                        variant="outlined"
                        sx={{ flexShrink: 0 }}
                      />
                    </Box>
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1.5,
                        flexWrap: 'wrap',
                      }}
                    >
                      <Chip
                        label={getTypeLabel(test.test_type)}
                        size="small"
                        color={TEST_TYPE_COLORS[test.test_type] || 'default'}
                        sx={{ height: 22 }}
                      />
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 0.5,
                        }}
                      >
                        <HelpOutlineOutlinedIcon
                          sx={{ fontSize: 14, color: 'text.secondary' }}
                        />
                        <Typography variant="caption" color="text.secondary">
                          {questionCount} Q{questionCount !== 1 ? 's' : ''}
                        </Typography>
                      </Box>
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 0.5,
                        }}
                      >
                        <PeopleOutlinedIcon
                          sx={{ fontSize: 14, color: 'text.secondary' }}
                        />
                        <Typography variant="caption" color="text.secondary">
                          {attemptCount} attempt{attemptCount !== 1 ? 's' : ''}
                        </Typography>
                      </Box>
                      {test.duration_minutes && (
                        <Box
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 0.5,
                          }}
                        >
                          <TimerOutlinedIcon
                            sx={{ fontSize: 14, color: 'text.secondary' }}
                          />
                          <Typography variant="caption" color="text.secondary">
                            {test.duration_minutes} min
                          </Typography>
                        </Box>
                      )}
                    </Box>
                  </Box>
                  {isExpanded ? (
                    <ExpandLessOutlinedIcon
                      sx={{ color: 'text.secondary', flexShrink: 0 }}
                    />
                  ) : (
                    <ExpandMoreOutlinedIcon
                      sx={{ color: 'text.secondary', flexShrink: 0 }}
                    />
                  )}
                </Box>

                {/* Expanded Details */}
                {isExpanded && (
                  <Box
                    sx={{
                      px: 2,
                      pb: 2,
                      pt: 0,
                      borderTop: '1px solid',
                      borderColor: 'divider',
                    }}
                  >
                    {test.description && (
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{ mt: 1.5, mb: 1 }}
                      >
                        {test.description}
                      </Typography>
                    )}

                    <Box
                      sx={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        mt: 1.5,
                      }}
                    >
                      <Box>
                        <Typography variant="caption" color="text.secondary">
                          Total Marks: {test.total_marks}
                        </Typography>
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ display: 'block' }}
                        >
                          Created: {formatDate(test.created_at)}
                        </Typography>
                      </Box>

                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 0.5,
                        }}
                      >
                        <Typography variant="body2" sx={{ fontWeight: 500 }}>
                          {test.is_published ? 'Published' : 'Draft'}
                        </Typography>
                        <Switch
                          checked={test.is_published}
                          onChange={() => handleTogglePublish(test)}
                          disabled={togglingId === test.id}
                          size="small"
                          color="success"
                        />
                      </Box>
                    </Box>

                    {/* Results summary */}
                    {attemptCount > 0 && (
                      <Paper
                        variant="outlined"
                        sx={{
                          mt: 1.5,
                          p: 1.5,
                          bgcolor: 'action.hover',
                          display: 'flex',
                          justifyContent: 'space-around',
                        }}
                      >
                        <Box sx={{ textAlign: 'center' }}>
                          <Typography
                            variant="h6"
                            sx={{ fontWeight: 700, lineHeight: 1 }}
                          >
                            {attemptCount}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            Attempts
                          </Typography>
                        </Box>
                        <Box sx={{ textAlign: 'center' }}>
                          <Typography
                            variant="h6"
                            sx={{ fontWeight: 700, lineHeight: 1 }}
                          >
                            {questionCount}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            Questions
                          </Typography>
                        </Box>
                        <Box sx={{ textAlign: 'center' }}>
                          <Typography
                            variant="h6"
                            sx={{ fontWeight: 700, lineHeight: 1 }}
                          >
                            {test.total_marks}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            Marks
                          </Typography>
                        </Box>
                      </Paper>
                    )}
                  </Box>
                )}
              </Paper>
            );
          })}
        </Box>
      )}
    </Box>
  );
}
