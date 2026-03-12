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
  IconButton,
} from '@neram/ui';
import AddOutlinedIcon from '@mui/icons-material/AddOutlined';
import QuizOutlinedIcon from '@mui/icons-material/QuizOutlined';
import ImageOutlinedIcon from '@mui/icons-material/ImageOutlined';
import CloseOutlinedIcon from '@mui/icons-material/CloseOutlined';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';

interface Submission {
  id: string;
  question_text: string;
  exam_name: string;
  exam_date: string;
  options: string[];
  correct_answer: string;
  difficulty: string;
  status: string;
  image_url?: string;
}

const DIFFICULTY_OPTIONS = ['easy', 'medium', 'hard'];

export default function StudentQuestions() {
  const { activeClassroom, getToken } = useNexusAuthContext();
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [examName, setExamName] = useState('');
  const [examDate, setExamDate] = useState('');
  const [questionText, setQuestionText] = useState('');
  const [options, setOptions] = useState(['', '', '', '']);
  const [correctAnswer, setCorrectAnswer] = useState('');
  const [difficulty, setDifficulty] = useState('medium');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  useEffect(() => {
    if (!activeClassroom) return;
    fetchSubmissions();
  }, [activeClassroom]);

  async function fetchSubmissions() {
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) return;

      const res = await fetch(
        `/api/questions?classroom=${activeClassroom!.id}&mode=submissions`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) {
        const data = await res.json();
        setSubmissions(data.submissions || []);
      }
    } catch (err) {
      console.error('Failed to load submissions:', err);
    } finally {
      setLoading(false);
    }
  }

  function handleOptionChange(index: number, value: string) {
    setOptions((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  }

  function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = () => setImagePreview(reader.result as string);
    reader.readAsDataURL(file);
  }

  function removeImage() {
    setImageFile(null);
    setImagePreview(null);
  }

  async function uploadImage(token: string): Promise<string | undefined> {
    if (!imageFile) return undefined;
    setUploadingImage(true);
    try {
      const formData = new FormData();
      formData.append('file', imageFile);
      formData.append('exercise_id', 'question-submission');

      const res = await fetch('/api/drawings/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        return data.url;
      }
    } catch (err) {
      console.error('Failed to upload image:', err);
    } finally {
      setUploadingImage(false);
    }
    return undefined;
  }

  function resetForm() {
    setExamName('');
    setExamDate('');
    setQuestionText('');
    setOptions(['', '', '', '']);
    setCorrectAnswer('');
    setDifficulty('medium');
    setImageFile(null);
    setImagePreview(null);
  }

  async function handleSubmit() {
    if (!questionText.trim() || !examName.trim()) return;
    setSubmitting(true);
    try {
      const token = await getToken();
      if (!token) return;

      let image_url: string | undefined;
      if (imageFile) {
        image_url = await uploadImage(token);
      }

      const res = await fetch('/api/questions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          classroom_id: activeClassroom!.id,
          exam_name: examName.trim(),
          exam_date: examDate || undefined,
          question_text: questionText.trim(),
          options: options.filter((o) => o.trim()),
          correct_answer: correctAnswer.trim() || undefined,
          difficulty,
          image_url,
        }),
      });

      if (res.ok) {
        resetForm();
        setShowForm(false);
        fetchSubmissions();
      }
    } catch (err) {
      console.error('Failed to submit question:', err);
    } finally {
      setSubmitting(false);
    }
  }

  const statusColor = (status: string) => {
    if (status === 'pending') return 'warning';
    if (status === 'verified') return 'success';
    if (status === 'rejected') return 'error';
    if (status === 'merged') return 'info';
    return 'default';
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  };

  const isFormValid = questionText.trim() && examName.trim();

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
        <Typography variant="h6" component="h1" sx={{ fontWeight: 700 }}>
          Question Submissions
        </Typography>
        <Button
          variant="contained"
          size="small"
          startIcon={<AddOutlinedIcon />}
          onClick={() => setShowForm(true)}
          sx={{ textTransform: 'none', minHeight: 36 }}
        >
          Submit
        </Button>
      </Box>

      {/* Submit question form */}
      {showForm && (
        <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
          <Typography variant="body2" fontWeight={600} sx={{ mb: 1.5 }}>
            Submit a Remembered Question
          </Typography>

          <TextField
            label="Exam Name"
            value={examName}
            onChange={(e) => setExamName(e.target.value)}
            size="small"
            fullWidth
            required
            placeholder="e.g., Mid-term Physics 2026"
            sx={{ mb: 1.5 }}
          />

          <TextField
            label="Exam Date"
            type="date"
            value={examDate}
            onChange={(e) => setExamDate(e.target.value)}
            size="small"
            fullWidth
            InputLabelProps={{ shrink: true }}
            sx={{ mb: 1.5 }}
          />

          <TextField
            label="Question Text"
            value={questionText}
            onChange={(e) => setQuestionText(e.target.value)}
            size="small"
            fullWidth
            required
            multiline
            rows={3}
            placeholder="Type the question as you remember it..."
            sx={{ mb: 1.5 }}
          />

          {/* MCQ Options */}
          <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
            Options (for MCQ)
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mb: 1.5 }}>
            {options.map((opt, i) => (
              <TextField
                key={i}
                label={`Option ${String.fromCharCode(65 + i)}`}
                value={opt}
                onChange={(e) => handleOptionChange(i, e.target.value)}
                size="small"
                fullWidth
              />
            ))}
          </Box>

          <TextField
            label="Correct Answer"
            value={correctAnswer}
            onChange={(e) => setCorrectAnswer(e.target.value)}
            size="small"
            fullWidth
            placeholder="e.g., A or the answer text"
            sx={{ mb: 1.5 }}
          />

          <TextField
            label="Difficulty"
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value)}
            size="small"
            fullWidth
            select
            sx={{ mb: 1.5 }}
          >
            {DIFFICULTY_OPTIONS.map((d) => (
              <MenuItem key={d} value={d}>
                {d.charAt(0).toUpperCase() + d.slice(1)}
              </MenuItem>
            ))}
          </TextField>

          {/* Image upload */}
          {imagePreview ? (
            <Paper variant="outlined" sx={{ p: 1, mb: 1.5, position: 'relative' }}>
              <IconButton
                size="small"
                onClick={removeImage}
                sx={{ position: 'absolute', top: 4, right: 4, bgcolor: 'background.paper' }}
              >
                <CloseOutlinedIcon sx={{ fontSize: 18 }} />
              </IconButton>
              <Box
                component="img"
                src={imagePreview}
                alt="Question image"
                sx={{
                  width: '100%',
                  maxHeight: 200,
                  objectFit: 'contain',
                  borderRadius: 1,
                }}
              />
            </Paper>
          ) : (
            <Button
              variant="outlined"
              size="small"
              component="label"
              startIcon={<ImageOutlinedIcon />}
              sx={{ textTransform: 'none', mb: 1.5 }}
            >
              Attach Image
              <input
                type="file"
                accept="image/*"
                hidden
                onChange={handleImageSelect}
              />
            </Button>
          )}

          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button
              variant="outlined"
              size="small"
              onClick={() => {
                setShowForm(false);
                resetForm();
              }}
              sx={{ textTransform: 'none', minHeight: 48 }}
            >
              Cancel
            </Button>
            <Button
              variant="contained"
              size="small"
              onClick={handleSubmit}
              disabled={submitting || uploadingImage || !isFormValid}
              sx={{ textTransform: 'none', minHeight: 48 }}
            >
              {submitting || uploadingImage ? 'Submitting...' : 'Submit Question'}
            </Button>
          </Box>
        </Paper>
      )}

      {/* Past submissions list */}
      {loading ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} variant="rectangular" height={72} sx={{ borderRadius: 1 }} />
          ))}
        </Box>
      ) : submissions.length === 0 ? (
        <Paper sx={{ p: 3, textAlign: 'center' }}>
          <QuizOutlinedIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
          <Typography variant="body2" color="text.secondary">
            No questions submitted yet. After an exam, submit the questions you remember!
          </Typography>
        </Paper>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {submissions.map((sub) => (
            <Paper
              key={sub.id}
              variant="outlined"
              sx={{ p: 2 }}
            >
              <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mb: 0.5 }}>
                <Typography variant="body2" fontWeight={600} sx={{ flex: 1 }} noWrap>
                  {sub.question_text}
                </Typography>
                <Chip
                  label={sub.status}
                  size="small"
                  color={statusColor(sub.status) as any}
                  sx={{ textTransform: 'capitalize', flexShrink: 0 }}
                />
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                <Typography variant="caption" color="text.secondary">
                  {sub.exam_name}
                </Typography>
                {sub.exam_date && (
                  <Typography variant="caption" color="text.secondary">
                    &middot; {formatDate(sub.exam_date)}
                  </Typography>
                )}
                <Chip
                  label={sub.difficulty}
                  size="small"
                  variant="outlined"
                  sx={{ height: 20, fontSize: '0.675rem', textTransform: 'capitalize' }}
                />
              </Box>
            </Paper>
          ))}
        </Box>
      )}
    </Box>
  );
}
