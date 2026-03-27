'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Card,
  Typography,
  Avatar,
  Skeleton,
  alpha,
} from '@neram/ui';
import MilitaryTechIcon from '@mui/icons-material/MilitaryTech';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import {
  neramTokens,
  neramFontFamilies,
} from '@neram/ui';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';

// ── Types ──

interface BadgeFeedItem {
  student_id: string;
  student_name: string;
  avatar_url: string | null;
  badge_display_name: string;
  badge_rarity_tier: string;
  badge_icon_svg_path: string;
  earned_at: string;
}

// ── Time ago helper ──

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;

  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;

  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
  });
}

// ── Rarity colors ──

const RARITY_COLORS: Record<string, string> = {
  common: '#8B9DAF',
  rare: '#1a8fff',
  epic: '#9B59B6',
  legendary: '#e8a020',
};

// ── Props ──

interface DashboardBadgeFeedProps {
  classroomId: string;
}

export default function DashboardBadgeFeed({
  classroomId,
}: DashboardBadgeFeedProps) {
  const { getToken } = useNexusAuthContext();
  const [feed, setFeed] = useState<BadgeFeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchFeed = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const token = await getToken();
      if (!token) throw new Error('Not authenticated');

      const res = await fetch(
        `/api/gamification/badges/feed?classroom_id=${classroomId}&limit=5`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Failed: ${res.status}`);
      }

      const json = await res.json();
      setFeed(json.feed || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [classroomId, getToken]);

  useEffect(() => {
    fetchFeed();
  }, [fetchFeed]);

  const hasFeed = feed.length > 0;

  return (
    <Card
      elevation={0}
      sx={{
        bgcolor: neramTokens.navy[800],
        border: `1px solid ${alpha(neramTokens.cream[100], 0.06)}`,
        borderRadius: 3,
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <Box
        sx={{
          px: 2,
          py: 1.5,
          borderBottom: `1px solid ${alpha(neramTokens.cream[100], 0.06)}`,
          display: 'flex',
          alignItems: 'center',
          gap: 1,
        }}
      >
        <MilitaryTechIcon
          sx={{ fontSize: '1.2rem', color: neramTokens.gold[500] }}
        />
        <Typography
          sx={{
            fontFamily: neramFontFamilies.serif,
            fontSize: '0.95rem',
            fontWeight: 600,
            color: neramTokens.cream[100],
          }}
        >
          Badge Feed
        </Typography>
      </Box>

      {/* Content */}
      <Box sx={{ px: 2, py: 1 }}>
        {/* Loading */}
        {loading && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, py: 0.5 }}>
            {[...Array(3)].map((_, i) => (
              <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Skeleton
                  variant="circular"
                  width={32}
                  height={32}
                  sx={{ bgcolor: alpha(neramTokens.cream[100], 0.06) }}
                />
                <Box sx={{ flex: 1 }}>
                  <Skeleton
                    width="70%"
                    height={14}
                    sx={{ bgcolor: alpha(neramTokens.cream[100], 0.06) }}
                  />
                  <Skeleton
                    width="40%"
                    height={12}
                    sx={{ bgcolor: alpha(neramTokens.cream[100], 0.06), mt: 0.5 }}
                  />
                </Box>
              </Box>
            ))}
          </Box>
        )}

        {/* Error */}
        {!loading && error && (
          <Typography
            sx={{
              fontFamily: neramFontFamilies.body,
              fontSize: '0.8rem',
              color: alpha(neramTokens.cream[100], 0.4),
              textAlign: 'center',
              py: 2,
            }}
          >
            {error}
          </Typography>
        )}

        {/* Empty */}
        {!loading && !error && !hasFeed && (
          <Typography
            sx={{
              fontFamily: neramFontFamilies.body,
              fontSize: '0.85rem',
              color: alpha(neramTokens.cream[100], 0.4),
              textAlign: 'center',
              py: 3,
            }}
          >
            No badges earned yet
          </Typography>
        )}

        {/* Feed items */}
        {!loading && hasFeed && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            {feed.map((item, idx) => {
              const rarityColor =
                RARITY_COLORS[item.badge_rarity_tier] || RARITY_COLORS.common;

              return (
                <Box
                  key={`${item.student_id}-${item.earned_at}-${idx}`}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.25,
                    py: 1,
                    borderBottom:
                      idx < feed.length - 1
                        ? `1px solid ${alpha(neramTokens.cream[100], 0.04)}`
                        : 'none',
                  }}
                >
                  {/* Student avatar */}
                  <Avatar
                    src={item.avatar_url || undefined}
                    alt={item.student_name}
                    sx={{
                      width: 32,
                      height: 32,
                      fontSize: '0.75rem',
                      fontFamily: neramFontFamilies.body,
                      bgcolor: alpha(neramTokens.cream[100], 0.08),
                      color: alpha(neramTokens.cream[100], 0.6),
                    }}
                  >
                    {item.student_name?.charAt(0)?.toUpperCase() || '?'}
                  </Avatar>

                  {/* Text */}
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography
                      sx={{
                        fontFamily: neramFontFamilies.body,
                        fontSize: '0.8rem',
                        color: neramTokens.cream[100],
                        lineHeight: 1.3,
                      }}
                    >
                      <Box
                        component="span"
                        sx={{ fontWeight: 600 }}
                      >
                        {item.student_name}
                      </Box>
                      {' earned '}
                      <Box
                        component="span"
                        sx={{ fontWeight: 600, color: rarityColor }}
                      >
                        {item.badge_display_name}
                      </Box>
                    </Typography>
                    <Typography
                      sx={{
                        fontFamily: neramFontFamilies.body,
                        fontSize: '0.65rem',
                        color: alpha(neramTokens.cream[100], 0.35),
                        mt: 0.25,
                      }}
                    >
                      {timeAgo(item.earned_at)}
                    </Typography>
                  </Box>

                  {/* Badge icon */}
                  <Box
                    component="img"
                    src={item.badge_icon_svg_path}
                    alt={item.badge_display_name}
                    sx={{
                      width: 28,
                      height: 28,
                      objectFit: 'contain',
                      flexShrink: 0,
                    }}
                  />
                </Box>
              );
            })}
          </Box>
        )}
      </Box>

      {/* Footer */}
      {!loading && !error && (
        <Box
          sx={{
            px: 2,
            py: 1.25,
            borderTop: `1px solid ${alpha(neramTokens.cream[100], 0.06)}`,
            display: 'flex',
            justifyContent: 'flex-end',
          }}
        >
          <Box
            component="a"
            href="/student/badges"
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.5,
              textDecoration: 'none',
              color: neramTokens.blue[500],
              fontFamily: neramFontFamilies.body,
              fontSize: '0.75rem',
              fontWeight: 600,
              '&:hover': { color: neramTokens.blue[400] },
            }}
          >
            View All Badges
            <ArrowForwardIcon sx={{ fontSize: '0.85rem' }} />
          </Box>
        </Box>
      )}
    </Card>
  );
}
