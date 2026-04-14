'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import {
  Box, Typography, Button, TextField, Rating, Paper, IconButton,
  CircularProgress, Collapse, Dialog, useTheme, useMediaQuery,
} from '@neram/ui';
import BrushOutlinedIcon from '@mui/icons-material/BrushOutlined';
import CloudUploadOutlinedIcon from '@mui/icons-material/CloudUploadOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ContentPasteIcon from '@mui/icons-material/ContentPaste';
import SketchOverCanvas from './SketchOverCanvas';
import ResourceLinkSearch from './ResourceLinkSearch';
import type { DrawingSubmission, TutorResource } from '@neram/database/types';
import type { RegionAnnotation } from '@/lib/drawing-prompt-templates';
import { RATING_LABELS } from '@/lib/drawing-prompt-templates';
import { compressImage } from '@/utils/imageCompression';

export interface WorkspaceData {
  overlayAnnotations: null; // kept for backwards compat, no longer used for zone chips
  overlayImageUrl: string | null;
  correctedImageUrl: string | null;
  tutorFeedback: string;
  resources: TutorResource[];
  rating: number;
  regionAnnotations?: RegionAnnotation[];
}

interface AIFeedbackWorkspaceProps {
  submission: DrawingSubmission & {
    corrected_image_url?: string | null;
  };
  getToken: () => Promise<string | null>;
  onChange: (data: WorkspaceData) => void;
  defaultCollapsed?: boolean;
  readOnly?: boolean;
}

export default function AIFeedbackWorkspace({
  submission, getToken, onChange, defaultCollapsed = false, readOnly = false,
}: AIFeedbackWorkspaceProps) {
  // Workspace state
  const [overlayImageUrl, setOverlayImageUrl] = useState<string | null>(submission.reviewed_image_url);
  const [correctedImageUrl, setCorrectedImageUrl] = useState<string | null>((submission as any).corrected_image_url || null);
  const [tutorFeedback, setTutorFeedback] = useState(submission.tutor_feedback || '');
  const [resources, setResources] = useState<TutorResource[]>(submission.tutor_resources || []);
  const [rating, setRating] = useState(submission.tutor_rating || 0);

  // UI state
  const [sketchOpen, setSketchOpen] = useState(false);
  const [uploadingOverlay, setUploadingOverlay] = useState(false);
  const [uploadingCorrected, setUploadingCorrected] = useState(false);
  const [imagesExpanded, setImagesExpanded] = useState(!defaultCollapsed);
  const [feedbackExpanded, setFeedbackExpanded] = useState(true);
  const [pasteTarget, setPasteTarget] = useState<'overlay' | 'corrected' | null>(null);

  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const notify = useCallback((overrides?: Partial<WorkspaceData>) => {
    onChange({
      overlayAnnotations: null,
      overlayImageUrl,
      correctedImageUrl,
      tutorFeedback,
      resources,
      rating,
      ...overrides,
    });
  }, [correctedImageUrl, onChange, overlayImageUrl, rating, resources, tutorFeedback]);

  // ─── Upload handlers ────────────────────────────────────────────────────────

  const handleUpload = useCallback(async (file: File, target: 'overlay' | 'corrected') => {
    const setUploading = target === 'overlay' ? setUploadingOverlay : setUploadingCorrected;
    setUploading(true);
    try {
      const token = await getToken();
      const compressed = await compressImage(file, 1920, 0.85, `${target}.jpg`).catch(() => file);
      const formData = new FormData();
      formData.append('file', compressed);
      formData.append('bucket', 'drawing-reviewed');
      const res = await fetch('/api/drawing/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!res.ok) throw new Error('Upload failed');
      const { url } = await res.json();
      if (target === 'overlay') {
        setOverlayImageUrl(url);
        notify({ overlayImageUrl: url });
      } else {
        setCorrectedImageUrl(url);
        notify({ correctedImageUrl: url });
      }
    } catch { /* silent */ } finally {
      setUploading(false);
    }
  }, [getToken, notify]);

  const handleSketchSave = async (blob: Blob) => {
    try {
      const token = await getToken();
      const compressed = await compressImage(blob, 1920, 0.85, 'overlay.jpg').catch(() => blob);
      const formData = new FormData();
      formData.append('file', compressed, 'overlay.jpg');
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
    } catch { /* canvas stays open */ }
  };

  // Combined upload/paste handler
  const handlePasteOrUpload = useCallback(async (target: 'overlay' | 'corrected') => {
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        for (const type of item.types) {
          if (type.startsWith('image/')) {
            const blob = await item.getType(type);
            handleUpload(new File([blob], 'pasted-image.png', { type }), target);
            return;
          }
        }
      }
      // No image in clipboard, open file picker as fallback
      setPasteTarget(target);
    } catch {
      // Clipboard denied, open file picker
      setPasteTarget(target);
    }
  }, [handleUpload]);

  // Auto-trigger file input when paste fails
  const overlayFileRef = useRef<HTMLInputElement>(null);
  const correctedFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (pasteTarget === 'overlay') overlayFileRef.current?.click();
    if (pasteTarget === 'corrected') correctedFileRef.current?.click();
    setPasteTarget(null);
  }, [pasteTarget]);

  // Global Ctrl+V paste listener
  useEffect(() => {
    if (readOnly) return;
    const handleGlobalPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (!file) continue;
          // Route to overlay first if expanded and empty, then corrected
          if (imagesExpanded && !overlayImageUrl) {
            handleUpload(file, 'overlay');
            return;
          }
          if (imagesExpanded && !correctedImageUrl) {
            handleUpload(file, 'corrected');
            return;
          }
        }
      }
    };
    document.addEventListener('paste', handleGlobalPaste);
    return () => document.removeEventListener('paste', handleGlobalPaste);
  }, [imagesExpanded, overlayImageUrl, correctedImageUrl, handleUpload, readOnly]);

  // ─── Render helpers ─────────────────────────────────────────────────────────

  const renderImageSlot = (
    label: string,
    imageUrl: string | null,
    target: 'overlay' | 'corrected',
    uploading: boolean,
    setUrl: (url: string | null) => void,
    fileRef: React.RefObject<HTMLInputElement | null>,
    extraButton?: React.ReactNode,
  ) => (
    <Box sx={{ mb: 1.5 }}>
      <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
        {label}
      </Typography>
      {readOnly ? (
        imageUrl ? (
          <Box component="img" src={imageUrl} alt={label}
            sx={{ width: '100%', borderRadius: 1, border: '1px solid', borderColor: 'divider' }} />
        ) : (
          <Typography variant="body2" color="text.secondary">Not added</Typography>
        )
      ) : imageUrl ? (
        <Box>
          <Box component="img" src={imageUrl} alt={label}
            sx={{ width: '100%', borderRadius: 1, border: '1px solid', borderColor: 'divider', mb: 0.75 }} />
          <Button
            size="small" variant="outlined" color="error"
            startIcon={<DeleteOutlineIcon />}
            onClick={() => { setUrl(null); notify({ [target === 'overlay' ? 'overlayImageUrl' : 'correctedImageUrl']: null }); }}
            sx={{ textTransform: 'none', minHeight: 32, fontSize: '0.78rem' }}
          >
            Remove
          </Button>
        </Box>
      ) : (
        <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', alignItems: 'center' }}>
          {extraButton}
          <input ref={fileRef as any} type="file" accept="image/*" style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleUpload(file, target);
              e.target.value = '';
            }} />
          <Button
            variant="outlined"
            size="small"
            startIcon={uploading ? <CircularProgress size={14} /> : <CloudUploadOutlinedIcon />}
            disabled={uploading}
            onClick={() => handlePasteOrUpload(target)}
            sx={{ textTransform: 'none', minHeight: 36, borderStyle: 'dashed', flex: 1, fontSize: '0.78rem' }}
          >
            {uploading ? 'Uploading...' : 'Upload or Paste'}
          </Button>
        </Box>
      )}
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>

      {/* Section 1: Review Images */}
      <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
        <Box
          sx={{ px: isMobile ? 1.5 : 2, py: isMobile ? 0.75 : 1, display: 'flex', alignItems: 'center', cursor: 'pointer', bgcolor: 'grey.50' }}
          onClick={() => setImagesExpanded(!imagesExpanded)}
        >
          <Typography variant="subtitle2" fontWeight={700} sx={{ flex: 1, fontSize: '0.85rem' }}>
            Review Images
          </Typography>
          {(overlayImageUrl || correctedImageUrl) && (
            <Typography variant="caption" color="success.main" fontWeight={600} sx={{ mr: 1 }}>
              {[overlayImageUrl && 'Overlay', correctedImageUrl && 'Reference'].filter(Boolean).join(' + ')}
            </Typography>
          )}
          {imagesExpanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
        </Box>
        <Collapse in={imagesExpanded}>
          <Box sx={{ p: isMobile ? 1.5 : 2 }}>
            {/* Overlay Image slot */}
            {renderImageSlot(
              'OVERLAY (ANNOTATED DRAWING)',
              overlayImageUrl,
              'overlay',
              uploadingOverlay,
              setOverlayImageUrl,
              overlayFileRef,
              !readOnly ? (
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<BrushOutlinedIcon />}
                  onClick={() => setSketchOpen(true)}
                  sx={{ textTransform: 'none', minHeight: 36, flex: 1, fontSize: '0.78rem' }}
                >
                  Draw on Image
                </Button>
              ) : undefined,
            )}

            <Box sx={{ borderTop: '1px solid', borderColor: 'divider', mt: 1, pt: 1 }} />

            {/* Reference Image slot */}
            {renderImageSlot(
              'REFERENCE IMAGE',
              correctedImageUrl,
              'corrected',
              uploadingCorrected,
              setCorrectedImageUrl,
              correctedFileRef,
            )}

            {!readOnly && (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                Paste images from Gemini here (Ctrl+V also works anywhere on the page)
              </Typography>
            )}
          </Box>
        </Collapse>
      </Paper>

      {/* Section 2: Feedback & Rating */}
      <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
        <Box
          sx={{ px: isMobile ? 1.5 : 2, py: isMobile ? 0.75 : 1, display: 'flex', alignItems: 'center', cursor: 'pointer', bgcolor: 'grey.50' }}
          onClick={() => setFeedbackExpanded(!feedbackExpanded)}
        >
          <Typography variant="subtitle2" fontWeight={700} sx={{ flex: 1, fontSize: '0.85rem' }}>
            Feedback & Rating
          </Typography>
          {rating > 0 && (
            <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ mr: 1 }}>
              {rating}/5 {RATING_LABELS[rating] || ''}
            </Typography>
          )}
          {feedbackExpanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
        </Box>
        <Collapse in={feedbackExpanded}>
          <Box sx={{ p: isMobile ? 1.5 : 2 }}>
            {readOnly ? (
              <Box>
                {rating > 0 && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                    <Rating value={rating} readOnly size="medium" />
                    <Typography variant="body2" fontWeight={600} color="text.secondary">
                      {RATING_LABELS[rating] || ''}
                    </Typography>
                  </Box>
                )}
                {tutorFeedback ? (
                  <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.7, mb: resources.length ? 2 : 0 }}>
                    {tutorFeedback}
                  </Typography>
                ) : (
                  <Typography variant="body2" color="text.secondary" sx={{ mb: resources.length ? 2 : 0 }}>
                    No written feedback yet.
                  </Typography>
                )}
                {resources.length > 0 && (
                  <Box>
                    <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                      RESOURCES
                    </Typography>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                      {resources.map((r, i) => (
                        <Button
                          key={i}
                          size="small"
                          variant="outlined"
                          onClick={() => window.open(r.url, '_blank')}
                          sx={{ textTransform: 'none', fontSize: '0.75rem', minHeight: 28 }}
                        >
                          {r.title || r.url}
                        </Button>
                      ))}
                    </Box>
                  </Box>
                )}
              </Box>
            ) : (
              <Box>
                {/* Rating with label */}
                <Box sx={{ mb: 2 }}>
                  <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                    RATING
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Rating
                      value={rating}
                      onChange={(_, v) => { setRating(v || 0); notify({ rating: v || 0 }); }}
                      size="large"
                    />
                    <Typography
                      variant="body2"
                      fontWeight={600}
                      color={rating >= 4 ? 'success.main' : rating >= 3 ? 'primary.main' : rating >= 1 ? 'warning.main' : 'text.disabled'}
                    >
                      {rating > 0 ? RATING_LABELS[rating] : 'Tap to rate'}
                    </Typography>
                  </Box>
                </Box>

                {/* Written feedback */}
                <TextField
                  placeholder="Paste feedback from Gemini or write your own..."
                  multiline
                  rows={4}
                  fullWidth
                  value={tutorFeedback}
                  onChange={(e) => {
                    setTutorFeedback(e.target.value);
                    notify({ tutorFeedback: e.target.value });
                  }}
                  sx={{ mb: 2 }}
                />

                {/* Resources */}
                <ResourceLinkSearch
                  resources={resources}
                  onChange={(r) => { setResources(r); notify({ resources: r }); }}
                  getToken={getToken}
                />
              </Box>
            )}
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
