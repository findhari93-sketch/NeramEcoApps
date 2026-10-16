import type { ReactNode } from 'react';
import { Box, Typography } from '@neram/ui';
import CheckList from './CheckList';
import { iconTileSx, tokens as t, v } from './tokens';

export interface TopicCardProps {
  icon?: ReactNode;
  title: ReactNode;
  items: ReactNode[];
  titleAs?: 'h3' | 'h4';
}

/** A white card with a 40px icon tile, a title and a short check list (curriculum subjects). */
export default function TopicCard({ icon, title, items, titleAs = 'h3' }: TopicCardProps) {
  return (
    <Box
      sx={{
        bgcolor: v.card,
        border: `1px solid ${v.line}`,
        borderRadius: `${t.radius}px`,
        p: 3,
        display: 'flex',
        flexDirection: 'column',
        gap: 1.5,
        color: v.fg,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
        {icon && (
          <Box aria-hidden sx={{ ...iconTileSx, width: 40, height: 40, '& svg': { fontSize: 22 } }}>
            {icon}
          </Box>
        )}
        <Typography component={titleAs} sx={{ m: 0, fontSize: '1.125rem', fontWeight: 700, lineHeight: 1.3 }}>
          {title}
        </Typography>
      </Box>
      <CheckList variant="compact" items={items} />
    </Box>
  );
}
