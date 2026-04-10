'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import {
  Box, Typography, Button, TextField, Rating, Paper, Chip, IconButton,
  CircularProgress, Collapse, Dialog, useTheme, useMediaQuery, Select, MenuItem,
  Tabs, Tab,
} from '@neram/ui';
import BrushOutlinedIcon from '@mui/icons-material/BrushOutlined';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CloudUploadOutlinedIcon from '@mui/icons-material/CloudUploadOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import RefreshIcon from '@mui/icons-material/Refresh';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import AddIcon from '@mui/icons-material/Add';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ContentPasteIcon from '@mui/icons-material/ContentPaste';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import SketchOverCanvas from './SketchOverCanvas';
import ResourceLinkSearch from './ResourceLinkSearch';
import type { DrawingSubmission, TutorResource } from '@neram/database/types';
import type { OverlayAnnotation } from './ImageToggleTabs';

export interface WorkspaceData {
  overlayAnnotations: OverlayAnnotation[] | null;
  overlayImageUrl: string | null;
  correctedImageUrl: string | null;
  tutorFeedback: string;
  resources: TutorResource[];
  rating: number;
}

interface AIFeedbackWorkspaceProps {
  submission: DrawingSubmission & {
    ai_overlay_annotations?: OverlayAnnotation[] | null;
    ai_corrected_image_prompt?: string | null;
    ai_annotation_prompt?: string | null;
    ai_reference_prompts?: { beginner: string; medium: string; expert: string } | null;
    corrected_image_url?: string | null;
    ai_draft_status?: 'pending' | 'generating' | 'ready' | 'failed';
  };
  getToken: () => Promise<string | null>;
  onChange: (data: WorkspaceData) => void;
  defaultCollapsed?: boolean;
}

const SEVERITY_COLORS: Record<string, 'error' | 'warning' | 'success'> = {
  high: 'error', medium: 'warning', low: 'success',
};

export default function AIFeedbackWorkspace({
  submission, getToken, onChange, defaultCollapsed = false,
}: AIFeedbackWorkspaceProps) {
  const aiDraftStatus = (submission as any).ai_draft_status || 'pending';
  const initialAnnotations = (submission as any).ai_overlay_annotations as OverlayAnnotation[] | null;
  const initialPrompt = (submission as any).ai_corrected_image_prompt as string | null;
  const initialAnnotationPrompt = (submission as any).ai_annotation_prompt as string | null;
  const initialReferencePrompts = (submission as any).ai_reference_prompts as {
    beginner: string; medium: string; expert: string;
  } | null;

  // Workspace state
  const [annotations, setAnnotations] = useState<OverlayAnnotation[]>(initialAnnotations || []);
  const [editingAnnotations, setEditingAnnotations] = useState(false);
  const [overlayImageUrl, setOverlayImageUrl] = useState<string | null>(submission.reviewed_image_url);
  const [correctedImageUrl, setCorrectedImageUrl] = useState<string | null>((submission as any).corrected_image_url || null);
  // aiPrompt is local state so it updates after re-generation
  const [aiPrompt, setAiPrompt] = useState<string | null>(initialPrompt);
  const [tutorFeedback, setTutorFeedback] = useState(
    submission.tutor_feedback ||
    (submission.ai_feedback ? buildAIFeedbackText(submission.ai_feedback) : '')
  );
  const [resources, setResources] = useState<TutorResource[]>(submission.tutor_resources || []);
  const [rating, setRating] = useState(submission.tutor_rating || 0);

  const [annotationPrompt, setAnnotationPrompt] = useState<string | null>(initialAnnotationPrompt);
  const [referencePrompts, setReferencePrompts] = useState<{ beginner: string; medium: string; expert: string } | null>(initialReferencePrompts);
  const [activeLevel, setActiveLevel] = useState<'beginner' | 'medium' | 'expert'>('medium');
  const [annotationPromptCopied, setAnnotationPromptCopied] = useState(false);
  const [referenceCopied, setReferenceCopied] = useState(false);
  const [latestAiFeedback, setLatestAiFeedback] = useState<Record<string, unknown> | null>(
    submission.ai_feedback as Record<string, unknown> | null
  );
  const [uploadingAnnotation, setUploadingAnnotation] = useState(false);
  const autoTriggeredRef = useRef(false);

  // UI state
  const [sketchOpen, setSketchOpen] = useState(false);
  const [promptCopied, setPromptCopied] = useState(false);
  const [uploadingCorrected, setUploadingCorrected] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [regenError, setRegenError] = useState('');
  const [overlayExpanded, setOverlayExpanded] = useState(!defaultCollapsed);
  const [correctedExpanded, setCorrectedExpanded] = useState(!defaultCollapsed);
  const [feedbackExpanded, setFeedbackExpanded] = useState(!defaultCollapsed);
  const [pasteError, setPasteError] = useState('');

  const pasteZoneRef = useRef<HTMLDivElement>(null);

  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const notify = useCallback((overrides?: Partial<WorkspaceData>) => {
    onChange({
      overlayAnnotations: annotations,
      overlayImageUrl,
      correctedImageUrl,
      tutorFeedback,
      resources,
      rating,
      ...overrides,
    });
  }, [annotations, correctedImageUrl, onChange, overlayImageUrl, rating, resources, tutorFeedback]);

  const handleSketchSave = async (blob: Blob) => {
    try {
      const token = await getToken();
      const formData = new FormData();
      formData.append('file', blob, 'overlay.png');
      formData.append('bucket', 'drawing-reviewed');
      const res = await fetch('/api/drawing/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!res.ok) throw new Error('Upload failed');
      const { url } = await res.json();
      setOverlayImageUrl(url);
      setSketchOpen(false);
      notify({ overlayImageUrl: url });
    } catch { /* user sees nothing, canvas stays open */ }
  };

  const handleCopyPrompt = async () => {
    if (!aiPrompt) return;
    await navigator.clipboard.writeText(aiPrompt);
    setPromptCopied(true);
    setTimeout(() => setPromptCopied(false), 2500);
  };

  const handleCopyAnnotationPrompt = async () => {
    if (!annotationPrompt) return;
    await navigator.clipboard.writeText(annotationPrompt);
    setAnnotationPromptCopied(true);
    setTimeout(() => setAnnotationPromptCopied(false), 2500);
  };

  const handleCopyReferencePrompt = async () => {
    const prompt = referencePrompts?.[activeLevel];
    if (!prompt) return;
    await navigator.clipboard.writeText(prompt);
    setReferenceCopied(true);
    setTimeout(() => setReferenceCopied(false), 2500);
  };

  const handleCorrectedUpload = useCallback(async (file: File) => {
    setUploadingCorrected(true);
    setPasteError('');
    try {
      const token = await getToken();
      const formData = new FormData();
      formData.append('file', file);
      formData.append('bucket', 'drawing-reviewed');
      const res = await fetch('/api/drawing/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!res.ok) throw new Error('Upload failed');
      const { url } = await res.json();
      setCorrectedImageUrl(url);
      notify({ correctedImageUrl: url });
    } catch { /* silent */ } finally {
      setUploadingCorrected(false);
    }
  }, [getToken, notify]);

  const handleAnnotationOverlayUpload = useCallback(async (file: File) => {
    setUploadingAnnotation(true);
    try {
      const token = await getToken();
      const formData = new FormData();
      formData.append('file', file);
      formData.append('bucket', 'drawing-reviewed');
      const res = await fetch('/api/drawing/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!res.ok) throw new Error('Upload failed');
      const { url } = await res.json();
      setOverlayImageUrl(url);
      notify({ overlayImageUrl: url });
    } catch { /* silent */ } finally {
      setUploadingAnnotation(false);
    }
  }, [getToken, notify]);

  const handlePasteImage = useCallback(async () => {
    setPasteError('');
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        for (const type of item.types) {
          if (type.startsWith('image/')) {
            const blob = await item.getType(type);
            const file = new File([blob], 'pasted-image.png', { type });
            handleCorrectedUpload(file);
            return;
          }
        }
      }
      setPasteError('No image found in clipboard. Copy an image first, then paste.');
    } catch {
      setPasteError('Clipboard access denied. Use the upload button instead.');
    }
  }, [handleCorrectedUpload]);

  // Listen for Ctrl+V paste when corrected or overlay section is expanded
  useEffect(() => {
    const handleGlobalPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (!file) continue;
          if (overlayExpanded && !overlayImageUrl) {
            handleAnnotationOverlayUpload(file);
            return;
          }
          if (correctedExpanded && !correctedImageUrl) {
            handleCorrectedUpload(file);
            return;
          }
        }
      }
    };
    document.addEventListener('paste', handleGlobalPaste);
    return () => document.removeEventListener('paste', handleGlobalPaste);
  }, [overlayExpanded, overlayImageUrl, correctedExpanded, correctedImageUrl, handleAnnotationOverlayUpload, handleCorrectedUpload]);

  // Auto-trigger AI generation when draft is missing on mount
  useEffect(() => {
    if (autoTriggeredRef.current) return;
    const hasAiData = initialAnnotations || initialPrompt || initialReferencePrompts || submission.ai_feedback;
    if (!hasAiData && (aiDraftStatus === 'pending' || aiDraftStatus === 'failed')) {
      autoTriggeredRef.current = true;
      handleRegenerate();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-generate: calls AI, updates ALL 3 sections at once
  const handleRegenerate = async () => {
    setRegenerating(true);
    setRegenError('');
    try {
      const token = await getToken();
      const res = await fetch('/api/drawing/ai-feedback', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ submission_id: submission.id }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || `AI generation failed (${res.status})`);
      }
      const { feedback } = await res.json();

      // Update overlay annotations
      const newAnnotations = Array.isArray(feedback?.overlay_annotations)
        ? feedback.overlay_annotations
        : annotations;
      if (Array.isArray(feedback?.overlay_annotations)) {
        setAnnotations(newAnnotations);
      }

      // Update corrected image prompt
      if (feedback?.corrected_image_prompt) {
        setAiPrompt(feedback.corrected_image_prompt);
      }

      if (feedback?.annotation_overlay_prompt) {
        setAnnotationPrompt(feedback.annotation_overlay_prompt);
      }
      if (feedback?.reference_prompts) {
        setReferencePrompts(feedback.reference_prompts);
      }
      setLatestAiFeedback(feedback);

      // Pre-fill written feedback if currently empty
      let newFeedbackText: string | null = null;
      if (!tutorFeedback) {
        const text = buildAIFeedbackText(feedback);
        if (text) {
          newFeedbackText = text;
          setTutorFeedback(text);
        }
      }

      // Always notify parent with the latest workspace state after regeneration
      notify({
        overlayAnnotations: newAnnotations,
        ...(newFeedbackText ? { tutorFeedback: newFeedbackText } : {}),
      });
    } catch (err) {
      setRegenError(err instanceof Error ? err.message : 'Re-generation failed. Try again.');
    } finally {
      setRegenerating(false);
    }
  };

  const handleAnnotationChange = (idx: number, field: keyof OverlayAnnotation, value: string) => {
    const updated = annotations.map((a, i) => i === idx ? { ...a, [field]: value } : a);
    setAnnotations(updated);
    notify({ overlayAnnotations: updated });
  };

  const handleAnnotationDelete = (idx: number) => {
    const updated = annotations.filter((_, i) => i !== idx);
    setAnnotations(updated);
    notify({ overlayAnnotations: updated });
  };

  const handleAddAnnotation = () => {
    const updated = [...annotations, { area: 'center', label: 'New note', severity: 'medium' as const }];
    setAnnotations(updated);
    notify({ overlayAnnotations: updated });
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>

      {/* AI Status Banner */}
      {aiDraftStatus === 'generating' && (
        <Paper variant="outlined" sx={{ p: 1.5, display: 'flex', alignItems: 'center', gap: 1, bgcolor: '#e3f2fd' }}>
          <CircularProgress size={16} />
          <Typography variant="body2" color="primary.main" fontWeight={600}>
            AI is analyzing the drawing...
          </Typography>
        </Paper>
      )}
      {(aiDraftStatus === 'failed' || aiDraftStatus === 'pending') && !initialAnnotations && !initialPrompt && (
        <Paper variant="outlined" sx={{ p: 1.5, bgcolor: '#fff8e1' }}>
          <Typography variant="body2" color="warning.dark" fontWeight={600}>
            AI draft not available. Click Re-generate below to get AI annotations, prompt, and feedback.
          </Typography>
        </Paper>
      )}

      {/* Re-generate error */}
      {regenError && (
        <Paper variant="outlined" sx={{ p: 1.5, bgcolor: '#fce4ec' }}>
          <Typography variant="body2" color="error.main" sx={{ fontSize: '0.8rem' }}>{regenError}</Typography>
        </Paper>
      )}

      {/* Section 1: Overlay Annotations */}
      <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
        <Box
          sx={{ px: isMobile ? 1.5 : 2, py: isMobile ? 1 : 1.25, display: 'flex', alignItems: 'center', cursor: 'pointer', bgcolor: 'grey.50' }}
          onClick={() => setOverlayExpanded(!overlayExpanded)}
        >
          <Typography variant="subtitle2" fontWeight={700} sx={{ flex: 1 }}>
            1. Overlay Annotations
          </Typography>
          {annotations.length > 0 && (
            <Chip label={`${annotations.length} notes`} size="small" color="primary" sx={{ mr: 1 }} />
          )}
          {overlayExpanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
        </Box>
        <Collapse in={overlayExpanded}>
          <Box sx={{ p: isMobile ? 1.5 : 2 }}>
            {/* Path A: Manual Drawing */}
            <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ display: 'block', mb: 0.75 }}>
              DRAW MANUALLY
            </Typography>
            <Button
              variant="outlined"
              startIcon={<BrushOutlinedIcon />}
              onClick={() => setSketchOpen(true)}
              sx={{ textTransform: 'none', minHeight: 40, mb: 2 }}
              size="small"
              fullWidth
            >
              Open Drawing Canvas
            </Button>

            {/* Path B: AI Annotation Prompt */}
            <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ display: 'block', mb: 0.75 }}>
              AI ANNOTATION PROMPT FOR CHATGPT
            </Typography>
            {annotationPrompt ? (
              <Box>
                <Paper
                  variant="outlined"
                  sx={{ p: 1.5, bgcolor: '#f9f9f9', fontFamily: 'monospace', fontSize: '0.78rem', lineHeight: 1.5, mb: 1 }}
                >
                  <Typography variant="body2" sx={{ fontSize: '0.78rem', fontFamily: 'inherit' }}>
                    {annotationPrompt}
                  </Typography>
                </Paper>
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1 }}>
                  <Button
                    size="small"
                    variant={annotationPromptCopied ? 'contained' : 'outlined'}
                    startIcon={annotationPromptCopied ? <CheckCircleOutlineIcon /> : <ContentCopyIcon />}
                    onClick={handleCopyAnnotationPrompt}
                    color={annotationPromptCopied ? 'success' : 'primary'}
                    sx={{ textTransform: 'none', minHeight: 36 }}
                  >
                    {annotationPromptCopied ? 'Copied!' : 'Copy Prompt'}
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<OpenInNewIcon />}
                    onClick={() => window.open(submission.original_image_url, '_blank')}
                    sx={{ textTransform: 'none', minHeight: 36 }}
                  >
                    View Student Image
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    color="secondary"
                    startIcon={<OpenInNewIcon />}
                    onClick={() => window.open('https://chat.openai.com', '_blank')}
                    sx={{ textTransform: 'none', minHeight: 36 }}
                  >
                    Open ChatGPT
                  </Button>
                </Box>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
                  Copy prompt, open student image (long-press on mobile or right-click on desktop to copy), then paste both into ChatGPT.
                </Typography>

                {/* Paste annotated image back */}
                {overlayImageUrl ? (
                  <Box>
                    <Box
                      component="img"
                      src={overlayImageUrl}
                      alt="Annotated overlay"
                      sx={{ width: '100%', borderRadius: 1, border: '1px solid', borderColor: 'divider', mb: 1 }}
                    />
                    <Button
                      size="small"
                      variant="outlined"
                      color="error"
                      startIcon={<DeleteOutlineIcon />}
                      onClick={() => { setOverlayImageUrl(null); notify({ overlayImageUrl: null }); }}
                      sx={{ textTransform: 'none' }}
                    >
                      Remove Annotated Image
                    </Button>
                  </Box>
                ) : (
                  <Box>
                    <input
                      type="file"
                      accept="image/*"
                      style={{ display: 'none' }}
                      id="upload-annotation-overlay"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleAnnotationOverlayUpload(file);
                        e.target.value = '';
                      }}
                    />
                    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                      <Button
                        variant="outlined"
                        startIcon={uploadingAnnotation ? <CircularProgress size={16} /> : <CloudUploadOutlinedIcon />}
                        disabled={uploadingAnnotation}
                        onClick={() => document.getElementById('upload-annotation-overlay')?.click()}
                        sx={{ textTransform: 'none', minHeight: 44, borderStyle: 'dashed', flex: 1 }}
                        size="small"
                      >
                        {uploadingAnnotation ? 'Uploading...' : 'Upload Annotated Image'}
                      </Button>
                      <Button
                        variant="outlined"
                        startIcon={<ContentPasteIcon />}
                        disabled={uploadingAnnotation}
                        onClick={async () => {
                          try {
                            const items = await navigator.clipboard.read();
                            for (const item of items) {
                              for (const type of item.types) {
                                if (type.startsWith('image/')) {
                                  const blob = await item.getType(type);
                                  handleAnnotationOverlayUpload(new File([blob], 'annotated.png', { type }));
                                  return;
                                }
                              }
                            }
                          } catch { /* silent */ }
                        }}
                        sx={{ textTransform: 'none', minHeight: 44, borderStyle: 'dashed', flex: 1 }}
                        size="small"
                      >
                        Paste Image
                      </Button>
                    </Box>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }}>
                      Paste the annotated drawing from ChatGPT here (Ctrl+V also works)
                    </Typography>
                  </Box>
                )}
              </Box>
            ) : (
              <Typography variant="body2" color="text.secondary">
                No AI annotation prompt yet. Re-generate in Section 2 to get one.
              </Typography>
            )}

            {/* Zone-based annotation chips */}
            {annotations.length > 0 && (
              <Box sx={{ mt: 2 }}>
                <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ display: 'block', mb: 0.75 }}>
                  ZONE ANNOTATIONS
                </Typography>
                {annotations.map((ann, i) => (
                  <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.75 }}>
                    {editingAnnotations ? (
                      <>
                        <TextField size="small" value={ann.label} sx={{ flex: 1 }}
                          onChange={(e) => handleAnnotationChange(i, 'label', e.target.value)} />
                        <Select size="small" value={ann.severity}
                          onChange={(e) => handleAnnotationChange(i, 'severity', e.target.value as string)}>
                          <MenuItem value="high">High</MenuItem>
                          <MenuItem value="medium">Medium</MenuItem>
                          <MenuItem value="low">Low</MenuItem>
                        </Select>
                        <IconButton size="small" color="error" onClick={() => handleAnnotationDelete(i)}>
                          <DeleteOutlineIcon fontSize="small" />
                        </IconButton>
                      </>
                    ) : (
                      <Chip
                        label={`${ann.area}: ${ann.label}`}
                        size="small"
                        color={SEVERITY_COLORS[ann.severity]}
                        variant="outlined"
                      />
                    )}
                  </Box>
                ))}
                <Box sx={{ display: 'flex', gap: 1, mt: 0.75 }}>
                  <Button size="small" startIcon={<EditOutlinedIcon />}
                    onClick={() => setEditingAnnotations(!editingAnnotations)}
                    sx={{ textTransform: 'none' }}>
                    {editingAnnotations ? 'Done' : 'Edit'}
                  </Button>
                  {editingAnnotations && (
                    <Button size="small" startIcon={<AddIcon />}
                      onClick={handleAddAnnotation} sx={{ textTransform: 'none' }}>
                      Add
                    </Button>
                  )}
                </Box>
              </Box>
            )}
          </Box>
        </Collapse>
      </Paper>

      {/* Section 2: Corrected Reference Image */}
      <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
        <Box
          sx={{ px: isMobile ? 1.5 : 2, py: isMobile ? 1 : 1.25, display: 'flex', alignItems: 'center', cursor: 'pointer', bgcolor: 'grey.50' }}
          onClick={() => setCorrectedExpanded(!correctedExpanded)}
        >
          <Typography variant="subtitle2" fontWeight={700} sx={{ flex: 1 }}>
            2. Corrected Reference Image
          </Typography>
          {correctedImageUrl && (
            <Chip label="Image uploaded" size="small" color="success" sx={{ mr: 1 }} />
          )}
          {correctedExpanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
        </Box>
        <Collapse in={correctedExpanded}>
          <Box sx={{ p: isMobile ? 1.5 : 2 }}>
            {/* Level tabs */}
            <Tabs
              value={activeLevel}
              onChange={(_, v) => { setActiveLevel(v); setReferenceCopied(false); }}
              sx={{ mb: 1.5, minHeight: 32, '& .MuiTab-root': { minHeight: 32, py: 0.25, textTransform: 'none', fontSize: '0.8rem' } }}
            >
              <Tab value="beginner" label="Beginner" />
              <Tab value="medium" label="Medium" />
              <Tab value="expert" label="Expert" />
            </Tabs>

            {/* Prompt for selected level */}
            {referencePrompts ? (
              <Box sx={{ mb: 2 }}>
                <Paper
                  variant="outlined"
                  sx={{ p: 1.5, bgcolor: '#f9f9f9', fontFamily: 'monospace', fontSize: '0.78rem', lineHeight: 1.5, mb: 1 }}
                >
                  <Typography variant="body2" sx={{ fontSize: '0.78rem', fontFamily: 'inherit' }}>
                    {referencePrompts[activeLevel]}
                  </Typography>
                </Paper>
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1 }}>
                  <Button
                    size="small"
                    variant={referenceCopied ? 'contained' : 'outlined'}
                    startIcon={referenceCopied ? <CheckCircleOutlineIcon /> : <ContentCopyIcon />}
                    onClick={handleCopyReferencePrompt}
                    color={referenceCopied ? 'success' : 'primary'}
                    sx={{ textTransform: 'none', minHeight: 36 }}
                  >
                    {referenceCopied ? 'Copied!' : 'Copy Prompt'}
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<OpenInNewIcon />}
                    onClick={() => window.open(submission.original_image_url, '_blank')}
                    sx={{ textTransform: 'none', minHeight: 36 }}
                  >
                    View Student Image
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    color="secondary"
                    startIcon={<OpenInNewIcon />}
                    onClick={() => window.open('https://chat.openai.com', '_blank')}
                    sx={{ textTransform: 'none', minHeight: 36 }}
                  >
                    Open ChatGPT
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={regenerating ? <CircularProgress size={14} /> : <RefreshIcon />}
                    onClick={handleRegenerate}
                    disabled={regenerating}
                    sx={{ textTransform: 'none', minHeight: 36 }}
                  >
                    {regenerating ? 'Re-generating...' : 'Re-generate'}
                  </Button>
                </Box>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                  Copy the {activeLevel} prompt, paste into ChatGPT (with student image for context), then paste the result below.
                </Typography>
              </Box>
            ) : aiDraftStatus === 'generating' ? (
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 2 }}>
                <CircularProgress size={14} />
                <Typography variant="body2" color="text.secondary">Generating prompts...</Typography>
              </Box>
            ) : (
              <Box sx={{ mb: 2 }}>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                  No reference prompts yet. Click Re-generate to get prompts for all three levels.
                </Typography>
                <Button
                  size="small"
                  variant="contained"
                  startIcon={regenerating ? <CircularProgress size={14} /> : <RefreshIcon />}
                  onClick={handleRegenerate}
                  disabled={regenerating}
                  sx={{ textTransform: 'none', minHeight: 36 }}
                >
                  {regenerating ? 'Re-generating...' : 'Re-generate AI Draft'}
                </Button>
              </Box>
            )}

            {/* Upload / Paste corrected image */}
            {correctedImageUrl ? (
              <Box>
                <Box
                  component="img"
                  src={correctedImageUrl}
                  alt="Reference image"
                  sx={{ width: '100%', borderRadius: 1, border: '1px solid', borderColor: 'divider', mb: 1 }}
                />
                <Button
                  size="small"
                  variant="outlined"
                  color="error"
                  startIcon={<DeleteOutlineIcon />}
                  onClick={() => { setCorrectedImageUrl(null); notify({ correctedImageUrl: null }); }}
                  sx={{ textTransform: 'none' }}
                >
                  Remove Image
                </Button>
              </Box>
            ) : (
              <Box ref={pasteZoneRef}>
                <input
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  id="upload-corrected"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleCorrectedUpload(file);
                    e.target.value = '';
                  }}
                />
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                  <Button
                    variant="outlined"
                    startIcon={uploadingCorrected ? <CircularProgress size={16} /> : <CloudUploadOutlinedIcon />}
                    disabled={uploadingCorrected}
                    onClick={() => document.getElementById('upload-corrected')?.click()}
                    sx={{ textTransform: 'none', minHeight: 44, borderStyle: 'dashed', flex: 1 }}
                    size="small"
                  >
                    {uploadingCorrected ? 'Uploading...' : 'Upload Reference Image'}
                  </Button>
                  <Button
                    variant="outlined"
                    startIcon={uploadingCorrected ? <CircularProgress size={16} /> : <ContentPasteIcon />}
                    disabled={uploadingCorrected}
                    onClick={handlePasteImage}
                    sx={{ textTransform: 'none', minHeight: 44, borderStyle: 'dashed', flex: 1 }}
                    size="small"
                  >
                    Paste Image
                  </Button>
                </Box>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }}>
                  Paste the reference image from ChatGPT here (Ctrl+V also works)
                </Typography>
                {pasteError && (
                  <Typography variant="caption" color="error" sx={{ display: 'block', mt: 0.5 }}>{pasteError}</Typography>
                )}
              </Box>
            )}
          </Box>
        </Collapse>
      </Paper>

      {/* Section 3: Written Feedback + Resources */}
      <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
        <Box
          sx={{ px: isMobile ? 1.5 : 2, py: isMobile ? 1 : 1.25, display: 'flex', alignItems: 'center', cursor: 'pointer', bgcolor: 'grey.50' }}
          onClick={() => setFeedbackExpanded(!feedbackExpanded)}
        >
          <Typography variant="subtitle2" fontWeight={700} sx={{ flex: 1 }}>
            3. Written Feedback
          </Typography>
          <Button
            size="small"
            variant="outlined"
            color="secondary"
            startIcon={<AutoAwesomeIcon />}
            onClick={(e) => {
              e.stopPropagation();
              const feedbackSource = latestAiFeedback || submission.ai_feedback;
              if (!feedbackSource) return;
              const draft = buildAIFeedbackText(feedbackSource as any);
              if (draft) {
                setTutorFeedback(draft);
                notify({ tutorFeedback: draft });
              }
            }}
            disabled={!latestAiFeedback && !submission.ai_feedback}
            title={!latestAiFeedback && !submission.ai_feedback ? 'Generate AI draft first using Re-generate above' : 'Pre-fill feedback from AI analysis'}
            sx={{ textTransform: 'none', mr: 1, minHeight: 28, fontSize: '0.75rem' }}
          >
            AI Draft
          </Button>
          {feedbackExpanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
        </Box>
        <Collapse in={feedbackExpanded}>
          <Box sx={{ p: 2 }}>
            <TextField
              placeholder="Share what the student should improve, practice areas, step-by-step tips..."
              multiline
              rows={4}
              fullWidth
              value={tutorFeedback}
              onChange={(e) => {
                setTutorFeedback(e.target.value);
                notify({ tutorFeedback: e.target.value });
              }}
              sx={{ mb: 2 }}
              helperText={
                tutorFeedback && (latestAiFeedback || submission.ai_feedback)
                  ? 'Pre-filled from AI analysis. Edit as needed.'
                  : undefined
              }
            />

            <ResourceLinkSearch
              resources={resources}
              onChange={(r) => { setResources(r); notify({ resources: r }); }}
              getToken={getToken}
            />

            <Box sx={{ mt: 2 }}>
              <Typography variant="subtitle2" fontWeight={600} gutterBottom>
                Rating (optional)
              </Typography>
              <Rating
                value={rating}
                onChange={(_, v) => { setRating(v || 0); notify({ rating: v || 0 }); }}
                size="large"
              />
            </Box>
          </Box>
        </Collapse>
      </Paper>

      {/* SketchOverCanvas dialog */}
      <Dialog open={sketchOpen} onClose={() => setSketchOpen(false)} maxWidth="xl" fullWidth>
        <SketchOverCanvas
          imageUrl={submission.original_image_url}
          onSave={handleSketchSave}
          onClose={() => setSketchOpen(false)}
        />
      </Dialog>
    </Box>
  );
}

function buildAIFeedbackText(aiFeedback: { feedback?: string[]; improvement_tip?: string } | null | Record<string, unknown>): string {
  if (!aiFeedback) return '';
  const lines: string[] = [];
  const f = aiFeedback as { feedback?: string[]; improvement_tip?: string };
  if (Array.isArray(f.feedback)) {
    lines.push(...f.feedback);
  }
  if (f.improvement_tip) {
    lines.push(`Tip: ${f.improvement_tip}`);
  }
  return lines.join('\n');
}
