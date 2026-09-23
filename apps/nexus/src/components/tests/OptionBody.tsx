'use client';

import { useState } from 'react';
import { Box } from '@neram/ui';
import MathText from '@/components/common/MathText';
import FigureViewer from '@/components/question-bank/FigureViewer';
import { textSaysNothingBeyondFigure } from '@/lib/qb-image-needs';

export interface TestOption {
  id?: string;
  label?: string;
  text: string;
  image_url?: string;
}

interface OptionBodyProps {
  option: TestOption;
  /** A, B, C... Used for the alt text, so a figure option is not unlabelled. */
  letter: string;
  /** The review list, where a figure is a reminder rather than the thing being judged. */
  compact?: boolean;
  /**
   * The option sits in a grid of figures rather than in a full width row, so
   * the picture is centred at its own size instead of stretched to the card,
   * and a label that only reads "Figure (1)" is dropped.
   */
  grid?: boolean;
}

/**
 * What one answer option actually says: its text, its figure, or both.
 *
 * The figure is the part that used to go missing (NXS-0115). `image_url` has
 * always been on the option and has always been carried through the API, but
 * neither the answer cards nor the post-submit review ever read it. A "choose
 * the correct top view" question therefore rendered as four blank rows reading
 * "Option figure (1)" to "Option figure (4)", which is unanswerable on its own
 * terms.
 *
 * Shared by the player and the review so the two cannot drift apart again.
 */
export default function OptionBody({ option, letter, compact, grid }: OptionBodyProps) {
  const hasText = Boolean(option.text && option.text.trim());
  const showText = hasText && !(grid && Boolean(option.image_url) && textSaysNothingBeyondFigure(option.text));
  const [zoomed, setZoomed] = useState(false);
  return (
    <>
      {showText && (
        <MathText
          text={option.text}
          variant="body2"
          sx={{ fontSize: { xs: '0.875rem', md: '0.95rem' } }}
        />
      )}
      {option.image_url && (
        <Box
          component="img"
          src={option.image_url}
          alt={`Option ${letter}`}
          loading="lazy"
          // The option sits inside a clickable Paper that selects it as the
          // answer on click, so a tap meant to zoom must not also answer.
          onClick={(e) => {
            e.stopPropagation();
            setZoomed(true);
          }}
          sx={{
            display: 'block',
            mt: showText ? 0.75 : 0,
            // Never stretched past its own pixels. The source scans are 79 to
            // 280px across, and blowing one up to fill a 375px screen is the
            // "pixelated" look the founder reported. In a grid the cards are
            // already about the size of the picture, and the viewer is there
            // for a closer look.
            width: compact || grid ? 'auto' : '100%',
            mx: grid ? 'auto' : 0,
            maxWidth: '100%',
            maxHeight: compact ? 96 : grid ? 200 : 180,
            objectFit: 'contain',
            objectPosition: grid ? 'center' : 'left',
            borderRadius: 1,
            // Bank figures are line art on transparent, invisible on a dark card.
            bgcolor: 'common.white',
            cursor: 'zoom-in',
          }}
        />
      )}
      {option.image_url && (
        <FigureViewer
          open={zoomed}
          onClose={() => setZoomed(false)}
          src={option.image_url}
          label={`Option ${letter}`}
          caption={hasText && !textSaysNothingBeyondFigure(option.text) ? option.text : null}
        />
      )}
    </>
  );
}
