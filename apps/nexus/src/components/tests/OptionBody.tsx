'use client';

import { useState } from 'react';
import { Box, ImageViewerDialog } from '@neram/ui';
import MathText from '@/components/common/MathText';

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
export default function OptionBody({ option, letter, compact }: OptionBodyProps) {
  const hasText = Boolean(option.text && option.text.trim());
  const [zoomed, setZoomed] = useState(false);
  return (
    <>
      {hasText && (
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
            mt: hasText ? 0.75 : 0,
            width: compact ? 'auto' : '100%',
            maxWidth: '100%',
            // Big enough to compare two isometric views at 375px without pinching.
            maxHeight: compact ? 96 : 180,
            objectFit: 'contain',
            objectPosition: 'left',
            borderRadius: 1,
            // Bank figures are line art on transparent, invisible on a dark card.
            bgcolor: 'common.white',
            cursor: 'zoom-in',
          }}
        />
      )}
      {option.image_url && (
        <ImageViewerDialog
          open={zoomed}
          onClose={() => setZoomed(false)}
          src={option.image_url}
          alt={`Option ${letter}`}
        />
      )}
    </>
  );
}
