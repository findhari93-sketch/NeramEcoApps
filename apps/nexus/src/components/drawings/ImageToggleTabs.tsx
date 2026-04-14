'use client';

import { useState } from 'react';
import {
  Box, ToggleButton, ToggleButtonGroup, Chip, Typography, IconButton,
  Tooltip, Badge, Menu, MenuItem, ListItemIcon, ListItemText, Snackbar,
  Button, useTheme, useMediaQuery,
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
import RegionAnnotationLayer from './RegionAnnotationLayer';
import {
  type DrawingMedium, type SkillLevel, type RegionAnnotation,
  MEDIUM_LABELS, LEVEL_LABELS, buildCombinedPrompt, getMediumFromCategory,
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
}

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
}: ImageToggleTabsProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const hasOverlay = !!(overlayAnnotations?.length || overlayImageUrl);
  const hasCorrected = !!correctedImageUrl;

  const [tab, setTab] = useState<'original' | 'overlay' | 'corrected'>('original');
  const [imgError, setImgError] = useState(false);
  const [annotateMode, setAnnotateMode] = useState(false);

  // Smart copy menu state
  const [copyMenuAnchor, setCopyMenuAnchor] = useState<null | HTMLElement>(null);
  const [promptBanner, setPromptBanner] = useState(false);

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

  const handleCopyImage = async () => {
    try {
      const res = await fetch(displayImageUrl);
      const blob = await res.blob();
      const pngBlob = blob.type === 'image/png' ? blob : await convertToPng(blob);
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })]);
    } catch { /* clipboard may be denied */ }
    setCopyMenuAnchor(null);
  };

  const handleCopyWithPrompt = async () => {
    const prompt = buildCombinedPrompt(medium, level, regionAnnotations, questionContext);
    try {
      await navigator.clipboard.writeText(prompt);
      setPromptBanner(true);
    } catch { /* clipboard may be denied */ }
    setCopyMenuAnchor(null);
  };

  const showAnnotateOnOriginal = isEditMode && activeTab === 'original' && annotateMode;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height, width: '100%' }}>
      {/* Toggle row */}
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', pb: 1, gap: 1, flexShrink: 0, flexWrap: 'wrap' }}>
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

        {/* Medium / Level chips (visible in edit mode) */}
        {isEditMode && activeTab === 'original' && (
          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', justifyContent: 'center' }}>
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
            <Box sx={{ width: 1, borderLeft: '1px solid rgba(255,255,255,0.3)', mx: 0.25 }} />
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
        )}
      </Box>

      {/* Image area */}
      <Box sx={{
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
            src={displayImageUrl}
            alt="Drawing"
            onError={() => setImgError(true)}
            sx={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', display: 'block' }}
          />
        )}

        {/* Region annotation layer (only on original tab in edit+annotate mode) */}
        {showAnnotateOnOriginal && onRegionAnnotationsChange && (
          <RegionAnnotationLayer
            annotations={regionAnnotations}
            onChange={onRegionAnnotationsChange}
          />
        )}

        {/* Show region annotations as read-only (no edit popover) when not in annotate mode but annotations exist */}
        {activeTab === 'original' && !annotateMode && regionAnnotations.length > 0 && (
          <Box sx={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 4 }}>
            {regionAnnotations.map((ann) => (
              <Box
                key={ann.id}
                sx={{
                  position: 'absolute',
                  left: `${ann.x}%`,
                  top: `${ann.y}%`,
                  width: `${ann.width}%`,
                  height: `${ann.height}%`,
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

        {/* Smart copy menu button (top-right) */}
        {!imgError && (
          <Tooltip title="Copy options" placement="left">
            <IconButton
              onClick={(e) => setCopyMenuAnchor(e.currentTarget)}
              size="small"
              sx={{
                position: 'absolute', top: 8, right: 8, zIndex: 6,
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

        <Menu
          anchorEl={copyMenuAnchor}
          open={Boolean(copyMenuAnchor)}
          onClose={() => setCopyMenuAnchor(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        >
          <MenuItem onClick={handleCopyImage}>
            <ListItemIcon><ImageOutlinedIcon fontSize="small" /></ListItemIcon>
            <ListItemText primary="Copy Image Only" secondary="Copies the displayed image" />
          </MenuItem>
          {isEditMode && (
            <MenuItem onClick={handleCopyWithPrompt}>
              <ListItemIcon><DescriptionOutlinedIcon fontSize="small" /></ListItemIcon>
              <ListItemText
                primary="Copy AI Prompt"
                secondary={`${MEDIUM_LABELS[medium]}, ${LEVEL_LABELS[level]}${regionAnnotations.length ? ` + ${regionAnnotations.length} annotation${regionAnnotations.length > 1 ? 's' : ''}` : ''}`}
              />
            </MenuItem>
          )}
          <MenuItem onClick={() => { window.open('https://gemini.google.com', '_blank'); setCopyMenuAnchor(null); }}>
            <ListItemIcon><OpenInNewIcon fontSize="small" /></ListItemIcon>
            <ListItemText primary="Open Gemini" />
          </MenuItem>
        </Menu>

        {/* Annotate toggle button (bottom-left, visible in edit mode on original tab) */}
        {isEditMode && activeTab === 'original' && (
          <Tooltip title={annotateMode ? 'Stop annotating' : 'Annotate drawing'} placement="right">
            <IconButton
              onClick={() => setAnnotateMode(!annotateMode)}
              size="small"
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
          </Tooltip>
        )}

        {/* Annotation count badge (bottom-left, next to annotate button) */}
        {isEditMode && activeTab === 'original' && regionAnnotations.length > 0 && (
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
        {activeTab === 'corrected' && !imgError && (
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
      </Box>

      {/* Prompt copied banner (Snackbar) */}
      <Snackbar
        open={promptBanner}
        autoHideDuration={8000}
        onClose={() => setPromptBanner(false)}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        message={
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <CheckIcon sx={{ fontSize: 18, color: '#4caf50' }} />
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              Prompt copied! Now {isMobile ? 'long-press' : 'right-click'} the image to copy it, then paste both into Gemini.
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
    </Box>
  );
}
