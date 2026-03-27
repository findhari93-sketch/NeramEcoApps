'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Drawer,
  Box,
  Typography,
  IconButton,
  Avatar,
  Skeleton,
  Divider,
  alpha,
  useMediaQuery,
  useTheme,
} from '@neram/ui';
import CloseIcon from '@mui/icons-material/Close';
import EmojiEventsOutlinedIcon from '@mui/icons-material/EmojiEventsOutlined';
import type {
  StudentAchievementProfile,
  BadgeCatalogEntry,
  GamificationPointEventType,
} from '@neram/database/types';
import {
  neramTokens,
  neramFontFamilies,
  neramShadows,
} from '@neram/ui';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import StudentStatsRow from './StudentStatsRow';
import BadgeGrid from './BadgeGrid';
import ActivityFeed from './ActivityFeed';
import AttendanceHeatmap from './AttendanceHeatmap';

// ── Points breakdown (self-view only) ──

interface PointsBreakdownEntry {
  event_type: GamificationPointEventType;
  total_points: number;
  count: number;
}

function PointsBreakdown({ breakdown }: { breakdown: PointsBreakdownEntry[] }) {
  if (!breakdown || breakdown.length === 0) return null;

  const totalPoints = breakdown.reduce((sum, e) => sum + e.total_points, 0);

  const labels: Record<string, string> = {
    class_attended: 'Class Attendance',
    checklist_item_completed: 'Checklist Items',
    full_checklist_completed: 'Full Checklists',
    drawing_submitted: 'Drawings Submitted',
    drawing_reviewed: 'Drawing Reviews',
    streak_day: 'Streak Days',
    streak_milestone: 'Streak Milestones',
    quiz_completed: 'Quizzes',
    peer_help: 'Peer Help',
    badge_bonus: 'Badge Bonuses',
    manual_teacher_award: 'Teacher Awards',
  };

  return (
    <Box>
      <Typography
        sx={{
          fontFamily: neramFontFamilies.serif,
          fontSize: '1rem',
          fontWeight: 600,
          color: neramTokens.cream[100],
          mb: 1.5,
        }}
      >
        Points Breakdown (This Week)
      </Typography>

      <Box
        sx={{
          bgcolor: alpha(neramTokens.navy[700], 0.4),
          borderRadius: 2,
          border: `1px solid ${alpha(neramTokens.cream[100], 0.06)}`,
          overflow: 'hidden',
        }}
      >
        {breakdown.map((entry, idx) => (
          <Box
            key={entry.event_type}
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              px: 2,
              py: 1.25,
              borderBottom:
                idx < breakdown.length - 1
                  ? `1px solid ${alpha(neramTokens.cream[100], 0.06)}`
                  : 'none',
            }}
          >
            <Typography
              sx={{
                fontFamily: neramFontFamilies.body,
                fontSize: '0.8rem',
                color: neramTokens.cream[100],
              }}
            >
              {labels[entry.event_type] || entry.event_type}
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography
                sx={{
                  fontFamily: neramFontFamilies.mono,
                  fontSize: '0.7rem',
                  color: alpha(neramTokens.cream[100], 0.4),
                }}
              >
                x{entry.count}
              </Typography>
              <Typography
                sx={{
                  fontFamily: neramFontFamilies.mono,
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  color: neramTokens.gold[500],
                }}
              >
                +{entry.total_points}
              </Typography>
            </Box>
          </Box>
        ))}

        {/* Total row */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            px: 2,
            py: 1.25,
            bgcolor: alpha(neramTokens.gold[500], 0.05),
            borderTop: `1px solid ${alpha(neramTokens.gold[500], 0.15)}`,
          }}
        >
          <Typography
            sx={{
              fontFamily: neramFontFamilies.body,
              fontSize: '0.85rem',
              fontWeight: 600,
              color: neramTokens.cream[100],
            }}
          >
            Total
          </Typography>
          <Typography
            sx={{
              fontFamily: neramFontFamilies.serif,
              fontSize: '1.1rem',
              fontWeight: 700,
              color: neramTokens.gold[500],
            }}
          >
            {totalPoints} pts
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}

// ── Profile header ──

function StudentProfileHeader({
  profile,
}: {
  profile: StudentAchievementProfile & { is_self?: boolean; current_rank?: number | null };
}) {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 1,
        pt: 1,
        pb: 2,
      }}
    >
      <Avatar
        src={profile.avatar_url || undefined}
        alt={profile.student_name}
        sx={{
          width: 96,
          height: 96,
          fontSize: '2rem',
          fontFamily: neramFontFamilies.serif,
          bgcolor: alpha(neramTokens.gold[500], 0.15),
          color: neramTokens.gold[500],
          border: `3px solid ${alpha(neramTokens.gold[500], 0.3)}`,
        }}
      >
        {profile.student_name?.charAt(0)?.toUpperCase() || '?'}
      </Avatar>

      <Typography
        sx={{
          fontFamily: neramFontFamilies.serif,
          fontSize: '1.35rem',
          fontWeight: 700,
          color: neramTokens.cream[100],
          textAlign: 'center',
          lineHeight: 1.2,
        }}
      >
        {profile.student_name}
      </Typography>

      {profile.batch_name && (
        <Typography
          sx={{
            fontFamily: neramFontFamilies.body,
            fontSize: '0.8rem',
            color: alpha(neramTokens.cream[100], 0.5),
          }}
        >
          {profile.batch_name}
          {profile.classroom_name ? ` \u2022 ${profile.classroom_name}` : ''}
        </Typography>
      )}

      {profile.current_rank != null && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
            bgcolor: alpha(neramTokens.gold[500], 0.1),
            border: `1px solid ${alpha(neramTokens.gold[500], 0.2)}`,
            borderRadius: 5,
            px: 1.5,
            py: 0.5,
          }}
        >
          <EmojiEventsOutlinedIcon
            sx={{ fontSize: '0.9rem', color: neramTokens.gold[500] }}
          />
          <Typography
            sx={{
              fontFamily: neramFontFamilies.mono,
              fontSize: '0.75rem',
              fontWeight: 600,
              color: neramTokens.gold[500],
            }}
          >
            Rank #{profile.current_rank}
          </Typography>
        </Box>
      )}
    </Box>
  );
}

// ── Main drawer ──

interface StudentProfileDrawerProps {
  studentId: string | null;
  open: boolean;
  onClose: () => void;
}

interface ExtendedProfile extends StudentAchievementProfile {
  is_self?: boolean;
  points_breakdown?: PointsBreakdownEntry[];
}

export default function StudentProfileDrawer({
  studentId,
  open,
  onClose,
}: StudentProfileDrawerProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { getToken } = useNexusAuthContext();

  const [profile, setProfile] = useState<ExtendedProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchProfile = useCallback(async () => {
    if (!studentId) return;

    setLoading(true);
    setError(null);

    try {
      const token = await getToken();
      if (!token) throw new Error('Not authenticated');

      const res = await fetch(`/api/gamification/profile/${studentId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Failed: ${res.status}`);
      }

      const data = await res.json();
      setProfile(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load profile');
    } finally {
      setLoading(false);
    }
  }, [studentId, getToken]);

  useEffect(() => {
    if (open && studentId) {
      fetchProfile();
    }
    if (!open) {
      // Reset on close
      setProfile(null);
      setError(null);
    }
  }, [open, studentId, fetchProfile]);

  // Build badge catalog from profile data
  const badgeCatalog: BadgeCatalogEntry[] = (profile?.badges || []).map((b) => ({
    ...b.badge,
    earned: true,
    earned_at: b.earned_at,
  }));

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{
        sx: {
          width: isMobile ? '100%' : 400,
          maxWidth: '100%',
          bgcolor: neramTokens.navy[900],
          backgroundImage: 'none',
          borderLeft: isMobile
            ? 'none'
            : `1px solid ${alpha(neramTokens.cream[100], 0.06)}`,
        },
      }}
    >
      {/* Header bar with close */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 2,
          py: 1.5,
          borderBottom: `1px solid ${alpha(neramTokens.cream[100], 0.06)}`,
          position: 'sticky',
          top: 0,
          zIndex: 10,
          bgcolor: neramTokens.navy[900],
        }}
      >
        <Typography
          sx={{
            fontFamily: neramFontFamilies.serif,
            fontSize: '1.1rem',
            fontWeight: 600,
            color: neramTokens.cream[100],
          }}
        >
          Achievement Profile
        </Typography>
        <IconButton
          onClick={onClose}
          sx={{
            color: alpha(neramTokens.cream[100], 0.6),
            '&:hover': { color: neramTokens.cream[100] },
          }}
          size="small"
        >
          <CloseIcon />
        </IconButton>
      </Box>

      {/* Content */}
      <Box
        sx={{
          flex: 1,
          overflowY: 'auto',
          px: 2,
          py: 2,
          display: 'flex',
          flexDirection: 'column',
          gap: 3,
        }}
      >
        {/* Loading state */}
        {loading && (
          <>
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5, py: 2 }}>
              <Skeleton
                variant="circular"
                width={96}
                height={96}
                sx={{ bgcolor: alpha(neramTokens.cream[100], 0.06) }}
              />
              <Skeleton
                width={160}
                height={28}
                sx={{ bgcolor: alpha(neramTokens.cream[100], 0.06) }}
              />
              <Skeleton
                width={120}
                height={18}
                sx={{ bgcolor: alpha(neramTokens.cream[100], 0.06) }}
              />
            </Box>
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: 1.5,
              }}
            >
              {[...Array(4)].map((_, i) => (
                <Skeleton
                  key={i}
                  variant="rounded"
                  height={80}
                  sx={{
                    bgcolor: alpha(neramTokens.cream[100], 0.06),
                    borderRadius: 2,
                  }}
                />
              ))}
            </Box>
            <Skeleton
              variant="rounded"
              height={200}
              sx={{
                bgcolor: alpha(neramTokens.cream[100], 0.06),
                borderRadius: 2,
              }}
            />
          </>
        )}

        {/* Error state */}
        {!loading && error && (
          <Box sx={{ py: 4, textAlign: 'center' }}>
            <Typography
              sx={{
                fontFamily: neramFontFamilies.body,
                fontSize: '0.85rem',
                color: neramTokens.error,
              }}
            >
              {error}
            </Typography>
          </Box>
        )}

        {/* Profile content */}
        {!loading && profile && (
          <>
            <StudentProfileHeader profile={profile} />

            <StudentStatsRow
              streak={profile.streak?.current_streak || 0}
              attendancePct={profile.attendance_pct}
              tasksCompleted={profile.total_checklists_completed}
              badgeCount={profile.total_badges}
            />

            <Divider sx={{ borderColor: alpha(neramTokens.cream[100], 0.06) }} />

            <BadgeGrid badges={badgeCatalog} />

            <Divider sx={{ borderColor: alpha(neramTokens.cream[100], 0.06) }} />

            <ActivityFeed activities={profile.recent_activity} />

            <Divider sx={{ borderColor: alpha(neramTokens.cream[100], 0.06) }} />

            <AttendanceHeatmap heatmap={profile.attendance_heatmap} />

            {/* Self-view: Points Breakdown */}
            {profile.is_self && profile.points_breakdown && (
              <>
                <Divider sx={{ borderColor: alpha(neramTokens.cream[100], 0.06) }} />
                <PointsBreakdown breakdown={profile.points_breakdown} />
              </>
            )}
          </>
        )}
      </Box>
    </Drawer>
  );
}
