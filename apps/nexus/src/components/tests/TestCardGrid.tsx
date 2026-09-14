'use client';

/**
 * How a list of test cards is laid out at each width.
 *
 * One column on a phone, two from 600px up, and it stops at two. A third column
 * at 1440px gives 260px cards, which breaks the titles again and turns a list
 * into a dashboard; that is a second design to maintain for no gain.
 *
 * `queue` forces one column at EVERY width. A queue is not a gallery: two
 * columns of "what do I do now" hands the reader an ordering decision the page
 * was supposed to make for them. Use it for anything the student is meant to
 * work through in order.
 */

import { Box } from '@neram/ui';

export default function TestCardGrid({
  children,
  queue = false,
}: {
  children: React.ReactNode;
  queue?: boolean;
}) {
  return (
    <Box
      sx={{
        display: 'grid',
        gap: 1.5,
        gridTemplateColumns: queue ? '1fr' : { xs: '1fr', sm: 'repeat(auto-fill, minmax(300px, 1fr))' },
        alignItems: 'start',
      }}
    >
      {children}
    </Box>
  );
}
