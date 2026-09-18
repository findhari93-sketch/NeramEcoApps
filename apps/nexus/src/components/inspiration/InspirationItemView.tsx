'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Box,
  Button,
  Chip,
  EmptyState,
  ImageViewerDialog,
  Skeleton,
  Snackbar,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@neram/ui';
import BrushOutlinedIcon from '@mui/icons-material/BrushOutlined';
import FavoriteIcon from '@mui/icons-material/Favorite';
import FavoriteBorderIcon from '@mui/icons-material/FavoriteBorder';
import ZoomInOutlinedIcon from '@mui/icons-material/ZoomInOutlined';
import ImageNotSupportedOutlinedIcon from '@mui/icons-material/ImageNotSupportedOutlined';
import PageHeader from '@/components/PageHeader';
import AddSketchSheet from '@/components/sketchbook/AddSketchSheet';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { useAuthSWR } from '@/lib/nexus-swr';
import { EXAM_LABELS, typeLabel } from '@/lib/inspiration-types';
import type { InspirationCard } from '@/lib/inspiration-present';
import type { AttemptsView } from '@/lib/inspiration-attempts';
import InspirationAttempts from './InspirationAttempts';
import InspirationCurationBar from './InspirationCurationBar';
import InspirationMasonry from './InspirationMasonry';
import InspirationTile from './InspirationTile';
import { setSaved } from './inspiration-api';
import { backHrefFor, inspirationBase, type InspirationMode } from './inspiration-nav';

interface ItemResponse {
  item: InspirationCard;
  pair: InspirationCard | null;
  similar: InspirationCard[];
  attempts: AttemptsView;
}

const chipSx = { height: 44 } as const;

export default function InspirationItemView({ mode, itemId }: { mode: InspirationMode; itemId: string }) {
  const { getToken } = useNexusAuthContext();
  const base = inspirationBase(mode);
  const [backHref, setBackHref] = useState(base);
  const [view, setView] = useState<'reference' | 'original' | null>(null);
  const [zoom, setZoom] = useState(false);
  const [practising, setPractising] = useState(false);
  const [added, setAdded] = useState(false);
  const { data, error, isLoading, mutate } = useAuthSWR<ItemResponse>(`/api/inspiration/items/${itemId}`);

  useEffect(() => setBackHref(backHrefFor(mode)), [mode]);
  useEffect(() => {
    setView(null);
    setZoom(false);
  }, [itemId]);

  const item = data?.item ?? null;
  const pair = data?.pair ?? null;
  const reference = item ? (item.kind === 'submission_original' ? pair : item) : null;
  const original = item ? (item.kind === 'submission_original' ? item : pair) : null;
  const activeView = view ?? (item?.kind === 'submission_original' ? 'original' : 'reference');
  const shown = (activeView === 'original' ? original : reference) ?? item;

  const toggleSave = useCallback(
    async (card: InspirationCard) => {
      const next = !card.saved;
      const apply = (d?: ItemResponse) =>
        d && {
          ...d,
          item: d.item.id === card.id ? { ...d.item, saved: next } : d.item,
          similar: d.similar.map((c) => (c.id === card.id ? { ...c, saved: next } : c)),
        };
      await mutate(apply(data), { revalidate: false });
      try {
        await setSaved(getToken, card.id, next);
      } catch {
        await mutate();
      }
    },
    [data, getToken, mutate],
  );

  const header = (title: string) => (
    <PageHeader title={title} backHref={backHref} breadcrumbs={[{ label: 'Inspiration', href: base }]} />
  );

  if (error) {
    const gone = error.status === 404;
    return (
      <Box sx={{ pb: 10 }}>
        {header('Inspiration')}
        <EmptyState
          icon={<ImageNotSupportedOutlinedIcon />}
          title={gone ? 'This drawing is no longer in Inspiration' : 'Could not load this drawing'}
          description={gone ? 'A teacher may have taken it down.' : 'Check your connection and try again.'}
          action={
            gone ? (
              <Button component={Link} href={base} variant="contained" sx={{ minHeight: 48 }}>
                Browse Inspiration
              </Button>
            ) : (
              <Button variant="contained" onClick={() => mutate()} sx={{ minHeight: 48 }}>
                Try again
              </Button>
            )
          }
        />
      </Box>
    );
  }

  return (
    <Box sx={{ pb: 10 }}>
      {header(item?.title ?? 'Inspiration')}
      <Box sx={{ px: { xs: 2, sm: 3 }, maxWidth: 1200, mx: 'auto', containerType: 'inline-size', minWidth: 0 }}>
        <Box
          sx={{
            display: 'grid',
            gap: 3,
            gridTemplateColumns: 'minmax(0, 1fr)',
            '@container (min-width: 760px)': { gridTemplateColumns: 'minmax(0, 3fr) minmax(0, 2fr)', alignItems: 'start' },
          }}
        >
          <Box sx={{ minWidth: 0 }}>
            {isLoading || !shown ? (
              <Skeleton variant="rounded" sx={{ width: '100%', height: 'auto', aspectRatio: '3 / 4', borderRadius: 2 }} />
            ) : (
              <Box
                component="button"
                type="button"
                onClick={() => setZoom(true)}
                aria-label="View full size"
                sx={{
                  position: 'relative',
                  display: 'block',
                  width: '100%',
                  p: 0,
                  border: 0,
                  borderRadius: 2,
                  overflow: 'hidden',
                  bgcolor: 'grey.100',
                  cursor: 'zoom-in',
                  '&:focus-visible': { outline: '3px solid', outlineColor: 'primary.main', outlineOffset: 2 },
                }}
              >
                <Box
                  component="img"
                  src={shown.imageUrl}
                  alt={shown.alt}
                  sx={{ display: 'block', width: '100%', maxHeight: '75dvh', objectFit: 'contain' }}
                />
                <ZoomInOutlinedIcon
                  aria-hidden
                  sx={{ position: 'absolute', right: 12, bottom: 12, color: 'common.white', bgcolor: 'rgba(0, 0, 0, 0.6)', borderRadius: '50%', p: 0.75, fontSize: 36 }}
                />
              </Box>
            )}
            {reference && original && (
              <ToggleButtonGroup
                exclusive
                value={activeView}
                onChange={(_, value: 'reference' | 'original' | null) => value && setView(value)}
                aria-label="Which image to show"
                sx={{ mt: 1.5, display: 'flex' }}
              >
                <ToggleButton value="reference" sx={{ flex: 1, minHeight: 44 }}>
                  Reference
                </ToggleButton>
                <ToggleButton value="original" sx={{ flex: 1, minHeight: 44 }}>
                  Student&apos;s drawing
                </ToggleButton>
              </ToggleButtonGroup>
            )}
          </Box>

          <Box sx={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
            {!item ? (
              <>
                <Skeleton variant="text" sx={{ width: '50%' }} />
                <Skeleton variant="rounded" sx={{ height: 96 }} />
              </>
            ) : (
              <>
                <Typography variant="body2" color="text.secondary">
                  {shown?.credit ?? item.credit}
                </Typography>
                {item.brief && (
                  <Typography variant="body1" sx={{ whiteSpace: 'pre-line', lineHeight: 1.6 }}>
                    {item.brief}
                  </Typography>
                )}
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                  {item.typeSlugs.map((slug) => (
                    <Chip key={slug} component={Link} href={`${base}?type=${slug}`} clickable label={typeLabel(slug)} sx={chipSx} />
                  ))}
                  {item.examTypes.map((exam) => (
                    <Chip key={exam} component={Link} href={`${base}?exam=${exam}`} clickable variant="outlined" label={EXAM_LABELS[exam] ?? exam} sx={chipSx} />
                  ))}
                  {item.years.map((year) => (
                    <Chip key={year} component={Link} href={`${base}?year=${year}`} clickable variant="outlined" label={String(year)} sx={chipSx} />
                  ))}
                  {item.tagLabels.map((tag) => (
                    <Chip key={tag} component={Link} href={`${base}?q=${encodeURIComponent(tag)}`} clickable variant="outlined" label={tag} sx={chipSx} />
                  ))}
                </Box>
                {mode === 'student' && (
                  <Button
                    variant="contained"
                    startIcon={<BrushOutlinedIcon />}
                    onClick={() => setPractising(true)}
                    sx={{ minHeight: 48, alignSelf: 'flex-start' }}
                  >
                    Practise this
                  </Button>
                )}
                <Button
                  variant={mode === 'student' ? 'outlined' : item.saved ? 'contained' : 'outlined'}
                  startIcon={item.saved ? <FavoriteIcon /> : <FavoriteBorderIcon />}
                  aria-pressed={item.saved}
                  onClick={() => toggleSave(item)}
                  sx={{ minHeight: 48, alignSelf: 'flex-start' }}
                >
                  {item.saved ? 'Saved' : 'Save'}
                </Button>
                {mode === 'staff' && item.staff && (
                  <InspirationCurationBar key={item.id} card={item} base={base} onChanged={() => void mutate()} />
                )}
              </>
            )}
          </Box>
        </Box>

        {data && <InspirationAttempts mode={mode} itemId={itemId} view={data.attempts} />}

        {data && data.similar.length > 0 && (
          <Box component="section" aria-labelledby="inspiration-more-like-this" sx={{ mt: 5 }}>
            <Typography id="inspiration-more-like-this" variant="h6" component="h2" sx={{ mb: 1.5, fontWeight: 700 }}>
              More like this
            </Typography>
            <InspirationMasonry
              cards={data.similar}
              renderTile={(card) => <InspirationTile card={card} href={`${base}/${card.id}`} onToggleSave={toggleSave} />}
            />
          </Box>
        )}
      </Box>

      {shown && (
        <ImageViewerDialog open={zoom} onClose={() => setZoom(false)} src={shown.imageUrl} alt={shown.alt} name={item?.title} />
      )}
      {mode === 'student' && item && (
        <AddSketchSheet
          open={practising}
          onClose={() => setPractising(false)}
          onAdded={() => {
            setPractising(false);
            setAdded(true);
            void mutate();
          }}
          practise={{ itemId: item.id, imageUrl: (reference ?? item).imageUrl, title: item.title }}
        />
      )}
      <Snackbar
        open={added}
        autoHideDuration={5000}
        onClose={() => setAdded(false)}
        message="Added to your Sketchbook"
        action={
          <Button component={Link} href="/student/sketchbook" color="inherit" sx={{ minHeight: 44 }}>
            Open
          </Button>
        }
      />
    </Box>
  );
}
