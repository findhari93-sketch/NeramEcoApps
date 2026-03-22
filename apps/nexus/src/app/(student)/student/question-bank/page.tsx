'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  Typography,
  Paper,
  Button,
  Skeleton,
  Tabs,
  Tab,
  Chip,
  alpha,
  useTheme,
  useMediaQuery,
  IconButton,
  Divider,
} from '@neram/ui';
import BugReportOutlinedIcon from '@mui/icons-material/BugReportOutlined';
import BlockOutlinedIcon from '@mui/icons-material/BlockOutlined';
import FilterListIcon from '@mui/icons-material/FilterList';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
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

/** Session month hints per exam type */
const SESSION_HINTS: Record<string, Record<string, string>> = {
  NATA: {
    'Test 1': 'April',
    'Test 2': 'July',
    'Test 3': 'October',
  },
  JEE_PAPER_2: {
    'Session 1': 'January',
    'Session 2': 'April',
  },
};

function capitalizeSession(session: string): string {
  return session.charAt(0).toUpperCase() + session.slice(1).toLowerCase();
}

export default function QuestionBankHome() {
  const router = useRouter();
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));
  const { activeClassroom, getToken } = useNexusAuthContext();

  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [stats, setStats] = useState<QBProgressStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [examTree, setExamTree] = useState<QBExamTree | null>(null);
  const [examTreeLoading, setExamTreeLoading] = useState(true);
  const [presets, setPresets] = useState<NexusQBSavedPreset[]>([]);
  const [presetsLoading, setPresetsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(0);
  const [expandedYears, setExpandedYears] = useState<Set<string>>(new Set());

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

  // Auto-expand the latest year when exam tree loads
  useEffect(() => {
    if (!examTree) return;
    const initial = new Set<string>();
    for (const exam of examTree.exams) {
      if (exam.years.length > 0) {
        // Years should be sorted descending; expand the first (latest)
        const sorted = [...exam.years].sort((a, b) => b.year - a.year);
        initial.add(`${exam.exam_type}-${sorted[0].year}`);
      }
    }
    setExpandedYears(initial);
  }, [examTree]);

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

  function toggleYear(key: string) {
    setExpandedYears((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
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

  // Loading state
  if (checkingAccess) {
    return (
      <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1100, mx: 'auto' }}>
        <Skeleton variant="text" width={180} height={36} sx={{ mb: 2 }} />
        <Skeleton variant="text" width={260} height={20} sx={{ mb: 3 }} />
        <Box sx={{ display: 'flex', gap: 3 }}>
          {isDesktop && <Skeleton variant="rounded" width={280} height={400} />}
          <Box sx={{ flex: 1 }}>
            <Skeleton variant="rounded" height={48} sx={{ mb: 2 }} />
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} variant="rounded" height={72} sx={{ mb: 1.5 }} />
            ))}
          </Box>
        </Box>
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

  // Get active exam data based on tab
  const exams = examTree?.exams || [];
  const activeExam: QBExamTreeExam | undefined = exams[activeTab];
  const sortedYears = activeExam
    ? [...activeExam.years].sort((a, b) => b.year - a.year)
    : [];

  // -- Sidebar content (desktop) --
  const sidebarContent = (
    <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* Compact stats */}
      <Box>
        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', mb: 0.5, display: 'block' }}>
          Progress
        </Typography>
        <StatsRow stats={stats} loading={statsLoading} compact />
      </Box>

      <Divider />

      {/* Saved Presets */}
      <Box>
        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', mb: 0.5, display: 'block' }}>
          Saved Presets
        </Typography>
        <PresetChips
          presets={presets}
          loading={presetsLoading}
          onSelect={handlePresetSelect}
        />
      </Box>

      <Divider />

      {/* My Reports link */}
      <Button
        size="small"
        startIcon={<BugReportOutlinedIcon />}
        onClick={() => router.push('/student/question-bank/reports')}
        sx={{ textTransform: 'none', justifyContent: 'flex-start', color: 'text.secondary' }}
      >
        My Reports
      </Button>
    </Box>
  );

  // -- Year-wise content --
  const yearContent = (
    <Box>
      {examTreeLoading ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} variant="rounded" height={64} />
          ))}
        </Box>
      ) : sortedYears.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 4, textAlign: 'center', borderRadius: 2 }}>
          <Typography variant="body2" color="text.secondary">
            No papers available for {activeExam?.label || 'this exam'} yet.
          </Typography>
        </Paper>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {sortedYears.map((yearEntry: QBExamTreeYear) => {
            const yearKey = `${activeExam!.exam_type}-${yearEntry.year}`;
            const isExpanded = expandedYears.has(yearKey);
            const examType = activeExam!.exam_type;
            const hints = SESSION_HINTS[examType] || {};

            return (
              <Paper
                key={yearEntry.year}
                variant="outlined"
                sx={{ borderRadius: 2, overflow: 'hidden' }}
              >
                {/* Year header */}
                <Box
                  onClick={() => toggleYear(yearKey)}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    px: 2,
                    py: 1.5,
                    cursor: 'pointer',
                    '&:hover': { bgcolor: alpha(theme.palette.action.hover, 0.04) },
                  }}
                >
                  <CalendarTodayIcon sx={{ fontSize: '1rem', color: 'text.secondary' }} />
                  <Typography variant="subtitle1" fontWeight={700} sx={{ flex: 1 }}>
                    {yearEntry.year}
                  </Typography>
                  <Chip
                    label={`${yearEntry.count} Q`}
                    size="small"
                    sx={{
                      height: 22,
                      fontSize: '0.7rem',
                      fontWeight: 600,
                      bgcolor: alpha(theme.palette.primary.main, 0.08),
                      color: theme.palette.primary.main,
                    }}
                  />
                  <ExpandMoreIcon
                    sx={{
                      fontSize: '1.2rem',
                      color: 'text.secondary',
                      transform: isExpanded ? 'rotate(180deg)' : 'none',
                      transition: 'transform 200ms',
                    }}
                  />
                </Box>

                {/* Sessions */}
                {isExpanded && (
                  <Box sx={{ borderTop: `1px solid ${theme.palette.divider}` }}>
                    {yearEntry.sessions.length > 0 ? (
                      yearEntry.sessions.map((sess: QBExamTreeSession) => (
                        <Box
                          key={sess.session}
                          onClick={() => handleSessionClick(examType, yearEntry.year, sess.session)}
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 1.5,
                            px: 2,
                            py: 1.5,
                            cursor: 'pointer',
                            minHeight: 56,
                            borderBottom: `1px solid ${theme.palette.divider}`,
                            '&:last-child': { borderBottom: 'none' },
                            '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.04) },
                            '&:focus-visible': {
                              outline: `2px solid ${theme.palette.primary.main}`,
                              outlineOffset: -2,
                            },
                          }}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              handleSessionClick(examType, yearEntry.year, sess.session);
                            }
                          }}
                        >
                          <AccessTimeIcon sx={{ fontSize: '1rem', color: 'text.disabled' }} />
                          <Box sx={{ flex: 1 }}>
                            <Typography variant="body2" fontWeight={600}>
                              {capitalizeSession(sess.session)}
                            </Typography>
                            {hints[sess.session] && (
                              <Typography variant="caption" color="text.disabled">
                                {hints[sess.session]}
                              </Typography>
                            )}
                          </Box>
                          <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500 }}>
                            {sess.count} questions
                          </Typography>
                          <ChevronRightIcon sx={{ fontSize: '1.1rem', color: 'text.disabled' }} />
                        </Box>
                      ))
                    ) : (
                      // No sessions — click to view all questions for this year
                      <Box
                        onClick={() => handleYearClick(examType, yearEntry.year)}
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 1.5,
                          px: 2,
                          py: 1.5,
                          cursor: 'pointer',
                          minHeight: 56,
                          '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.04) },
                        }}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            handleYearClick(examType, yearEntry.year);
                          }
                        }}
                      >
                        <Box sx={{ flex: 1 }}>
                          <Typography variant="body2" fontWeight={500}>
                            View all {yearEntry.count} questions
                          </Typography>
                        </Box>
                        <ChevronRightIcon sx={{ fontSize: '1.1rem', color: 'text.disabled' }} />
                      </Box>
                    )}
                  </Box>
                )}
              </Paper>
            );
          })}
        </Box>
      )}
    </Box>
  );

  // -- Tabs --
  const tabsContent = (
    <Tabs
      value={activeTab}
      onChange={(_, v) => setActiveTab(v)}
      sx={{
        minHeight: 42,
        '& .MuiTab-root': { minHeight: 42, textTransform: 'none', fontWeight: 600 },
      }}
    >
      {exams.map((exam, i) => (
        <Tab
          key={exam.exam_type}
          label={
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
              {QB_EXAM_TYPE_LABELS[exam.exam_type] || exam.label}
              <Chip
                label={exam.total_count}
                size="small"
                sx={{
                  height: 20,
                  fontSize: '0.65rem',
                  fontWeight: 700,
                  bgcolor: activeTab === i
                    ? alpha(theme.palette.primary.main, 0.12)
                    : alpha(theme.palette.text.primary, 0.08),
                }}
              />
            </Box>
          }
        />
      ))}
    </Tabs>
  );

  // ====== DESKTOP LAYOUT ======
  if (isDesktop) {
    return (
      <Box sx={{ display: 'flex', height: '100%' }}>
        {/* Sidebar */}
        <Box
          sx={{
            width: 280,
            minWidth: 280,
            borderRight: 1,
            borderColor: 'divider',
            overflowY: 'auto',
            bgcolor: 'background.paper',
          }}
        >
          <Box sx={{ px: 2, pt: 2, pb: 1 }}>
            <Typography variant="subtitle2" fontWeight={700}>
              Question Bank
            </Typography>
          </Box>
          {sidebarContent}
        </Box>

        {/* Main content */}
        <Box sx={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          {/* Tabs */}
          <Box sx={{ px: 3, pt: 2, borderBottom: 1, borderColor: 'divider' }}>
            {examTreeLoading ? (
              <Skeleton variant="rounded" width={300} height={42} />
            ) : (
              tabsContent
            )}
          </Box>

          {/* Year-wise papers */}
          <Box sx={{ p: 3, flex: 1, maxWidth: 800 }}>
            {yearContent}
          </Box>
        </Box>
      </Box>
    );
  }

  // ====== MOBILE LAYOUT ======
  return (
    <Box>
      {/* Header */}
      <Box sx={{ px: 2, pt: 2, pb: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
          <Typography variant="h6" fontWeight={700}>
            Question Bank
          </Typography>
          <Button
            size="small"
            startIcon={<BugReportOutlinedIcon />}
            onClick={() => router.push('/student/question-bank/reports')}
            sx={{ textTransform: 'none', color: 'text.secondary', fontSize: '0.75rem' }}
          >
            Reports
          </Button>
        </Box>
        <StatsRow stats={stats} loading={statsLoading} compact />
      </Box>

      {/* Presets (if any) */}
      {(presetsLoading || presets.length > 0) && (
        <Box sx={{ px: 2, py: 1 }}>
          <PresetChips
            presets={presets}
            loading={presetsLoading}
            onSelect={handlePresetSelect}
          />
        </Box>
      )}

      {/* Sticky tabs */}
      <Box
        sx={{
          position: 'sticky',
          top: 0,
          zIndex: 20,
          bgcolor: 'background.default',
          borderBottom: 1,
          borderColor: 'divider',
          px: 1,
        }}
      >
        {examTreeLoading ? (
          <Skeleton variant="rounded" height={42} sx={{ mx: 1, my: 0.5 }} />
        ) : (
          tabsContent
        )}
      </Box>

      {/* Year-wise papers */}
      <Box sx={{ p: 2 }}>
        {yearContent}
      </Box>
    </Box>
  );
}
