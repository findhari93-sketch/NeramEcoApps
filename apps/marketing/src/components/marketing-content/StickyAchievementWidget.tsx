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
} from '@neram/ui';
import { useTheme, useMediaQuery } from '@mui/material';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import CloseIcon from '@mui/icons-material/Close';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import { useRouter } from 'next/navigation';

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
        borderRadius: roundedTop ? '12px 12px 0 0' : 0,
        overflow: 'hidden',
        bgcolor: 'warning.light',
      }}
    >
      {imageUrl ? (
        <Box
          component="img"
          src={imageUrl}
          alt={name}
          sx={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: 'block',
          }}
        />
      ) : (
        <Box
          sx={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'linear-gradient(135deg, #F9A825 0%, #FFD54F 50%, #F9A825 100%)',
          }}
        >
          <Typography
            sx={{
              fontSize: height * 0.35,
              fontWeight: 800,
              color: 'rgba(255,255,255,0.85)',
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
          background: 'linear-gradient(transparent, rgba(0,0,0,0.7))',
        }}
      >
        <Typography variant="h6" sx={{ color: '#fff', fontWeight: 700, lineHeight: 1.2 }}>
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
            sx={{
              bgcolor: 'warning.50',
              color: 'warning.dark',
              fontWeight: 600,
              '& .MuiChip-icon': { color: 'warning.main' },
            }}
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
            borderLeft: '3px solid',
            borderColor: 'warning.main',
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
      <IconButton size="small" onClick={onPrev}>
        <ChevronLeftIcon fontSize="small" />
      </IconButton>
      {Array.from({ length: count }).map((_, i) => (
        <Box
          key={i}
          sx={{
            width: dotSize,
            height: dotSize,
            borderRadius: '50%',
            bgcolor: i === activeIndex ? 'warning.main' : 'grey.300',
            transition: 'background-color 0.2s',
            cursor: 'pointer',
          }}
          onClick={(e) => {
            e.stopPropagation();
            onSelect(i);
          }}
        />
      ))}
      <IconButton size="small" onClick={onNext}>
        <ChevronRightIcon fontSize="small" />
      </IconButton>
    </Box>
  );
}

export default function StickyAchievementWidget({ locale = 'en' }: { locale?: string }) {
  const [items, setItems] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [visible, setVisible] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));
  const router = useRouter();

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
    fetchAchievements();
  }, []);

  // Delayed entrance
  useEffect(() => {
    if (!loading && items.length > 0 && !dismissed) {
      const timer = setTimeout(() => setVisible(true), 2000);
      return () => clearTimeout(timer);
    }
  }, [loading, items.length, dismissed]);

  const handleDismiss = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setDismissed(true);
    setVisible(false);
    setMobileOpen(false);
  }, []);

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

  if (loading || items.length === 0 || dismissed) return null;

  const current = items[activeIndex];
  const meta = current.metadata;

  // M3 emphasized easing for smooth, natural transitions
  const smoothEasing = 'cubic-bezier(0.4, 0, 0.2, 1)';

  // ─── DESKTOP ────────────────────────────────────────
  if (isDesktop) {
    return (
      <Slide direction="up" in={visible} mountOnEnter unmountOnExit>
        <Box
          onMouseEnter={() => setExpanded(true)}
          onMouseLeave={() => setExpanded(false)}
          sx={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            zIndex: 1050,
            width: expanded ? 400 : 360,
            borderRadius: 3,
            overflow: 'hidden',
            bgcolor: 'background.paper',
            boxShadow: expanded
              ? '0 16px 48px rgba(0,0,0,0.22)'
              : '0 8px 32px rgba(0,0,0,0.18)',
            border: '2px solid',
            borderColor: 'warning.main',
            animation: 'goldBorderPulse 3s ease-in-out 1',
            transition: `all 0.45s ${smoothEasing}`,
          }}
        >
          {/* Dismiss button */}
          <IconButton
            size="small"
            onClick={handleDismiss}
            sx={{
              position: 'absolute',
              top: 6,
              right: 6,
              zIndex: 10,
              bgcolor: 'rgba(0,0,0,0.5)',
              color: '#fff',
              '&:hover': { bgcolor: 'rgba(0,0,0,0.7)' },
              width: 28,
              height: 28,
            }}
          >
            <CloseIcon sx={{ fontSize: 16 }} />
          </IconButton>

          {/* ─── COLLAPSED VIEW (fades out when expanded) ─── */}
          <Box
            sx={{
              opacity: expanded ? 0 : 1,
              maxHeight: expanded ? 0 : 120,
              overflow: 'hidden',
              transition: `opacity 0.3s ${smoothEasing}, max-height 0.45s ${smoothEasing}`,
              pointerEvents: expanded ? 'none' : 'auto',
            }}
          >
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 2,
                p: 1.5,
                cursor: 'pointer',
              }}
            >
              {/* Student photo thumbnail — use square crop if available */}
              <Box
                sx={{
                  width: 80,
                  height: 80,
                  borderRadius: 2,
                  overflow: 'hidden',
                  flexShrink: 0,
                  bgcolor: 'warning.light',
                }}
              >
                {(meta.image_crops?.square || current.image_url) ? (
                  <Box
                    component="img"
                    src={meta.image_crops?.square || current.image_url!}
                    alt={meta.student_name}
                    sx={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      display: 'block',
                    }}
                  />
                ) : (
                  <Box
                    sx={{
                      width: '100%',
                      height: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: 'linear-gradient(135deg, #F9A825 0%, #FFD54F 100%)',
                    }}
                  >
                    <Typography
                      sx={{
                        fontSize: 24,
                        fontWeight: 800,
                        color: 'rgba(255,255,255,0.85)',
                      }}
                    >
                      {getInitials(meta.student_name)}
                    </Typography>
                  </Box>
                )}
              </Box>

              {/* Text */}
              <Box sx={{ minWidth: 0, flex: 1, pr: 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                  <EmojiEventsIcon
                    sx={{
                      color: 'warning.main',
                      fontSize: 20,
                      animation: 'trophyBounce 1s ease-in-out 1',
                    }}
                  />
                  <Typography
                    variant="caption"
                    sx={{
                      color: 'warning.dark',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: 0.5,
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

          {/* ─── EXPANDED VIEW (fades in with slight delay) ─── */}
          <Box
            sx={{
              opacity: expanded ? 1 : 0,
              maxHeight: expanded ? 600 : 0,
              overflow: 'hidden',
              transition: `opacity 0.35s ${smoothEasing} ${expanded ? '0.1s' : '0s'}, max-height 0.45s ${smoothEasing}`,
              pointerEvents: expanded ? 'auto' : 'none',
            }}
          >
            <PhotoBanner
              imageUrl={meta.image_crops?.banner || current.image_url}
              name={meta.student_name}
              height={180}
              roundedTop
            />
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
                onClick={handleViewAll}
                sx={{ textTransform: 'none', fontWeight: 600 }}
              >
                View All
              </Button>
            </Box>
          </Box>
        </Box>
      </Slide>
    );
  }

  // ─── MOBILE ────────────────────────────────────────
  return (
    <>
      <Slide direction="up" in={visible} mountOnEnter unmountOnExit>
        <Box
          onClick={() => setMobileOpen(true)}
          sx={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: 1050,
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            px: 2,
            py: 1.5,
            bgcolor: 'background.paper',
            boxShadow: '0 -4px 20px rgba(0,0,0,0.12)',
            borderTop: '2px solid',
            borderColor: 'warning.main',
            animation: 'goldBorderPulse 3s ease-in-out 1',
            cursor: 'pointer',
          }}
        >
          {/* Photo thumbnail — use square crop if available */}
          <Box
            sx={{
              width: 48,
              height: 48,
              borderRadius: 1.5,
              overflow: 'hidden',
              flexShrink: 0,
              bgcolor: 'warning.light',
            }}
          >
            {(meta.image_crops?.square || current.image_url) ? (
              <Box
                component="img"
                src={meta.image_crops?.square || current.image_url!}
                alt={meta.student_name}
                sx={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  display: 'block',
                }}
              />
            ) : (
              <Box
                sx={{
                  width: '100%',
                  height: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'linear-gradient(135deg, #F9A825 0%, #FFD54F 100%)',
                }}
              >
                <Typography
                  sx={{
                    fontSize: 16,
                    fontWeight: 800,
                    color: 'rgba(255,255,255,0.85)',
                  }}
                >
                  {getInitials(meta.student_name)}
                </Typography>
              </Box>
            )}
          </Box>

          {/* Trophy + text */}
          <EmojiEventsIcon
            sx={{
              color: 'warning.main',
              fontSize: 22,
              animation: 'trophyBounce 1s ease-in-out 1',
              flexShrink: 0,
            }}
          />
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

          {/* Dismiss */}
          <IconButton
            size="small"
            onClick={handleDismiss}
            sx={{ flexShrink: 0, ml: 0.5 }}
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
            borderRadius: '16px 16px 0 0',
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
              borderRadius: 2,
              bgcolor: 'grey.300',
            }}
          />
        </Box>

        {/* Close button */}
        <IconButton
          onClick={() => setMobileOpen(false)}
          sx={{ position: 'absolute', top: 8, right: 8, zIndex: 10 }}
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
              borderColor: 'warning.main',
              color: 'warning.dark',
              '&:hover': { borderColor: 'warning.dark', bgcolor: 'warning.50' },
            }}
          >
            View All Achievements
          </Button>
        </Box>
      </Drawer>
    </>
  );
}
