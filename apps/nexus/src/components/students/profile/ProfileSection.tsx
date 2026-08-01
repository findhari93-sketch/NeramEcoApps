'use client';

/**
 * One section of the student profile, in the two shapes the page needs.
 *
 * Below `md` it is an Accordion, because a teacher on a phone wants to
 * thumb-scroll past nine sections and open the one they came for. At `md` and
 * above it is a plain Paper with a static header, because on a monitor there is
 * room to show everything at once and clicking to expand is friction.
 *
 * One component with one breakpoint check, not two components: the alternative
 * duplicates every section's markup and lets the two drift.
 *
 * THE SUMMARY CARRIES THE ANSWER. `headline` is rendered in the collapsed
 * summary row, so "12 of 15 classes" or "4 uploaded, 1 pending" is visible with
 * zero taps. A section whose summary says only its name makes the user open it
 * to find out whether it was worth opening.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Chip,
  Paper,
  Typography,
  useMediaQuery,
  useTheme,
} from '@neram/ui';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';

export interface ProfileSectionProps {
  /** Anchor id, used by the desktop jump nav. */
  id: string;
  title: string;
  /** The one number that answers the common question. Shown when collapsed. */
  headline?: string | null;
  /** Small chip beside the title, e.g. "Admin only". */
  badge?: string | null;
  /** Mobile only. Desktop always shows everything. */
  defaultExpanded?: boolean;
  /**
   * Fired the first time this section becomes visible to the user, so the page
   * can fetch its data lazily. Called once, on mobile when first expanded and
   * on desktop on mount.
   */
  onFirstOpen?: () => void;
  children: ReactNode;
}

export default function ProfileSection({
  id,
  title,
  headline,
  badge,
  defaultExpanded = false,
  onFirstOpen,
  children,
}: ProfileSectionProps) {
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));
  const [expanded, setExpanded] = useState(defaultExpanded);

  // A ref, not state: firing the lazy fetch must not itself cause a render, and
  // "have we already asked" is not something the UI draws.
  const opened = useRef(false);

  // Visible means expanded on mobile, or mounted at all on desktop, where every
  // section renders open. Runs after commit, so it never sets state in render.
  const visible = isDesktop || expanded;
  useEffect(() => {
    if (!visible || opened.current) return;
    opened.current = true;
    onFirstOpen?.();
  }, [visible, onFirstOpen]);

  if (isDesktop) {
    return (
      <Paper id={id} sx={{ p: 3, mb: 2, scrollMarginTop: 96 }}>
        <Header title={title} headline={headline} badge={badge} desktop />
        <Box sx={{ mt: 2 }}>{children}</Box>
      </Paper>
    );
  }

  return (
    <Accordion
      id={id}
      expanded={expanded}
      onChange={(_, isExpanded) => setExpanded(isExpanded)}
      disableGutters
      sx={{
        mb: 1,
        borderRadius: 1,
        scrollMarginTop: 96,
        '&:before': { display: 'none' },
      }}
    >
      <AccordionSummary
        expandIcon={<ExpandMoreIcon />}
        // 56px clears the 48px touch target with room for the tap to feel safe.
        sx={{ minHeight: 56, '& .MuiAccordionSummary-content': { my: 1.25 } }}
      >
        <Header title={title} headline={headline} badge={badge} />
      </AccordionSummary>
      <AccordionDetails sx={{ pt: 0 }}>{children}</AccordionDetails>
    </Accordion>
  );
}

function Header({
  title,
  headline,
  badge,
  desktop = false,
}: {
  title: string;
  headline?: string | null;
  badge?: string | null;
  desktop?: boolean;
}) {
  return (
    <Box sx={{ minWidth: 0, width: '100%' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <Typography
          variant={desktop ? 'h6' : 'subtitle1'}
          component="h2"
          sx={{ fontWeight: 700 }}
        >
          {title}
        </Typography>
        {badge && (
          <Chip
            label={badge}
            size="small"
            sx={{ height: 20, fontSize: '0.68rem', fontWeight: 700 }}
          />
        )}
      </Box>
      {headline && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
          {headline}
        </Typography>
      )}
    </Box>
  );
}
