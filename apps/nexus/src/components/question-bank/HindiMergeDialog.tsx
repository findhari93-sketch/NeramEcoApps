'use client';

import { useState, useCallback } from 'react';
import {
  Box,
  Typography,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  Checkbox,
  Alert,
  Chip,
  Paper,
  Divider,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Snackbar,
  alpha,
  useTheme,
  useMediaQuery,
} from '@neram/ui';
import CloseIcon from '@mui/icons-material/Close';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import TranslateIcon from '@mui/icons-material/Translate';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import type { NexusQBQuestion } from '@neram/database';
import MathText from '@/components/common/MathText';
import { HINDI_AI_PROMPT_TEMPLATE } from '@/lib/bulk-upload-schema';

interface HindiDataItem {
  question_number: number;
  text_hi: string;
  options_hi?: { label: string; text_hi: string }[];
  explanation_brief_hi?: string;
  explanation_detailed_hi?: string;
}

interface MatchedRow {
  questionNumber: number;
  englishText: string;
  hindiText: string;
  optionsHi?: { label: string; text_hi: string }[];
  explanationBriefHi?: string;
  explanationDetailedHi?: string;
  matched: boolean;
  selected: boolean;
  isOverwrite: boolean;
  hasVideo: boolean;
  questionFormat: string;
}

type Step = 'upload' | 'review' | 'confirm' | 'done';

interface MergeResult {
  updated: number;
  skipped: number;
  details: {
    textUpdated: number;
    optionsUpdated: number;
    explanationsUpdated: number;
    overwrites: number;
  };
}

interface HindiMergeDialogProps {
  open: boolean;
  onClose: () => void;
  paperId: string;
  questions: NexusQBQuestion[];
  getToken: () => Promise<string | null>;
  onSuccess: () => void;
}

export default function HindiMergeDialog({
  open,
  onClose,
  paperId,
  questions,
  getToken,
  onSuccess,
}: HindiMergeDialogProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const [step, setStep] = useState<Step>('upload');
  const [rows, setRows] = useState<MatchedRow[]>([]);
  const [error, setError] = useState('');
  const [merging, setMerging] = useState(false);
  const [result, setResult] = useState<MergeResult | null>(null);
  const [promptCopied, setPromptCopied] = useState(false);
  const [expandedCards, setExpandedCards] = useState<Set<number>>(new Set());

  const handleFileUpload = useCallback(async (file: File) => {
    setError('');
    try {
      const text = await file.text();
      const data = JSON.parse(text);

      let hindiItems: HindiDataItem[] = [];

      // Support multiple formats:
      // 1. Direct array: [{ question_number, text_hi, options_hi }]
      // 2. Schema format: { sections: [{ questions: [{ question_number, question_text_hi, options }] }] }
      // 3. Questions wrapper: { questions: [...] }
      if (Array.isArray(data)) {
        hindiItems = data;
      } else if (data.sections && Array.isArray(data.sections)) {
        for (const section of data.sections) {
          if (section.questions && Array.isArray(section.questions)) {
            for (const q of section.questions) {
              if (q.question_text_hi) {
                hindiItems.push({
                  question_number: q.question_number,
                  text_hi: q.question_text_hi,
                  options_hi: q.options?.filter((o: { text_hi?: string }) => o.text_hi).map((o: { label: string; text_hi: string }) => ({
                    label: o.label,
                    text_hi: o.text_hi,
                  })),
                  explanation_brief_hi: q.explanation_brief_hi,
                  explanation_detailed_hi: q.explanation_detailed_hi,
                });
              }
            }
          }
        }
      } else if (data.questions && Array.isArray(data.questions)) {
        for (const q of data.questions) {
          if (q.question_text_hi || q.text_hi) {
            hindiItems.push({
              question_number: q.question_number,
              text_hi: q.question_text_hi || q.text_hi,
              options_hi: q.options_hi || q.options?.filter((o: { text_hi?: string }) => o.text_hi).map((o: { label: string; text_hi: string }) => ({
                label: o.label,
                text_hi: o.text_hi,
              })),
              explanation_brief_hi: q.explanation_brief_hi,
              explanation_detailed_hi: q.explanation_detailed_hi,
            });
          }
        }
      }

      if (hindiItems.length === 0) {
        setError('No Hindi text found in the uploaded file. Expected question_text_hi or text_hi fields.');
        return;
      }

      // Build lookup of existing questions by display_order
      const questionByNumber = new Map<number, NexusQBQuestion>();
      for (const q of questions) {
        if (q.display_order != null) {
          questionByNumber.set(q.display_order, q);
        }
      }

      // Match Hindi items to existing questions
      const matched: MatchedRow[] = hindiItems.map((hi) => {
        const existing = questionByNumber.get(hi.question_number);
        return {
          questionNumber: hi.question_number,
          englishText: existing?.question_text || '(no English text)',
          hindiText: hi.text_hi,
          optionsHi: hi.options_hi,
          explanationBriefHi: hi.explanation_brief_hi,
          explanationDetailedHi: hi.explanation_detailed_hi,
          matched: !!existing,
          selected: !!existing,
          isOverwrite: !!(existing?.question_text_hi),
          hasVideo: !!(existing?.solution_video_url),
          questionFormat: existing?.question_format || 'MCQ',
        };
      });

      setRows(matched);
      setStep('review');
    } catch (err) {
      setError(err instanceof SyntaxError ? 'Invalid JSON file' : 'Failed to read file');
    }
  }, [questions]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith('.json')) {
      handleFileUpload(file);
    } else {
      setError('Please drop a .json file');
    }
  }, [handleFileUpload]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileUpload(file);
  }, [handleFileUpload]);

  const toggleRow = (index: number) => {
    setRows((prev) =>
      prev.map((r, i) => (i === index ? { ...r, selected: !r.selected } : r))
    );
  };

  const toggleAll = () => {
    const allSelected = rows.filter((r) => r.matched).every((r) => r.selected);
    setRows((prev) =>
      prev.map((r) => (r.matched ? { ...r, selected: !allSelected } : r))
    );
  };

  const toggleCard = (qNum: number) => {
    setExpandedCards((prev) => {
      const next = new Set(prev);
      if (next.has(qNum)) next.delete(qNum);
      else next.add(qNum);
      return next;
    });
  };

  const handleCopyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(HINDI_AI_PROMPT_TEMPLATE);
      setPromptCopied(true);
    } catch {
      setError('Failed to copy prompt. Please copy it manually.');
    }
  };

  const handleMerge = async () => {
    setMerging(true);
    setError('');
    try {
      const token = await getToken();
      if (!token) {
        setError('Authentication failed');
        return;
      }

      const selectedRows = rows.filter((r) => r.selected && r.matched);
      const payload = selectedRows.map((r) => ({
        question_number: r.questionNumber,
        text_hi: r.hindiText,
        options_hi: r.optionsHi,
        explanation_brief_hi: r.explanationBriefHi,
        explanation_detailed_hi: r.explanationDetailedHi,
      }));

      const res = await fetch(`/api/question-bank/papers/${paperId}/merge-hindi`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ questions: payload }),
      });

      const json = await res.json();
      if (res.ok) {
        setResult(json.data);
        setStep('done');
        onSuccess();
      } else {
        console.error('[Hindi Merge] API error:', res.status, json);
        setError(json.error || `Merge failed (${res.status})`);
      }
    } catch (err) {
      console.error('[Hindi Merge] Network error:', err);
      setError('Failed to merge Hindi text. Check your connection and try again.');
    } finally {
      setMerging(false);
    }
  };

  const handleClose = () => {
    setStep('upload');
    setRows([]);
    setError('');
    setResult(null);
    setExpandedCards(new Set());
    onClose();
  };

  // Stats
  const matchedCount = rows.filter((r) => r.matched).length;
  const unmatchedCount = rows.filter((r) => !r.matched).length;
  const selectedCount = rows.filter((r) => r.selected && r.matched).length;
  const overwriteCount = rows.filter((r) => r.selected && r.matched && r.isOverwrite).length;
  const videoCount = rows.filter((r) => r.selected && r.matched && r.hasVideo).length;
  const withOptions = rows.filter((r) => r.selected && r.matched && r.optionsHi && r.optionsHi.length > 0).length;
  const withExplanations = rows.filter((r) => r.selected && r.matched && (r.explanationBriefHi || r.explanationDetailedHi)).length;

  return (
    <Dialog
      open={open}
      onClose={merging ? undefined : handleClose}
      fullScreen={isMobile}
      maxWidth="md"
      fullWidth
      disableEscapeKeyDown={merging}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <TranslateIcon sx={{ color: '#e65100' }} />
        <Typography variant="h6" component="span" fontWeight={600} sx={{ flex: 1 }}>
          {step === 'upload' && 'Upload Hindi Text'}
          {step === 'review' && 'Review Hindi Matches'}
          {step === 'confirm' && 'Confirm Merge'}
          {step === 'done' && 'Merge Complete'}
        </Typography>
        <IconButton onClick={handleClose} aria-label="Close" sx={{ minWidth: 48, minHeight: 48 }}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
            {error}
          </Alert>
        )}

        {/* Step 1: Upload with Prompt Helper */}
        {step === 'upload' && (
          <Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Upload a JSON file containing Hindi translations. The system will match questions
              by question number and show a side-by-side review before merging.
            </Typography>

            {/* AI Prompt Helper Accordion */}
            <Accordion
              sx={{
                mb: 2,
                border: '1px solid',
                borderColor: alpha('#e65100', 0.2),
                borderRadius: '8px !important',
                '&:before': { display: 'none' },
                '&.Mui-expanded': { margin: '0 0 16px 0' },
              }}
            >
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography variant="body2" fontWeight={600} color="#e65100">
                  Need help generating the JSON?
                </Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                  <Typography variant="body2" color="text.secondary">
                    Use an AI tool (Claude, Gemini, ChatGPT) to extract Hindi text from a PDF:
                  </Typography>
                  <Box component="ol" sx={{ m: 0, pl: 2.5, '& li': { mb: 1, fontSize: '0.875rem' } }}>
                    <li>Open your preferred AI tool and start a new chat</li>
                    <li>Copy the Hindi extraction prompt below</li>
                    <li>Paste the prompt and attach the Hindi/bilingual question paper PDF</li>
                    <li>Save the AI output as a <code>.json</code> file</li>
                    <li>Upload the JSON file here</li>
                  </Box>
                  <Button
                    variant="outlined"
                    startIcon={<ContentCopyIcon />}
                    onClick={handleCopyPrompt}
                    sx={{
                      textTransform: 'none',
                      borderColor: '#e65100',
                      color: '#e65100',
                      '&:hover': { borderColor: '#bf360c', bgcolor: alpha('#e65100', 0.04) },
                      alignSelf: 'flex-start',
                    }}
                  >
                    Copy Hindi Extraction Prompt
                  </Button>
                  <Alert severity="info" variant="outlined" sx={{ fontSize: '0.8rem' }}>
                    The AI will also generate Hindi explanations (brief + detailed) for each question automatically.
                  </Alert>
                </Box>
              </AccordionDetails>
            </Accordion>

            {/* Drop zone */}
            <Box
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              sx={{
                border: '2px dashed',
                borderColor: alpha('#e65100', 0.3),
                borderRadius: 2,
                p: 4,
                textAlign: 'center',
                cursor: 'pointer',
                transition: 'all 0.2s',
                '&:hover': {
                  borderColor: '#e65100',
                  bgcolor: alpha('#e65100', 0.04),
                },
              }}
              onClick={() => document.getElementById('hindi-file-input')?.click()}
            >
              <UploadFileIcon sx={{ fontSize: 48, color: '#e65100', mb: 1 }} />
              <Typography variant="body1" fontWeight={600}>
                Drop Hindi JSON file here
              </Typography>
              <Typography variant="caption" color="text.secondary">
                or click to browse
              </Typography>
              <input
                id="hindi-file-input"
                type="file"
                accept=".json"
                hidden
                onChange={handleFileSelect}
              />
            </Box>

            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
              Supported formats: AI-generated JSON (with question_text_hi), schema format (with sections),
              or a simple array of {'{'} question_number, text_hi, options_hi {'}'}.
            </Typography>
          </Box>
        )}

        {/* Step 2: Review */}
        {step === 'review' && (
          <Box>
            {/* Summary bar */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5, flexWrap: 'wrap' }}>
              <Chip label={`${matchedCount} matched`} color="success" size="small" />
              {unmatchedCount > 0 && (
                <Chip label={`${unmatchedCount} unmatched`} color="error" size="small" />
              )}
              {overwriteCount > 0 && (
                <Chip
                  icon={<WarningAmberIcon sx={{ fontSize: 14 }} />}
                  label={`${overwriteCount} overwrites`}
                  size="small"
                  sx={{ bgcolor: alpha('#ff9800', 0.15), color: '#e65100' }}
                />
              )}
              <Box sx={{ flex: 1 }} />
              <Button size="small" onClick={toggleAll} sx={{ textTransform: 'none' }}>
                {rows.filter((r) => r.matched).every((r) => r.selected) ? 'Deselect All' : 'Select All'}
              </Button>
            </Box>

            {/* Stats line */}
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
              Hindi text: {matchedCount}/{rows.length}
              {withOptions > 0 && ` · Options: ${withOptions}`}
              {withExplanations > 0 && ` · Explanations: ${withExplanations}`}
              {videoCount > 0 && ` · ${videoCount} videos preserved`}
            </Typography>

            {/* Question cards */}
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, maxHeight: 400, overflow: 'auto' }}>
              {rows.map((row, idx) => {
                const isExpanded = expandedCards.has(row.questionNumber);

                return (
                  <Paper
                    key={idx}
                    variant="outlined"
                    sx={{
                      p: 1.5,
                      borderRadius: 1.5,
                      opacity: row.matched ? 1 : 0.5,
                      borderColor: !row.matched
                        ? theme.palette.error.main
                        : row.isOverwrite && row.selected
                          ? '#ff9800'
                          : row.selected
                            ? alpha('#e65100', 0.4)
                            : theme.palette.divider,
                    }}
                  >
                    {/* Compact header */}
                    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                      <Checkbox
                        checked={row.selected}
                        disabled={!row.matched}
                        onChange={() => toggleRow(idx)}
                        size="small"
                        sx={{ mt: -0.5, p: 0.5 }}
                      />
                      <Typography variant="body2" fontWeight={700} sx={{ minWidth: 30, pt: 0.25 }}>
                        Q{row.questionNumber}
                      </Typography>
                      <Box
                        sx={{ flex: 1, minWidth: 0, cursor: row.matched ? 'pointer' : 'default' }}
                        onClick={() => row.matched && toggleCard(row.questionNumber)}
                      >
                        {/* English preview */}
                        <Typography variant="caption" color="text.secondary" fontWeight={600}>
                          English
                        </Typography>
                        <MathText
                          text={row.englishText}
                          variant="body2"
                          sx={{
                            mb: 0.5,
                            display: '-webkit-box',
                            WebkitLineClamp: isExpanded ? undefined : 1,
                            WebkitBoxOrient: 'vertical',
                            overflow: isExpanded ? 'visible' : 'hidden',
                          }}
                        />
                        {/* Hindi preview */}
                        <Typography variant="caption" sx={{ color: '#e65100', fontWeight: 600 }}>
                          हिंदी
                        </Typography>
                        <MathText
                          text={row.hindiText}
                          variant="body2"
                          sx={{
                            color: 'text.secondary',
                            display: '-webkit-box',
                            WebkitLineClamp: isExpanded ? undefined : 1,
                            WebkitBoxOrient: 'vertical',
                            overflow: isExpanded ? 'visible' : 'hidden',
                          }}
                        />

                        {/* Collapsed summary chips */}
                        {!isExpanded && (
                          <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5, flexWrap: 'wrap' }}>
                            {row.optionsHi && row.optionsHi.length > 0 && (
                              <Typography variant="caption" color="text.disabled">
                                + {row.optionsHi.length} option translations
                              </Typography>
                            )}
                            {(row.explanationBriefHi || row.explanationDetailedHi) && (
                              <Typography variant="caption" color="text.disabled">
                                · + Hindi explanations
                              </Typography>
                            )}
                          </Box>
                        )}

                        {/* Expanded details */}
                        {isExpanded && (
                          <Box sx={{ mt: 1.5 }}>
                            <Divider sx={{ mb: 1.5 }} />

                            {/* Options side by side */}
                            {row.optionsHi && row.optionsHi.length > 0 && (
                              <Box sx={{ mb: 1.5 }}>
                                <Typography variant="caption" fontWeight={600} color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
                                  Option Translations
                                </Typography>
                                {row.optionsHi.map((opt) => (
                                  <Box key={opt.label} sx={{ display: 'flex', gap: 1, mb: 0.25 }}>
                                    <Typography variant="caption" fontWeight={600} sx={{ minWidth: 20 }}>
                                      {opt.label}.
                                    </Typography>
                                    <MathText text={opt.text_hi} variant="caption" sx={{ color: 'text.secondary' }} />
                                  </Box>
                                ))}
                              </Box>
                            )}

                            {/* Hindi explanations */}
                            {row.explanationBriefHi && (
                              <Box sx={{ mb: 1 }}>
                                <Typography variant="caption" fontWeight={600} sx={{ color: '#2e7d32', display: 'block', mb: 0.25 }}>
                                  संक्षिप्त व्याख्या (Brief)
                                </Typography>
                                <MathText text={row.explanationBriefHi} variant="caption" sx={{ color: 'text.secondary' }} />
                              </Box>
                            )}
                            {row.explanationDetailedHi && (
                              <Box sx={{ mb: 1 }}>
                                <Typography variant="caption" fontWeight={600} sx={{ color: '#1565c0', display: 'block', mb: 0.25 }}>
                                  विस्तृत हल (Detailed)
                                </Typography>
                                <MathText text={row.explanationDetailedHi} variant="caption" sx={{ color: 'text.secondary' }} />
                              </Box>
                            )}

                            {/* Video / overwrite indicators */}
                            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 0.5 }}>
                              {row.hasVideo && (
                                <Chip label="Video preserved" size="small" variant="outlined" color="info" sx={{ height: 20, fontSize: '0.65rem' }} />
                              )}
                              {row.isOverwrite && (
                                <Chip
                                  icon={<WarningAmberIcon sx={{ fontSize: 12 }} />}
                                  label="Will overwrite existing Hindi"
                                  size="small"
                                  sx={{ height: 20, fontSize: '0.65rem', bgcolor: alpha('#ff9800', 0.1), color: '#e65100' }}
                                />
                              )}
                            </Box>
                          </Box>
                        )}
                      </Box>
                      {/* Status chips */}
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, alignItems: 'flex-end', flexShrink: 0 }}>
                        {!row.matched && (
                          <Chip label="No match" size="small" color="error" variant="outlined" sx={{ height: 20, fontSize: '0.6rem' }} />
                        )}
                        {row.matched && row.isOverwrite && (
                          <Chip label="Overwrite" size="small" sx={{ height: 20, fontSize: '0.6rem', bgcolor: alpha('#ff9800', 0.15), color: '#e65100' }} />
                        )}
                        {row.matched && !row.isOverwrite && (
                          <Chip label="New" size="small" color="success" variant="outlined" sx={{ height: 20, fontSize: '0.6rem' }} />
                        )}
                      </Box>
                    </Box>
                  </Paper>
                );
              })}
            </Box>
          </Box>
        )}

        {/* Step 3: Confirm */}
        {step === 'confirm' && (
          <Box sx={{ py: 2 }}>
            <Typography variant="h6" fontWeight={600} sx={{ mb: 2.5, textAlign: 'center' }}>
              Ready to merge {selectedCount} questions
            </Typography>

            <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2, mb: 2 }}>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <ConfirmLine label="Hindi question texts" count={selectedCount} />
                {withOptions > 0 && <ConfirmLine label="Hindi option translations" count={withOptions} />}
                {withExplanations > 0 && <ConfirmLine label="Hindi explanations" count={withExplanations} />}
                {overwriteCount > 0 && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <WarningAmberIcon sx={{ fontSize: 18, color: '#e65100' }} />
                    <Typography variant="body2" sx={{ color: '#e65100' }}>
                      {overwriteCount} questions will have Hindi text overwritten
                    </Typography>
                  </Box>
                )}
                {videoCount > 0 && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <CheckCircleOutlineIcon sx={{ fontSize: 18, color: 'info.main' }} />
                    <Typography variant="body2" color="info.main">
                      {videoCount} solution videos preserved
                    </Typography>
                  </Box>
                )}
                {rows.length - selectedCount > 0 && (
                  <Typography variant="caption" color="text.disabled">
                    {rows.length - selectedCount} questions skipped (deselected or unmatched)
                  </Typography>
                )}
              </Box>
            </Paper>
          </Box>
        )}

        {/* Step 4: Done */}
        {step === 'done' && result && (
          <Box sx={{ textAlign: 'center', py: 3 }}>
            <CheckCircleOutlineIcon sx={{ fontSize: 56, color: 'success.main', mb: 2 }} />
            <Typography variant="h6" fontWeight={600} sx={{ mb: 1 }}>
              Hindi Text Merged
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
              {result.updated} questions updated
              {result.skipped > 0 ? `, ${result.skipped} skipped` : ''}
            </Typography>

            {/* Detailed breakdown */}
            {result.details && (
              <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, textAlign: 'left', maxWidth: 360, mx: 'auto' }}>
                <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1 }}>
                  Breakdown
                </Typography>
                {result.details.textUpdated > 0 && (
                  <Typography variant="body2" color="text.secondary">
                    Hindi question texts: {result.details.textUpdated}
                  </Typography>
                )}
                {result.details.optionsUpdated > 0 && (
                  <Typography variant="body2" color="text.secondary">
                    Hindi option translations: {result.details.optionsUpdated}
                  </Typography>
                )}
                {result.details.explanationsUpdated > 0 && (
                  <Typography variant="body2" color="text.secondary">
                    Hindi explanations: {result.details.explanationsUpdated}
                  </Typography>
                )}
                {result.details.overwrites > 0 && (
                  <Typography variant="body2" sx={{ color: '#e65100' }}>
                    Overwrites: {result.details.overwrites}
                  </Typography>
                )}
              </Paper>
            )}
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        {step === 'review' && (
          <>
            <Button onClick={() => { setStep('upload'); setRows([]); setExpandedCards(new Set()); }} sx={{ textTransform: 'none' }}>
              Back
            </Button>
            <Box sx={{ flex: 1 }} />
            <Button
              variant="contained"
              onClick={() => setStep('confirm')}
              disabled={selectedCount === 0}
              sx={{ textTransform: 'none', minWidth: 140 }}
            >
              Review {selectedCount} Questions
            </Button>
          </>
        )}
        {step === 'confirm' && (
          <>
            <Button onClick={() => setStep('review')} sx={{ textTransform: 'none' }}>
              Back
            </Button>
            <Box sx={{ flex: 1 }} />
            <Button
              variant="contained"
              onClick={handleMerge}
              disabled={merging || selectedCount === 0}
              sx={{ textTransform: 'none', minWidth: 160 }}
            >
              {merging ? 'Merging...' : `Merge ${selectedCount} Questions`}
            </Button>
          </>
        )}
        {step === 'done' && (
          <Button variant="contained" onClick={handleClose} sx={{ textTransform: 'none' }}>
            Done
          </Button>
        )}
      </DialogActions>

      {/* Prompt copied snackbar */}
      <Snackbar
        open={promptCopied}
        autoHideDuration={3000}
        onClose={() => setPromptCopied(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="success" variant="filled" onClose={() => setPromptCopied(false)}>
          Hindi extraction prompt copied to clipboard!
        </Alert>
      </Snackbar>
    </Dialog>
  );
}

/** Small helper for confirm step summary lines */
function ConfirmLine({ label, count }: { label: string; count: number }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      <CheckCircleOutlineIcon sx={{ fontSize: 18, color: 'success.main' }} />
      <Typography variant="body2">
        {count} {label}
      </Typography>
    </Box>
  );
}
