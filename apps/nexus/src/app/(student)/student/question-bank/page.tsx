'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  Typography,
  Paper,
  Skeleton,
  alpha,
  useTheme,
} from '@neram/ui';
import CalendarTodayOutlinedIcon from '@mui/icons-material/CalendarTodayOutlined';
import TopicOutlinedIcon from '@mui/icons-material/TopicOutlined';
import CategoryOutlinedIcon from '@mui/icons-material/CategoryOutlined';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import BlockOutlinedIcon from '@mui/icons-material/BlockOutlined';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import StatsRow from '@/components/question-bank/StatsRow';
import PresetChips from '@/components/question-bank/PresetChips';
import QuestionCard from '@/components/question-bank/QuestionCard';
import type {
  NexusQBQuestionListItem,
  NexusQBSavedPreset,
  QBProgressStats,
  NexusQBClassroomLink,
} from '@neram/database';

export default function QuestionBankHome() {
  const router = useRouter();
  const theme = useTheme();
  const { activeClassroom, getToken } = useNexusAuthContext();

  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [stats, setStats] = useState<QBProgressStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [presets, setPresets] = useState<NexusQBSavedPreset[]>([]);
  const [presetsLoading, setPresetsLoading] = useState(true);
  const [recentQuestions, setRecentQuestions] = useState<NexusQBQuestionListItem[]>([]);
  const [recentLoading, setRecentLoading] = useState(true);

  useEffect(() => {
    if (!activeClassroom) return;
    checkAccess();
  }, [activeClassroom]);

  useEffect(() => {
    if (enabled !== true) return;
    fetchStats();
    fetchPresets();
    fetchRecent();
  }, [enabled]);

  async function checkAccess() {
    setCheckingAccess(true);
    try {
      const token = await getToken();
      const res = await fetch(
        `/api/question-bank/classroom-link?classroom_id=${activeClassroom!.id}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) {
        setEnabled(false);
        return;
      }
      const json = await res.json();
      const link = json.data as NexusQBClassroomLink | null;
      setEnabled(link?.is_active === true);
    } catch {
      setEnabled(false);
    } finally {
      setCheckingAccess(false);
    }
  }

  async function fetchStats() {
    setStatsLoading(true);
    try {
      const token = await getToken();
      const res = await fetch(
        `/api/question-bank/stats?classroom_id=${activeClassroom!.id}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (res.ok) {
        const json = await res.json();
        setStats(json.data || json);
      }
    } catch (err) {
      console.error('Failed to fetch stats:', err);
    } finally {
      setStatsLoading(false);
    }
  }

  async function fetchPresets() {
    setPresetsLoading(true);
    try {
      const token = await getToken();
      const res = await fetch(
        `/api/question-bank/presets?classroom_id=${activeClassroom!.id}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (res.ok) {
        const json = await res.json();
        setPresets(json.data || json || []);
      }
    } catch (err) {
      console.error('Failed to fetch presets:', err);
    } finally {
      setPresetsLoading(false);
    }
  }

  async function fetchRecent() {
    setRecentLoading(true);
    try {
      const token = await getToken();
      const res = await fetch(
        `/api/question-bank/questions?classroom_id=${activeClassroom!.id}&page_size=5&status=attempted&sort=recent`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (res.ok) {
        const json = await res.json();
        setRecentQuestions(json.data || json.questions || []);
      }
    } catch (err) {
      console.error('Failed to fetch recent:', err);
    } finally {
      setRecentLoading(false);
    }
  }

  function handlePresetSelect(preset: NexusQBSavedPreset) {
    router.push(`/student/question-bank/questions?preset=${preset.id}`);
  }

  // Loading state
  if (checkingAccess) {
    return (
      <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 600, mx: 'auto' }}>
        <Skeleton variant="text" width={180} height={36} sx={{ mb: 2 }} />
        <Box sx={{ display: 'flex', gap: 1, mb: 3 }}>
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} variant="rounded" height={100} sx={{ flex: 1 }} />
          ))}
        </Box>
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} variant="rounded" height={72} sx={{ mb: 1.5 }} />
        ))}
      </Box>
    );
  }

  // Not enabled
  if (enabled === false) {
    return (
      <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 600, mx: 'auto' }}>
        <Typography variant="h5" fontWeight={700} sx={{ mb: 3 }}>
          Question Bank
        </Typography>
        <Paper
          variant="outlined"
          sx={{
            p: 4,
            textAlign: 'center',
            borderRadius: 2,
          }}
        >
          <BlockOutlinedIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
          <Typography variant="body1" color="text.secondary">
            Question Bank is not available for this classroom yet.
          </Typography>
        </Paper>
      </Box>
    );
  }

  const exploreCards = [
    {
      icon: <CalendarTodayOutlinedIcon />,
      title: 'Browse by Year',
      href: '/student/question-bank/questions',
    },
    {
      icon: <TopicOutlinedIcon />,
      title: 'Browse by Topic',
      href: '/student/question-bank/questions',
    },
    {
      icon: <CategoryOutlinedIcon />,
      title: 'Browse by Category',
      href: '/student/question-bank/questions',
    },
  ];

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 600, mx: 'auto' }}>
      <Typography variant="h5" fontWeight={700} sx={{ mb: 3 }}>
        Question Bank
      </Typography>

      {/* Stats */}
      <Box sx={{ mb: 3 }}>
        <StatsRow stats={stats} loading={statsLoading} />
      </Box>

      {/* Saved Presets */}
      <Box sx={{ mb: 3 }}>
        <PresetChips
          presets={presets}
          loading={presetsLoading}
          onSelect={handlePresetSelect}
        />
      </Box>

      {/* Explore */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
          Explore
        </Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {exploreCards.map((card) => (
            <Paper
              key={card.title}
              variant="outlined"
              onClick={() => router.push(card.href)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  router.push(card.href);
                }
              }}
              sx={{
                p: 2,
                display: 'flex',
                alignItems: 'center',
                gap: 2,
                cursor: 'pointer',
                borderRadius: 2,
                transition: 'all 0.2s',
                '&:hover': {
                  borderColor: alpha(theme.palette.primary.main, 0.4),
                  boxShadow: theme.shadows[2],
                },
                '&:focus-visible': {
                  outline: `2px solid ${theme.palette.primary.main}`,
                  outlineOffset: 2,
                },
              }}
            >
              <Box
                sx={{
                  width: 40,
                  height: 40,
                  borderRadius: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  bgcolor: alpha(theme.palette.primary.main, 0.08),
                  color: theme.palette.primary.main,
                }}
              >
                {card.icon}
              </Box>
              <Typography variant="body1" fontWeight={500} sx={{ flex: 1 }}>
                {card.title}
              </Typography>
              <ChevronRightIcon sx={{ color: 'text.secondary' }} />
            </Paper>
          ))}
        </Box>
      </Box>

      {/* Continue Practice */}
      <Box>
        <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
          Continue Practice
        </Typography>
        {recentLoading ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} variant="rounded" height={120} />
            ))}
          </Box>
        ) : recentQuestions.length === 0 ? (
          <Paper variant="outlined" sx={{ p: 3, textAlign: 'center', borderRadius: 2 }}>
            <Typography variant="body2" color="text.secondary">
              No recent practice. Start browsing to begin!
            </Typography>
          </Paper>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {recentQuestions.map((q) => (
              <QuestionCard
                key={q.id}
                question={q}
                mode="practice"
                onClick={() =>
                  router.push(
                    `/student/question-bank/questions/${q.id}?mode=practice`,
                  )
                }
              />
            ))}
          </Box>
        )}
      </Box>
    </Box>
  );
}
