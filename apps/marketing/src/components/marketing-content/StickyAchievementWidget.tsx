'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Chip,
  IconButton,
  Drawer,
  Button,
  Slide,
  Dialog,
} from '@neram/ui';
import { useTheme, useMediaQuery } from '@mui/material';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import CloseIcon from '@mui/icons-material/Close';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import { useRouter, usePathname } from 'next/navigation';
import Image from 'next/image';
import { tokens as t } from '@/design-system/tokens';
import { useDismiss } from './useDismiss';

/** Score chip: gold tint with gold800 text (readable on white). */
const scoreChipSx = {
  bgcolor: t.goldTintBg,
  color: t.gold800,
  fontWeight: 600,
  '& .MuiChip-icon': { color: t.gold800 },
} as const;

/** Initials when there is no photo: paper on navy700, like PersonCard. */
const initialsTileSx = {
  width: '100%',
  height: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  bgcolor: t.navy700,
} as const;

/** Close control over a photo: 44px target, dark scrim so the glyph reads on any image. */
const overlayCloseSx = {
  position: 'absolute',
  zIndex: 10,
  width: 44,
  height: 44,
  bgcolor: 'rgba(6,13,31,0.6)',
  color: t.paper,
  '&:hover': { bgcolor: 'rgba(6,13,31,0.8)' },
  '&:focus-visible': { outline: t.focusOutline, outlineOffset: '2px' },
} as const;

const navButtonSx = {
  width: 44,
  height: 44,
  color: t.ink,
  '&:focus-visible': { outline: t.focusOutline, outlineOffset: '2px' },
} as const;

/** Pages where Tawk.to chat lives — hide widget to avoid overlap */
const HIDDEN_PATHS = ['/contact', '/enroll'];

interface ContentItem {
  id: string;
  title: Record<string, string>;
  description: Record<string, string>;
  image_url: string | null;
  metadata: {
    student_name: string;
    exam: string;
    score?: number | null;
    rank?: number | null;
    percentile?: number | null;
    college?: string | null;
    academic_year?: string;
    student_quote?: string | null;
    image_crops?: {
      square?: string;
      banner?: string;
      mobile?: string;
    } | null;
  };
}

function getScoreLabel(meta: ContentItem['metadata']): string | null {
  if (meta.rank) return `Rank ${meta.rank}`;
  if (meta.score) return `Score: ${meta.score}`;
  if (meta.percentile) return `${meta.percentile}%`;
  return null;
}

function getCompactText(meta: ContentItem['metadata']): string {
  const score = meta.percentile
    ? `${meta.percentile}%`
    : meta.rank
      ? `Rank ${meta.rank}`
      : meta.score
        ? `${meta.score}`
        : '';
  return `${meta.student_name} scored ${score} in ${meta.exam}`;
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

/** Full-size photo with gold gradient overlay and fallback initials */
function PhotoBanner({
  imageUrl,
  name,
  height,
  roundedTop,
}: {
  imageUrl: string | null;
  name: string;
  height: number;
  roundedTop?: boolean;
}) {
  return (
    <Box
      sx={{
        position: 'relative',
        width: '100%',
        height,
        borderRadius: roundedTop ? `${t.radius}px ${t.radius}px 0 0` : 0,
        overflow: 'hidden',
        bgcolor: t.navy700,
      }}
    >
      {imageUrl ? (
        <Image
          src={imageUrl}
          alt={name}
          fill
          sizes="400px"
          style={{ objectFit: 'cover' }}
        />
      ) : (
        <Box sx={initialsTileSx}>
          <Typography
            sx={{
              fontSize: height * 0.35,
              fontWeight: 800,
              color: t.paper,
              letterSpacing: 2,
            }}
          >
            {getInitials(name)}
          </Typography>
        </Box>
      )}
      {/* Gold gradient overlay at bottom with name */}
      <Box
        sx={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          px: 2,
          py: 1.5,
          background: 'linear-gradient(transparent, rgba(6,13,31,0.8))',
        }}
      >
        <Typography variant="h6" sx={{ color: t.paper, fontWeight: 700, lineHeight: 1.2 }}>
          {name}
        </Typography>
      </Box>
    </Box>
  );
}

/** Expanded detail content (shared between desktop and mobile) */
function AchievementDetail({
  item,
  locale,
}: {
  item: ContentItem;
  locale: string;
}) {
  const meta = item.metadata;
  const scoreLabel = getScoreLabel(meta);
  const title = item.title?.[locale] || item.title?.en || '';
  const quote = meta.student_quote || item.description?.[locale] || item.description?.en || '';

  return (
    <Box sx={{ p: 2.5 }}>
      {/* Exam + Score chips */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5, flexWrap: 'wrap' }}>
        <Chip label={meta.exam} size="small" color="primary" variant="outlined" />
        {scoreLabel && (
          <Chip
            icon={<EmojiEventsIcon sx={{ fontSize: 16 }} />}
            label={scoreLabel}
            size="small"
            sx={scoreChipSx}
          />
        )}
        {meta.academic_year && (
          <Chip label={meta.academic_year} size="small" variant="outlined" />
        )}
      </Box>

      {/* College */}
      {meta.college && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Admitted to: <strong>{meta.college}</strong>
        </Typography>
      )}

      {/* Title */}
      {title && (
        <Typography variant="body1" fontWeight={600} sx={{ mb: 1 }}>
          {title}
        </Typography>
      )}

      {/* Student quote */}
      {quote && (
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{
            fontStyle: 'italic',
            pl: 2,
            borderLeft: `3px solid ${t.gold500}`,
            mt: 1,
          }}
        >
          &ldquo;{quote}&rdquo;
        </Typography>
      )}
    </Box>
  );
}

/** Navigation dots + arrows for multiple items */
function ItemNavigation({
  count,
  activeIndex,
  onPrev,
  onNext,
  onSelect,
  dotSize = 8,
}: {
  count: number;
  activeIndex: number;
  onPrev: (e: React.MouseEvent) => void;
  onNext: (e: React.MouseEvent) => void;
  onSelect: (i: number) => void;
  dotSize?: number;
}) {
  if (count <= 1) return null;
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
      <IconButton onClick={onPrev} aria-label="Previous achievement" sx={navButtonSx}>
        <ChevronLeftIcon fontSize="small" />
      </IconButton>
      {Array.from({ length: count }).map((_, i) => (
        <Box
          key={i}
          aria-hidden
          sx={{
            width: dotSize,
            height: dotSize,
            borderRadius: '50%',
            bgcolor: i === activeIndex ? t.gold500 : t.lineStrong,
            transition: 'background-color 150ms ease',
            cursor: 'pointer',
          }}
          onClick={(e) => {
            e.stopPropagation();
            onSelect(i);
          }}
        />
      ))}
      <IconButton onClick={onNext} aria-label="Next achievement" sx={navButtonSx}>
        <ChevronRightIcon fontSize="small" />
      </IconButton>
    </Box>
  );
}

export default function StickyAchievementWidget({ locale = 'en' }: { locale?: string }) {
  const [items, setItems] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [visible, setVisible] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));
  const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const slideTimeout = reduceMotion ? 0 : undefined;
  const router = useRouter();
  const pathname = usePathname();

  // Persistent 24-hour dismissal — keyed by the first (latest) achievement ID
  const latestId = items.length > 0 ? items[0].id : null;
  const [dismissed, dismiss] = useDismiss('achievement', latestId);

  // Hide on pages where Tawk.to chat widget is active (avoids overlap)
  const isHiddenPage = HIDDEN_PATHS.some((p) => pathname.includes(p));

  useEffect(() => {
    async function fetchAchievements() {
      try {
        const res = await fetch('/api/marketing-content?type=achievement&limit=5');
        const json = await res.json();
        setItems(json.content || []);
      } catch {
        // silently fail
      } finally {
        setLoading(false);
      }
    }
    const timer = setTimeout(() => {
      fetchAchievements();
    }, 5000);
    return () => clearTimeout(timer);
  }, []);

  // Delayed entrance
  useEffect(() => {
    if (!loading && items.length > 0 && !dismissed) {
      const timer = setTimeout(() => setVisible(true), 2000);
      return () => clearTimeout(timer);
    }
  }, [loading, items.length, dismissed]);

  // Broadcast visibility so other floating widgets (e.g. chatbot) can adjust position
  useEffect(() => {
    const shouldShow = visible && !dismissed && !isHiddenPage;
    window.dispatchEvent(
      new CustomEvent('achievement-widget-visibility', { detail: { visible: shouldShow } }),
    );
    return () => {
      window.dispatchEvent(
        new CustomEvent('achievement-widget-visibility', { detail: { visible: false } }),
      );
    };
  }, [visible, dismissed, isHiddenPage]);

  const handleDismiss = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    dismiss();
    setVisible(false);
    setMobileOpen(false);
  }, [dismiss]);

  const handlePrev = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setActiveIndex((prev) => (prev > 0 ? prev - 1 : items.length - 1));
    },
    [items.length],
  );

  const handleNext = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setActiveIndex((prev) => (prev < items.length - 1 ? prev + 1 : 0));
    },
    [items.length],
  );

  const handleViewAll = useCallback(() => {
    router.push('/achievements');
  }, [router]);

  if (loading || items.length === 0 || dismissed || isHiddenPage) return null;

  const current = items[activeIndex];
  const meta = current.metadata;

  // ─── DESKTOP ────────────────────────────────────────
  if (isDesktop) {
    return (
      <>
        <Slide direction="up" in={visible} timeout={slideTimeout} mountOnEnter unmountOnExit>
          <Box
            sx={{
              position: 'fixed',
              bottom: 24,
              right: 24,
              zIndex: 1050,
              width: 360,
              borderRadius: `${t.radius}px`,
              overflow: 'hidden',
              bgcolor: t.surface,
              color: t.ink,
              boxShadow: t.shadowMegaMenu,
              border: `1px solid ${t.line}`,
              borderTop: `3px solid ${t.gold500}`,
              transition: 'border-color 150ms ease',
              '&:hover': { borderColor: t.gold500 },
            }}
          >
            {/* Dismiss button */}
            <IconButton
              onClick={handleDismiss}
              aria-label="Dismiss achievement"
              sx={{
                position: 'absolute',
                top: 0,
                right: 0,
                zIndex: 10,
                width: 44,
                height: 44,
                color: t.inkMuted,
                '&:hover': { color: t.ink, bgcolor: t.surfaceHover },
                '&:focus-visible': { outline: t.focusOutline, outlineOffset: '-2px' },
              }}
            >
              <CloseIcon sx={{ fontSize: 18 }} />
            </IconButton>

            {/* Compact card — click to open detail dialog */}
            <Box
              component="button"
              type="button"
              onClick={() => setDialogOpen(true)}
              aria-haspopup="dialog"
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 2,
                p: 1.5,
                width: '100%',
                border: 0,
                bgcolor: 'transparent',
                color: 'inherit',
                font: 'inherit',
                textAlign: 'left',
                cursor: 'pointer',
                '&:focus-visible': { outline: t.focusOutline, outlineOffset: '-2px' },
              }}
            >
              {/* Student photo thumbnail — use square crop if available */}
              <Box
                sx={{
                  width: 80,
                  height: 80,
                  borderRadius: `${t.radius}px`,
                  overflow: 'hidden',
                  flexShrink: 0,
                  bgcolor: t.navy700,
                  position: 'relative',
                }}
              >
                {(meta.image_crops?.square || current.image_url) ? (
                  <Image
                    src={meta.image_crops?.square || current.image_url!}
                    alt={meta.student_name}
                    fill
                    sizes="80px"
                    style={{ objectFit: 'cover' }}
                  />
                ) : (
                  <Box sx={initialsTileSx}>
                    <Typography
                      sx={{
                        fontSize: 24,
                        fontWeight: 800,
                        color: t.paper,
                      }}
                    >
                      {getInitials(meta.student_name)}
                    </Typography>
                  </Box>
                )}
              </Box>

              {/* Text */}
              <Box sx={{ minWidth: 0, flex: 1, pr: 4 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                  <EmojiEventsIcon aria-hidden sx={{ color: t.gold800, fontSize: 20 }} />
                  <Typography
                    variant="caption"
                    sx={{
                      fontFamily: t.fontMono,
                      color: t.gold800,
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.2em',
                    }}
                  >
                    Achievement
                  </Typography>
                </Box>
                <Typography
                  variant="body2"
                  fontWeight={600}
                  sx={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                  }}
                >
                  {getCompactText(meta)}
                </Typography>
              </Box>
            </Box>
          </Box>
        </Slide>

        {/* ─── DESKTOP DETAIL DIALOG ─── */}
        <Dialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          maxWidth="xs"
          fullWidth
          PaperProps={{
            sx: {
              borderRadius: `${t.radius}px`,
              overflow: 'hidden',
              border: `1px solid ${t.line}`,
              borderTop: `3px solid ${t.gold500}`,
            },
          }}
        >
          {/* Close button */}
          <IconButton
            onClick={() => setDialogOpen(false)}
            aria-label="Close achievement details"
            sx={{ ...overlayCloseSx, top: 8, right: 8 }}
          >
            <CloseIcon />
          </IconButton>

          {/* Photo banner */}
          <PhotoBanner
            imageUrl={meta.image_crops?.banner || current.image_url}
            name={meta.student_name}
            height={220}
            roundedTop
          />

          {/* Achievement details */}
          <AchievementDetail item={current} locale={locale} />

          {/* Navigation + View All */}
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              px: 2,
              pb: 2,
            }}
          >
            <ItemNavigation
              count={items.length}
              activeIndex={activeIndex}
              onPrev={handlePrev}
              onNext={handleNext}
              onSelect={setActiveIndex}
            />
            <Button
              size="small"
              endIcon={<ArrowForwardIcon />}
              onClick={() => {
                setDialogOpen(false);
                handleViewAll();
              }}
              sx={{ textTransform: 'none', fontWeight: 600, minHeight: 44 }}
            >
              View All
            </Button>
          </Box>
        </Dialog>
      </>
    );
  }

  // ─── MOBILE ────────────────────────────────────────
  return (
    <>
      <Slide direction="up" in={visible} timeout={slideTimeout} mountOnEnter unmountOnExit>
        <Box
          sx={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: 1050,
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
            pl: 2,
            pr: 1,
            py: 1,
            bgcolor: t.surface,
            color: t.ink,
            boxShadow: '0 -4px 20px rgba(6,13,31,0.12)',
            borderTop: `3px solid ${t.gold500}`,
          }}
        >
          {/* The whole row opens the details sheet; dismiss is a separate button. */}
          <Box
            component="button"
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-haspopup="dialog"
            sx={{
              flex: 1,
              minWidth: 0,
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
              p: 0.5,
              border: 0,
              bgcolor: 'transparent',
              color: 'inherit',
              font: 'inherit',
              textAlign: 'left',
              cursor: 'pointer',
              borderRadius: `${t.radius}px`,
              '&:focus-visible': { outline: t.focusOutline, outlineOffset: '2px' },
            }}
          >
            {/* Photo thumbnail — use square crop if available */}
            <Box
              sx={{
                width: 48,
                height: 48,
                borderRadius: `${t.radius}px`,
                overflow: 'hidden',
                flexShrink: 0,
                bgcolor: t.navy700,
                position: 'relative',
              }}
            >
              {(meta.image_crops?.square || current.image_url) ? (
                <Image
                  src={meta.image_crops?.square || current.image_url!}
                  alt={meta.student_name}
                  fill
                  sizes="48px"
                  style={{ objectFit: 'cover' }}
                />
              ) : (
                <Box sx={initialsTileSx}>
                  <Typography
                    sx={{
                      fontSize: 16,
                      fontWeight: 800,
                      color: t.paper,
                    }}
                  >
                    {getInitials(meta.student_name)}
                  </Typography>
                </Box>
              )}
            </Box>

            {/* Trophy + text */}
            <EmojiEventsIcon aria-hidden sx={{ color: t.gold800, fontSize: 22, flexShrink: 0 }} />
            <Typography
              variant="body2"
              fontWeight={600}
              sx={{
                flex: 1,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {getCompactText(meta)}
            </Typography>
          </Box>

          {/* Dismiss */}
          <IconButton
            onClick={handleDismiss}
            aria-label="Dismiss achievement"
            sx={{
              flexShrink: 0,
              ml: 0.5,
              width: 44,
              height: 44,
              color: t.inkMuted,
              '&:focus-visible': { outline: t.focusOutline, outlineOffset: '2px' },
            }}
          >
            <CloseIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Box>
      </Slide>

      {/* ─── MOBILE BOTTOM SHEET ─── */}
      <Drawer
        anchor="bottom"
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        PaperProps={{
          sx: {
            borderRadius: `${t.radius}px ${t.radius}px 0 0`,
            maxHeight: '80vh',
            overflow: 'auto',
          },
        }}
      >
        {/* Handle bar */}
        <Box sx={{ display: 'flex', justifyContent: 'center', pt: 1.5, pb: 0.5 }}>
          <Box
            sx={{
              width: 40,
              height: 4,
              borderRadius: `${t.radiusPill}px`,
              bgcolor: t.lineStrong,
            }}
          />
        </Box>

        {/* Close button */}
        <IconButton
          onClick={() => setMobileOpen(false)}
          aria-label="Close achievement details"
          sx={{ ...overlayCloseSx, top: 8, right: 8 }}
        >
          <CloseIcon />
        </IconButton>

        {/* Full-width photo — use mobile crop if available */}
        <PhotoBanner imageUrl={meta.image_crops?.mobile || current.image_url} name={meta.student_name} height={240} />

        {/* Details */}
        <AchievementDetail item={current} locale={locale} />

        {/* Navigation for multiple items */}
        {items.length > 1 && (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              py: 1,
            }}
          >
            <ItemNavigation
              count={items.length}
              activeIndex={activeIndex}
              onPrev={handlePrev}
              onNext={handleNext}
              onSelect={setActiveIndex}
              dotSize={10}
            />
          </Box>
        )}

        {/* View All CTA */}
        <Box sx={{ px: 2.5, pb: 3 }}>
          <Button
            variant="outlined"
            fullWidth
            endIcon={<ArrowForwardIcon />}
            onClick={() => {
              setMobileOpen(false);
              handleViewAll();
            }}
            sx={{
              textTransform: 'none',
              fontWeight: 600,
              py: 1.5,
              minHeight: 48,
              borderRadius: `${t.radius}px`,
            }}
          >
            View All Achievements
          </Button>
        </Box>
      </Drawer>
    </>
  );
}
