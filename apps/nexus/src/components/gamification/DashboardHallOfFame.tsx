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
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import LocalFireDepartmentIcon from '@mui/icons-material/LocalFireDepartment';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import {
  neramTokens,
  neramFontFamilies,
  neramShadows,
} from '@neram/ui';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';

// ── Types (from dashboard API) ──

interface TopPerformer {
  rank: number;
  student_id: string;
  student_name: string;
  avatar_url: string | null;
  raw_score: number;
  streak_length: number;
}

interface DashboardData {
  top_performers: TopPerformer[];
  my_rank: number | null;
  my_rank_change: number;
}

// ── Rank medal colors ──

const RANK_COLORS: Record<number, string> = {
  1: '#FFD700', // Gold
  2: '#C0C0C0', // Silver
  3: '#CD7F32', // Bronze
};

// ── Props ──

interface DashboardHallOfFameProps {
  classroomId: string;
}

export default function DashboardHallOfFame({
  classroomId,
}: DashboardHallOfFameProps) {
  const { getToken } = useNexusAuthContext();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const token = await getToken();
      if (!token) throw new Error('Not authenticated');

      const res = await fetch(
        `/api/gamification/dashboard?classroom_id=${classroomId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Failed: ${res.status}`);
      }

      const json = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [classroomId, getToken]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const hasPerformers = data && data.top_performers && data.top_performers.length > 0;

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
      {/* Gold accent header */}
      <Box
        sx={{
          px: 2,
          py: 1.5,
          background: `linear-gradient(135deg, ${alpha(neramTokens.gold[500], 0.12)} 0%, ${alpha(neramTokens.gold[500], 0.04)} 100%)`,
          borderBottom: `1px solid ${alpha(neramTokens.gold[500], 0.15)}`,
          display: 'flex',
          alignItems: 'center',
          gap: 1,
        }}
      >
        <EmojiEventsIcon
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
          This Week&apos;s Top Performers
        </Typography>
      </Box>

      {/* Content */}
      <Box sx={{ px: 2, py: 1.5 }}>
        {/* Loading */}
        {loading && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {[...Array(3)].map((_, i) => (
              <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Skeleton
                  variant="circular"
                  width={36}
                  height={36}
                  sx={{ bgcolor: alpha(neramTokens.cream[100], 0.06) }}
                />
                <Box sx={{ flex: 1 }}>
                  <Skeleton
                    width={100}
                    height={16}
                    sx={{ bgcolor: alpha(neramTokens.cream[100], 0.06) }}
                  />
                </Box>
                <Skeleton
                  width={40}
                  height={16}
                  sx={{ bgcolor: alpha(neramTokens.cream[100], 0.06) }}
                />
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

        {/* Empty state */}
        {!loading && !error && !hasPerformers && (
          <Typography
            sx={{
              fontFamily: neramFontFamilies.body,
              fontSize: '0.85rem',
              color: alpha(neramTokens.cream[100], 0.4),
              textAlign: 'center',
              py: 3,
            }}
          >
            No activity this week yet
          </Typography>
        )}

        {/* Top 3 performers */}
        {!loading && hasPerformers && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {data!.top_performers.slice(0, 3).map((performer) => {
              const medalColor = RANK_COLORS[performer.rank] || alpha(neramTokens.cream[100], 0.3);

              return (
                <Box
                  key={performer.student_id}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.5,
                    py: 0.75,
                  }}
                >
                  {/* Rank number */}
                  <Typography
                    sx={{
                      fontFamily: neramFontFamilies.mono,
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      color: medalColor,
                      width: 20,
                      textAlign: 'center',
                    }}
                  >
                    #{performer.rank}
                  </Typography>

                  {/* Avatar */}
                  <Avatar
                    src={performer.avatar_url || undefined}
                    alt={performer.student_name}
                    sx={{
                      width: 36,
                      height: 36,
                      fontSize: '0.85rem',
                      fontFamily: neramFontFamilies.body,
                      bgcolor: alpha(medalColor, 0.15),
                      color: medalColor,
                      border: `2px solid ${alpha(medalColor, 0.3)}`,
                    }}
                  >
                    {performer.student_name?.charAt(0)?.toUpperCase() || '?'}
                  </Avatar>

                  {/* Name */}
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography
                      sx={{
                        fontFamily: neramFontFamilies.body,
                        fontSize: '0.85rem',
                        fontWeight: 600,
                        color: neramTokens.cream[100],
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {performer.student_name}
                    </Typography>
                  </Box>

                  {/* Points */}
                  <Typography
                    sx={{
                      fontFamily: neramFontFamilies.mono,
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      color: neramTokens.gold[500],
                    }}
                  >
                    {performer.raw_score}
                  </Typography>

                  {/* Streak */}
                  {performer.streak_length > 0 && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
                      <LocalFireDepartmentIcon
                        sx={{
                          fontSize: '0.85rem',
                          color:
                            performer.streak_length >= 7
                              ? '#ff6b35'
                              : neramTokens.gold[500],
                        }}
                      />
                      <Typography
                        sx={{
                          fontFamily: neramFontFamilies.mono,
                          fontSize: '0.65rem',
                          color: alpha(neramTokens.cream[100], 0.5),
                        }}
                      >
                        {performer.streak_length}
                      </Typography>
                    </Box>
                  )}
                </Box>
              );
            })}
          </Box>
        )}
      </Box>

      {/* Footer: My rank + View All */}
      {!loading && !error && (
        <Box
          sx={{
            px: 2,
            py: 1.25,
            borderTop: `1px solid ${alpha(neramTokens.cream[100], 0.06)}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          {/* My rank */}
          {data?.my_rank != null && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
              <Typography
                sx={{
                  fontFamily: neramFontFamilies.body,
                  fontSize: '0.75rem',
                  color: alpha(neramTokens.cream[100], 0.5),
                }}
              >
                Your rank:
              </Typography>
              <Typography
                sx={{
                  fontFamily: neramFontFamilies.mono,
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  color: neramTokens.cream[100],
                }}
              >
                #{data.my_rank}
              </Typography>
              {data.my_rank_change !== 0 && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
                  {data.my_rank_change > 0 ? (
                    <TrendingUpIcon
                      sx={{ fontSize: '0.85rem', color: neramTokens.success }}
                    />
                  ) : (
                    <TrendingDownIcon
                      sx={{ fontSize: '0.85rem', color: neramTokens.error }}
                    />
                  )}
                  <Typography
                    sx={{
                      fontFamily: neramFontFamilies.mono,
                      fontSize: '0.65rem',
                      fontWeight: 600,
                      color:
                        data.my_rank_change > 0
                          ? neramTokens.success
                          : neramTokens.error,
                    }}
                  >
                    {Math.abs(data.my_rank_change)}
                  </Typography>
                </Box>
              )}
            </Box>
          )}

          {data?.my_rank == null && <Box />}

          {/* View All */}
          <Box
            component="a"
            href="/student/leaderboard"
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
            View All
            <ArrowForwardIcon sx={{ fontSize: '0.85rem' }} />
          </Box>
        </Box>
      )}
    </Card>
  );
}
