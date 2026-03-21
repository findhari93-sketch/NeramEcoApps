'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  Typography,
  Paper,
  Button,
  Stepper,
  Step,
  StepLabel,
  Alert,
  Chip,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  TextField,
  IconButton,
  Tab,
  Tabs,
  alpha,
  useTheme,
  LinearProgress,
  Autocomplete,
  ToggleButton,
  ToggleButtonGroup,
} from '@neram/ui';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ContentPasteIcon from '@mui/icons-material/ContentPaste';
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined';
import DataObjectIcon from '@mui/icons-material/DataObject';
import CloudUploadOutlinedIcon from '@mui/icons-material/CloudUploadOutlined';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import type { QBExamType } from '@neram/database';
import type { ReviewQuestion, UploadMethod } from '@/lib/bulk-upload-schema';
import { uploadBase64Images } from '@/lib/upload-base64-images';
import PasteTextTab from '@/components/question-bank/bulk-upload/PasteTextTab';
import UploadPDFTab from '@/components/question-bank/bulk-upload/UploadPDFTab';
import UploadJSONTab from '@/components/question-bank/bulk-upload/UploadJSONTab';
import ReviewPanel from '@/components/question-bank/bulk-upload/ReviewPanel';

const steps = ['Paper Info', 'Upload Data', 'Review & Import', 'Done'];
const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: currentYear - 2005 + 1 }, (_, i) => currentYear - i);

// JEE Paper 2 has 2 sessions per year
const JEE_SESSIONS = [
  { value: 'Session 1', label: 'Session 1', hint: 'January' },
  { value: 'Session 2', label: 'Session 2', hint: 'April' },
];

// NATA has up to 3 tests per year
const NATA_SESSIONS = [
  { value: 'Test 1', label: 'Test 1', hint: 'April' },
  { value: 'Test 2', label: 'Test 2', hint: 'July' },
  { value: 'Test 3', label: 'Test 3', hint: 'October' },
];

const TAB_ICONS: Record<UploadMethod, React.ReactElement> = {
  paste: <ContentPasteIcon sx={{ fontSize: '1rem' }} />,
  pdf: <PictureAsPdfOutlinedIcon sx={{ fontSize: '1rem' }} />,
  json: <DataObjectIcon sx={{ fontSize: '1rem' }} />,
};

export default function BulkUploadPage() {
  const router = useRouter();
  const theme = useTheme();
  const { getToken } = useNexusAuthContext();

  const [activeStep, setActiveStep] = useState(0);

  // Step 1: Paper Info
  const [examType, setExamType] = useState<QBExamType>('JEE_PAPER_2');
  const [year, setYear] = useState<number>(2026);
  const [session, setSession] = useState('');

  // Step 2: Upload method
  const [uploadMethod, setUploadMethod] = useState<UploadMethod>('json');

  // Step 3: Review
  const [reviewQuestions, setReviewQuestions] = useState<ReviewQuestion[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);

  // Image auto-upload state
  const [uploadingImages, setUploadingImages] = useState(false);
  const [imageUploadProgress, setImageUploadProgress] = useState<{
    total: number;
    completed: number;
    failed: number;
  } | null>(null);

  // Import state
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    paperId: string;
    count: number;
    isNew: boolean;
    message: string;
  } | null>(null);
  const [error, setError] = useState('');

  const handleQuestionsReady = useCallback(async (questions: ReviewQuestion[], warns: string[]) => {
    // Check if there are any base64 images that need uploading
    const hasBase64 = questions.some((q) => {
      if (q.question_image && !q.question_image.uploaded && q.question_image.url.startsWith('data:')) return true;
      return q.options.some((opt) => opt.image && !opt.image.uploaded && opt.image.url.startsWith('data:'));
    });

    if (hasBase64) {
      // Auto-upload base64 images before showing review
      setUploadingImages(true);
      setImageUploadProgress(null);
      setWarnings(warns);
      setActiveStep(2);

      try {
        let failedCount = 0;
        const updated = await uploadBase64Images(questions, getToken, (progress) => {
          setImageUploadProgress(progress);
          failedCount = progress.failed;
        });
        setReviewQuestions(updated);

        if (failedCount > 0) {
          setWarnings((prev) => [
            ...prev,
            `${failedCount} image(s) failed to upload. You can manually re-upload them in the review panel.`,
          ]);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Image upload failed');
        setReviewQuestions(questions);
      } finally {
        setUploadingImages(false);
        setImageUploadProgress(null);
      }
    } else {
      setReviewQuestions(questions);
      setWarnings(warns);
      setActiveStep(2);
    }
  }, [getToken]);

  const handleImport = async () => {
    if (reviewQuestions.length === 0) return;
    setImporting(true);
    setError('');

    try {
      const token = await getToken();
      if (!token) {
        setError('Authentication failed');
        return;
      }

      // Convert ReviewQuestions back to the API format
      const parsed_questions = reviewQuestions.map((q) => ({
        question_number: q.question_number,
        nta_question_id: q.nta_question_id,
        question_format: q.question_format,
        question_text: q.question_text || null,
        question_image_url: q.question_image?.uploaded ? q.question_image.url : null,
        options: q.options.map((opt) => ({
          nta_id: opt.nta_id || '',
          text: opt.text || '',
          label: opt.label || '',
          image_url: opt.image?.uploaded ? opt.image.url : null,
        })),
        section: q.section,
        categories: q.categories,
        marks_correct: q.marks_correct,
        marks_negative: q.marks_negative,
        solution_video_url: q.solution_video_url || null,
        explanation_brief: q.explanation_brief || null,
        explanation_detailed: q.explanation_detailed || null,
      }));

      const res = await fetch('/api/question-bank/papers', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          exam_type: examType,
          year,
          session: session || null,
          parsed_questions,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        setError(json.error || 'Import failed');
        return;
      }

      setImportResult({
        paperId: json.data.id,
        count: json.data.questions_parsed || reviewQuestions.length,
        isNew: json.isNew,
        message: json.message,
      });
      setActiveStep(3);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  return (
    <Box sx={{ px: { xs: 0, md: 1 }, py: 2 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <IconButton size="small" onClick={() => router.push('/teacher/question-bank')}>
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h5" component="h1" fontWeight={700}>
          Bulk Upload
        </Typography>
      </Box>

      {/* Stepper */}
      <Stepper
        activeStep={activeStep}
        alternativeLabel
        sx={{ mb: 3, '& .MuiStepLabel-label': { fontSize: '0.75rem' } }}
      >
        {steps.map((label) => (
          <Step key={label}>
            <StepLabel>{label}</StepLabel>
          </Step>
        ))}
      </Stepper>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      {/* Step 1: Paper Info */}
      {activeStep === 0 && (
        <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2.5 }}>
          <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 2 }}>
            Paper Information
          </Typography>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
            {/* Exam Type */}
            <FormControl fullWidth size="small">
              <InputLabel>Exam Type</InputLabel>
              <Select
                value={examType}
                onChange={(e) => {
                  setExamType(e.target.value as QBExamType);
                  setSession('');
                }}
                label="Exam Type"
              >
                <MenuItem value="JEE_PAPER_2">JEE Paper 2 (B.Arch)</MenuItem>
                <MenuItem value="NATA">NATA</MenuItem>
              </Select>
            </FormControl>

            {/* Year (Autocomplete) + Session (Toggle Buttons) — same row on tablet+ */}
            <Box
              sx={{
                display: 'flex',
                flexDirection: { xs: 'column', sm: 'row' },
                gap: 2,
                alignItems: { sm: 'flex-start' },
              }}
            >
              <Autocomplete
                size="small"
                options={YEARS}
                value={year}
                onChange={(_, v) => v && setYear(v)}
                getOptionLabel={(opt) => String(opt)}
                renderInput={(params) => (
                  <TextField {...params} label="Year" />
                )}
                disableClearable
                sx={{ minWidth: { xs: '100%', sm: 160 }, flex: { sm: '0 0 160px' } }}
              />

              {/* Session selector */}
              <Box sx={{ flex: 1 }}>
                <Typography variant="caption" color="text.secondary" sx={{ mb: 0.75, display: 'block' }}>
                  Session
                </Typography>
                <ToggleButtonGroup
                  value={session}
                  exclusive
                  onChange={(_, v) => setSession(v || '')}
                  size="small"
                  sx={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 0.75,
                    '& .MuiToggleButton-root': {
                      flex: '1 1 auto',
                      border: '1px solid',
                      borderColor: 'divider',
                      borderRadius: '8px !important',
                      textTransform: 'none',
                      px: 2,
                      py: 0.75,
                      '&.Mui-selected': {
                        bgcolor: 'primary.main',
                        color: 'primary.contrastText',
                        borderColor: 'primary.main',
                        '&:hover': { bgcolor: 'primary.dark' },
                      },
                    },
                  }}
                >
                  {(examType === 'JEE_PAPER_2' ? JEE_SESSIONS : NATA_SESSIONS).map((s) => (
                    <ToggleButton key={s.value} value={s.value}>
                      <Box sx={{ textAlign: 'center' }}>
                        <Typography variant="body2" fontWeight={600} sx={{ lineHeight: 1.2 }}>
                          {s.label}
                        </Typography>
                        <Typography
                          variant="caption"
                          sx={{
                            lineHeight: 1,
                            opacity: 0.75,
                            display: 'block',
                            fontSize: '0.65rem',
                          }}
                        >
                          {s.hint}
                        </Typography>
                      </Box>
                    </ToggleButton>
                  ))}
                </ToggleButtonGroup>
              </Box>
            </Box>

            <Button variant="contained" onClick={() => setActiveStep(1)}>
              Next
            </Button>
          </Box>
        </Paper>
      )}

      {/* Step 2: Upload Data (3 tabs) */}
      {activeStep === 1 && (
        <Paper variant="outlined" sx={{ borderRadius: 2.5, overflow: 'hidden' }}>
          {/* Paper info chips */}
          <Box sx={{ px: 2.5, pt: 2, pb: 1, display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
            <Chip
              label={examType === 'JEE_PAPER_2' ? 'JEE Paper 2' : 'NATA'}
              size="small"
              color="primary"
            />
            <Chip label={`${year}`} size="small" variant="outlined" />
            {session && <Chip label={session} size="small" variant="outlined" />}
            <Button
              size="small"
              variant="text"
              onClick={() => setActiveStep(0)}
              sx={{ ml: 'auto', fontSize: '0.75rem' }}
            >
              Edit
            </Button>
          </Box>

          {/* Upload method tabs */}
          <Tabs
            value={uploadMethod}
            onChange={(_, v) => setUploadMethod(v)}
            variant="fullWidth"
            sx={{
              borderBottom: `1px solid ${theme.palette.divider}`,
              '& .MuiTab-root': {
                textTransform: 'none',
                fontWeight: 600,
                fontSize: '0.8rem',
                minHeight: 48,
              },
            }}
          >
            <Tab
              value="json"
              label="Upload JSON"
              icon={TAB_ICONS.json}
              iconPosition="start"
            />
            <Tab
              value="pdf"
              label="Upload PDF"
              icon={TAB_ICONS.pdf}
              iconPosition="start"
            />
            <Tab
              value="paste"
              label="Paste Text"
              icon={TAB_ICONS.paste}
              iconPosition="start"
            />
          </Tabs>

          {/* Tab content */}
          <Box sx={{ p: 2.5 }}>
            {uploadMethod === 'paste' && (
              <PasteTextTab onQuestionsReady={handleQuestionsReady} />
            )}
            {uploadMethod === 'pdf' && (
              <UploadPDFTab onQuestionsReady={handleQuestionsReady} />
            )}
            {uploadMethod === 'json' && (
              <UploadJSONTab onQuestionsReady={handleQuestionsReady} />
            )}
          </Box>
        </Paper>
      )}

      {/* Image upload progress */}
      {activeStep === 2 && uploadingImages && (
        <Paper variant="outlined" sx={{ p: 3, textAlign: 'center', borderRadius: 2.5 }}>
          <CloudUploadOutlinedIcon sx={{ fontSize: 48, color: 'primary.main', mb: 1.5 }} />
          <Typography variant="h6" fontWeight={700} sx={{ mb: 1 }}>
            Uploading Images...
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Uploading extracted images to storage. This may take a moment.
          </Typography>
          {imageUploadProgress && (
            <Box sx={{ maxWidth: 400, mx: 'auto' }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                <Typography variant="caption" color="text.secondary">
                  {imageUploadProgress.completed} / {imageUploadProgress.total} images
                </Typography>
                {imageUploadProgress.failed > 0 && (
                  <Typography variant="caption" color="error">
                    {imageUploadProgress.failed} failed
                  </Typography>
                )}
              </Box>
              <LinearProgress
                variant="determinate"
                value={
                  imageUploadProgress.total > 0
                    ? ((imageUploadProgress.completed + imageUploadProgress.failed) / imageUploadProgress.total) * 100
                    : 0
                }
                sx={{ height: 8, borderRadius: 4 }}
              />
            </Box>
          )}
        </Paper>
      )}

      {/* Step 3: Review & Import */}
      {activeStep === 2 && !uploadingImages && (
        <Box>
          <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
            <Button variant="outlined" size="small" onClick={() => setActiveStep(1)}>
              Back to Upload
            </Button>
          </Box>
          <ReviewPanel
            questions={reviewQuestions}
            warnings={warnings}
            onQuestionsChange={setReviewQuestions}
            onImport={handleImport}
            importing={importing}
            getToken={getToken}
          />
        </Box>
      )}

      {/* Step 4: Done */}
      {activeStep === 3 && importResult && (
        <Paper variant="outlined" sx={{ p: 3, textAlign: 'center', borderRadius: 2.5 }}>
          <CheckCircleOutlineIcon sx={{ fontSize: 48, color: 'success.main', mb: 1 }} />
          <Typography variant="h6" fontWeight={700} sx={{ mb: 1 }}>
            {importResult.isNew ? 'Import Successful!' : 'Paper Already Exists'}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {importResult.message}
          </Typography>

          {importResult.isNew && (
            <Typography variant="body2" sx={{ mb: 2 }}>
              {importResult.count} questions created as drafts.
              Add the answer key to proceed.
            </Typography>
          )}

          <Box sx={{ display: 'flex', gap: 1.5, justifyContent: 'center' }}>
            <Button
              variant="contained"
              onClick={() => router.push(`/teacher/question-bank/papers/${importResult.paperId}`)}
            >
              {importResult.isNew ? 'Add Answer Key' : 'View Paper'}
            </Button>
            <Button
              variant="outlined"
              onClick={() => router.push('/teacher/question-bank/papers')}
            >
              View All Papers
            </Button>
          </Box>
        </Paper>
      )}
    </Box>
  );
}
