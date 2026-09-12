'use client';

/**
 * The row that chooses what fills a phone screen in the chapter viewer.
 *
 * With slides it reads PDF, Slides, Notes, Comments: one level, an icon over a
 * short label, so four targets fit a 375px screen at full height. Without slides
 * it stays Document, Notes, Comments as before, the icon beside the label.
 *
 * Desktop never shows this row. The document is always on screen there, PDF or
 * Slides is chosen in the viewer header, and the side rail has its own tabs.
 */

import { ToggleButton, ToggleButtonGroup } from '@neram/ui';
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined';
import ImageOutlinedIcon from '@mui/icons-material/ImageOutlined';
import SlideshowOutlinedIcon from '@mui/icons-material/SlideshowOutlined';
import StickyNote2OutlinedIcon from '@mui/icons-material/StickyNote2Outlined';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';

export type ReaderTabValue = 'pdf' | 'slides' | 'notes' | 'comments';

interface ReaderTabsProps {
  value: ReaderTabValue;
  onChange: (value: ReaderTabValue) => void;
  hasSlides: boolean;
  /** The chapter file's kind, so an image is never labelled a PDF. */
  kind: string;
}

export default function ReaderTabs({ value, onChange, hasSlides, kind }: ReaderTabsProps) {
  const isPdf = kind === 'pdf';
  return (
    <ToggleButtonGroup
      value={value}
      exclusive
      onChange={(_, v: ReaderTabValue | null) => {
        if (v) onChange(v);
      }}
      fullWidth
      size="small"
      aria-label="Chapter view"
      sx={{
        p: 1,
        flexShrink: 0,
        '& .MuiToggleButton-root': hasSlides
          ? { minHeight: 52, px: 0.5, py: 0.5, textTransform: 'none', flexDirection: 'column', gap: 0.25, fontSize: 12, lineHeight: 1.2 }
          : { minHeight: 48, textTransform: 'none', gap: 0.5 },
      }}
    >
      <ToggleButton value="pdf">
        {isPdf ? <PictureAsPdfOutlinedIcon fontSize="small" /> : <ImageOutlinedIcon fontSize="small" />}
        {hasSlides && isPdf ? 'PDF' : 'Document'}
      </ToggleButton>
      {hasSlides && (
        <ToggleButton value="slides">
          <SlideshowOutlinedIcon fontSize="small" />
          Slides
        </ToggleButton>
      )}
      <ToggleButton value="notes">
        <StickyNote2OutlinedIcon fontSize="small" />
        Notes
      </ToggleButton>
      <ToggleButton value="comments">
        <ChatBubbleOutlineIcon fontSize="small" />
        Comments
      </ToggleButton>
    </ToggleButtonGroup>
  );
}
