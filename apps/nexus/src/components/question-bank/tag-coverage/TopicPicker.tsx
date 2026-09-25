'use client';

import {
  Box,
  Chip,
  List,
  ListItemButton,
  ListItemText,
  Paper,
  Skeleton,
  Typography,
} from '@neram/ui';
import type { CoverageTopic } from './types';

interface Props {
  topics: CoverageTopic[];
  selected: string | null;
  loading: boolean;
  onSelect: (slug: string) => void;
}

function waitingText(t: CoverageTopic): string {
  if (t.suggestion_count === 0) return 'Nothing waiting';
  return `${t.suggestion_count.toLocaleString('en-IN')} waiting`;
}

/**
 * The topics, biggest gap first.
 *
 * Phone: one row of chips that scrolls sideways inside its own strip, so the
 * page itself never scrolls sideways and the review card stays on screen.
 * From md up: a left rail with the tagged count beside what is waiting.
 */
export default function TopicPicker({ topics, selected, loading, onSelect }: Props) {
  if (loading) {
    return (
      <>
        <Box sx={{ display: { xs: 'flex', md: 'none' }, gap: 1, overflow: 'hidden' }} aria-hidden>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} variant="rounded" width={150} height={44} sx={{ flexShrink: 0, borderRadius: 22 }} />
          ))}
        </Box>
        <Paper variant="outlined" sx={{ display: { xs: 'none', md: 'block' }, p: 1, borderRadius: 2 }} aria-hidden>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} variant="rounded" height={52} sx={{ mb: 0.75 }} />
          ))}
        </Paper>
      </>
    );
  }

  return (
    <>
      {/* Phone and small tablet */}
      <Box
        component="nav"
        aria-label="Topics"
        sx={{
          display: { xs: 'flex', md: 'none' },
          gap: 1,
          overflowX: 'auto',
          pb: 0.5,
          minWidth: 0,
          scrollbarWidth: 'thin',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {topics.map((t) => {
          const active = t.slug === selected;
          return (
            <Chip
              key={t.slug}
              clickable
              color={active ? 'primary' : 'default'}
              variant={active ? 'filled' : 'outlined'}
              aria-pressed={active}
              onClick={() => onSelect(t.slug)}
              label={
                <Box component="span" sx={{ display: 'inline-flex', alignItems: 'baseline', gap: 0.75 }}>
                  <Box component="span" sx={{ fontWeight: 600 }}>{t.label}</Box>
                  <Box component="span" sx={{ opacity: 0.85, fontSize: '0.8125rem' }}>
                    {t.suggestion_count > 0 ? t.suggestion_count.toLocaleString('en-IN') : 'done'}
                  </Box>
                </Box>
              }
              sx={{ height: 44, borderRadius: 22, flexShrink: 0, px: 0.5, fontSize: '0.875rem' }}
            />
          );
        })}
      </Box>

      {/* Laptop: left rail */}
      <Paper
        component="nav"
        aria-label="Topics"
        variant="outlined"
        sx={{ display: { xs: 'none', md: 'block' }, borderRadius: 2, overflow: 'hidden' }}
      >
        <Typography variant="overline" color="text.secondary" sx={{ display: 'block', px: 2, pt: 1.5, fontWeight: 700 }}>
          Topics, biggest gap first
        </Typography>
        <List dense disablePadding sx={{ pb: 1 }}>
          {topics.map((t) => {
            const active = t.slug === selected;
            return (
              <ListItemButton
                key={t.slug}
                selected={active}
                aria-current={active ? 'true' : undefined}
                onClick={() => onSelect(t.slug)}
                sx={{ minHeight: 52, px: 2, alignItems: 'flex-start' }}
              >
                <ListItemText
                  primary={t.label}
                  secondary={`${t.tagged_count.toLocaleString('en-IN')} tagged · ${waitingText(t)}`}
                  primaryTypographyProps={{ fontWeight: active ? 700 : 600, fontSize: '0.9rem' }}
                  secondaryTypographyProps={{ fontSize: '0.8rem' }}
                />
                {t.suggestion_count > 0 && (
                  <Chip
                    size="small"
                    label={t.suggestion_count.toLocaleString('en-IN')}
                    color={active ? 'primary' : 'default'}
                    sx={{ ml: 1, mt: 0.5, fontWeight: 700 }}
                    aria-hidden
                  />
                )}
              </ListItemButton>
            );
          })}
        </List>
      </Paper>
    </>
  );
}
