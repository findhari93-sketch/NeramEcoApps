'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  Typography,
  Paper,
  Button,
  Skeleton,
  Chip,
  alpha,
  useTheme,
  useMediaQuery,
  LinearProgress,
} from '@neram/ui';
import BlockOutlinedIcon from '@mui/icons-material/BlockOutlined';
import SearchIcon from '@mui/icons-material/Search';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import StatsRow from '@/components/question-bank/StatsRow';
import PresetChips from '@/components/question-bank/PresetChips';
import type {
  NexusQBSavedPreset,
  QBProgressStats,
  NexusQBClassroomLink,
  QBExamTree,
  QBExamTreeExam,
  QBExamTreeYear,
  QBExamTreeSession,
} from '@neram/database';
import { QB_EXAM_TYPE_LABELS } from '@neram/database';

/** Exam badge colors */
const EXAM_COLORS: Record<string, { bg: string; text: string }> = {
  JEE_PAPER_2: { bg: '#e3f2fd', text: '#1565c0' },
  NATA: { bg: '#f3e5f5', text: '#7b1fa2' },
};

const DEFAULT_EXAM_COLOR = { bg: '#f5f5f5', text: '#616161' };

/** Build a flat list of paper cards from the exam tree */
interface PaperCard {
  key: string;
  examType: string;
  examLabel: string;
  year: number;
  session: string | null;
  sessionLabel: string | null;
  title: string;
  count: number;
  href: string;
}

function buildPaperCards(examTree: QBExamTree): PaperCard[] {
  const cards: PaperCard[] = [];

  for (const exam of examTree.exams) {
    const label = QB_EXAM_TYPE_LABELS[exam.exam_type] || exam.label;
    const sortedYears = [...exam.years].sort((a, b) => b.year - a.year);

    for (const yearEntry of sortedYears) {
      if (yearEntry.sessions.length > 0) {
        for (const sess of yearEntry.sessions) {
          const sessionDisplay = sess.session.charAt(0).toUpperCase() + sess.session.slice(1).toLowerCase();
          cards.push({
            key: `${exam.exam_type}-${yearEntry.year}-${sess.session}`,
            examType: exam.exam_type,
            examLabel: label,
            year: yearEntry.year,
            session: sess.session,
            sessionLabel: sessionDisplay,
            title: `${label} ${yearEntry.year} ${sessionDisplay}`,
            count: sess.count,
            href: `/student/question-bank/questions?exam=${exam.exam_type}&year=${yearEntry.year}&session=${sess.session}`,
          });
        }
      } else {
        cards.push({
          key: `${exam.exam_type}-${yearEntry.year}`,
          examType: exam.exam_type,
          examLabel: label,
          year: yearEntry.year,
          session: null,
          sessionLabel: null,
          title: `${label} ${yearEntry.year}`,
          count: yearEntry.count,
          href: `/student/question-bank/questions?exam=${exam.exam_type}&year=${yearEntry.year}`,
        });
      }
    }
  }

  return cards;
}

export default function QuestionBankHome() {
  const router = useRouter();
  const theme = useTheme();
  const { activeClassroom, getToken } = useNexusAuthContext();

  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [stats, setStats] = useState<QBProgressStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [examTree, setExamTree] = useState<QBExamTree | null>(null);
  const [examTreeLoading, setExamTreeLoading] = useState(true);
  const [presets, setPresets] = useState<NexusQBSavedPreset[]>([]);
  const [presetsLoading, setPresetsLoading] = useState(true);

  useEffect(() => {
    if (!activeClassroom) return;
    checkAccess();
  }, [activeClassroom]);

  useEffect(() => {
    if (enabled !== true) return;
    fetchStats();
    fetchExamTree();
    fetchPresets();
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

  async function fetchExamTree() {
    setExamTreeLoading(true);
    try {
      const token = await getToken();
      const res = await fetch(
        `/api/question-bank/exam-tree?classroom_id=${activeClassroom!.id}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (res.ok) {
        const json = await res.json();
        setExamTree(json.data);
      }
    } catch (err) {
      console.error('Failed to fetch exam tree:', err);
    } finally {
      setExamTreeLoading(false);
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

  function handlePresetSelect(preset: NexusQBSavedPreset) {
    router.push(`/student/question-bank/questions?preset=${preset.id}`);
  }

  function handleSessionClick(examType: string, year: number, session: string) {
    router.push(
      `/student/question-bank/questions?exam=${examType}&year=${year}&session=${session}`,
    );
  }

  function handleYearClick(examType: string, year: number) {
    router.push(
      `/student/question-bank/questions?exam=${examType}&year=${year}`,
    );
  }

  const paperCards = useMemo(
    () => (examTree ? buildPaperCards(examTree) : []),
    [examTree],
  );

  const totalQuestions = stats?.total_questions ?? examTree?.exams.reduce((s, e) => s + e.total_count, 0) ?? 0;

  // ====== LOADING STATE ======
  if (checkingAccess) {
    return (
      <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 900, mx: 'auto' }}>
        <Skeleton variant="text" width={180} height={36} sx={{ mb: 1 }} />
        <Skeleton variant="text" width={260} height={20} sx={{ mb: 2 }} />
        <Skeleton variant="rounded" height={56} sx={{ mb: 3 }} />
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
            gap: 1.5,
          }}
        >
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} variant="rounded" height={140} />
          ))}
        </Box>
      </Box>
    );
  }

  // ====== NOT ENABLED ======
  if (enabled === false) {
    return (
      <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 600, mx: 'auto' }}>
        <Typography variant="h5" fontWeight={700} sx={{ mb: 3 }}>
          Question Bank
        </Typography>
        <Paper
          variant="outlined"
          sx={{ p: 4, textAlign: 'center', borderRadius: 2 }}
        >
          <BlockOutlinedIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
          <Typography variant="body1" color="text.secondary">
            Question Bank is not available for this classroom yet.
          </Typography>
        </Paper>
      </Box>
    );
  }

  // ====== MAIN LAYOUT ======
  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 900, mx: 'auto' }}>
      {/* Header */}
      <Typography variant="h5" fontWeight={700} sx={{ mb: 0.5 }}>
        Question Bank
      </Typography>

      {/* Compact stats line */}
      <Box sx={{ mb: 2 }}>
        <StatsRow stats={stats} loading={statsLoading} compact />
      </Box>

      {/* Browse Full Question Bank CTA */}
      <Button
        variant="contained"
        size="large"
        fullWidth
        startIcon={<SearchIcon />}
        onClick={() => router.push('/student/question-bank/questions')}
        sx={{
          mb: 1,
          py: 1.5,
          fontWeight: 700,
          fontSize: '1rem',
          borderRadius: 2,
          textTransform: 'none',
        }}
      >
        Browse Full Question Bank
      </Button>
      <Typography
        variant="body2"
        color="text.secondary"
        sx={{ mb: 3, textAlign: 'center' }}
      >
        All {totalQuestions} Questions — Filter by Subject, Chapter, Year, Difficulty
      </Typography>

      {/* Saved Presets */}
      {(presetsLoading || presets.length > 0) && (
        <Box sx={{ mb: 3 }}>
          <PresetChips
            presets={presets}
            loading={presetsLoading}
            onSelect={handlePresetSelect}
          />
        </Box>
      )}

      {/* Practice by Year Paper */}
      <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1.5 }}>
        Practice by Year Paper
      </Typography>

      {examTreeLoading ? (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
            gap: 1.5,
          }}
        >
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} variant="rounded" height={140} />
          ))}
        </Box>
      ) : paperCards.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 4, textAlign: 'center', borderRadius: 2 }}>
          <Typography variant="body2" color="text.secondary">
            No papers available yet.
          </Typography>
        </Paper>
      ) : (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
            gap: 1.5,
          }}
        >
          {paperCards.map((card) => {
            const colors = EXAM_COLORS[card.examType] || DEFAULT_EXAM_COLOR;
            // Progress: use stats per-paper if available, otherwise 0
            const attempted = 0; // TODO: wire per-paper progress when API supports it
            const progressPct = card.count > 0 ? (attempted / card.count) * 100 : 0;
            const isComplete = attempted >= card.count && card.count > 0;

            return (
              <Paper
                key={card.key}
                variant="outlined"
                onClick={() => router.push(card.href)}
                sx={{
                  p: 1.5,
                  borderRadius: 2,
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 1,
                  transition: 'box-shadow 150ms, border-color 150ms',
                  '&:hover': {
                    borderColor: theme.palette.primary.main,
                    boxShadow: `0 2px 8px ${alpha(theme.palette.primary.main, 0.15)}`,
                  },
                  '&:focus-visible': {
                    outline: `2px solid ${theme.palette.primary.main}`,
                    outlineOffset: -2,
                  },
                }}
                tabIndex={0}
                role="button"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    router.push(card.href);
                  }
                }}
              >
                {/* Exam badge */}
                <Chip
                  label={card.examLabel}
                  size="small"
                  sx={{
                    alignSelf: 'flex-start',
                    height: 22,
                    fontSize: '0.65rem',
                    fontWeight: 700,
                    bgcolor: colors.bg,
                    color: colors.text,
                    borderRadius: 1,
                  }}
                />

                {/* Title */}
                <Typography variant="subtitle2" fontWeight={700} sx={{ lineHeight: 1.3 }}>
                  {card.sessionLabel
                    ? `${card.year} ${card.sessionLabel}`
                    : `${card.year}`}
                </Typography>

                {/* Question count */}
                <Typography variant="caption" color="text.secondary">
                  {card.count} questions
                </Typography>

                {/* Progress bar */}
                <LinearProgress
                  variant="determinate"
                  value={progressPct}
                  sx={{
                    height: 6,
                    borderRadius: 3,
                    bgcolor: alpha(theme.palette.success.main, 0.12),
                    '& .MuiLinearProgress-bar': {
                      bgcolor: isComplete
                        ? theme.palette.success.main
                        : theme.palette.success.light,
                      borderRadius: 3,
                    },
                  }}
                />

                {/* Progress text */}
                <Typography
                  variant="caption"
                  sx={{
                    fontWeight: 600,
                    color: isComplete
                      ? theme.palette.success.main
                      : 'text.secondary',
                    fontSize: '0.7rem',
                  }}
                >
                  {isComplete
                    ? '\u2713 Complete'
                    : attempted > 0
                      ? `${attempted}/${card.count} done`
                      : 'Not started'}
                </Typography>
              </Paper>
            );
          })}
        </Box>
      )}
    </Box>
  );
}
