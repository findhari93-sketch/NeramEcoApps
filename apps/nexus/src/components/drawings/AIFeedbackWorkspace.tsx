'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import {
  Box, Typography, Button, TextField, Rating, Paper, IconButton,
  CircularProgress, Collapse, Dialog, useTheme, useMediaQuery,
} from '@neram/ui';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import CloseIcon from '@mui/icons-material/Close';
import LayersOutlinedIcon from '@mui/icons-material/LayersOutlined';
import ImageOutlinedIcon from '@mui/icons-material/ImageOutlined';
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
  sketchTrigger?: number;
}

export default function AIFeedbackWorkspace({
  submission, getToken, onChange, defaultCollapsed = false, readOnly = false,
  sketchTrigger = 0,
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

  // Open sketch when triggered externally (from pencil menu on canvas)
  useEffect(() => {
    if (sketchTrigger > 0) setSketchOpen(true);
  }, [sketchTrigger]);

  // ─── Render helpers ─────────────────────────────────────────────────────────

  const renderDropZone = (
    label: string,
    icon: React.ReactNode,
    imageUrl: string | null,
    target: 'overlay' | 'corrected',
    uploading: boolean,
    setUrl: (url: string | null) => void,
    fileRef: React.RefObject<HTMLInputElement | null>,
  ) => (
    <Box
      onClick={() => !readOnly && !imageUrl && !uploading && handlePasteOrUpload(target)}
      sx={{
        flex: 1,
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        border: '2px dashed',
        borderColor: imageUrl ? 'primary.200' : 'divider',
        borderRadius: 2,
        overflow: 'hidden',
        cursor: readOnly || imageUrl ? 'default' : 'pointer',
        minHeight: isMobile ? 100 : 110,
        bgcolor: imageUrl ? 'transparent' : 'grey.50',
        transition: 'all 0.2s',
        ...(!readOnly && !imageUrl && {
          '&:hover': { borderColor: 'primary.main', bgcolor: 'primary.50' },
          '&:active': { bgcolor: 'primary.100' },
        }),
      }}
    >
      <input ref={fileRef as any} type="file" accept="image/*" style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleUpload(file, target);
          e.target.value = '';
        }} />

      {imageUrl ? (
        <>
          <Box component="img" src={imageUrl} alt={label}
            sx={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', inset: 0 }} />
          {!readOnly && (
            <IconButton
              onClick={(e) => { e.stopPropagation(); setUrl(null); notify({ [target === 'overlay' ? 'overlayImageUrl' : 'correctedImageUrl']: null }); }}
              size="small"
              sx={{
                position: 'absolute', top: 4, right: 4, zIndex: 2,
                bgcolor: 'rgba(0,0,0,0.55)', color: '#fff',
                '&:hover': { bgcolor: 'rgba(0,0,0,0.75)' },
                width: 24, height: 24,
              }}
            >
              <CloseIcon sx={{ fontSize: 14 }} />
            </IconButton>
          )}
        </>
      ) : uploading ? (
        <CircularProgress size={24} />
      ) : (
        <>
          <Box sx={{ color: 'text.disabled', mb: 0.5 }}>{icon}</Box>
          <Typography variant="caption" color="text.secondary" textAlign="center" sx={{ fontSize: '0.68rem', lineHeight: 1.3, px: 1 }}>
            Tap to paste or upload
          </Typography>
        </>
      )}

      {/* Bottom label strip */}
      <Box sx={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        textAlign: 'center', py: 0.25, px: 0.5,
        bgcolor: imageUrl ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.04)',
        zIndex: 1,
      }}>
        <Typography variant="caption" fontWeight={700} sx={{
          fontSize: '0.65rem',
          color: imageUrl ? '#fff' : 'text.secondary',
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
        }}>
          {label}
        </Typography>
      </Box>
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
            {/* Side-by-side thumbnail drop zones */}
            <Box sx={{ display: 'flex', gap: 1.5 }}>
              {renderDropZone(
                'Overlay',
                <LayersOutlinedIcon sx={{ fontSize: 28 }} />,
                overlayImageUrl,
                'overlay',
                uploadingOverlay,
                setOverlayImageUrl,
                overlayFileRef,
              )}
              {renderDropZone(
                'Reference',
                <ImageOutlinedIcon sx={{ fontSize: 28 }} />,
                correctedImageUrl,
                'corrected',
                uploadingCorrected,
                setCorrectedImageUrl,
                correctedFileRef,
              )}
            </Box>

            {!readOnly && (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1, textAlign: 'center', fontSize: '0.68rem' }}>
                Ctrl+V pastes into the first empty slot
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
                  sx={{
                    mb: 2,
                    '& textarea': {
                      scrollbarWidth: 'thin',
                      scrollbarColor: 'rgba(0,0,0,0.15) transparent',
                      '&::-webkit-scrollbar': { width: 3 },
                      '&::-webkit-scrollbar-track': { background: 'transparent' },
                      '&::-webkit-scrollbar-thumb': { background: 'rgba(0,0,0,0.15)', borderRadius: 2 },
                    },
                  }}
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
