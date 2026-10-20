'use client';

import { useMemo } from 'react';
import { Box, Divider, Typography } from '@neram/ui';
import { alpha } from '@mui/material/styles';
import { parseAintraAnswer, type Block, type ParsedAnswer } from '@/lib/aintra/rich/parse';
import InlineText from './InlineText';
import AintraTable from './AintraTable';
import FeeCards from './FeeCards';
import ActionButtons from './ActionButtons';
import BookingBlock from './booking/BookingBlock';
import { formatBookMarker, type BookSuggestion } from '@/lib/aintra/booking';

export interface AintraRichTextProps {
  /** The raw answer. Ignored when `parsed` is given. */
  text?: string;
  parsed?: ParsedAnswer;
  streaming?: boolean;
  /** 'chat' in the message list, 'canvas' in the wide reading pane. */
  variant?: 'chat' | 'canvas';
  /** Offered on tables and fee cards in the chat; opens this answer in the canvas. */
  onOpenCanvas?: () => void;
}

/**
 * Renders an Aintra answer: text, lists, tables, fee cards and buttons.
 *
 * Used by the site-wide Aintra drawer (message list and canvas) and by the NATA
 * chatbot, which used to carry its own copy of the old renderer.
 */
export default function AintraRichText({ text = '', parsed, streaming, variant = 'chat', onOpenCanvas }: AintraRichTextProps) {
  const answer = useMemo(() => withoutRepeatedActions(parsed ?? parseAintraAnswer(text, { streaming })), [parsed, text, streaming]);
  const canvas = variant === 'canvas';
  const body = canvas ? { fontSize: '1.0625rem', lineHeight: 1.7 } : { fontSize: '1rem', lineHeight: 1.6 };

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: canvas ? 1.75 : 1.25,
        color: 'text.primary',
        minWidth: 0,
        overflowWrap: 'break-word',
      }}
    >
      {answer.blocks.map((block, i) => (
        // A booking card keeps its key while the answer streams, so a half-filled card is never reset.
        <BlockView key={block.type === 'book' ? bookKey(block.suggestion) : i} block={block} body={body} variant={variant} onOpenCanvas={onOpenCanvas} first={i === 0} />
      ))}
    </Box>
  );
}

/**
 * A card a booking tool filled in arrives once, at the end of the answer, and
 * replaces any plain card the model wrote: a new key so it opens with the
 * tool's values instead of keeping the plain card's state.
 */
function bookKey(s: BookSuggestion): string {
  return s.draft || s.change ? `book-${s.kind}-${formatBookMarker(s)}` : `book-${s.kind}`;
}

/**
 * Fee cards carry their own Apply and Demo buttons. When the model also adds
 * [[cta:apply,demo]] under them, the same two buttons show twice in a row.
 */
function withoutRepeatedActions(answer: ParsedAnswer): ParsedAnswer {
  const fees = answer.blocks.some((b) => b.type === 'fees');
  // A booking card already is the demo or call button.
  const bookDemo = answer.blocks.some((b) => b.type === 'book' && (b.suggestion.kind === 'demo' || b.suggestion.kind === 'cancel-demo'));
  const bookCall = answer.blocks.some((b) => b.type === 'book' && b.suggestion.kind === 'callback');
  const bookApply = answer.blocks.some((b) => b.type === 'book' && b.suggestion.kind === 'apply');
  if (!fees && !bookDemo && !bookCall && !bookApply) return answer;
  const blocks = answer.blocks.flatMap((b): Block[] => {
    if (b.type !== 'cta') return [b];
    const actions = b.actions.filter(
      (a) =>
        !(fees && (a === 'apply' || a === 'demo')) &&
        !(bookDemo && a === 'demo') &&
        !(bookCall && a === 'call') &&
        !(bookApply && a === 'apply'),
    );
    return actions.length ? [{ ...b, actions }] : [];
  });
  return { ...answer, blocks };
}

function BlockView({
  block,
  body,
  variant,
  onOpenCanvas,
  first,
}: {
  block: Block;
  body: { fontSize: string; lineHeight: number };
  variant: 'chat' | 'canvas';
  onOpenCanvas?: () => void;
  first: boolean;
}) {
  switch (block.type) {
    case 'heading': {
      const big = block.level <= 2;
      return (
        <Typography
          component={block.level <= 2 ? 'h3' : 'h4'}
          sx={{
            fontSize: variant === 'canvas' ? (big ? '1.375rem' : '1.125rem') : big ? '1.125rem' : '1rem',
            fontWeight: 700,
            lineHeight: 1.35,
            mt: first ? 0 : 0.75,
          }}
        >
          <InlineText text={block.text} />
        </Typography>
      );
    }
    case 'paragraph':
      return (
        <Typography component="p" sx={{ ...body, m: 0, whiteSpace: 'pre-line' }}>
          <InlineText text={block.text} />
        </Typography>
      );
    case 'list':
      return (
        <Box
          component={block.ordered ? 'ol' : 'ul'}
          {...(block.ordered && block.start !== 1 ? { start: block.start } : {})}
          sx={{
            m: 0,
            pl: 3,
            display: 'flex',
            flexDirection: 'column',
            gap: 0.5,
            '& li': { ...body, pl: 0.25, whiteSpace: 'pre-line' },
            '& li::marker': { color: 'primary.main', fontWeight: 700 },
          }}
        >
          {block.items.map((item, i) => (
            <Box
              component="li"
              key={i}
              sx={item.depth > 0 ? { ml: 2.5, listStyleType: block.ordered ? 'lower-alpha' : 'circle', color: 'text.secondary' } : undefined}
            >
              <InlineText text={item.text} />
            </Box>
          ))}
        </Box>
      );
    case 'table':
      return (
        <AintraTable header={block.header} align={block.align} rows={block.rows} variant={variant} onOpenCanvas={onOpenCanvas} />
      );
    case 'quote':
      return (
        <Box
          sx={(theme) => ({
            ...body,
            borderLeft: '3px solid',
            borderColor: 'primary.main',
            bgcolor: alpha(theme.palette.primary.main, 0.05),
            borderRadius: '0 8px 8px 0',
            px: 1.75,
            py: 1.25,
            whiteSpace: 'pre-line',
          })}
        >
          <InlineText text={block.text} />
        </Box>
      );
    case 'code':
      return (
        <Box
          component="pre"
          sx={{
            m: 0,
            p: 1.5,
            borderRadius: 2,
            bgcolor: 'grey.100',
            overflowX: 'auto',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            fontSize: '0.875rem',
            lineHeight: 1.6,
          }}
        >
          {block.text}
        </Box>
      );
    case 'hr':
      return <Divider />;
    case 'fees':
      return <FeeCards ids={block.ids} variant={variant} onOpenCanvas={onOpenCanvas} />;
    case 'cta':
      return <ActionButtons actions={block.actions} />;
    case 'book':
      return <BookingBlock suggestion={block.suggestion} interactive={variant === 'chat'} />;
    default:
      return null;
  }
}
