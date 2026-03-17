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
} from '@neram/ui';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ContentPasteIcon from '@mui/icons-material/ContentPaste';
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined';
import DataObjectIcon from '@mui/icons-material/DataObject';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import type { QBExamType } from '@neram/database';
import type { ReviewQuestion, UploadMethod } from '@/lib/bulk-upload-schema';
import PasteTextTab from '@/components/question-bank/bulk-upload/PasteTextTab';
import UploadPDFTab from '@/components/question-bank/bulk-upload/UploadPDFTab';
import UploadJSONTab from '@/components/question-bank/bulk-upload/UploadJSONTab';
import ReviewPanel from '@/components/question-bank/bulk-upload/ReviewPanel';

const steps = ['Paper Info', 'Upload Data', 'Review & Import', 'Done'];
const YEARS = Array.from({ length: 15 }, (_, i) => 2027 - i);

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

  // Import state
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    paperId: string;
    count: number;
    isNew: boolean;
    message: string;
  } | null>(null);
  const [error, setError] = useState('');

  const handleQuestionsReady = useCallback((questions: ReviewQuestion[], warns: string[]) => {
    setReviewQuestions(questions);
    setWarnings(warns);
    setActiveStep(2);
  }, []);

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

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <FormControl fullWidth size="small">
              <InputLabel>Exam Type</InputLabel>
              <Select
                value={examType}
                onChange={(e) => setExamType(e.target.value as QBExamType)}
                label="Exam Type"
              >
                <MenuItem value="JEE_PAPER_2">JEE Paper 2 (B.Arch)</MenuItem>
                <MenuItem value="NATA">NATA</MenuItem>
              </Select>
            </FormControl>

            <FormControl fullWidth size="small">
              <InputLabel>Year</InputLabel>
              <Select
                value={year}
                onChange={(e) => setYear(e.target.value as number)}
                label="Year"
              >
                {YEARS.map((y) => (
                  <MenuItem key={y} value={y}>{y}</MenuItem>
                ))}
              </Select>
            </FormControl>

            <TextField
              size="small"
              label="Session (optional)"
              value={session}
              onChange={(e) => setSession(e.target.value)}
              placeholder="e.g., Session 1, January, Shift 2"
              helperText="Leave blank if only one session"
            />

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

      {/* Step 3: Review & Import */}
      {activeStep === 2 && (
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
