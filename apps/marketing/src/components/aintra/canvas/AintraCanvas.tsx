'use client';

import { useMemo } from 'react';
import { Box, IconButton, Tooltip, Typography } from '@neram/ui';
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import { parseAintraAnswer } from '@/lib/aintra/rich/parse';
import { answerToPlainText } from '@/lib/aintra/rich/plain';
import AintraRichText from '../rich/AintraRichText';
import CopyButton from '../rich/CopyButton';

export interface CanvasDoc {
  /** The message this canvas shows, so re-opening the same one is a no-op. */
  messageId: string;
  title: string;
  text: string;
}

interface Props {
  doc: CanvasDoc;
  /** 'side' beside the chat on wide screens; 'overlay' over it on phones and tablets. */
  mode: 'side' | 'overlay';
  onClose: () => void;
}

/**
 * The canvas: one answer at reading width, the way Claude shows an artifact.
 * Tables stay tables here (no card fallback), type is a step larger, and the
 * toolbar can copy the answer or send it to a parent on WhatsApp.
 */
export default function AintraCanvas({ doc, mode, onClose }: Props) {
  const parsed = useMemo(() => parseAintraAnswer(doc.text), [doc.text]);
  const plain = () => `${doc.title}\n\n${answerToPlainText(parsed)}`;

  const share = () => {
    const text = `${plain()}\n\nFrom Aintra, the Neram Classes assistant: https://neramclasses.com`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
  };

  return (
    <Box
      component="section"
      aria-label={`Canvas: ${doc.title}`}
      data-testid="aintra-canvas"
      data-mode={mode}
      sx={{ display: 'flex', flexDirection: 'column', height: '100%', minWidth: 0, bgcolor: 'background.paper' }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
          px: 1,
          minHeight: 60,
          borderBottom: '1px solid',
          borderColor: 'divider',
          flexShrink: 0,
        }}
      >
        {mode === 'overlay' && (
          <IconButton aria-label="Back to chat" onClick={onClose} sx={{ width: 44, height: 44 }}>
            <ArrowBackRoundedIcon />
          </IconButton>
        )}
        <Box sx={{ minWidth: 0, flex: 1, pl: mode === 'side' ? 1.5 : 0 }}>
          <Typography component="p" sx={{ fontSize: '0.75rem', fontWeight: 600, color: 'text.secondary', lineHeight: 1.2 }}>
            Canvas
          </Typography>
          <Typography component="h2" noWrap sx={{ fontSize: '1rem', fontWeight: 700, lineHeight: 1.35 }}>
            {doc.title}
          </Typography>
        </Box>
        <CopyButton getText={plain} label="Copy answer" />
        <Tooltip title="Share on WhatsApp">
          <IconButton aria-label="Share on WhatsApp" onClick={share} sx={{ width: 44, height: 44, color: '#0F7A3D' }}>
            <WhatsAppIcon sx={{ fontSize: 20 }} />
          </IconButton>
        </Tooltip>
        {mode === 'side' && (
          <Tooltip title="Close canvas">
            <IconButton aria-label="Close canvas" onClick={onClose} sx={{ width: 44, height: 44 }}>
              <CloseRoundedIcon />
            </IconButton>
          </Tooltip>
        )}
      </Box>

      <Box sx={{ flex: 1, overflowY: 'auto', overscrollBehavior: 'contain', px: { xs: 2, sm: 3, md: 4 }, py: { xs: 2.5, md: 3.5 } }}>
        <Box sx={{ maxWidth: 760, mx: 'auto' }}>
          <AintraRichText parsed={parsed} variant="canvas" />
        </Box>
      </Box>
    </Box>
  );
}
