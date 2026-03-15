'use client';

import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  Chip,
  Skeleton,
  Button,
  TextField,
  MenuItem,
  Tabs,
  Tab,
  IconButton,
} from '@neram/ui';
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined';
import CloseOutlinedIcon from '@mui/icons-material/CloseOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import QuizOutlinedIcon from '@mui/icons-material/QuizOutlined';
import FilterListOutlinedIcon from '@mui/icons-material/FilterListOutlined';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';

interface StudentSubmission {
  id: string;
  student: { name: string };
  question_text: string;
  exam_name: string;
  exam_date: string;
  options: string[];
  correct_answer: string;
  difficulty: string;
  status: string;
}

interface BankQuestion {
  id: string;
  question_text: string;
  question_type: string;
  difficulty: string;
  topic: { title: string };
  options: string[];
  source_exam: string;
}

const DIFFICULTY_OPTIONS = ['', 'easy', 'medium', 'hard'];

export default function TeacherQuestions() {
  const { activeClassroom, getToken } = useNexusAuthContext();
  const [tab, setTab] = useState(0);

  // Submissions tab state
  const [submissions, setSubmissions] = useState<StudentSubmission[]>([]);
  const [loadingSubs, setLoadingSubs] = useState(true);
  const [selectedSub, setSelectedSub] = useState<StudentSubmission | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editText, setEditText] = useState('');
  const [editOptions, setEditOptions] = useState<string[]>([]);
  const [editAnswer, setEditAnswer] = useState('');
  const [editDifficulty, setEditDifficulty] = useState('');
  const [actioning, setActioning] = useState(false);

  // Bank tab state
  const [questions, setQuestions] = useState<BankQuestion[]>([]);
  const [loadingBank, setLoadingBank] = useState(true);
  const [filterDifficulty, setFilterDifficulty] = useState('');
  const [filterTopic, setFilterTopic] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    if (!activeClassroom) return;
    if (tab === 0) fetchSubmissions();
    else fetchBank();
  }, [activeClassroom, tab]);

  async function fetchSubmissions() {
    setLoadingSubs(true);
    try {
      const token = await getToken();
      if (!token) return;

      const res = await fetch(
        `/api/questions?classroom=${activeClassroom!.id}&mode=submissions&status=pending`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) {
        const data = await res.json();
        setSubmissions(data.submissions || []);
      }
    } catch (err) {
      console.error('Failed to load submissions:', err);
    } finally {
      setLoadingSubs(false);
    }
  }

  async function fetchBank() {
    setLoadingBank(true);
    try {
      const token = await getToken();
      if (!token) return;

      let url = `/api/questions?classroom=${activeClassroom!.id}&mode=bank`;
      if (filterDifficulty) url += `&difficulty=${filterDifficulty}`;
      if (filterTopic) url += `&topic=${filterTopic}`;

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setQuestions(data.questions || []);
      }
    } catch (err) {
      console.error('Failed to load question bank:', err);
    } finally {
      setLoadingBank(false);
    }
  }

  // Re-fetch bank when filters change
  useEffect(() => {
    if (tab === 1 && activeClassroom) fetchBank();
  }, [filterDifficulty, filterTopic]);

  function openSubmission(sub: StudentSubmission) {
    setSelectedSub(sub);
    setEditMode(false);
    setEditText(sub.question_text);
    setEditOptions([...(sub.options || [])]);
    setEditAnswer(sub.correct_answer || '');
    setEditDifficulty(sub.difficulty || 'medium');
  }

  function startEdit() {
    setEditMode(true);
  }

  async function handleAction(status: 'verified' | 'rejected') {
    if (!selectedSub) return;
    setActioning(true);
    try {
      const token = await getToken();
      if (!token) return;

      const body: Record<string, unknown> = {
        submission_id: selectedSub.id,
        status,
      };

      // If editing and verifying, include edited fields
      if (editMode && status === 'verified') {
        body.question_text = editText.trim();
        body.options = editOptions.filter((o) => o.trim());
        body.correct_answer = editAnswer.trim();
        body.difficulty = editDifficulty;
      }

      const res = await fetch('/api/questions', {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        setSubmissions((prev) => prev.filter((s) => s.id !== selectedSub.id));
        setSelectedSub(null);
      }
    } catch (err) {
      console.error('Failed to update submission:', err);
    } finally {
      setActioning(false);
    }
  }

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  };

  const difficultyColor = (d: string) => {
    if (d === 'easy') return 'success';
    if (d === 'medium') return 'warning';
    if (d === 'hard') return 'error';
    return 'default';
  };

  return (
    <Box>
      <Typography variant="h6" component="h1" sx={{ fontWeight: 700, mb: 1 }}>
        Question Bank
      </Typography>

      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v)}
        sx={{ mb: 2, minHeight: 40 }}
      >
        <Tab
          label={
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              Submissions
              {submissions.length > 0 && (
                <Chip label={submissions.length} size="small" color="error" sx={{ height: 20, fontSize: '0.7rem' }} />
              )}
            </Box>
          }
          sx={{ textTransform: 'none', minHeight: 40, px: 2 }}
        />
        <Tab
          label="Question Bank"
          sx={{ textTransform: 'none', minHeight: 40, px: 2 }}
        />
      </Tabs>

      {/* Tab 0: Submissions */}
      {tab === 0 && (
        <>
          {loadingSubs ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} variant="rectangular" height={80} sx={{ borderRadius: 1 }} />
              ))}
            </Box>
          ) : submissions.length === 0 ? (
            <Paper sx={{ p: 3, textAlign: 'center' }}>
              <CheckCircleOutlinedIcon sx={{ fontSize: 48, color: 'success.main', mb: 1 }} />
              <Typography variant="body2" color="text.secondary">
                No pending submissions to review.
              </Typography>
            </Paper>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {submissions.map((sub) => (
                <Paper
                  key={sub.id}
                  variant="outlined"
                  onClick={() => openSubmission(sub)}
                  sx={{
                    p: 2,
                    cursor: 'pointer',
                    '&:hover': { bgcolor: 'action.hover' },
                    '&:active': { bgcolor: 'action.selected' },
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                    <Typography variant="body2" fontWeight={600} sx={{ flex: 1 }} noWrap>
                      {sub.student.name}
                    </Typography>
                    <Chip
                      label={sub.difficulty}
                      size="small"
                      color={difficultyColor(sub.difficulty) as any}
                      sx={{ height: 20, fontSize: '0.675rem', textTransform: 'capitalize' }}
                    />
                  </Box>
                  <Typography variant="body2" color="text.secondary" noWrap sx={{ mb: 0.5 }}>
                    {sub.question_text}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {sub.exam_name}
                    {sub.exam_date && ` \u00b7 ${formatDate(sub.exam_date)}`}
                  </Typography>
                </Paper>
              ))}
            </Box>
          )}

          {/* Submission detail bottom sheet */}
          {selectedSub && (
            <Box
              sx={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                zIndex: 1300,
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <Box
                onClick={() => setSelectedSub(null)}
                sx={{ flex: 1, bgcolor: 'rgba(0,0,0,0.5)', minHeight: 40 }}
              />
              <Paper
                elevation={8}
                sx={{
                  borderTopLeftRadius: 16,
                  borderTopRightRadius: 16,
                  maxHeight: '85vh',
                  overflow: 'auto',
                  p: { xs: 2, sm: 3 },
                }}
              >
                <Box sx={{ display: 'flex', justifyContent: 'center', mb: 1.5 }}>
                  <Box sx={{ width: 40, height: 4, borderRadius: 2, bgcolor: 'divider' }} />
                </Box>

                {/* Header */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="body2" fontWeight={600}>
                      {selectedSub.student.name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {selectedSub.exam_name}
                      {selectedSub.exam_date && ` \u00b7 ${formatDate(selectedSub.exam_date)}`}
                    </Typography>
                  </Box>
                  {!editMode && (
                    <IconButton size="small" onClick={startEdit} sx={{ minWidth: 48, minHeight: 48 }}>
                      <EditOutlinedIcon sx={{ fontSize: 20 }} />
                    </IconButton>
                  )}
                </Box>

                {/* Question content - readonly or edit */}
                {editMode ? (
                  <>
                    <TextField
                      label="Question Text"
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      size="small"
                      fullWidth
                      multiline
                      rows={3}
                      sx={{ mb: 1.5 }}
                    />
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mb: 1.5 }}>
                      {editOptions.map((opt, i) => (
                        <TextField
                          key={i}
                          label={`Option ${String.fromCharCode(65 + i)}`}
                          value={opt}
                          onChange={(e) => {
                            const next = [...editOptions];
                            next[i] = e.target.value;
                            setEditOptions(next);
                          }}
                          size="small"
                          fullWidth
                        />
                      ))}
                    </Box>
                    <TextField
                      label="Correct Answer"
                      value={editAnswer}
                      onChange={(e) => setEditAnswer(e.target.value)}
                      size="small"
                      fullWidth
                      sx={{ mb: 1.5 }}
                    />
                    <TextField
                      label="Difficulty"
                      value={editDifficulty}
                      onChange={(e) => setEditDifficulty(e.target.value)}
                      size="small"
                      fullWidth
                      select
                      InputLabelProps={{ shrink: true }}
                      sx={{ mb: 2 }}
                    >
                      {['easy', 'medium', 'hard'].map((d) => (
                        <MenuItem key={d} value={d}>
                          {d.charAt(0).toUpperCase() + d.slice(1)}
                        </MenuItem>
                      ))}
                    </TextField>
                  </>
                ) : (
                  <>
                    <Paper variant="outlined" sx={{ p: 1.5, mb: 1.5, bgcolor: 'grey.50' }}>
                      <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                        {selectedSub.question_text}
                      </Typography>
                    </Paper>

                    {selectedSub.options?.length > 0 && (
                      <Box sx={{ mb: 1.5 }}>
                        <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
                          Options
                        </Typography>
                        {selectedSub.options.map((opt, i) => (
                          <Typography key={i} variant="body2" sx={{ pl: 1, mb: 0.25 }}>
                            {String.fromCharCode(65 + i)}. {opt}
                          </Typography>
                        ))}
                      </Box>
                    )}

                    {selectedSub.correct_answer && (
                      <Typography variant="body2" sx={{ mb: 1.5 }}>
                        <Typography component="span" variant="caption" color="text.secondary">
                          Answer:{' '}
                        </Typography>
                        {selectedSub.correct_answer}
                      </Typography>
                    )}

                    <Chip
                      label={selectedSub.difficulty}
                      size="small"
                      color={difficultyColor(selectedSub.difficulty) as any}
                      sx={{ textTransform: 'capitalize', mb: 2 }}
                    />
                  </>
                )}

                {/* Actions */}
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Button
                    variant="outlined"
                    color="error"
                    fullWidth
                    onClick={() => handleAction('rejected')}
                    disabled={actioning}
                    startIcon={<CloseOutlinedIcon />}
                    sx={{ textTransform: 'none', minHeight: 48 }}
                  >
                    Reject
                  </Button>
                  <Button
                    variant="contained"
                    color="success"
                    fullWidth
                    onClick={() => handleAction('verified')}
                    disabled={actioning}
                    startIcon={<CheckCircleOutlinedIcon />}
                    sx={{ textTransform: 'none', minHeight: 48 }}
                  >
                    {actioning ? 'Saving...' : editMode ? 'Save & Verify' : 'Verify'}
                  </Button>
                </Box>
              </Paper>
            </Box>
          )}
        </>
      )}

      {/* Tab 1: Question Bank */}
      {tab === 1 && (
        <>
          {/* Filter bar */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
            <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
              {!loadingBank && `${questions.length} question${questions.length !== 1 ? 's' : ''}`}
            </Typography>
            <IconButton
              size="small"
              onClick={() => setShowFilters(!showFilters)}
              sx={{ minWidth: 48, minHeight: 48 }}
            >
              <FilterListOutlinedIcon />
            </IconButton>
          </Box>

          {showFilters && (
            <Paper variant="outlined" sx={{ p: 1.5, mb: 1.5, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              <TextField
                label="Difficulty"
                value={filterDifficulty}
                onChange={(e) => setFilterDifficulty(e.target.value)}
                size="small"
                select
                InputLabelProps={{ shrink: true }}
                sx={{ minWidth: 120 }}
              >
                <MenuItem value="">All</MenuItem>
                {['easy', 'medium', 'hard'].map((d) => (
                  <MenuItem key={d} value={d}>
                    {d.charAt(0).toUpperCase() + d.slice(1)}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                label="Topic"
                value={filterTopic}
                onChange={(e) => setFilterTopic(e.target.value)}
                size="small"
                placeholder="Topic ID or name"
                sx={{ flex: 1, minWidth: 120 }}
              />
            </Paper>
          )}

          {loadingBank ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} variant="rectangular" height={80} sx={{ borderRadius: 1 }} />
              ))}
            </Box>
          ) : questions.length === 0 ? (
            <Paper sx={{ p: 3, textAlign: 'center' }}>
              <QuizOutlinedIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
              <Typography variant="body2" color="text.secondary">
                No questions in the bank yet. Verify student submissions to build the bank.
              </Typography>
            </Paper>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {questions.map((q) => (
                <Paper key={q.id} variant="outlined" sx={{ p: 2 }}>
                  <Typography variant="body2" fontWeight={600} sx={{ mb: 0.5 }}>
                    {q.question_text}
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
                    <Chip
                      label={q.question_type || 'MCQ'}
                      size="small"
                      variant="outlined"
                      sx={{ height: 20, fontSize: '0.675rem' }}
                    />
                    <Chip
                      label={q.difficulty}
                      size="small"
                      color={difficultyColor(q.difficulty) as any}
                      sx={{ height: 20, fontSize: '0.675rem', textTransform: 'capitalize' }}
                    />
                    {q.topic?.title && (
                      <Chip
                        label={q.topic.title}
                        size="small"
                        variant="outlined"
                        sx={{ height: 20, fontSize: '0.675rem' }}
                      />
                    )}
                    {q.source_exam && (
                      <Typography variant="caption" color="text.secondary">
                        {q.source_exam}
                      </Typography>
                    )}
                  </Box>
                </Paper>
              ))}
            </Box>
          )}
        </>
      )}
    </Box>
  );
}
