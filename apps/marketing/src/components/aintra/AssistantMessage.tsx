'use client';

import { memo, useMemo } from 'react';
import { Box, Button, Typography } from '@neram/ui';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import ChromeReaderModeOutlinedIcon from '@mui/icons-material/ChromeReaderModeOutlined';
import { answerTitle, isLongAnswer, parseAintraAnswer } from '@/lib/aintra/rich/parse';
import { answerToPlainText } from '@/lib/aintra/rich/plain';
import AintraRichText from './rich/AintraRichText';
import SuggestionChips from './rich/SuggestionChips';
import TypingIndicator from './rich/TypingIndicator';
import CopyButton from './rich/CopyButton';
import { tokens, brandColors } from '@/design-system';
import BotAvatar from './BotAvatar';
import type { CanvasDoc } from './canvas/AintraCanvas';

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  /** A failed answer: show a WhatsApp button under it so the visitor has a next step. */
  needsHuman?: boolean;
  /** Still arriving. */
  streaming?: boolean;
  /** What a running tool is doing, shown beside the typing dots. */
  status?: string;
  /** The visitor pressed Stop. */
  stopped?: boolean;
}

interface Props {
  msg: ChatMessage;
  /** Only the latest answer shows follow-up suggestions. */
  isLatest: boolean;
  busy: boolean;
  onOpenCanvas: (doc: CanvasDoc) => void;
  onSuggest: (question: string) => void;
  onWhatsApp: () => void;
}

/**
 * One Aintra answer. No bubble: the answer takes the full column width (as in
 * ChatGPT and Claude) so tables and fee cards have room, with a small name row
 * on top so it is still clear who is speaking.
 */
function AssistantMessage({ msg, isLatest, busy, onOpenCanvas, onSuggest, onWhatsApp }: Props) {
  const parsed = useMemo(() => parseAintraAnswer(msg.text, { streaming: msg.streaming }), [msg.text, msg.streaming]);
  const hasContent = parsed.blocks.length > 0;
  const finished = !msg.streaming && hasContent;
  const openCanvas = () => onOpenCanvas({ messageId: msg.id, title: answerTitle(parsed), text: msg.text });

  return (
    <Box
      data-role="model"
      data-testid="aintra-assistant-message"
      data-streaming={msg.streaming ? 'true' : 'false'}
      aria-busy={msg.streaming ? true : undefined}
      sx={{ alignSelf: 'stretch', display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <BotAvatar size={24} />
        <Typography component="span" sx={{ fontSize: '0.8125rem', fontWeight: 700, color: 'text.secondary' }}>
          Aintra
        </Typography>
      </Box>

      {hasContent ? (
        <AintraRichText parsed={parsed} variant="chat" onOpenCanvas={finished ? openCanvas : undefined} />
      ) : msg.streaming ? (
        <TypingIndicator status={msg.status} />
      ) : null}

      {msg.streaming && hasContent && msg.status && <TypingIndicator status={msg.status} />}

      {msg.stopped && (
        <Typography component="p" sx={{ fontSize: '0.8125rem', color: 'text.secondary', fontStyle: 'italic' }}>
          {hasContent ? 'Stopped.' : 'Stopped before an answer arrived.'}
        </Typography>
      )}

      {msg.needsHuman && (
        <Button
          onClick={onWhatsApp}
          variant="contained"
          disableElevation
          startIcon={<WhatsAppIcon sx={{ color: brandColors.whatsapp }} />}
          sx={{
            alignSelf: 'flex-start',
            minHeight: 48,
            textTransform: 'none',
            fontWeight: 700,
            borderRadius: `${tokens.radius}px`,
            bgcolor: tokens.navy900,
            color: tokens.paper,
            '&:hover': { bgcolor: tokens.navy700 },
          }}
        >
          Chat on WhatsApp
        </Button>
      )}

      {finished && !msg.needsHuman && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, ml: -1.25 }}>
          <CopyButton getText={() => answerToPlainText(parsed)} label="Copy answer" />
          {isLongAnswer(msg.text, parsed) && (
            <Button
              size="small"
              onClick={openCanvas}
              startIcon={<ChromeReaderModeOutlinedIcon sx={{ fontSize: 18 }} />}
              sx={{ minHeight: 44, textTransform: 'none', fontWeight: 600, color: 'text.secondary', px: 1.25 }}
            >
              Read in canvas
            </Button>
          )}
        </Box>
      )}

      {isLatest && !busy && finished && <SuggestionChips suggestions={parsed.suggestions} onPick={onSuggest} />}
    </Box>
  );
}

export default memo(AssistantMessage);
