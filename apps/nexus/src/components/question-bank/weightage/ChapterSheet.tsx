'use client';

import Link from 'next/link';
import {
  Box,
  Button,
  Dialog,
  IconButton,
  SwipeableDrawer,
  Tooltip,
  Typography,
  alpha,
  useMediaQuery,
  useTheme,
} from '@neram/ui';
import CloseIcon from '@mui/icons-material/Close';
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded';
import {
  formatPerPaper,
  gapLabel,
  type ChapterStat,
  type SectionWeightage,
} from '@/lib/qb-weightage';
import { hatch } from './weightage-colors';

interface Props {
  chapter: ChapterStat | null;
  section: SectionWeightage;
  color: string;
  practiceHref: (c: ChapterStat) => string;
  onClose: () => void;
}

/**
 * One chapter, close up: how much, how often, the year-by-year bars, and the
 * one thing to do next (practise it).
 *
 * A bottom sheet on a phone, where it opens from a list the thumb is already
 * on; a dialog from md up.
 */
export default function ChapterSheet({ chapter, section, color, practiceHref, onClose }: Props) {
  const theme = useTheme();
  const isMdUp = useMediaQuery(theme.breakpoints.up('md'), { noSsr: true });
  const open = !!chapter;

  const body = chapter ? (
    <Box sx={{ display: 'grid', gap: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="h6" component="h2" fontWeight={700} sx={{ lineHeight: 1.3 }}>
            {chapter.label}
          </Typography>
          {chapter.unitLabel && (
            <Typography variant="body2" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
              <Box component="span" sx={{ width: 10, height: 10, borderRadius: '3px', bgcolor: color, flex: 'none' }} />
              {chapter.unitLabel}
            </Typography>
          )}
        </Box>
        <IconButton onClick={onClose} aria-label="Close" sx={{ width: 48, height: 48, mt: -1, mr: -1 }}>
          <CloseIcon />
        </IconButton>
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 1 }}>
        <Stat value={formatPerPaper(chapter.perPaper)} label="questions a paper" />
        <Stat value={`${chapter.askedAll}/${chapter.ofAll}`} label="years asked" />
        <Stat value={chapter.lastYear ? String(chapter.lastYear) : 'None'} label="last asked" />
      </Box>

      <YearBars chapter={chapter} section={section} color={color} />

      {chapter.trend !== 'steady' && (
        <Typography variant="body2" color="text.secondary">
          {chapter.trend === 'rising' && 'More questions in the last 5 years than before.'}
          {chapter.trend === 'new' && 'Asked only in recent years.'}
          {chapter.trend === 'falling' && 'Fewer questions in the last 5 years than before.'}
          {chapter.trend === 'stopped' && `Not asked since ${chapter.lastYear}.`}
        </Typography>
      )}

      <Button
        component={Link}
        href={practiceHref(chapter)}
        variant="contained"
        size="large"
        startIcon={<PlayArrowRoundedIcon />}
        sx={{ minHeight: 48, borderRadius: 2, textTransform: 'none', fontWeight: 700 }}
      >
        Practise {chapter.total} {chapter.total === 1 ? 'question' : 'questions'}
      </Button>
    </Box>
  ) : null;

  if (isMdUp) {
    return (
      <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 3, p: 2.5 } }}>
        {body}
      </Dialog>
    );
  }

  return (
    <SwipeableDrawer
      anchor="bottom"
      open={open}
      onClose={onClose}
      onOpen={() => {}}
      disableSwipeToOpen
      PaperProps={{
        sx: {
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
          maxHeight: '85svh',
          px: 2,
          pt: 1,
          pb: 'calc(16px + env(safe-area-inset-bottom, 0px))',
        },
      }}
    >
      <Box aria-hidden sx={{ width: 36, height: 4, borderRadius: 2, bgcolor: 'divider', mx: 'auto', mb: 1.5 }} />
      <Box sx={{ overflowY: 'auto', minHeight: 0 }}>{body}</Box>
    </SwipeableDrawer>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  const theme = useTheme();
  return (
    <Box sx={{ bgcolor: alpha(theme.palette.text.primary, 0.05), borderRadius: 2, p: 1.25 }}>
      <Typography sx={{ fontSize: 20, fontWeight: 700, fontVariantNumeric: 'tabular-nums', lineHeight: 1.2 }}>
        {value}
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.3, display: 'block' }}>
        {label}
      </Typography>
    </Box>
  );
}

/** Questions per paper in each year, with missing and partial years hatched. */
function YearBars({ chapter, section, color }: { chapter: ChapterStat; section: SectionWeightage; color: string }) {
  const theme = useTheme();
  const cols = section.columns;
  const values = cols.map((c) =>
    c.kind === 'year' && !c.partial ? (chapter.counts[c.year] ?? 0) / c.papers : null,
  );
  const max = Math.max(1, ...values.filter((v): v is number => v !== null));
  const first = cols[0];
  const last = cols[cols.length - 1];

  return (
    <Box>
      <Box
        role="img"
        aria-label={`${chapter.label}, questions by year`}
        sx={{ display: 'flex', alignItems: 'flex-end', gap: '3px', height: 72, borderBottom: 1, borderColor: 'divider' }}
      >
        {cols.map((c, i) => {
          if (c.kind === 'gap') {
            return (
              <Tooltip key={`g${c.from}`} title={`${c.from} to ${c.to}: not in the bank yet`} arrow>
                <Box sx={{ flex: 1.4, height: '100%', background: hatch(theme), borderRadius: '2px 2px 0 0' }} />
              </Tooltip>
            );
          }
          const count = chapter.counts[c.year] ?? 0;
          if (c.partial) {
            return (
              <Tooltip key={c.year} title={`${c.year}: only part of this paper is in the bank (${count} here)`} arrow>
                <Box sx={{ flex: 1, height: '100%', background: hatch(theme), borderRadius: '2px 2px 0 0' }} />
              </Tooltip>
            );
          }
          const v = values[i] ?? 0;
          const tip = `${c.year}: ${count} ${count === 1 ? 'question' : 'questions'}${c.papers > 1 ? ` across ${c.papers} papers` : ''}`;
          return (
            <Tooltip key={c.year} title={tip} arrow>
              <Box sx={{ flex: 1, height: '100%', display: 'flex', alignItems: 'flex-end' }}>
                <Box
                  sx={{
                    width: '100%',
                    height: v ? `${Math.max(6, (v / max) * 100)}%` : 3,
                    bgcolor: v ? color : 'divider',
                    borderRadius: v ? '3px 3px 0 0' : 1,
                  }}
                />
              </Box>
            </Tooltip>
          );
        })}
      </Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.5 }}>
        <Typography variant="caption" color="text.secondary">
          {first.kind === 'year' ? first.year : gapLabel(first)}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Bar height: questions a paper
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {last.kind === 'year' ? last.year : gapLabel(last)}
        </Typography>
      </Box>
    </Box>
  );
}
