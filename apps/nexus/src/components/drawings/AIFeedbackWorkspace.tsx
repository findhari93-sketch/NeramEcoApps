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
import type { DrawingSubmission, TutorResource, GalleryReactionType } from '@neram/database/types';
import type { RegionAnnotation } from '@/lib/drawing-prompt-templates';
import { compressImage } from '@/utils/imageCompression';
import type { DrawingMark } from '@/lib/drawing-marks';
import RubricScorePanel from './review/RubricScorePanel';
import { feedbackPrefill, type AiDraft } from '@/lib/drawing-ai-draft';
import type { AutoDraftState } from '@/hooks/useAutoDraft';
import ReactionPicker from '@/components/assignments/ReactionPicker';

export interface WorkspaceData {
  overlayAnnotations: null; // kept for backwards compat, no longer used for zone chips
  overlayImageUrl: string | null;
  correctedImageUrl: string | null;
  tutorFeedback: string;
  resources: TutorResource[];
  rating: number;
  /** Numeric mark when the parent assignment grades on 'marks' (else null). */
  marks: number | null;
  /** Teacher's encouraging reaction (assignment drawings). */
  reaction: GalleryReactionType | null;
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
  /** Grading scale from the parent assignment (defaults to stars for practice drawings). */
  evaluationType?: 'marks' | 'stars';
  /** Marks ceiling when evaluationType is 'marks'. */
  maxMarks?: number;
  /**
   * The voice note, placed beside the written feedback so "say it" is one stage
   * rather than two panels a screen apart.
   */
  voiceSlot?: React.ReactNode;
  /** The AI draft on this sheet, when one exists. */
  aiDraft?: AiDraft | null;
  /** Where Gemini's draft for this sheet stands. */
  draftState?: AutoDraftState | null;
  /**
   * The "Send some encouragement" picker. Off for practice, where the review
   * screen shows the quick reactions (Nice, Great, Wow) that the flip-through uses.
   */
  showEncouragement?: boolean;
}

/**
 * A section heading on the rail, in plain words. It used to be numbered steps
 * in capitals ("01 SCORE", "02 SAY IT"), which read as a wizard the teacher had
 * to walk through rather than a sheet to confirm.
 */
function StageLabel({ label }: { label: string }) {
  return (
    <Typography variant="subtitle2" component="h3" sx={{ fontWeight: 700, mb: 0.75 }}>
      {label}
    </Typography>
  );
}

export default function AIFeedbackWorkspace({
  submission, getToken, onChange, defaultCollapsed = false, readOnly = false,
  sketchTrigger = 0, evaluationType = 'stars', maxMarks = 5, voiceSlot, aiDraft = null,
  draftState = null, showEncouragement = true,
}: AIFeedbackWorkspaceProps) {
  const drafting = draftState?.phase === 'drafting';
  const isMarks = evaluationType === 'marks';
  // Workspace state
  const [overlayImageUrl, setOverlayImageUrl] = useState<string | null>(submission.reviewed_image_url);
  const [correctedImageUrl, setCorrectedImageUrl] = useState<string | null>((submission as any).corrected_image_url || null);
  const [tutorFeedback, setTutorFeedback] = useState(submission.tutor_feedback || '');
  // The draft's paragraph opens the feedback box only when the teacher has
  // written nothing, and only once per draft, so it can never overwrite words.
  const draftPrefilled = useRef<string | null>(null);
  const [feedbackFromDraft, setFeedbackFromDraft] = useState(false);
  const [resources, setResources] = useState<TutorResource[]>(submission.tutor_resources || []);
  const [rating, setRating] = useState(submission.tutor_rating || 0);
  const [marks, setMarks] = useState(
    (submission as any).tutor_marks != null ? String((submission as any).tutor_marks) : '',
  );
  const [reaction, setReaction] = useState<GalleryReactionType | null>((submission as any).reaction ?? null);

  /**
   * The teacher's marks on this drawing as vectors, loaded before the canvas
   * opens so a second visit continues the correction instead of starting a
   * fresh overlay over the original. `marks` on this screen is already the
   * numeric grade, hence the longer name.
   */
  const [canvasMarks, setCanvasMarks] = useState<DrawingMark[] | null>(null);
  /** The image saved but the vectors did not. Worth saying, not worth blocking. */
  const [marksWarning, setMarksWarning] = useState(false);

  // UI state
  const [sketchOpen, setSketchOpen] = useState(false);
  const [uploadingOverlay, setUploadingOverlay] = useState(false);
  const [uploadingCorrected, setUploadingCorrected] = useState(false);
  const [imagesExpanded, setImagesExpanded] = useState(
    () => !defaultCollapsed && !!(submission.reviewed_image_url || (submission as any).corrected_image_url),
  );
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
      marks: marks.trim() === '' ? null : Number(marks),
      reaction,
      ...overrides,
    });
  }, [correctedImageUrl, onChange, overlayImageUrl, rating, marks, reaction, resources, tutorFeedback]);

  useEffect(() => {
    if (readOnly || !aiDraft || draftPrefilled.current === aiDraft.evaluation_id) return;
    draftPrefilled.current = aiDraft.evaluation_id;
    const text = feedbackPrefill(tutorFeedback, aiDraft);
    if (!text) return;
    setTutorFeedback(text);
    setFeedbackFromDraft(true);
    notify({ tutorFeedback: text });
  }, [readOnly, aiDraft, tutorFeedback, notify]);

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

  /**
   * Save the marks twice over, on purpose.
   *
   * The flattened PNG is what the review stage and the student's card show, and
   * it stays the quickest way to hand someone one picture. The vectors are what
   * make the marks mean anything afterwards: they let the canvas reopen with the
   * corrections still editable, and they are the only form the learning loop can
   * read, because a flattened image has no coordinates.
   *
   * The image is now the derived artifact of the two.
   */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await getToken();
        const res = await fetch(`/api/drawing/submissions/${submission.id}/marks`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        // A 503 means this environment has no marks tables yet. The canvas still
        // works; it just starts empty, exactly as it always did.
        if (!res.ok) { if (!cancelled) setCanvasMarks([]); return; }
        const body = await res.json();
        if (!cancelled) setCanvasMarks(Array.isArray(body.marks) ? (body.marks as DrawingMark[]) : []);
      } catch {
        // Settle on "none" rather than leaving it loading forever, or the canvas
        // would wait for marks that are never coming.
        if (!cancelled) setCanvasMarks([]);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submission.id]);

  const handleSketchSave = async (blob: Blob, nextMarks: DrawingMark[]) => {
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

      // Vectors after the image, and never fatal: a teacher who has just spent
      // ten minutes marking a sheet should not lose the overlay because the
      // marks table was unreachable. They keep the picture and a warning.
      try {
        const saved = await fetch(`/api/drawing/submissions/${submission.id}/marks`, {
          method: 'PUT',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ scope: 'canvas', marks: nextMarks }),
        });
        if (saved.ok) {
          setCanvasMarks(nextMarks);
          setMarksWarning(false);
        } else {
          setMarksWarning(true);
        }
      } catch {
        setMarksWarning(true);
      }

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

      {/* The verdict, first: scores, then the feedback to the student (written
          and voice together), then the action bar sends it. No collapsible
          header of its own: the rail's "Feedback" heading already names it, and
          the running total sits beside that heading. */}
      <Box>
        <Box>
          <Box>
            {readOnly ? (
              <Box>
                {isMarks
                  ? marks.trim() !== '' && (
                      <Box sx={{ mb: 1.5 }}>
                        <Typography variant="body2" fontWeight={700} color="text.secondary">
                          Marks: {marks} / {maxMarks}
                        </Typography>
                      </Box>
                    )
                  : (
                      <Box sx={{ mb: 1.5 }}>
                        <RubricScorePanel submissionId={submission.id} getToken={getToken} readOnly />
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
                {/*
                  An assignment marked out of N keeps its number. Everything
                  else is scored per criterion now: five anonymous stars told a
                  student nothing to act on and told the next teacher nothing
                  comparable. The rubric still feeds the star column, so the
                  queue, the gallery, the roster and the student page are
                  unchanged.
                */}
                <Box sx={{ mb: 2 }}>
                  {isMarks ? (
                    <>
                      <StageLabel label="Marks" />
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <TextField
                          value={marks}
                          onChange={(e) => {
                            const v = e.target.value.replace(/[^0-9.]/g, '');
                            setMarks(v);
                            notify({ marks: v.trim() === '' ? null : Number(v) });
                          }}
                          inputProps={{ inputMode: 'decimal' }}
                          size="small"
                          sx={{ width: 100 }}
                          placeholder="0"
                        />
                        <Typography color="text.secondary">out of {maxMarks}</Typography>
                      </Box>
                    </>
                  ) : (
                    <RubricScorePanel
                      submissionId={submission.id}
                      getToken={getToken}
                      aiDraft={aiDraft}
                      draftState={draftState}
                      onOverallChange={(stars) => {
                        setRating(stars ?? 0);
                        notify({ rating: stars ?? 0 });
                      }}
                    />
                  )}
                </Box>

                <StageLabel label="Feedback to student" />
                {feedbackFromDraft && (
                  <Typography variant="caption" color="primary.dark" data-testid="feedback-from-draft" sx={{ display: 'block', mb: 0.5 }}>
                    Drafted by Gemini. Read it through before you send.
                  </Typography>
                )}
                {/* Written feedback */}
                <TextField
                  placeholder={
                    drafting && !tutorFeedback
                      ? 'Gemini is writing a draft...'
                      : 'What should they keep, fix and try next?'
                  }
                  inputProps={{ 'aria-label': 'Feedback to student' }}
                  multiline
                  minRows={4}
                  maxRows={12}
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

                {voiceSlot && <Box sx={{ mb: 2 }}>{voiceSlot}</Box>}

                {/* Resources */}
                <ResourceLinkSearch
                  resources={resources}
                  onChange={(r) => { setResources(r); notify({ resources: r }); }}
                  getToken={getToken}
                />

                {/* Encouraging reaction sent to the student */}
                {showEncouragement && (
                  <Box sx={{ mt: 2 }}>
                    <ReactionPicker value={reaction} onChange={(v) => { setReaction(v); notify({ reaction: v }); }} />
                  </Box>
                )}
              </Box>
            )}
          </Box>
        </Box>
      </Box>

      {/* Reference and overlay images. After the score, and folded away when
          empty: two blank upload slots used to sit above the verdict, so the
          first thing on the rail was the least used thing on it. */}
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

            {/* The picture saved, the shapes behind it did not. Say so, because
                the next time this canvas opens those marks will not be there to
                edit, and the overlay on screen gives no hint of that. */}
            {marksWarning && (
              <Typography
                role="status"
                variant="caption"
                color="warning.dark"
                sx={{ display: 'block', mt: 1, textAlign: 'center', fontWeight: 600, fontSize: '0.68rem' }}
              >
                Your overlay image saved, but the marks behind it did not. Reopening the canvas will
                start from the original drawing.
              </Typography>
            )}
          </Box>
        </Collapse>
      </Paper>

      {/* SketchOverCanvas dialog */}
      <Dialog open={sketchOpen} onClose={() => setSketchOpen(false)} maxWidth="xl" fullWidth>
        <SketchOverCanvas
          imageUrl={submission.original_image_url}
          initialMarks={canvasMarks}
          onSave={handleSketchSave}
          onClose={() => setSketchOpen(false)}
        />
      </Dialog>
    </Box>
  );
}
