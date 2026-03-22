'use client';

import { useState, useCallback } from 'react';
import {
  Box,
  Typography,
  Button,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  RadioGroup,
  FormControlLabel,
  Radio,
  Stepper,
  Step,
  StepLabel,
  StepContent,
  Paper,
  Chip,
  Divider,
  useTheme,
  useMediaQuery,
  IconButton,
} from '@neram/ui';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import type {
  NexusQBQuestion,
  NexusQBQuestionSource,
  NexusQBTopic,
  QBQuestionFormat,
  QBDifficulty,
  QBExamRelevance,
  QBExamType,
  NexusQBQuestionOption,
} from '@neram/database';
import { QB_CATEGORIES, QB_CATEGORY_LABELS, QB_EXAM_TYPE_LABELS } from '@neram/database';
import type { QBCategory } from '@neram/database';
import type { ImageState } from '@/lib/bulk-upload-schema';
import QuestionCard from './QuestionCard';
import ImageUploadZone from './ImageUploadZone';

interface QuestionFormWizardProps {
  initialData?: NexusQBQuestion;
  sources?: NexusQBQuestionSource[];
  topics: NexusQBTopic[];
  onSubmit: (data: Partial<NexusQBQuestion>, sources: Partial<NexusQBQuestionSource>[]) => Promise<void>;
  loading?: boolean;
  getToken: () => Promise<string | null>;
}

interface FormData {
  // Step 1: Source & Format
  exam_type: QBExamType;
  year: string;
  session: string;
  question_number: string;
  question_format: QBQuestionFormat;
  // Step 2: Content
  question_text: string;
  question_text_hi: string;
  question_image?: ImageState;
  options: NexusQBQuestionOption[];
  correct_option_id: string;
  correct_answer: string;
  answer_tolerance: string;
  // Step 3: Classification
  categories: string[];
  difficulty: QBDifficulty;
  exam_relevance: QBExamRelevance;
  topic_id: string;
  sub_topic: string;
  // Step 4: Solution
  explanation_brief: string;
  explanation_detailed: string;
  solution_video_url: string;
  solution_image?: ImageState;
}

const STEPS = [
  'Source & Format',
  'Content',
  'Classification',
  'Solution',
  'Repeat Linking',
  'Review',
];

function createDefaultOption(idx: number): NexusQBQuestionOption {
  return { id: `opt_${idx}_${Date.now()}`, text: '' };
}

function getInitialFormData(
  initialData?: NexusQBQuestion,
  sources?: NexusQBQuestionSource[]
): FormData {
  const source = sources?.[0];
  return {
    exam_type: source?.exam_type ?? 'NATA',
    year: source?.year ? String(source.year) : String(new Date().getFullYear()),
    session: source?.session ?? '',
    question_number: source?.question_number ? String(source.question_number) : '',
    question_format: initialData?.question_format ?? 'MCQ',
    question_text: initialData?.question_text ?? '',
    question_text_hi: initialData?.question_text_hi ?? '',
    question_image: initialData?.question_image_url
      ? { url: initialData.question_image_url, uploaded: true }
      : undefined,
    options: initialData?.options?.length
      ? initialData.options
      : [createDefaultOption(0), createDefaultOption(1), createDefaultOption(2), createDefaultOption(3)],
    correct_option_id: initialData?.correct_answer ?? '',
    correct_answer: initialData?.correct_answer ?? '',
    answer_tolerance: initialData?.answer_tolerance ? String(initialData.answer_tolerance) : '',
    categories: initialData?.categories ?? [],
    difficulty: initialData?.difficulty ?? 'MEDIUM',
    exam_relevance: initialData?.exam_relevance ?? 'BOTH',
    topic_id: initialData?.topic_id ?? '',
    sub_topic: initialData?.sub_topic ?? '',
    explanation_brief: initialData?.explanation_brief ?? '',
    explanation_detailed: initialData?.explanation_detailed ?? '',
    solution_video_url: initialData?.solution_video_url ?? '',
    solution_image: initialData?.solution_image_url
      ? { url: initialData.solution_image_url, uploaded: true }
      : undefined,
  };
}

function extractYouTubeId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

function isSharePointUrl(url: string): boolean {
  return /\.sharepoint\.com\//i.test(url) || /onedrive\.live\.com\//i.test(url);
}

function getSharePointEmbedUrl(url: string): string {
  // OneDrive personal links
  if (/onedrive\.live\.com\//i.test(url)) {
    return url.replace(/\/redir\?/i, '/embed?').replace(/\/view\?/i, '/embed?');
  }
  // SharePoint: try _layouts/15/embed.aspx pattern
  try {
    const parsed = new URL(url);
    const host = parsed.hostname; // e.g. myorg.sharepoint.com
    // If it's already an embed URL, return as-is
    if (parsed.pathname.includes('_layouts/15/embed.aspx')) return url;
    // For download.aspx or direct file URLs, convert to embed
    if (parsed.pathname.includes('download.aspx') || parsed.pathname.includes('_api')) {
      const srcParam = parsed.searchParams.get('UniqueId') || parsed.searchParams.get('sourcedoc');
      if (srcParam) {
        return `https://${host}/_layouts/15/embed.aspx?UniqueId=${encodeURIComponent(srcParam)}`;
      }
    }
    // Generic SharePoint file link — wrap in embed.aspx
    return `https://${host}/_layouts/15/embed.aspx?url=${encodeURIComponent(url)}`;
  } catch {
    return url;
  }
}

export default function QuestionFormWizard({
  initialData,
  sources,
  topics,
  onSubmit,
  loading,
  getToken,
}: QuestionFormWizardProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const [activeStep, setActiveStep] = useState(0);
  const [form, setForm] = useState<FormData>(() => getInitialFormData(initialData, sources));

  const updateField = useCallback(
    <K extends keyof FormData>(key: K, value: FormData[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }));
    },
    []
  );

  const handleNext = () => setActiveStep((s) => Math.min(s + 1, STEPS.length - 1));
  const handleBack = () => setActiveStep((s) => Math.max(s - 1, 0));

  const handleOptionChange = (idx: number, text: string) => {
    setForm((prev) => {
      const next = [...prev.options];
      next[idx] = { ...next[idx], text };
      return { ...prev, options: next };
    });
  };

  const handleOptionHindiChange = (idx: number, text_hi: string) => {
    setForm((prev) => {
      const next = [...prev.options];
      next[idx] = { ...next[idx], text_hi: text_hi || undefined };
      return { ...prev, options: next };
    });
  };

  const handleAddOption = () => {
    setForm((prev) => ({
      ...prev,
      options: [...prev.options, createDefaultOption(prev.options.length)],
    }));
  };

  const handleRemoveOption = (idx: number) => {
    setForm((prev) => {
      const next = prev.options.filter((_, i) => i !== idx);
      return { ...prev, options: next };
    });
  };

  const toggleCategory = (cat: string) => {
    setForm((prev) => {
      const has = prev.categories.includes(cat);
      return {
        ...prev,
        categories: has
          ? prev.categories.filter((c) => c !== cat)
          : [...prev.categories, cat],
      };
    });
  };

  const handleSubmit = async () => {
    const questionData: Partial<NexusQBQuestion> = {
      question_text: form.question_text || null,
      question_text_hi: form.question_text_hi || null,
      question_image_url: form.question_image?.uploaded ? form.question_image.url : null,
      question_format: form.question_format,
      options: form.question_format === 'MCQ' ? form.options : null,
      correct_answer:
        form.question_format === 'MCQ' ? form.correct_option_id : form.correct_answer,
      answer_tolerance:
        form.question_format === 'NUMERICAL' && form.answer_tolerance
          ? Number(form.answer_tolerance)
          : null,
      explanation_brief: form.explanation_brief || null,
      explanation_detailed: form.explanation_detailed || null,
      solution_video_url: form.solution_video_url || null,
      solution_image_url: form.solution_image?.uploaded ? form.solution_image.url : null,
      difficulty: form.difficulty,
      exam_relevance: form.exam_relevance,
      categories: form.categories,
      topic_id: form.topic_id || null,
      sub_topic: form.sub_topic || null,
    };

    const sourceData: Partial<NexusQBQuestionSource>[] = [
      {
        exam_type: form.exam_type,
        year: Number(form.year),
        session: form.session || null,
        question_number: form.question_number ? Number(form.question_number) : null,
      },
    ];

    await onSubmit(questionData, sourceData);
  };

  // Build preview question for step 6
  const previewQuestion = {
    id: initialData?.id ?? 'preview',
    question_text: form.question_text || null,
    question_image_url: form.question_image?.url || null,
    question_format: form.question_format,
    options: form.question_format === 'MCQ' ? form.options : null,
    correct_answer:
      form.question_format === 'MCQ' ? form.correct_option_id : form.correct_answer,
    answer_tolerance: form.answer_tolerance ? Number(form.answer_tolerance) : null,
    explanation_brief: form.explanation_brief,
    explanation_detailed: form.explanation_detailed || null,
    solution_image_url: form.solution_image?.url || null,
    solution_video_url: form.solution_video_url || null,
    difficulty: form.difficulty,
    exam_relevance: form.exam_relevance,
    categories: form.categories,
    topic_id: form.topic_id || null,
    sub_topic: form.sub_topic || null,
    repeat_group_id: null,
    original_paper_id: null,
    original_paper_page: null,
    display_order: null,
    is_active: true,
    created_by: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    sources: [
      {
        id: 'preview-source',
        question_id: 'preview',
        exam_type: form.exam_type,
        year: Number(form.year),
        session: form.session || null,
        question_number: form.question_number ? Number(form.question_number) : null,
        created_at: new Date().toISOString(),
      },
    ],
    topic: null,
    attempt_summary: null,
  };

  const renderStepContent = (step: number) => {
    switch (step) {
      /* ── Step 1: Source & Format ─────────────────────── */
      case 0:
        return (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <FormControl fullWidth size="small">
              <InputLabel>Exam Type</InputLabel>
              <Select
                value={form.exam_type}
                label="Exam Type"
                onChange={(e) => updateField('exam_type', e.target.value as QBExamType)}
              >
                {Object.entries(QB_EXAM_TYPE_LABELS).map(([val, label]) => (
                  <MenuItem key={val} value={val}>
                    {label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <Box sx={{ display: 'flex', gap: 1.5 }}>
              <TextField
                label="Year"
                size="small"
                type="number"
                value={form.year}
                onChange={(e) => updateField('year', e.target.value)}
                sx={{ flex: 1 }}
              />
              <TextField
                label="Session"
                size="small"
                value={form.session}
                onChange={(e) => updateField('session', e.target.value)}
                placeholder="e.g. 1"
                sx={{ flex: 1 }}
              />
            </Box>
            <TextField
              label="Question Number"
              size="small"
              type="number"
              value={form.question_number}
              onChange={(e) => updateField('question_number', e.target.value)}
            />
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
                Format
              </Typography>
              <RadioGroup
                value={form.question_format}
                onChange={(e) =>
                  updateField('question_format', e.target.value as QBQuestionFormat)
                }
                row={!isMobile}
              >
                <FormControlLabel value="MCQ" control={<Radio />} label="MCQ" />
                <FormControlLabel value="NUMERICAL" control={<Radio />} label="Numerical" />
                <FormControlLabel value="DRAWING_PROMPT" control={<Radio />} label="Drawing" />
                <FormControlLabel value="IMAGE_BASED" control={<Radio />} label="Image-based" />
              </RadioGroup>
            </Box>
          </Box>
        );

      /* ── Step 2: Content ─────────────────────────────── */
      case 1:
        return (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <TextField
              label="Question Text"
              multiline
              minRows={3}
              maxRows={8}
              value={form.question_text}
              onChange={(e) => updateField('question_text', e.target.value)}
              fullWidth
            />
            <TextField
              label="Question Text (Hindi) — हिंदी"
              multiline
              minRows={2}
              maxRows={6}
              value={form.question_text_hi}
              onChange={(e) => updateField('question_text_hi', e.target.value)}
              fullWidth
              placeholder="प्रश्न का हिंदी पाठ (वैकल्पिक)"
              sx={{
                '& .MuiInputLabel-root': { color: '#e65100' },
                '& .MuiOutlinedInput-root:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#e65100' },
              }}
            />
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
                Question Image (optional)
              </Typography>
              <ImageUploadZone
                image={form.question_image}
                onChange={(img) => updateField('question_image', img)}
                label="Drop question image, paste, or click to upload"
                height={140}
                getToken={getToken}
              />
            </Box>

            {form.question_format === 'MCQ' && (
              <Box>
                <Typography variant="subtitle2" sx={{ mb: 1.5, fontWeight: 600 }}>
                  Options (select correct answer)
                </Typography>
                {form.options.map((opt, idx) => (
                  <Box
                    key={opt.id}
                    sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}
                  >
                    <Radio
                      checked={form.correct_option_id === opt.id}
                      onChange={() => updateField('correct_option_id', opt.id)}
                      value={opt.id}
                      size="small"
                      sx={{ p: 0.5 }}
                    />
                    <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                      <TextField
                        placeholder={`Option ${String.fromCharCode(65 + idx)}`}
                        size="small"
                        fullWidth
                        value={opt.text}
                        onChange={(e) => handleOptionChange(idx, e.target.value)}
                        sx={{ '& .MuiInputBase-root': { minHeight: 40 } }}
                      />
                      <TextField
                        placeholder={`हिंदी ${String.fromCharCode(65 + idx)}`}
                        size="small"
                        fullWidth
                        value={opt.text_hi || ''}
                        onChange={(e) => handleOptionHindiChange(idx, e.target.value)}
                        sx={{
                          '& .MuiInputBase-input': { fontSize: '0.85rem' },
                          '& .MuiOutlinedInput-root': { minHeight: 36 },
                        }}
                      />
                    </Box>
                    {form.options.length > 2 && (
                      <IconButton
                        size="small"
                        onClick={() => handleRemoveOption(idx)}
                        aria-label={`Remove option ${String.fromCharCode(65 + idx)}`}
                        sx={{ minWidth: 36, minHeight: 36 }}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    )}
                  </Box>
                ))}
                {form.options.length < 8 && (
                  <Button
                    startIcon={<AddIcon />}
                    size="small"
                    onClick={handleAddOption}
                    sx={{ mt: 0.5, textTransform: 'none' }}
                  >
                    Add Option
                  </Button>
                )}
              </Box>
            )}

            {form.question_format === 'NUMERICAL' && (
              <Box sx={{ display: 'flex', gap: 1.5 }}>
                <TextField
                  label="Correct Answer"
                  size="small"
                  type="number"
                  value={form.correct_answer}
                  onChange={(e) => updateField('correct_answer', e.target.value)}
                  sx={{ flex: 2 }}
                />
                <TextField
                  label="Tolerance (+/-)"
                  size="small"
                  type="number"
                  value={form.answer_tolerance}
                  onChange={(e) => updateField('answer_tolerance', e.target.value)}
                  sx={{ flex: 1 }}
                />
              </Box>
            )}
          </Box>
        );

      /* ── Step 3: Classification ──────────────────────── */
      case 2:
        return (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pt: 1 }}>
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
                Categories
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                {QB_CATEGORIES.map((cat: string) => {
                  const selected = form.categories.includes(cat);
                  return (
                    <Chip
                      key={cat}
                      label={QB_CATEGORY_LABELS[cat as QBCategory]}
                      size="small"
                      variant={selected ? 'filled' : 'outlined'}
                      color={selected ? 'primary' : 'default'}
                      onClick={() => toggleCategory(cat)}
                      sx={{ minHeight: 32 }}
                    />
                  );
                })}
              </Box>
            </Box>

            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
                Difficulty
              </Typography>
              <RadioGroup
                value={form.difficulty}
                onChange={(e) => updateField('difficulty', e.target.value as QBDifficulty)}
                row
              >
                <FormControlLabel value="EASY" control={<Radio />} label="Easy" />
                <FormControlLabel value="MEDIUM" control={<Radio />} label="Medium" />
                <FormControlLabel value="HARD" control={<Radio />} label="Hard" />
              </RadioGroup>
            </Box>

            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
                Exam Relevance
              </Typography>
              <RadioGroup
                value={form.exam_relevance}
                onChange={(e) =>
                  updateField('exam_relevance', e.target.value as QBExamRelevance)
                }
                row
              >
                <FormControlLabel value="JEE" control={<Radio />} label="JEE" />
                <FormControlLabel value="NATA" control={<Radio />} label="NATA" />
                <FormControlLabel value="BOTH" control={<Radio />} label="Both" />
              </RadioGroup>
            </Box>

            <FormControl fullWidth size="small">
              <InputLabel>Topic</InputLabel>
              <Select
                value={form.topic_id}
                label="Topic"
                onChange={(e) => updateField('topic_id', e.target.value as string)}
              >
                <MenuItem value="">
                  <em>None</em>
                </MenuItem>
                {topics.map((topic) => (
                  <MenuItem key={topic.id} value={topic.id}>
                    {topic.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <TextField
              label="Sub-topic"
              size="small"
              value={form.sub_topic}
              onChange={(e) => updateField('sub_topic', e.target.value)}
              placeholder="Optional sub-topic"
            />
          </Box>
        );

      /* ── Step 4: Solution ────────────────────────────── */
      case 3:
        return (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <TextField
              label="Brief Explanation"
              multiline
              minRows={2}
              maxRows={5}
              value={form.explanation_brief}
              onChange={(e) => updateField('explanation_brief', e.target.value)}
              fullWidth
            />
            <TextField
              label="Detailed Explanation"
              multiline
              minRows={3}
              maxRows={8}
              value={form.explanation_detailed}
              onChange={(e) => updateField('explanation_detailed', e.target.value)}
              fullWidth
            />
            <TextField
              label="Solution Video URL"
              size="small"
              value={form.solution_video_url}
              onChange={(e) => updateField('solution_video_url', e.target.value)}
              placeholder="YouTube, SharePoint, or OneDrive link"
              fullWidth
            />
            {/* Video URL preview */}
            {form.solution_video_url && (() => {
              const ytId = extractYouTubeId(form.solution_video_url);
              if (ytId) {
                return (
                  <Box sx={{ maxWidth: 400, width: '100%' }}>
                    <Box sx={{ position: 'relative', width: '100%', paddingTop: '56.25%', borderRadius: 1, overflow: 'hidden', bgcolor: 'grey.900' }}>
                      <Box
                        component="iframe"
                        src={`https://www.youtube-nocookie.com/embed/${ytId}`}
                        title="Solution video preview"
                        loading="lazy"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                        sx={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 0 }}
                      />
                    </Box>
                  </Box>
                );
              }
              if (isSharePointUrl(form.solution_video_url)) {
                const embedUrl = getSharePointEmbedUrl(form.solution_video_url);
                return (
                  <Box sx={{ maxWidth: 400, width: '100%' }}>
                    <Box sx={{ position: 'relative', width: '100%', paddingTop: '56.25%', borderRadius: 1, overflow: 'hidden', bgcolor: 'grey.900' }}>
                      <Box
                        component="iframe"
                        src={embedUrl}
                        title="Solution video preview"
                        loading="lazy"
                        allowFullScreen
                        sx={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 0 }}
                      />
                    </Box>
                  </Box>
                );
              }
              return (
                <Box
                  component="a"
                  href={form.solution_video_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, color: 'primary.main', textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}
                >
                  <OpenInNewIcon fontSize="small" />
                  <Typography variant="body2">Open link</Typography>
                </Box>
              );
            })()}
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
                Solution Image (optional)
              </Typography>
              <ImageUploadZone
                image={form.solution_image}
                onChange={(img) => updateField('solution_image', img)}
                label="Drop solution image, paste, or click to upload"
                height={140}
                getToken={getToken}
              />
            </Box>
          </Box>
        );

      /* ── Step 5: Repeat Linking ──────────────────────── */
      case 4:
        return (
          <Box sx={{ pt: 1 }}>
            <Paper
              variant="outlined"
              sx={{
                p: 3,
                textAlign: 'center',
                bgcolor: 'action.hover',
                borderRadius: 1.5,
              }}
            >
              <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1 }}>
                Search and link questions that are repeated across exams
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.disabled' }}>
                This feature will be fully available in Phase 2. For now, repeat
                linking is handled during import.
              </Typography>
            </Paper>
          </Box>
        );

      /* ── Step 6: Review ──────────────────────────────── */
      case 5:
        return (
          <Box sx={{ pt: 1 }}>
            <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600 }}>
              Preview
            </Typography>
            <QuestionCard
              question={previewQuestion as any}
              mode="practice"
              onClick={() => {}}
            />
            <Divider sx={{ my: 3 }} />
            <Button
              variant="contained"
              fullWidth
              onClick={handleSubmit}
              disabled={loading}
              sx={{
                minHeight: 48,
                fontWeight: 600,
                textTransform: 'none',
                fontSize: '1rem',
              }}
            >
              {loading ? 'Submitting...' : initialData ? 'Update Question' : 'Create Question'}
            </Button>
          </Box>
        );

      default:
        return null;
    }
  };

  /* ── Mobile: vertical stepper ── Desktop: horizontal stepper ── */
  if (isMobile) {
    return (
      <Box sx={{ px: { xs: 1, md: 0 } }}>
        <Stepper activeStep={activeStep} orientation="vertical">
          {STEPS.map((label, idx) => (
            <Step key={label}>
              <StepLabel
                onClick={() => idx < activeStep && setActiveStep(idx)}
                sx={{ cursor: idx < activeStep ? 'pointer' : 'default' }}
              >
                {label}
              </StepLabel>
              <StepContent>
                {renderStepContent(idx)}
                <Box sx={{ display: 'flex', gap: 1, mt: 2 }}>
                  {idx > 0 && (
                    <Button
                      onClick={handleBack}
                      variant="text"
                      sx={{ minHeight: 40, textTransform: 'none' }}
                    >
                      Back
                    </Button>
                  )}
                  {idx < STEPS.length - 1 && (
                    <Button
                      onClick={handleNext}
                      variant="contained"
                      sx={{ minHeight: 40, textTransform: 'none' }}
                    >
                      Next
                    </Button>
                  )}
                </Box>
              </StepContent>
            </Step>
          ))}
        </Stepper>
      </Box>
    );
  }

  return (
    <Box>
      <Stepper activeStep={activeStep} sx={{ mb: 4 }}>
        {STEPS.map((label, idx) => (
          <Step key={label}>
            <StepLabel
              onClick={() => idx < activeStep && setActiveStep(idx)}
              sx={{ cursor: idx < activeStep ? 'pointer' : 'default' }}
            >
              {label}
            </StepLabel>
          </Step>
        ))}
      </Stepper>

      <Paper variant="outlined" sx={{ p: 3, borderRadius: 2 }}>
        {renderStepContent(activeStep)}
      </Paper>

      {activeStep < STEPS.length - 1 && (
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 3 }}>
          <Button
            onClick={handleBack}
            disabled={activeStep === 0}
            variant="text"
            sx={{ minHeight: 44, textTransform: 'none' }}
          >
            Back
          </Button>
          <Button
            onClick={handleNext}
            variant="contained"
            sx={{ minHeight: 44, textTransform: 'none' }}
          >
            Next
          </Button>
        </Box>
      )}
    </Box>
  );
}
