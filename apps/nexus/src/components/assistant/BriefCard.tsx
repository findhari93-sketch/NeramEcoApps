'use client';

import Link from 'next/link';
import { Box, Button, Paper, Skeleton, Typography, alpha, useMediaQuery, useTheme } from '@neram/ui';
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { useAuthSWR, type NexusFetchError } from '@/lib/nexus-swr';
import type { Brief } from '@/lib/assistant/brief';
import { useAssistantOptional } from './AssistantProvider';
import { ASSISTANT_FLAG, BRIEF_KEY } from './client';
import { focusRing } from './focusRing';
import { stableHover } from './stableHover';

/** 401, 403 and 404 are answers (signed out, not in the pilot, flag off), not blips: retrying them only bills more calls. */
const SWR_OPTIONS = {
  shouldRetryOnError: (err: Error) => ![401, 403, 404].includes((err as NexusFetchError).status),
};

/**
 * "Your day", at the top of the student dashboard. Deterministic: the server
 * builds it from the same loaders as the pages it links to, so nothing here
 * can disagree with the page behind the link. Nothing to say means no card.
 */
export default function BriefCard() {
  const theme = useTheme();
  const { tokenReady, isFeatureEnabled } = useNexusAuthContext();
  const assistant = useAssistantOptional();
  const on = tokenReady && isFeatureEnabled(ASSISTANT_FLAG);
  const reduce = useMediaQuery('(prefers-reduced-motion: reduce)');
  const { data, error, isLoading } = useAuthSWR<{ brief: Brief }>(on ? BRIEF_KEY : null, SWR_OPTIONS);

  if (!on || error) return null;
  if (isLoading || !data) {
    return (
      <Paper data-testid="brief-skeleton" aria-hidden="true" elevation={0} sx={{ p: 2, mb: 2, borderRadius: 3, border: `1px solid ${theme.palette.divider}` }}>
        {/* Still under reduced motion: the pulse is decoration, the shape says loading. */}
        <Skeleton animation={reduce ? false : 'pulse'} width="40%" height={28} />
        <Skeleton animation={reduce ? false : 'pulse'} width="90%" />
        <Skeleton animation={reduce ? false : 'pulse'} width="70%" />
        <Skeleton animation={reduce ? false : 'pulse'} width="60%" />
      </Paper>
    );
  }
  const { brief } = data;
  if (!brief.hasContent) return null;

  return (
    <Paper elevation={0} component="section" aria-labelledby="brief-title" sx={{ p: 2, mb: 2, borderRadius: 3, border: `1px solid ${theme.palette.divider}`, bgcolor: alpha(theme.palette.primary.main, 0.03), '& .Mui-focusVisible': focusRing(theme.palette.primary.main) }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <AutoAwesomeOutlinedIcon fontSize="small" color="primary" />
        <Typography id="brief-title" variant="subtitle1" sx={{ fontWeight: 700 }}>{brief.greeting}</Typography>
      </Box>
      <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        {brief.sections.map((s) => (
          <Box component="li" key={s.id}>
            {s.link ? (
              <Button component={Link} href={s.link} endIcon={<ChevronRightIcon />} sx={{ ...stableHover, justifyContent: 'space-between', width: '100%', minHeight: 48, textTransform: 'none', textAlign: 'left', color: 'text.primary', px: 1 }}>
                <Typography variant="body1" sx={{ lineHeight: 1.5 }}>{s.text}</Typography>
              </Button>
            ) : (
              <Typography variant="body1" sx={{ px: 1, py: 1.5, lineHeight: 1.5 }}>{s.text}</Typography>
            )}
          </Box>
        ))}
      </Box>
      {assistant?.enabled && (
        <Box sx={{ display: 'flex', gap: 1, mt: 1.5 }}>
          <Button variant="contained" onClick={() => assistant.openPanel()} sx={{ ...stableHover, minHeight: 48, textTransform: 'none', fontWeight: 700 }}>Ask</Button>
          <Button variant="outlined" onClick={() => assistant.openPanel("I can't attend a class")} sx={{ ...stableHover, minHeight: 48, textTransform: 'none', fontWeight: 700 }}>Can&apos;t attend</Button>
        </Box>
      )}
    </Paper>
  );
}
