'use client';

import { useState, useCallback, useRef } from 'react';
import {
  Box,
  Typography,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Chip,
  CircularProgress,
  Alert,
  IconButton,
  useTheme,
  useMediaQuery,
} from '@neram/ui';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import RemoveCircleOutlineIcon from '@mui/icons-material/RemoveCircleOutline';
import type { NexusQBQuestion } from '@neram/database';
import {
  validateAnswerKeyJSON,
  matchAnswerKeyToQuestions,
  ANSWER_KEY_AI_PROMPT,
  type AnswerKeyMatchResult,
} from '@/lib/answer-key-schema';

interface AnswerKeyUploadProps {
  open: boolean;
  onClose: () => void;
  questions: NexusQBQuestion[];
  onApply: (answers: { question_number: number; correct_answer: string }[]) => Promise<void>;
}

type Step = 'input' | 'preview' | 'result';

const STATUS_CONFIG = {
  matched: { label: 'Matched', color: '#2e7d32', bg: '#e8f5e9', icon: CheckCircleOutlineIcon },
  numerical: { label: 'Numerical', color: '#1565c0', bg: '#e3f2fd', icon: CheckCircleOutlineIcon },
  not_found: { label: 'Not Found', color: '#e65100', bg: '#fff3e0', icon: WarningAmberIcon },
  option_not_found: { label: 'Option N/F', color: '#c62828', bg: '#ffebee', icon: ErrorOutlineIcon },
  dropped: { label: 'Dropped', color: '#757575', bg: '#f5f5f5', icon: RemoveCircleOutlineIcon },
} as const;

export default function AnswerKeyUpload({ open, onClose, questions, onApply }: AnswerKeyUploadProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>('input');
  const [jsonText, setJsonText] = useState('');
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [parseWarnings, setParseWarnings] = useState<string[]>([]);
  const [matchResult, setMatchResult] = useState<AnswerKeyMatchResult | null>(null);
  const [applying, setApplying] = useState(false);
  const [applyResult, setApplyResult] = useState<{ success: boolean; message: string } | null>(null);
  const [promptCopied, setPromptCopied] = useState(false);

  const reset = useCallback(() => {
    setStep('input');
    setJsonText('');
    setParseErrors([]);
    setParseWarnings([]);
    setMatchResult(null);
    setApplying(false);
    setApplyResult(null);
    setPromptCopied(false);
  }, []);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  const handleCopyPrompt = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(ANSWER_KEY_AI_PROMPT);
      setPromptCopied(true);
      setTimeout(() => setPromptCopied(false), 2000);
    } catch {
      // Fallback: select the text
    }
  }, []);

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result;
      if (typeof text === 'string') setJsonText(text);
    };
    reader.readAsText(file);
    // Reset so same file can be re-selected
    e.target.value = '';
  }, []);

  const handleParse = useCallback(() => {
    setParseErrors([]);
    setParseWarnings([]);

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText.trim());
    } catch {
      setParseErrors(['Invalid JSON — please check the syntax']);
      return;
    }

    const validation = validateAnswerKeyJSON(parsed);
    setParseWarnings(validation.warnings);

    if (!validation.valid || !validation.data) {
      setParseErrors(validation.errors);
      return;
    }

    const result = matchAnswerKeyToQuestions(validation.data, questions);
    setMatchResult(result);
    setStep('preview');
  }, [jsonText, questions]);

  const handleApply = useCallback(async () => {
    if (!matchResult) return;

    const answersToApply = matchResult.matches
      .filter((m) => (m.status === 'matched' || m.status === 'numerical') && m.questionNumber > 0)
      .map((m) => ({
        question_number: m.questionNumber,
        correct_answer: m.resolvedAnswer,
      }));

    if (answersToApply.length === 0) {
      setApplyResult({ success: false, message: 'No valid answers to apply' });
      setStep('result');
      return;
    }

    setApplying(true);
    try {
      await onApply(answersToApply);
      setApplyResult({
        success: true,
        message: `Successfully applied ${answersToApply.length} answer${answersToApply.length !== 1 ? 's' : ''}`,
      });
      setStep('result');
    } catch (err) {
      setApplyResult({
        success: false,
        message: err instanceof Error ? err.message : 'Failed to apply answers',
      });
      setStep('result');
    } finally {
      setApplying(false);
    }
  }, [matchResult, onApply]);

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      fullScreen={isMobile}
      maxWidth="md"
      fullWidth
      PaperProps={{ sx: { minHeight: isMobile ? undefined : 500 } }}
    >
      <DialogTitle sx={{ pb: 1 }}>
        <Typography variant="h6" fontWeight={600}>
          Upload Answer Key (JSON)
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {step === 'input' && 'Paste JSON extracted from NTA answer key using any AI tool'}
          {step === 'preview' && 'Review matched answers before applying'}
          {step === 'result' && 'Done'}
        </Typography>
      </DialogTitle>

      <DialogContent dividers sx={{ p: { xs: 1.5, sm: 2.5 } }}>
        {/* Step 1: Input */}
        {step === 'input' && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {/* AI Prompt section */}
            <Box
              sx={{
                p: 1.5,
                borderRadius: 1.5,
                bgcolor: 'grey.50',
                border: '1px solid',
                borderColor: 'divider',
              }}
            >
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                <Typography variant="subtitle2" fontWeight={600}>
                  Step 1: Copy this prompt to an AI tool
                </Typography>
                <Button
                  size="small"
                  variant={promptCopied ? 'contained' : 'outlined'}
                  color={promptCopied ? 'success' : 'primary'}
                  startIcon={promptCopied ? <CheckCircleOutlineIcon /> : <ContentCopyIcon />}
                  onClick={handleCopyPrompt}
                  sx={{ minWidth: 100 }}
                >
                  {promptCopied ? 'Copied!' : 'Copy'}
                </Button>
              </Box>
              <Typography variant="caption" color="text.secondary">
                Give this prompt to Gemini, Claude, or ChatGPT along with the NTA answer key
                (PDF, image, or table). The AI tool will output JSON in the correct format.
              </Typography>
            </Box>

            {/* JSON Input */}
            <Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                <Typography variant="subtitle2" fontWeight={600}>
                  Step 2: Paste the JSON output below
                </Typography>
                <Button
                  size="small"
                  variant="text"
                  startIcon={<UploadFileIcon />}
                  onClick={() => fileInputRef.current?.click()}
                >
                  Upload File
                </Button>
              </Box>
              <TextField
                multiline
                minRows={8}
                maxRows={16}
                fullWidth
                value={jsonText}
                onChange={(e) => setJsonText(e.target.value)}
                placeholder='{\n  "schema_version": "1.0",\n  "paper": { "exam_name": "..." },\n  "answers": [\n    { "question_id": "4951349335", "correct_option_id": "49513493352" },\n    ...\n  ]\n}'
                sx={{
                  '& .MuiInputBase-input': {
                    fontFamily: 'monospace',
                    fontSize: '0.8rem',
                  },
                }}
              />
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                hidden
                onChange={handleFileUpload}
              />
            </Box>

            {/* Errors */}
            {parseErrors.length > 0 && (
              <Alert severity="error" sx={{ py: 0.5 }}>
                {parseErrors.map((e, i) => (
                  <Typography key={i} variant="body2">{e}</Typography>
                ))}
              </Alert>
            )}
            {parseWarnings.length > 0 && (
              <Alert severity="warning" sx={{ py: 0.5 }}>
                {parseWarnings.map((w, i) => (
                  <Typography key={i} variant="body2">{w}</Typography>
                ))}
              </Alert>
            )}
          </Box>
        )}

        {/* Step 2: Preview */}
        {step === 'preview' && matchResult && (
          <Box>
            {/* Summary chips */}
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
              <Chip
                label={`${matchResult.summary.matched + matchResult.summary.numerical} matched`}
                size="small"
                sx={{ bgcolor: '#e8f5e9', color: '#2e7d32', fontWeight: 600 }}
              />
              {matchResult.summary.notFound > 0 && (
                <Chip
                  label={`${matchResult.summary.notFound} not found`}
                  size="small"
                  sx={{ bgcolor: '#fff3e0', color: '#e65100', fontWeight: 600 }}
                />
              )}
              {matchResult.summary.optionNotFound > 0 && (
                <Chip
                  label={`${matchResult.summary.optionNotFound} option mismatch`}
                  size="small"
                  sx={{ bgcolor: '#ffebee', color: '#c62828', fontWeight: 600 }}
                />
              )}
              {matchResult.summary.dropped > 0 && (
                <Chip
                  label={`${matchResult.summary.dropped} dropped`}
                  size="small"
                  sx={{ bgcolor: '#f5f5f5', color: '#757575', fontWeight: 600 }}
                />
              )}
            </Box>

            {parseWarnings.length > 0 && (
              <Alert severity="warning" sx={{ py: 0.5, mb: 2 }}>
                {parseWarnings.map((w, i) => (
                  <Typography key={i} variant="body2">{w}</Typography>
                ))}
              </Alert>
            )}

            {/* Match table */}
            <Box
              component="table"
              sx={{
                width: '100%',
                borderCollapse: 'collapse',
                '& th, & td': {
                  px: { xs: 0.75, sm: 1.5 },
                  py: 0.75,
                  borderBottom: '1px solid',
                  borderColor: 'divider',
                  fontSize: { xs: '0.75rem', sm: '0.875rem' },
                },
                '& th': {
                  bgcolor: 'grey.50',
                  fontWeight: 600,
                  textAlign: 'left',
                  position: 'sticky',
                  top: 0,
                  zIndex: 1,
                },
              }}
            >
              <thead>
                <tr>
                  <th style={{ width: 45 }}>Q#</th>
                  {!isMobile && <th>NTA ID</th>}
                  <th>Answer</th>
                  <th style={{ width: 100 }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {matchResult.matches.map((m, idx) => {
                  const cfg = STATUS_CONFIG[m.status];
                  const Icon = cfg.icon;
                  return (
                    <tr key={idx} style={{ backgroundColor: m.status !== 'matched' && m.status !== 'numerical' ? cfg.bg : undefined }}>
                      <td>
                        <Typography variant="body2" fontWeight={500}>
                          {m.questionNumber || '—'}
                        </Typography>
                      </td>
                      {!isMobile && (
                        <td>
                          <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                            {m.ntaQuestionId}
                          </Typography>
                        </td>
                      )}
                      <td>
                        <Typography variant="body2">
                          {m.matchedOptionLabel || '—'}
                        </Typography>
                        {m.warning && (
                          <Typography variant="caption" color="error" display="block">
                            {m.warning}
                          </Typography>
                        )}
                      </td>
                      <td>
                        <Chip
                          icon={<Icon sx={{ fontSize: '0.9rem' }} />}
                          label={cfg.label}
                          size="small"
                          sx={{
                            bgcolor: cfg.bg,
                            color: cfg.color,
                            fontWeight: 600,
                            fontSize: '0.7rem',
                            '& .MuiChip-icon': { color: cfg.color },
                          }}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Box>
          </Box>
        )}

        {/* Step 3: Result */}
        {step === 'result' && applyResult && (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, py: 4 }}>
            {applyResult.success ? (
              <CheckCircleOutlineIcon sx={{ fontSize: 64, color: 'success.main' }} />
            ) : (
              <ErrorOutlineIcon sx={{ fontSize: 64, color: 'error.main' }} />
            )}
            <Typography variant="h6" textAlign="center">
              {applyResult.success ? 'Answers Applied!' : 'Error'}
            </Typography>
            <Typography variant="body2" color="text.secondary" textAlign="center">
              {applyResult.message}
            </Typography>
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ px: { xs: 1.5, sm: 2.5 }, py: 1.5 }}>
        {step === 'input' && (
          <>
            <Button onClick={handleClose}>Cancel</Button>
            <Button
              variant="contained"
              onClick={handleParse}
              disabled={!jsonText.trim()}
            >
              Parse & Preview
            </Button>
          </>
        )}
        {step === 'preview' && (
          <>
            <Button onClick={() => setStep('input')}>Back</Button>
            <Button
              variant="contained"
              onClick={handleApply}
              disabled={applying || (matchResult?.summary.matched ?? 0) + (matchResult?.summary.numerical ?? 0) === 0}
              startIcon={applying ? <CircularProgress size={16} /> : undefined}
            >
              {applying
                ? 'Applying...'
                : `Apply ${(matchResult?.summary.matched ?? 0) + (matchResult?.summary.numerical ?? 0)} Answers`}
            </Button>
          </>
        )}
        {step === 'result' && (
          <Button variant="contained" onClick={handleClose}>
            Done
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
