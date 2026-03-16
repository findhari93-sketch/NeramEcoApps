'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  Typography,
  Paper,
  Button,
  TextField,
  Stepper,
  Step,
  StepLabel,
  Alert,
  Chip,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  CircularProgress,
  IconButton,
} from '@neram/ui';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { parseNTAAnswerSheet } from '@/lib/nta-parser';
import type { NTAParsedPaper, QBExamType } from '@neram/database';

const steps = ['Paper Info', 'Paste Data', 'Review & Import', 'Done'];

const YEARS = Array.from({ length: 15 }, (_, i) => 2027 - i);

export default function BulkUploadPage() {
  const router = useRouter();
  const { getToken } = useNexusAuthContext();

  const [activeStep, setActiveStep] = useState(0);

  // Step 1: Paper Info
  const [examType, setExamType] = useState<QBExamType>('JEE_PAPER_2');
  const [year, setYear] = useState<number>(2026);
  const [session, setSession] = useState('');

  // Step 2: Paste Data
  const [rawText, setRawText] = useState('');
  const [parsedData, setParsedData] = useState<NTAParsedPaper | null>(null);

  // Step 3-4: Import
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    paperId: string;
    count: number;
    isNew: boolean;
    message: string;
  } | null>(null);
  const [error, setError] = useState('');

  const handleParse = () => {
    setError('');
    const result = parseNTAAnswerSheet(rawText);
    if (result.total === 0) {
      setError('No questions found. Check that you pasted the correct NTA answer sheet text.');
      return;
    }
    setParsedData(result);
    setActiveStep(2);
  };

  const handleImport = async () => {
    if (!parsedData) return;
    setImporting(true);
    setError('');

    try {
      const token = await getToken();
      if (!token) {
        setError('Authentication failed');
        return;
      }

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
          parsed_questions: parsedData.questions,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        setError(json.error || 'Import failed');
        return;
      }

      setImportResult({
        paperId: json.data.id,
        count: json.data.questions_parsed || parsedData.total,
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
    <Box sx={{ px: { xs: 2, md: 3 }, py: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <IconButton size="small" onClick={() => router.push('/teacher/question-bank')}>
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h5" component="h1" fontWeight={700}>
          Bulk Upload
        </Typography>
      </Box>

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
        <Paper variant="outlined" sx={{ p: 2.5 }}>
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

      {/* Step 2: Paste Data */}
      {activeStep === 1 && (
        <Paper variant="outlined" sx={{ p: 2.5 }}>
          <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1 }}>
            Paste NTA Answer Sheet Text
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Open the NTA answer sheet PDF, select all text (Ctrl+A), copy (Ctrl+C),
            and paste below. The parser will extract question IDs and option IDs.
          </Typography>

          <Alert severity="warning" sx={{ mb: 2 }}>
            The &quot;Chosen Option&quot; field is the student&apos;s answer, NOT the correct answer.
            It will be ignored during import.
          </Alert>

          <TextField
            multiline
            minRows={10}
            maxRows={20}
            fullWidth
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            placeholder="Paste NTA answer sheet text here..."
            sx={{ mb: 2 }}
          />

          <Box sx={{ display: 'flex', gap: 1.5 }}>
            <Button variant="outlined" onClick={() => setActiveStep(0)}>
              Back
            </Button>
            <Button
              variant="contained"
              onClick={handleParse}
              disabled={!rawText.trim()}
            >
              Parse & Preview
            </Button>
          </Box>
        </Paper>
      )}

      {/* Step 3: Review & Import */}
      {activeStep === 2 && parsedData && (
        <Paper variant="outlined" sx={{ p: 2.5 }}>
          <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 2 }}>
            Review Parsed Data
          </Typography>

          <Box sx={{ mb: 2 }}>
            <Chip
              label={examType === 'JEE_PAPER_2' ? 'JEE Paper 2' : 'NATA'}
              size="small"
              color="primary"
              sx={{ mr: 1 }}
            />
            <Chip label={`${year}`} size="small" variant="outlined" sx={{ mr: 1 }} />
            {session && <Chip label={session} size="small" variant="outlined" />}
          </Box>

          <Paper
            variant="outlined"
            sx={{ p: 2, mb: 2, bgcolor: 'success.50' }}
          >
            <Typography variant="h4" fontWeight={700} color="success.main">
              {parsedData.total}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Questions parsed
            </Typography>
          </Paper>

          {/* Section breakdown */}
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            Sections
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, mb: 2 }}>
            {parsedData.sections.map((s) => (
              <Box key={s.name} sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2">{s.name}</Typography>
                <Typography variant="body2" fontWeight={600}>{s.count}</Typography>
              </Box>
            ))}
          </Box>

          {/* Warnings */}
          {parsedData.warnings.length > 0 && (
            <Alert severity="warning" sx={{ mb: 2 }} icon={<WarningAmberIcon />}>
              <Typography variant="subtitle2">
                {parsedData.warnings.length} warning(s)
              </Typography>
              <Box component="ul" sx={{ m: 0, pl: 2 }}>
                {parsedData.warnings.slice(0, 10).map((w, i) => (
                  <li key={i}>
                    <Typography variant="caption">{w}</Typography>
                  </li>
                ))}
                {parsedData.warnings.length > 10 && (
                  <li>
                    <Typography variant="caption">
                      ...and {parsedData.warnings.length - 10} more
                    </Typography>
                  </li>
                )}
              </Box>
            </Alert>
          )}

          <Alert severity="info" sx={{ mb: 2 }}>
            Questions will be imported as <strong>drafts</strong> without correct answers.
            You can add the answer key on the paper detail page after import.
          </Alert>

          <Box sx={{ display: 'flex', gap: 1.5 }}>
            <Button variant="outlined" onClick={() => setActiveStep(1)}>
              Back
            </Button>
            <Button
              variant="contained"
              onClick={handleImport}
              disabled={importing}
              startIcon={importing ? <CircularProgress size={16} /> : undefined}
            >
              {importing ? 'Importing...' : `Import ${parsedData.total} Questions`}
            </Button>
          </Box>
        </Paper>
      )}

      {/* Step 4: Done */}
      {activeStep === 3 && importResult && (
        <Paper variant="outlined" sx={{ p: 3, textAlign: 'center' }}>
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
