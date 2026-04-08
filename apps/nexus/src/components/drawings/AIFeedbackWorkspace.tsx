'use client';

import { useState, useCallback } from 'react';
import {
  Box, Typography, Button, TextField, Rating, Paper, Chip, IconButton,
  CircularProgress, Divider, Collapse, Dialog,
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
    corrected_image_url?: string | null;
    ai_draft_status?: 'pending' | 'generating' | 'ready' | 'failed';
  };
  getToken: () => Promise<string | null>;
  onChange: (data: WorkspaceData) => void;
}

const SEVERITY_COLORS: Record<string, 'error' | 'warning' | 'success'> = {
  high: 'error', medium: 'warning', low: 'success',
};

export default function AIFeedbackWorkspace({
  submission, getToken, onChange,
}: AIFeedbackWorkspaceProps) {
  const aiDraftStatus = (submission as any).ai_draft_status || 'pending';
  const aiAnnotations = (submission as any).ai_overlay_annotations as OverlayAnnotation[] | null;
  const aiPrompt = (submission as any).ai_corrected_image_prompt as string | null;

  // Workspace state
  const [annotations, setAnnotations] = useState<OverlayAnnotation[]>(aiAnnotations || []);
  const [editingAnnotations, setEditingAnnotations] = useState(false);
  const [overlayImageUrl, setOverlayImageUrl] = useState<string | null>(submission.reviewed_image_url);
  const [correctedImageUrl, setCorrectedImageUrl] = useState<string | null>((submission as any).corrected_image_url || null);
  const [tutorFeedback, setTutorFeedback] = useState(
    submission.tutor_feedback ||
    (submission.ai_feedback ? buildAIFeedbackText(submission.ai_feedback) : '')
  );
  const [resources, setResources] = useState<TutorResource[]>(submission.tutor_resources || []);
  const [rating, setRating] = useState(submission.tutor_rating || 0);

  // UI state
  const [sketchOpen, setSketchOpen] = useState(false);
  const [promptCopied, setPromptCopied] = useState(false);
  const [uploadingCorrected, setUploadingCorrected] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [overlayExpanded, setOverlayExpanded] = useState(true);
  const [correctedExpanded, setCorrectedExpanded] = useState(true);
  const [feedbackExpanded, setFeedbackExpanded] = useState(true);

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

  const handleCorrectedUpload = async (file: File) => {
    setUploadingCorrected(true);
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
  };

  const handleRegenerate = async () => {
    setRegenerating(true);
    try {
      const token = await getToken();
      const res = await fetch('/api/drawing/ai-feedback', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ submission_id: submission.id }),
      });
      if (!res.ok) throw new Error('Failed');
      const { feedback } = await res.json();
      if (feedback?.overlay_annotations) {
        setAnnotations(feedback.overlay_annotations);
        notify({ overlayAnnotations: feedback.overlay_annotations });
      }
    } catch { /* silent */ } finally {
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
            Analyzing your drawing...
          </Typography>
        </Paper>
      )}
      {aiDraftStatus === 'failed' && (
        <Paper variant="outlined" sx={{ p: 1.5, bgcolor: '#fff3e0' }}>
          <Typography variant="body2" color="warning.main" fontWeight={600}>
            AI draft generation failed. You can fill in feedback manually or re-generate.
          </Typography>
        </Paper>
      )}

      {/* Section 1: Overlay Annotations */}
      <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
        <Box
          sx={{ px: 2, py: 1.25, display: 'flex', alignItems: 'center', cursor: 'pointer', bgcolor: 'grey.50' }}
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
          <Box sx={{ p: 2 }}>
            {aiDraftStatus === 'generating' ? (
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                <CircularProgress size={14} />
                <Typography variant="body2" color="text.secondary">Generating annotations...</Typography>
              </Box>
            ) : annotations.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                No annotations yet. Draw manually or re-generate.
              </Typography>
            ) : (
              <Box sx={{ mb: 1.5 }}>
                {annotations.map((ann, i) => (
                  <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.75 }}>
                    {editingAnnotations ? (
                      <>
                        <TextField
                          size="small"
                          value={ann.label}
                          onChange={(e) => handleAnnotationChange(i, 'label', e.target.value)}
                          sx={{ flex: 1, '& .MuiInputBase-input': { py: 0.5, fontSize: '0.8rem' } }}
                        />
                        <TextField
                          select
                          size="small"
                          value={ann.severity}
                          onChange={(e) => handleAnnotationChange(i, 'severity', e.target.value)}
                          SelectProps={{ native: true }}
                          sx={{ width: 90, '& .MuiInputBase-input': { py: 0.5, fontSize: '0.8rem' } }}
                        >
                          <option value="high">High</option>
                          <option value="medium">Medium</option>
                          <option value="low">Low</option>
                        </TextField>
                        <IconButton size="small" onClick={() => handleAnnotationDelete(i)} color="error">
                          <DeleteOutlineIcon fontSize="small" />
                        </IconButton>
                      </>
                    ) : (
                      <Chip
                        label={ann.label}
                        size="small"
                        color={SEVERITY_COLORS[ann.severity] || 'warning'}
                        sx={{ fontWeight: 600 }}
                      />
                    )}
                  </Box>
                ))}
                {editingAnnotations && (
                  <Button size="small" startIcon={<AddIcon />} onClick={handleAddAnnotation} sx={{ mt: 0.5, textTransform: 'none' }}>
                    Add note
                  </Button>
                )}
              </Box>
            )}

            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              <Button
                size="small"
                variant="outlined"
                startIcon={<BrushOutlinedIcon />}
                onClick={() => setSketchOpen(true)}
                sx={{ textTransform: 'none', minHeight: 36 }}
              >
                {overlayImageUrl ? 'Edit Drawing' : 'Draw Manually'}
              </Button>
              {annotations.length > 0 && (
                <Button
                  size="small"
                  variant={editingAnnotations ? 'contained' : 'outlined'}
                  startIcon={editingAnnotations ? <CheckCircleOutlineIcon /> : <EditOutlinedIcon />}
                  onClick={() => setEditingAnnotations(!editingAnnotations)}
                  sx={{ textTransform: 'none', minHeight: 36 }}
                >
                  {editingAnnotations ? 'Done Editing' : 'Edit Notes'}
                </Button>
              )}
              <Button
                size="small"
                variant="outlined"
                startIcon={regenerating ? <CircularProgress size={14} /> : <RefreshIcon />}
                onClick={handleRegenerate}
                disabled={regenerating}
                sx={{ textTransform: 'none', minHeight: 36 }}
              >
                Re-generate
              </Button>
            </Box>

            {overlayImageUrl && (
              <Box sx={{ mt: 1.5 }}>
                <Box
                  component="img"
                  src={overlayImageUrl}
                  alt="Teacher overlay"
                  sx={{ width: '100%', borderRadius: 1, border: '1px solid', borderColor: 'divider' }}
                />
              </Box>
            )}
          </Box>
        </Collapse>
      </Paper>

      {/* Section 2: Corrected Reference Image */}
      <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
        <Box
          sx={{ px: 2, py: 1.25, display: 'flex', alignItems: 'center', cursor: 'pointer', bgcolor: 'grey.50' }}
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
          <Box sx={{ p: 2 }}>
            {aiPrompt ? (
              <Box sx={{ mb: 2 }}>
                <Typography variant="caption" fontWeight={600} color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
                  AI-GENERATED CHATGPT PROMPT
                </Typography>
                <Paper
                  variant="outlined"
                  sx={{ p: 1.5, bgcolor: '#f9f9f9', fontFamily: 'monospace', fontSize: '0.78rem', lineHeight: 1.5, mb: 1 }}
                >
                  <Typography variant="body2" sx={{ fontSize: '0.78rem', fontFamily: 'inherit' }}>
                    {aiPrompt}
                  </Typography>
                </Paper>
                <Button
                  size="small"
                  variant={promptCopied ? 'contained' : 'outlined'}
                  startIcon={promptCopied ? <CheckCircleOutlineIcon /> : <ContentCopyIcon />}
                  onClick={handleCopyPrompt}
                  color={promptCopied ? 'success' : 'primary'}
                  sx={{ textTransform: 'none', minHeight: 36 }}
                >
                  {promptCopied ? 'Copied!' : 'Copy Prompt'}
                </Button>
              </Box>
            ) : aiDraftStatus === 'generating' ? (
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 2 }}>
                <CircularProgress size={14} />
                <Typography variant="body2" color="text.secondary">Generating ChatGPT prompt...</Typography>
              </Box>
            ) : (
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                No AI prompt generated yet. Re-generate to get a ChatGPT prompt.
              </Typography>
            )}

            <Divider sx={{ mb: 2 }} />

            {correctedImageUrl ? (
              <Box>
                <Box
                  component="img"
                  src={correctedImageUrl}
                  alt="Corrected reference"
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
              <Box>
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
                <Button
                  variant="outlined"
                  startIcon={uploadingCorrected ? <CircularProgress size={16} /> : <CloudUploadOutlinedIcon />}
                  fullWidth
                  disabled={uploadingCorrected}
                  onClick={() => document.getElementById('upload-corrected')?.click()}
                  sx={{ textTransform: 'none', minHeight: 44, borderStyle: 'dashed' }}
                >
                  {uploadingCorrected ? 'Uploading...' : 'Upload Corrected Image'}
                </Button>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, textAlign: 'center' }}>
                  Generate in ChatGPT using the prompt above, then upload here
                </Typography>
              </Box>
            )}
          </Box>
        </Collapse>
      </Paper>

      {/* Section 3: Written Feedback + Resources */}
      <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
        <Box
          sx={{ px: 2, py: 1.25, display: 'flex', alignItems: 'center', cursor: 'pointer', bgcolor: 'grey.50' }}
          onClick={() => setFeedbackExpanded(!feedbackExpanded)}
        >
          <Typography variant="subtitle2" fontWeight={700} sx={{ flex: 1 }}>
            3. Written Feedback
          </Typography>
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
              helperText={submission.ai_feedback ? 'Pre-filled from AI analysis. Edit as needed.' : undefined}
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

function buildAIFeedbackText(aiFeedback: { feedback?: string[]; improvement_tip?: string } | null): string {
  if (!aiFeedback) return '';
  const lines: string[] = [];
  if (Array.isArray(aiFeedback.feedback)) {
    lines.push(...aiFeedback.feedback);
  }
  if (aiFeedback.improvement_tip) {
    lines.push(`Tip: ${aiFeedback.improvement_tip}`);
  }
  return lines.join('\n');
}
