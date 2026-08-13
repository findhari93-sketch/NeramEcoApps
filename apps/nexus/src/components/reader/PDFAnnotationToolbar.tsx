'use client';

import { Box, Drawer, IconButton, Tooltip, Typography, Button, useMediaQuery, useTheme } from '@neram/ui';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import BorderColorIcon from '@mui/icons-material/BorderColor';
import StickyNote2OutlinedIcon from '@mui/icons-material/StickyNote2Outlined';
import AutoFixOffOutlinedIcon from '@mui/icons-material/AutoFixOffOutlined';
import UndoIcon from '@mui/icons-material/Undo';
import type { AnnotationTool } from './PDFAnnotationLayer';

export const ANNOTATION_COLORS = ['#FFD54F', '#A5D6A7', '#F48FB1', '#90CAF9', '#FFAB91'];

const TOOLS: { value: AnnotationTool; label: string; icon: React.ReactNode }[] = [
  { value: 'highlighter', label: 'Highlighter', icon: <BorderColorIcon fontSize="small" /> },
  { value: 'pen', label: 'Pen', icon: <EditOutlinedIcon fontSize="small" /> },
  { value: 'note', label: 'Note', icon: <StickyNote2OutlinedIcon fontSize="small" /> },
  { value: 'eraser', label: 'Eraser', icon: <AutoFixOffOutlinedIcon fontSize="small" /> },
];

interface PDFAnnotationToolbarProps {
  open: boolean;
  /**
   * DOM node to portal the Drawer into (PDFReader's own outer element, the same
   * one that receives requestFullscreen()). Without this the Drawer portals to
   * document.body by default, which renders behind any Dialog wrapping the reader
   * and disappears entirely in fullscreen, since the Fullscreen API only paints
   * the fullscreen element's actual DOM descendants.
   */
  container?: HTMLElement | null;
  tool: AnnotationTool;
  color: string;
  canUndo: boolean;
  onToolChange: (tool: AnnotationTool) => void;
  onColorChange: (color: string) => void;
  onUndo: () => void;
  onDone: () => void;
}

/**
 * Tool/color picker for marking up a PDF: Pen, Highlighter, Note, Eraser, five preset
 * colors, Undo (removes the last mark made this session), and Done to leave annotate
 * mode. Bottom sheet on mobile, side panel on desktop, mirroring RecapSettingsSheet.
 */
export default function PDFAnnotationToolbar({
  open,
  container,
  tool,
  color,
  canUndo,
  onToolChange,
  onColorChange,
  onUndo,
  onDone,
}: PDFAnnotationToolbarProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  return (
    <Drawer
      anchor={isMobile ? 'bottom' : 'right'}
      open={open}
      onClose={onDone}
      container={container}
      PaperProps={{
        sx: isMobile
          ? { borderTopLeftRadius: 16, borderTopRightRadius: 16 }
          : { width: 280 },
      }}
    >
      <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Typography sx={{ fontWeight: 700, fontSize: '0.95rem' }}>Mark up this page</Typography>

        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1 }}>
          {TOOLS.map((t) => (
            <Box
              key={t.value}
              component="button"
              onClick={() => onToolChange(t.value)}
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 0.5,
                minHeight: 56,
                borderRadius: 2,
                border: '1px solid',
                borderColor: tool === t.value ? 'primary.main' : 'divider',
                bgcolor: tool === t.value ? 'action.selected' : 'background.paper',
                color: tool === t.value ? 'primary.main' : 'text.primary',
                cursor: 'pointer',
                fontSize: '0.65rem',
                fontWeight: 600,
              }}
            >
              {t.icon}
              {t.label}
            </Box>
          ))}
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {ANNOTATION_COLORS.map((c) => (
            <Box
              key={c}
              component="button"
              aria-label={`Color ${c}`}
              onClick={() => onColorChange(c)}
              sx={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                bgcolor: c,
                border: color === c ? '3px solid' : '1px solid',
                borderColor: color === c ? 'text.primary' : 'divider',
                cursor: 'pointer',
                p: 0,
              }}
            />
          ))}
        </Box>

        <Box sx={{ display: 'flex', gap: 1 }}>
          <Tooltip title="Undo the last mark">
            <span>
              <IconButton onClick={onUndo} disabled={!canUndo} sx={{ width: 48, height: 48 }}>
                <UndoIcon />
              </IconButton>
            </span>
          </Tooltip>
          <Button
            variant="contained"
            fullWidth
            onClick={onDone}
            sx={{ minHeight: 48, textTransform: 'none', fontWeight: 700 }}
          >
            Done
          </Button>
        </Box>
      </Box>
    </Drawer>
  );
}
