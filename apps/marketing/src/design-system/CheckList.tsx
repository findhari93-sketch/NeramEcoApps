import { isValidElement, type ReactNode } from 'react';
import { Box, Typography } from '@neram/ui';
import CheckIcon from '@mui/icons-material/Check';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import BlockOutlinedIcon from '@mui/icons-material/BlockOutlined';
import { v } from './tokens';

/** A titled row ("features as a ruled list"): bold title, muted body under it. */
export interface CheckListDetail {
  title: ReactNode;
  body?: ReactNode;
}

export interface CheckListProps {
  items: (ReactNode | CheckListDetail)[];
  /**
   * ruled: "features as a ruled list" (T1, T7): check_circle, an ink top rule
   * and 1px rules between rows, two columns from ~560px. compact: a tight list
   * of checks inside a card.
   */
  variant?: 'ruled' | 'compact';
  /** Minimum column width for the ruled grid (default 260). */
  columnMin?: number;
  /** Heading level for detail titles; default is plain bold text. */
  titleAs?: 'h3' | 'h4' | 'strong';
  /** no: a "don't" list (block icon in muted ink instead of a gold check). */
  tone?: 'yes' | 'no';
}

function isDetail(item: ReactNode | CheckListDetail): item is CheckListDetail {
  return typeof item === 'object' && item !== null && !isValidElement(item) && 'title' in item;
}

/** A list with gold800 checks (gold500 on dark, via the Surface variable). */
export default function CheckList({ items, variant = 'ruled', columnMin = 260, titleAs = 'strong', tone = 'yes' }: CheckListProps) {
  const ruled = variant === 'ruled';
  return (
    <Box
      component="ul"
      sx={{
        m: 0,
        p: 0,
        listStyle: 'none',
        ...(ruled
          ? {
              display: 'grid',
              gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${columnMin}px), 1fr))`,
              columnGap: 3,
              borderTop: `1px solid ${v.fg}`,
            }
          : { display: 'flex', flexDirection: 'column', gap: 0.75 }),
      }}
    >
      {items.map((item, i) => {
        const detail = isDetail(item);
        return (
          <Box
            component="li"
            key={i}
            sx={
              ruled
                ? {
                    display: 'flex',
                    gap: detail ? 1.75 : 1.25,
                    alignItems: detail ? 'flex-start' : 'center',
                    py: detail ? 2.5 : 1.75,
                    pr: detail ? 3 : 0,
                    borderBottom: `1px solid ${v.line}`,
                    fontSize: '1rem',
                    fontWeight: 500,
                  }
                : { display: 'flex', gap: 1, alignItems: 'flex-start', fontSize: '0.9375rem', lineHeight: 1.4 }
            }
          >
            {tone === 'no' ? (
              <BlockOutlinedIcon aria-hidden sx={{ fontSize: ruled ? (detail ? 24 : 20) : 18, color: v.muted, flexShrink: 0, mt: ruled ? 0 : '1px' }} />
            ) : ruled ? (
              <CheckCircleOutlineIcon aria-hidden sx={{ fontSize: detail ? 24 : 20, color: v.eyebrow, flexShrink: 0 }} />
            ) : (
              <CheckIcon aria-hidden sx={{ fontSize: 18, color: v.eyebrow, flexShrink: 0, mt: '1px' }} />
            )}
            {detail ? (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, minWidth: 0 }}>
                <Typography component={titleAs} sx={{ m: 0, fontSize: '1rem', fontWeight: 700, lineHeight: 1.4 }}>
                  {item.title}
                </Typography>
                {item.body && (
                  <Typography component="span" sx={{ fontSize: '0.9375rem', fontWeight: 400, lineHeight: 1.55, color: v.muted }}>
                    {item.body}
                  </Typography>
                )}
              </Box>
            ) : (
              item
            )}
          </Box>
        );
      })}
    </Box>
  );
}
