'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Box, ToggleButton, ToggleButtonGroup, Chip, Typography, IconButton,
  Tooltip, Badge, Menu, MenuItem, ListItemIcon, ListItemText, Snackbar,
  Button, CircularProgress, useTheme, useMediaQuery,
} from '@neram/ui';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckIcon from '@mui/icons-material/Check';
import BrokenImageOutlinedIcon from '@mui/icons-material/BrokenImageOutlined';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import ImageOutlinedIcon from '@mui/icons-material/ImageOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import EditOffIcon from '@mui/icons-material/EditOff';
import BrushOutlinedIcon from '@mui/icons-material/BrushOutlined';
import GestureIcon from '@mui/icons-material/Gesture';
import RotateRightIcon from '@mui/icons-material/RotateRight';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import RegionAnnotationLayer from './RegionAnnotationLayer';
import { centeredBox, isReady, toStyle } from '@/lib/annotation-geometry';
import { nextRotation, rotationTransform, type Rotation } from '@/lib/image-rotation';
import {
  type DrawingMedium, type SkillLevel, type RegionAnnotation, type SubmissionPromptType,
  MEDIUM_LABELS, LEVEL_LABELS, PROMPT_TYPE_LABELS,
  buildAnnotationPrompt, buildReferencePrompt, buildFeedbackPrompt,
  getMediumFromCategory,
} from '@/lib/drawing-prompt-templates';

export interface OverlayAnnotation {
  area: string;
  label: string;
  severity: 'high' | 'medium' | 'low';
}

interface ImageToggleTabsProps {
  originalImageUrl: string;
  overlayAnnotations?: OverlayAnnotation[] | null;
  overlayImageUrl?: string | null;
  correctedImageUrl?: string | null;
  height?: string | number;
  // New props for region annotations and smart copy
  isEditMode?: boolean;
  regionAnnotations?: RegionAnnotation[];
  onRegionAnnotationsChange?: (annotations: RegionAnnotation[]) => void;
  questionCategory?: string;
  questionContext?: string;
  onOpenSketch?: () => void;
  /** Hide teacher-only menu items like "Open Gemini" and prompt copy options */
  studentView?: boolean;
  /**
   * Bake a quarter-turn into the stored image for the given tab. Supplying this
   * is what enables the rotate control, the same opt-in shape as onOpenSketch,
   * so a surface that cannot persist a rotation simply never shows the button.
   * Should resolve once the new image is saved, and reject to keep the turn.
   */
  onRotate?: (rotation: Rotation, tab: DisplayTab, clearAnnotations: boolean) => Promise<void>;
  /**
   * Marks from an AI draft, image-relative. Drawn solid where the model was sure
   * of the criterion and dashed where it was not, in the theme colour so they
   * never read as the teacher's own red boxes.
   */
  aiMarks?: Array<{ id: string; x: number; y: number; width: number; height: number; comment: string | null; confident: boolean }>;
}

type DisplayTab = 'original' | 'overlay' | 'corrected';

// Maps rough area names to approximate percentage positions on the image (backwards compat)
const AREA_POSITIONS: Record<string, { top: string; left: string }> = {
  'top-left':      { top: '12%', left: '15%' },
  'top-center':    { top: '12%', left: '50%' },
  'top-right':     { top: '12%', left: '78%' },
  'center-left':   { top: '50%', left: '12%' },
  'center':        { top: '50%', left: '50%' },
  'center-right':  { top: '50%', left: '78%' },
  'bottom-left':   { top: '80%', left: '15%' },
  'bottom-center': { top: '80%', left: '50%' },
  'bottom-right':  { top: '80%', left: '78%' },
};

const SEVERITY_COLORS: Record<string, 'error' | 'warning' | 'success' | 'info'> = {
  high: 'error', medium: 'warning', low: 'success',
};

async function convertToPng(blob: Blob): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext('2d')!.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      canvas.toBlob((b) => b ? resolve(b) : reject(new Error('canvas toBlob failed')), 'image/png');
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image load failed')); };
    img.src = url;
  });
}

export default function ImageToggleTabs({
  originalImageUrl,
  overlayAnnotations,
  overlayImageUrl,
  correctedImageUrl,
  height = '100%',
  isEditMode = false,
  regionAnnotations = [],
  onRegionAnnotationsChange,
  questionCategory,
  questionContext,
  onOpenSketch,
  studentView = false,
  onRotate,
  aiMarks = [],
}: ImageToggleTabsProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const prefersReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');

  const hasOverlay = !!(overlayAnnotations?.length || overlayImageUrl);
  const hasCorrected = !!correctedImageUrl;

  const [tab, setTab] = useState<DisplayTab>('original');
  const [imgError, setImgError] = useState(false);
  const [annotateMode, setAnnotateMode] = useState(false);

  // Rotation preview state. The turn is applied instantly as a CSS transform so
  // the teacher sees it with zero latency; only "Save" bakes it into the file.
  const [rotation, setRotation] = useState<Rotation>(0);
  const [rotationSaving, setRotationSaving] = useState(false);
  const [rotationError, setRotationError] = useState('');
  const [rotationSaved, setRotationSaved] = useState(false);

  const stageRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  // Layout sizes of the fitted image and its stage. Transforms do not affect
  // layout, so these stay stable across a rotation and never feed back.
  const [fitBox, setFitBox] = useState({ rw: 0, rh: 0, cw: 0, ch: 0 });

  // Smart copy menu state
  const [copyMenuAnchor, setCopyMenuAnchor] = useState<null | HTMLElement>(null);
  const [promptBanner, setPromptBanner] = useState<string | false>(false);

  // Pencil tools menu state
  const [pencilMenuAnchor, setPencilMenuAnchor] = useState<null | HTMLElement>(null);

  // Medium and level selectors
  const [medium, setMedium] = useState<DrawingMedium>(
    questionCategory ? getMediumFromCategory(questionCategory) : 'graphite_pencil'
  );
  const [level, setLevel] = useState<SkillLevel>('medium');

  const activeTab = tab === 'corrected' && !hasCorrected
    ? 'original'
    : tab === 'overlay' && !hasOverlay
    ? 'original'
    : tab;

  const displayImageUrl =
    activeTab === 'overlay' && overlayImageUrl
      ? overlayImageUrl
      : activeTab === 'corrected'
      ? correctedImageUrl!
      : originalImageUrl;

  // Snackbar state for student direct-copy feedback
  const [copiedBanner, setCopiedBanner] = useState(false);

  const handleCopyImage = async () => {
    try {
      const res = await fetch(displayImageUrl);
      const blob = await res.blob();
      const pngBlob = blob.type === 'image/png' ? blob : await convertToPng(blob);
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })]);
      if (studentView) setCopiedBanner(true);
    } catch { /* clipboard may be denied */ }
    setCopyMenuAnchor(null);
  };

  const handleCopyPrompt = async (type: SubmissionPromptType) => {
    let prompt: string;
    switch (type) {
      case 'annotation':
        prompt = buildAnnotationPrompt(medium, level, regionAnnotations, questionContext);
        break;
      case 'reference':
        prompt = buildReferencePrompt(medium, level, questionContext);
        break;
      case 'feedback':
        prompt = buildFeedbackPrompt(medium, level, regionAnnotations, questionContext);
        break;
    }
    try {
      await navigator.clipboard.writeText(prompt);
      const label = PROMPT_TYPE_LABELS[type].label;
      setPromptBanner(label);
    } catch { /* clipboard may be denied */ }
    setCopyMenuAnchor(null);
  };

  // Marking is suspended mid-rotation: the percentages a teacher drew now would
  // be measured against a box that is about to change shape.
  const showAnnotateOnOriginal =
    isEditMode && activeTab === 'original' && annotateMode && rotation === 0;

  // ─── Rotation ───────────────────────────────────────────────────────────────

  const measureFit = useCallback(() => {
    const stage = stageRef.current;
    const img = imgRef.current;
    if (!stage || !img) return;
    setFitBox({
      rw: img.offsetWidth,
      rh: img.offsetHeight,
      cw: stage.clientWidth,
      ch: stage.clientHeight,
    });
  }, []);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    measureFit();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measureFit);
    observer.observe(stage);
    if (imgRef.current) observer.observe(imgRef.current);
    return () => observer.disconnect();
  }, [measureFit, displayImageUrl, imgError]);

  // A pending turn belongs to the image it was started on, so leaving the tab
  // must not carry it across to a different picture.
  useEffect(() => {
    setRotation(0);
    setRotationError('');
  }, [activeTab]);

  const canRotate = !!onRotate && !imgError;
  // Regions are fractions of the image, so a quarter turn transposes their
  // axes and no longer describes the same part of the drawing. Only the
  // original tab carries them.
  const annotationsAtRisk =
    activeTab === 'original' && rotation % 180 !== 0 ? regionAnnotations.length : 0;

  const handleRotateStep = () => {
    setRotationError('');
    setRotation((r) => nextRotation(r));
  };

  const handleSaveRotation = async () => {
    if (!onRotate || rotation === 0 || rotationSaving) return;
    setRotationSaving(true);
    setRotationError('');
    try {
      await onRotate(rotation, activeTab, annotationsAtRisk > 0);
      // The saved image comes back already upright, so the preview turn is
      // spent. Reset before the new URL paints to avoid a double rotation.
      setRotation(0);
      setRotationSaved(true);
    } catch (err) {
      // Keep the preview turn so the teacher can simply retry, and never let
      // the screen imply a rotation that was not stored.
      setRotationError(err instanceof Error ? err.message : 'Could not save the rotation');
    } finally {
      setRotationSaving(false);
    }
  };

  const imageTransform = rotationTransform(fitBox.rw, fitBox.rh, fitBox.cw, fitBox.ch, rotation);

  /**
   * Where the drawing actually sits inside the stage.
   *
   * Reuses the measurement the rotation fit already takes: rw and rh are the
   * image element's layout size, which with maxWidth/maxHeight is the rendered
   * size of the drawing itself, and the flex stage centres it. Annotations are
   * positioned against this rather than against the stage, so a rectangle
   * stays on the same part of the drawing at every viewport width.
   */
  const annotationBox = centeredBox(fitBox.rw, fitBox.rh, fitBox.cw, fitBox.ch);
  const canPlaceAnnotations = isReady(annotationBox);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height, width: '100%' }}>
      {/* Toggle row + copy button */}
      <Box sx={{ display: 'flex', alignItems: 'center', pb: 1, flexShrink: 0, px: 1 }}>
        <Box sx={{ flex: 1 }} />
        <ToggleButtonGroup
          value={activeTab}
          exclusive
          onChange={(_, v) => { if (v) { setTab(v); setImgError(false); } }}
          size="small"
          sx={{
            bgcolor: 'rgba(255,255,255,0.92)',
            borderRadius: 1,
            boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
            '& .MuiToggleButton-root': {
              py: 0.4, px: 1.5,
              textTransform: 'none',
              fontSize: '0.75rem',
              fontWeight: 600,
            },
          }}
        >
          <ToggleButton value="original">My Drawing</ToggleButton>
          <ToggleButton value="overlay" disabled={!hasOverlay}>
            <Badge variant="dot" color="primary" invisible={!hasOverlay}
              sx={{ '& .MuiBadge-dot': { top: -2, right: -4 } }}>
              Overlay
            </Badge>
          </ToggleButton>
          {hasCorrected && (
            <ToggleButton value="corrected">
              <Badge variant="dot" color="success"
                sx={{ '& .MuiBadge-dot': { top: -2, right: -4 } }}>
                Reference
              </Badge>
            </ToggleButton>
          )}
        </ToggleButtonGroup>
        <Box sx={{ flex: 1, display: 'flex', justifyContent: 'flex-end' }}>
          {!imgError && (
            <Tooltip title={studentView ? 'Copy image' : 'Copy options'} placement="left">
              <IconButton
                onClick={studentView ? handleCopyImage : (e) => setCopyMenuAnchor(e.currentTarget)}
                size="small"
                sx={{
                  bgcolor: 'rgba(0,0,0,0.55)', color: '#fff',
                  backdropFilter: 'blur(4px)',
                  '&:hover': { bgcolor: 'rgba(0,0,0,0.75)' },
                  width: 32, height: 32,
                }}
              >
                <ContentCopyIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
          )}
        </Box>
      </Box>

      {/* Image area */}
      <Box ref={stageRef} sx={{
        flex: 1,
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 0,
        overflow: 'hidden',
      }}>
        {imgError ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, opacity: 0.5 }}>
            <BrokenImageOutlinedIcon sx={{ fontSize: 40, color: '#fff' }} />
            <Typography variant="caption" sx={{ color: '#fff' }}>Image unavailable</Typography>
          </Box>
        ) : (
          <Box
            component="img"
            ref={imgRef}
            src={displayImageUrl}
            alt="Drawing"
            onError={() => setImgError(true)}
            onLoad={measureFit}
            // Exposes the pending turn to tests, which cannot read an sx-driven
            // transform because it compiles to a class rather than inline style.
            data-rotation={rotation}
            sx={{
              maxWidth: '100%',
              maxHeight: '100%',
              objectFit: 'contain',
              display: 'block',
              // A bare rotate would overflow, because the box the image
              // occupies swaps its axes while its layout box does not. The
              // paired scale keeps it fitted inside the stage.
              transform: imageTransform,
              transition: prefersReducedMotion ? 'none' : 'transform 0.22s ease',
            }}
          />
        )}

        {/* Region annotation layer (only on original tab in edit+annotate mode) */}
        {showAnnotateOnOriginal && onRegionAnnotationsChange && canPlaceAnnotations && (
          <RegionAnnotationLayer
            annotations={regionAnnotations}
            onChange={onRegionAnnotationsChange}
            box={annotationBox}
          />
        )}

        {/* Show region annotations as read-only (no edit popover) when not in annotate mode but annotations exist */}
        {activeTab === 'original' && !annotateMode && rotation === 0 && canPlaceAnnotations && regionAnnotations.length > 0 && (
          <Box sx={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 4 }}>
            {regionAnnotations.map((ann) => (
              <Box
                key={ann.id}
                style={{ position: 'absolute', ...toStyle(ann, annotationBox) }}
                sx={{
                  border: '2px dashed rgba(220, 40, 40, 0.6)',
                  bgcolor: 'rgba(220, 40, 40, 0.06)',
                  borderRadius: '4px',
                }}
              >
                {ann.comment && (
                  <Chip
                    label={ann.comment}
                    size="small"
                    sx={{
                      position: 'absolute', top: -12, left: 4, maxWidth: '90%',
                      height: 22, fontSize: '0.7rem', fontWeight: 600,
                      bgcolor: 'rgba(255,255,255,0.9)', border: '1px solid rgba(220,40,40,0.4)',
                      color: '#b71c1c', '& .MuiChip-label': { px: 1 },
                    }}
                  />
                )}
              </Box>
            ))}
          </Box>
        )}

        {/* AI draft marks: solid when the model was sure, dashed when not. */}
        {activeTab === 'original' && !annotateMode && rotation === 0 && canPlaceAnnotations && aiMarks.length > 0 && (
          <Box sx={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 3 }}>
            {aiMarks.map((mark) => (
              <Box
                key={mark.id}
                data-testid="ai-mark"
                data-confident={mark.confident ? 'true' : 'false'}
                style={{ position: 'absolute', ...toStyle(mark, annotationBox) }}
                sx={{
                  border: `2px ${mark.confident ? 'solid' : 'dashed'} rgba(124, 58, 237, 0.75)`,
                  bgcolor: 'rgba(124, 58, 237, 0.05)',
                  borderRadius: '4px',
                }}
              >
                <Chip
                  label={mark.comment ? `AI: ${mark.comment}` : 'AI'}
                  size="small"
                  sx={{
                    position: 'absolute', bottom: -12, left: 4, maxWidth: '90%',
                    height: 22, fontSize: '0.7rem', fontWeight: 600,
                    bgcolor: 'rgba(255,255,255,0.92)', border: '1px solid rgba(124,58,237,0.45)',
                    color: '#5B21B6', '& .MuiChip-label': { px: 1 },
                  }}
                />
              </Box>
            ))}
          </Box>
        )}

        {/* Old AI overlay annotation labels (backwards compat, read-only on overlay tab) */}
        {activeTab === 'overlay' && !overlayImageUrl && overlayAnnotations?.map((ann, i) => {
          const pos = AREA_POSITIONS[ann.area] || AREA_POSITIONS['center'];
          return (
            <Box
              key={i}
              sx={{
                position: 'absolute', top: pos.top, left: pos.left,
                transform: 'translate(-50%, -50%)', pointerEvents: 'none', zIndex: 2,
              }}
            >
              <Chip
                label={ann.label}
                size="small"
                color={SEVERITY_COLORS[ann.severity] || 'warning'}
                sx={{ fontWeight: 700, fontSize: '0.7rem', boxShadow: '0 1px 4px rgba(0,0,0,0.35)', opacity: 0.92 }}
              />
            </Box>
          );
        })}

        <Menu
          anchorEl={copyMenuAnchor}
          open={Boolean(copyMenuAnchor)}
          onClose={() => setCopyMenuAnchor(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        >
          {isEditMode && (
            <Box sx={{ px: 2, py: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
              <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ mb: 0.75, display: 'block' }}>
                MEDIUM
              </Typography>
              <Box sx={{ display: 'flex', gap: 0.5, mb: 1.5 }}>
                {(Object.entries(MEDIUM_LABELS) as [DrawingMedium, string][]).map(([key, label]) => (
                  <Chip
                    key={key}
                    label={label}
                    size="small"
                    variant={medium === key ? 'filled' : 'outlined'}
                    color={medium === key ? 'primary' : 'default'}
                    onClick={() => setMedium(key)}
                    sx={{ fontSize: '0.68rem', height: 24, cursor: 'pointer' }}
                  />
                ))}
              </Box>
              <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ mb: 0.75, display: 'block' }}>
                LEVEL
              </Typography>
              <Box sx={{ display: 'flex', gap: 0.5 }}>
                {(Object.entries(LEVEL_LABELS) as [SkillLevel, string][]).map(([key, label]) => (
                  <Chip
                    key={key}
                    label={label}
                    size="small"
                    variant={level === key ? 'filled' : 'outlined'}
                    color={level === key ? 'secondary' : 'default'}
                    onClick={() => setLevel(key)}
                    sx={{ fontSize: '0.68rem', height: 24, cursor: 'pointer' }}
                  />
                ))}
              </Box>
            </Box>
          )}
          <MenuItem onClick={handleCopyImage}>
            <ListItemIcon><ImageOutlinedIcon fontSize="small" /></ListItemIcon>
            <ListItemText primary="Copy Image Only" secondary="Copies the displayed image" />
          </MenuItem>
          {isEditMode && (
            <>
              <MenuItem onClick={() => handleCopyPrompt('annotation')} sx={{ borderTop: '1px solid', borderColor: 'divider' }}>
                <ListItemIcon><DescriptionOutlinedIcon fontSize="small" /></ListItemIcon>
                <ListItemText
                  primary={`${PROMPT_TYPE_LABELS.annotation.icon} Annotation Prompt`}
                  secondary={`Arrows, circles, labels on drawing${regionAnnotations.length ? ` (${regionAnnotations.length} area${regionAnnotations.length > 1 ? 's' : ''} marked)` : ''}`}
                />
              </MenuItem>
              <MenuItem onClick={() => handleCopyPrompt('reference')}>
                <ListItemIcon><DescriptionOutlinedIcon fontSize="small" /></ListItemIcon>
                <ListItemText
                  primary={`${PROMPT_TYPE_LABELS.reference.icon} Reference Prompt`}
                  secondary={`Corrected ${LEVEL_LABELS[level].toLowerCase()} version`}
                />
              </MenuItem>
              <MenuItem onClick={() => handleCopyPrompt('feedback')}>
                <ListItemIcon><DescriptionOutlinedIcon fontSize="small" /></ListItemIcon>
                <ListItemText
                  primary={`${PROMPT_TYPE_LABELS.feedback.icon} Feedback Prompt`}
                  secondary="Written evaluation with rating"
                />
              </MenuItem>
            </>
          )}
          {!studentView && (
            <MenuItem onClick={() => { window.open('https://gemini.google.com', '_blank'); setCopyMenuAnchor(null); }} sx={{ borderTop: '1px solid', borderColor: 'divider' }}>
              <ListItemIcon><OpenInNewIcon fontSize="small" /></ListItemIcon>
              <ListItemText primary="Open Gemini" />
            </MenuItem>
          )}
        </Menu>

        {/* Pencil tools button (bottom-left, visible in edit mode on original tab) */}
        {isEditMode && activeTab === 'original' && rotation === 0 && (
          <>
            <IconButton
              onClick={annotateMode ? () => setAnnotateMode(false) : (e) => setPencilMenuAnchor(e.currentTarget)}
              size="small"
              aria-label={annotateMode ? 'Exit annotate' : 'Markup tools'}
              sx={{
                position: 'absolute', bottom: 8, left: 8, zIndex: 6,
                bgcolor: annotateMode ? '#1976d2' : 'rgba(0,0,0,0.55)',
                color: '#fff',
                backdropFilter: 'blur(4px)',
                '&:hover': { bgcolor: annotateMode ? '#1565c0' : 'rgba(0,0,0,0.75)' },
                width: 36, height: 36,
                transition: 'background-color 0.2s',
              }}
            >
              {annotateMode ? <EditOffIcon sx={{ fontSize: 18 }} /> : <EditOutlinedIcon sx={{ fontSize: 18 }} />}
            </IconButton>
            <Menu
              anchorEl={pencilMenuAnchor}
              open={Boolean(pencilMenuAnchor)}
              onClose={() => setPencilMenuAnchor(null)}
              anchorOrigin={{ vertical: 'top', horizontal: 'left' }}
              transformOrigin={{ vertical: 'bottom', horizontal: 'left' }}
            >
              <MenuItem onClick={() => { setAnnotateMode(true); setPencilMenuAnchor(null); }}>
                <ListItemIcon><GestureIcon fontSize="small" /></ListItemIcon>
                <ListItemText primary="Annotate regions" secondary="Mark areas with comments" />
              </MenuItem>
              {onOpenSketch && (
                <MenuItem onClick={() => { onOpenSketch(); setPencilMenuAnchor(null); }}>
                  <ListItemIcon><BrushOutlinedIcon fontSize="small" /></ListItemIcon>
                  <ListItemText primary="Draw on image" secondary="Sketch corrections over drawing" />
                </MenuItem>
              )}
            </Menu>
          </>
        )}

        {/* Annotation count badge (bottom-left, next to pencil button) */}
        {isEditMode && activeTab === 'original' && rotation === 0 && regionAnnotations.length > 0 && (
          <Box sx={{
            position: 'absolute', bottom: 12, left: 52, zIndex: 6,
            bgcolor: 'rgba(0,0,0,0.6)', borderRadius: 1, px: 1, py: 0.25,
          }}>
            <Typography variant="caption" sx={{ color: '#fff', fontWeight: 600, fontSize: '0.7rem' }}>
              {regionAnnotations.length} area{regionAnnotations.length > 1 ? 's' : ''} marked
            </Typography>
          </Box>
        )}

        {/* Caption for reference image */}
        {activeTab === 'corrected' && !imgError && rotation === 0 && (
          <Box sx={{
            position: 'absolute', bottom: 8, left: 0, right: 0,
            display: 'flex', justifyContent: 'center',
          }}>
            <Box sx={{ bgcolor: 'rgba(0,0,0,0.55)', borderRadius: 1, px: 1.5, py: 0.4 }}>
              <Typography variant="caption" sx={{ color: '#fff', fontWeight: 600 }}>
                Teacher Reference
              </Typography>
            </Box>
          </Box>
        )}

        {/* Rotate button (bottom-right, clear of the pencil FAB and its badge) */}
        {canRotate && (
          <Tooltip title="Rotate 90°" placement="top">
            <span style={{ position: 'absolute', bottom: 8, right: 8, zIndex: 6 }}>
              <IconButton
                onClick={handleRotateStep}
                disabled={rotationSaving}
                aria-label="Rotate image 90 degrees"
                sx={{
                  width: { xs: 48, md: 40 },
                  height: { xs: 48, md: 40 },
                  bgcolor: rotation !== 0 ? '#1976d2' : 'rgba(0,0,0,0.55)',
                  color: '#fff',
                  backdropFilter: 'blur(4px)',
                  cursor: 'pointer',
                  '&:hover': { bgcolor: rotation !== 0 ? '#1565c0' : 'rgba(0,0,0,0.75)' },
                  '&.Mui-disabled': { bgcolor: 'rgba(0,0,0,0.35)', color: 'rgba(255,255,255,0.5)' },
                  transition: 'background-color 0.2s',
                }}
              >
                <RotateRightIcon sx={{ fontSize: 20 }} />
              </IconButton>
            </span>
          </Tooltip>
        )}

        {/* Confirm bar, only once a turn is pending. Sits left of the rotate
            button so both stay reachable at 375px. */}
        {canRotate && rotation !== 0 && (
          <Box
            sx={{
              position: 'absolute',
              bottom: 8,
              left: 8,
              right: { xs: 64, md: 56 },
              zIndex: 7,
              bgcolor: 'rgba(0,0,0,0.78)',
              backdropFilter: 'blur(6px)',
              borderRadius: 2,
              px: 1.25,
              py: 1,
              display: 'flex',
              flexDirection: 'column',
              gap: 0.75,
            }}
          >
            {annotationsAtRisk > 0 && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <WarningAmberIcon sx={{ fontSize: 16, color: '#ffb74d', flexShrink: 0 }} />
                <Typography variant="caption" sx={{ color: '#ffe0b2', fontWeight: 600, lineHeight: 1.4 }}>
                  Saving clears your {annotationsAtRisk} marked area
                  {annotationsAtRisk > 1 ? 's' : ''}
                </Typography>
              </Box>
            )}

            {rotationError && (
              <Typography variant="caption" sx={{ color: '#ef9a9a', fontWeight: 600, lineHeight: 1.4 }}>
                {rotationError}
              </Typography>
            )}

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Button
                size="small"
                onClick={() => { setRotation(0); setRotationError(''); }}
                disabled={rotationSaving}
                sx={{
                  minHeight: 40, flex: 1, textTransform: 'none', fontWeight: 600,
                  color: '#fff', borderColor: 'rgba(255,255,255,0.4)',
                }}
                variant="outlined"
              >
                Cancel
              </Button>
              <Button
                size="small"
                variant="contained"
                onClick={handleSaveRotation}
                disabled={rotationSaving}
                startIcon={rotationSaving ? <CircularProgress size={14} color="inherit" /> : undefined}
                sx={{ minHeight: 40, flex: 1.4, textTransform: 'none', fontWeight: 700 }}
              >
                {rotationSaving ? 'Saving' : 'Save rotation'}
              </Button>
            </Box>
          </Box>
        )}
      </Box>

      {/* Prompt copied banner (Snackbar) - teacher only */}
      <Snackbar
        open={!!promptBanner}
        autoHideDuration={8000}
        onClose={() => setPromptBanner(false)}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        message={
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <CheckIcon sx={{ fontSize: 18, color: '#4caf50' }} />
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {promptBanner} prompt copied! {isMobile ? 'Long-press' : 'Right-click'} the image to copy it, then paste both into Gemini.
            </Typography>
            <Button
              size="small"
              variant="outlined"
              startIcon={<OpenInNewIcon />}
              onClick={() => { window.open('https://gemini.google.com', '_blank'); setPromptBanner(false); }}
              sx={{ textTransform: 'none', ml: 1, color: '#fff', borderColor: 'rgba(255,255,255,0.5)' }}
            >
              Open Gemini
            </Button>
          </Box>
        }
        sx={{
          '& .MuiSnackbarContent-root': {
            bgcolor: '#1a1a1a',
            maxWidth: isMobile ? '95vw' : 600,
          },
        }}
      />

      {/* Rotation saved banner */}
      <Snackbar
        open={rotationSaved}
        autoHideDuration={2500}
        onClose={() => setRotationSaved(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        message={
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <CheckIcon sx={{ fontSize: 16, color: '#4caf50' }} />
            <Typography variant="body2" fontWeight={600}>Rotation saved</Typography>
          </Box>
        }
        sx={{ '& .MuiSnackbarContent-root': { bgcolor: '#1a1a1a', minWidth: 'auto' } }}
      />

      {/* Image copied banner (student view) */}
      <Snackbar
        open={copiedBanner}
        autoHideDuration={2500}
        onClose={() => setCopiedBanner(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        message={
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <CheckIcon sx={{ fontSize: 16, color: '#4caf50' }} />
            <Typography variant="body2" fontWeight={600}>Image copied to clipboard</Typography>
          </Box>
        }
        sx={{
          '& .MuiSnackbarContent-root': { bgcolor: '#1a1a1a', minWidth: 'auto' },
        }}
      />
    </Box>
  );
}
