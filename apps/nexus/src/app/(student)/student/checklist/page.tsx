'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Paper,
  Chip,
  Skeleton,
  Button,
  LinearProgress,
  Tabs,
  Tab,
  alpha,
  useTheme,
} from '@neram/ui';
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PlayCircleOutlinedIcon from '@mui/icons-material/PlayCircleOutlined';
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined';
import LinkOutlinedIcon from '@mui/icons-material/LinkOutlined';
import NoteOutlinedIcon from '@mui/icons-material/NoteOutlined';
import ImageOutlinedIcon from '@mui/icons-material/ImageOutlined';
import EmojiEventsOutlinedIcon from '@mui/icons-material/EmojiEventsOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import { useRouter } from 'next/navigation';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import PageHeader from '@/components/PageHeader';
import FoundationOverviewCard from '@/components/foundation/FoundationOverviewCard';
import type { NexusFoundationChapterWithProgress } from '@neram/database/types';

// --- V2 Checklist Types ---

interface ModuleItem {
  id: string;
  title: string;
  item_type: string;
  sort_order: number;
}

interface ModuleRef {
  id: string;
  title: string;
  color: string;
  icon?: string;
  module_type?: string;
  items?: ModuleItem[];
}

interface Resource {
  id: string;
  resource_type: string;
  url: string;
  title?: string;
}

interface EntryProgress {
  id: string;
  student_id: string;
  entry_id: string;
  is_completed: boolean;
  status: 'not_started' | 'in_progress' | 'completed';
  started_at: string | null;
  completed_at: string | null;
}

interface ModuleItemProgress {
  id: string;
  student_id: string;
  module_item_id: string;
  is_completed: boolean;
  status: 'not_started' | 'in_progress' | 'completed';
  started_at: string | null;
  completed_at: string | null;
}

interface ChecklistEntry {
  id: string;
  entry_type: 'module' | 'simple_item';
  title: string | null;
  sort_order: number;
  module: ModuleRef | null;
  resources: Resource[];
  progress: EntryProgress | null;
  module_item_progress?: ModuleItemProgress[];
}

interface ChecklistV2 {
  id: string;
  title: string;
  description: string | null;
  entries: ChecklistEntry[];
}

interface FoundationData {
  chapters: NexusFoundationChapterWithProgress[];
  currentChapter: { id: string; title: string } | null;
  completedCount: number;
  totalCount: number;
}

// --- Helpers ---

const resourceIcon = (type: string) => {
  switch (type) {
    case 'video':
    case 'youtube':
      return <PlayCircleOutlinedIcon sx={{ fontSize: '1.1rem' }} />;
    case 'pdf':
      return <PictureAsPdfOutlinedIcon sx={{ fontSize: '1.1rem' }} />;
    case 'onenote':
      return <NoteOutlinedIcon sx={{ fontSize: '1.1rem' }} />;
    case 'image':
      return <ImageOutlinedIcon sx={{ fontSize: '1.1rem' }} />;
    default:
      return <LinkOutlinedIcon sx={{ fontSize: '1.1rem' }} />;
  }
};

const resourceColor = (type: string) => {
  switch (type) {
    case 'video':
    case 'youtube':
      return '#DC2626';
    case 'pdf':
      return '#D97706';
    case 'onenote':
      return '#7C3AED';
    default:
      return '#4F46E5';
  }
};

function getEntryCompletedCount(entry: ChecklistEntry): { completed: number; total: number } {
  if (entry.entry_type === 'simple_item') {
    return { completed: entry.progress?.is_completed ? 1 : 0, total: 1 };
  }
  if (entry.entry_type === 'module' && entry.module) {
    const items = entry.module.items || [];
    const progressMap = new Map(
      (entry.module_item_progress || []).map((p) => [p.module_item_id, p])
    );
    const completed = items.filter((i) => progressMap.get(i.id)?.is_completed).length;
    return { completed, total: items.length };
  }
  return { completed: 0, total: 0 };
}

function getChecklistProgress(checklist: ChecklistV2): { completed: number; total: number } {
  let completed = 0;
  let total = 0;
  for (const entry of checklist.entries) {
    const counts = getEntryCompletedCount(entry);
    completed += counts.completed;
    total += counts.total;
  }
  return { completed, total };
}

function getEntryStatus(entry: ChecklistEntry, foundation: FoundationData | null): 'not_started' | 'in_progress' | 'completed' {
  if (entry.entry_type === 'module' && entry.module?.module_type === 'foundation' && foundation) {
    if (foundation.totalCount > 0 && foundation.completedCount >= foundation.totalCount) return 'completed';
    if (foundation.completedCount > 0) return 'in_progress';
    return 'not_started';
  }
  const counts = getEntryCompletedCount(entry);
  if (counts.total > 0 && counts.completed >= counts.total) return 'completed';
  if (entry.entry_type === 'simple_item') {
    if (entry.progress?.status === 'in_progress') return 'in_progress';
    return 'not_started';
  }
  if (entry.entry_type === 'module') {
    if (counts.completed > 0) return 'in_progress';
    return 'not_started';
  }
  return 'not_started';
}

// --- Component ---

export default function StudentChecklist() {
  const theme = useTheme();
  const router = useRouter();
  const { user, activeClassroom, getToken, loading: authLoading } = useNexusAuthContext();

  const [checklists, setChecklists] = useState<ChecklistV2[]>([]);
  const [foundation, setFoundation] = useState<FoundationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(0);
  const [actioningIds, setActioningIds] = useState<Set<string>>(new Set());

  // Fetch V2 checklists for this classroom
  const fetchData = useCallback(async () => {
    if (!activeClassroom) {
      if (!authLoading) setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) return;

      const res = await fetch(
        `/api/checklists/student?classroom=${activeClassroom.id}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (res.ok) {
        const data = await res.json();
        setChecklists(data.checklists || []);
        setFoundation(data.foundation || null);
      }
    } catch (err) {
      console.error('Failed to load checklists:', err);
    } finally {
      setLoading(false);
    }
  }, [activeClassroom, authLoading, getToken]);

  useEffect(() => {
    if (!authLoading) fetchData();
  }, [authLoading, fetchData]);

  // Start an entry (simple item)
  const handleStartEntry = async (entryId: string) => {
    setActioningIds((prev) => new Set(prev).add(entryId));

    // Optimistic update
    setChecklists((prev) =>
      prev.map((cl) => ({
        ...cl,
        entries: cl.entries.map((e) =>
          e.id === entryId
            ? {
                ...e,
                progress: {
                  ...(e.progress || { id: '', student_id: '', entry_id: entryId, is_completed: false, completed_at: null }),
                  status: 'in_progress' as const,
                  started_at: new Date().toISOString(),
                  is_completed: false,
                  completed_at: null,
                } as EntryProgress,
              }
            : e
        ),
      }))
    );

    try {
      const token = await getToken();
      if (!token) return;
      await fetch('/api/checklists/student/toggle', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ entry_id: entryId, action: 'start' }),
      });
    } catch (err) {
      console.error('Failed to start entry:', err);
    } finally {
      setActioningIds((prev) => {
        const next = new Set(prev);
        next.delete(entryId);
        return next;
      });
    }
  };

  // Complete an entry (simple item)
  const handleCompleteEntry = async (entryId: string) => {
    setActioningIds((prev) => new Set(prev).add(entryId));

    // Optimistic update
    setChecklists((prev) =>
      prev.map((cl) => ({
        ...cl,
        entries: cl.entries.map((e) =>
          e.id === entryId
            ? {
                ...e,
                progress: {
                  ...(e.progress || { id: '', student_id: '', entry_id: entryId }),
                  status: 'completed' as const,
                  is_completed: true,
                  completed_at: new Date().toISOString(),
                } as EntryProgress,
              }
            : e
        ),
      }))
    );

    try {
      const token = await getToken();
      if (!token) return;
      await fetch('/api/checklists/student/toggle', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ entry_id: entryId, action: 'complete' }),
      });
    } catch (err) {
      console.error('Failed to complete entry:', err);
    } finally {
      setActioningIds((prev) => {
        const next = new Set(prev);
        next.delete(entryId);
        return next;
      });
    }
  };

  // Start a module entry (mark as started + navigate)
  const handleStartModule = async (entryId: string, moduleId: string) => {
    // If it's the first module item, mark it as started via API
    try {
      const token = await getToken();
      if (token) {
        await fetch('/api/checklists/student/toggle', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ entry_id: entryId, action: 'start' }),
        });
      }
    } catch {
      // Navigate anyway
    }
    router.push(`/student/modules/${moduleId}`);
  };

  // Overall progress across all checklists
  const overallProgress = checklists.reduce(
    (acc, cl) => {
      const p = getChecklistProgress(cl);
      return { completed: acc.completed + p.completed, total: acc.total + p.total };
    },
    { completed: 0, total: 0 }
  );
  const progressPercent =
    overallProgress.total > 0
      ? Math.round((overallProgress.completed / overallProgress.total) * 100)
      : 0;
  const allDone = overallProgress.total > 0 && overallProgress.completed === overallProgress.total;

  const showTabs = checklists.length > 1;
  const activeChecklist = checklists[activeTab] || null;

  return (
    <Box sx={{ pb: 4 }}>
      <PageHeader
        title="My Checklist"
        subtitle={`${user?.name?.split(' ')[0] || 'Student'}'s learning tasks`}
      />

      {/* Overall Progress Card */}
      {!loading && overallProgress.total > 0 && (
        <Paper
          elevation={0}
          sx={{
            p: 2.5,
            mb: 2.5,
            borderRadius: 3,
            border: `1px solid ${theme.palette.divider}`,
            background: allDone
              ? `linear-gradient(135deg, ${alpha(theme.palette.success.main, 0.08)} 0%, ${alpha('#FFD700', 0.06)} 100%)`
              : `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.04)} 0%, transparent 100%)`,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              {allDone ? (
                <EmojiEventsOutlinedIcon sx={{ fontSize: '1.3rem', color: '#FFB300' }} />
              ) : (
                <CheckCircleOutlinedIcon sx={{ fontSize: '1.1rem', color: 'primary.main' }} />
              )}
              <Typography variant="body2" sx={{ fontWeight: 700 }}>
                {allDone ? 'All Done!' : 'Your Progress'}
              </Typography>
            </Box>
            <Typography
              variant="h6"
              sx={{ fontWeight: 800, color: allDone ? 'success.main' : 'primary.main', fontSize: '1.1rem' }}
            >
              {progressPercent}%
            </Typography>
          </Box>
          <LinearProgress
            variant="determinate"
            value={progressPercent}
            sx={{
              height: 10,
              borderRadius: 5,
              bgcolor: alpha(allDone ? theme.palette.success.main : theme.palette.primary.main, 0.1),
              '& .MuiLinearProgress-bar': {
                borderRadius: 5,
                background: allDone
                  ? `linear-gradient(90deg, ${theme.palette.success.main}, #FFB300)`
                  : undefined,
              },
            }}
          />
          <Typography variant="caption" color="text.secondary" sx={{ mt: 0.75, display: 'block', fontWeight: 500 }}>
            {overallProgress.completed} of {overallProgress.total} items completed
          </Typography>
        </Paper>
      )}

      {/* Loading State */}
      {loading ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Skeleton variant="rounded" height={80} sx={{ borderRadius: 3 }} />
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} variant="rounded" height={64} sx={{ borderRadius: 2.5 }} />
          ))}
        </Box>
      ) : checklists.length === 0 ? (
        <Paper
          elevation={0}
          sx={{
            p: { xs: 3, sm: 4 },
            textAlign: 'center',
            borderRadius: 3,
            border: `1px solid ${theme.palette.divider}`,
          }}
        >
          <CheckCircleOutlinedIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1.5 }} />
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5 }}>
            No Checklists Assigned
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Your teacher hasn&apos;t assigned any checklists to this classroom yet. Check back soon!
          </Typography>
        </Paper>
      ) : (
        <>
          {/* Category Tabs */}
          {showTabs && (
            <Box
              sx={{
                mb: 2.5,
                mx: -2,
                px: 2,
                position: 'sticky',
                top: 0,
                zIndex: 10,
                bgcolor: 'background.default',
                pt: 0.5,
                pb: 0.5,
              }}
            >
              <Tabs
                value={activeTab}
                onChange={(_, v) => setActiveTab(v)}
                variant="scrollable"
                scrollButtons="auto"
                allowScrollButtonsMobile
                sx={{
                  minHeight: 40,
                  '& .MuiTab-root': {
                    minHeight: 40,
                    textTransform: 'none',
                    fontWeight: 700,
                    fontSize: '0.85rem',
                    px: 2,
                  },
                  '& .MuiTabs-indicator': {
                    height: 3,
                    borderRadius: 1.5,
                  },
                }}
              >
                {checklists.map((cl) => {
                  const prog = getChecklistProgress(cl);
                  return (
                    <Tab
                      key={cl.id}
                      label={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                          <span>{cl.title}</span>
                          {prog.total > 0 && (
                            <Chip
                              label={`${prog.completed}/${prog.total}`}
                              size="small"
                              sx={{
                                height: 20,
                                fontSize: '0.65rem',
                                fontWeight: 700,
                                bgcolor:
                                  prog.completed === prog.total
                                    ? alpha(theme.palette.success.main, 0.1)
                                    : alpha(theme.palette.primary.main, 0.08),
                                color:
                                  prog.completed === prog.total
                                    ? 'success.main'
                                    : 'primary.main',
                              }}
                            />
                          )}
                        </Box>
                      }
                    />
                  );
                })}
              </Tabs>
            </Box>
          )}

          {/* Active Checklist Entries — Vertical Stepper */}
          {activeChecklist && (() => {
            const visibleEntries = activeChecklist.entries;

            // Determine status per entry
            const entryStatuses = visibleEntries.map((entry) => getEntryStatus(entry, foundation));

            // First incomplete entry index = current step
            const currentStepIdx = entryStatuses.findIndex((s) => s !== 'completed');

            return (
              <Box>
                <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                  {visibleEntries.map((entry, idx) => {
                    const status = entryStatuses[idx];
                    const isCompleted = status === 'completed';
                    const isCurrent = idx === currentStepIdx;
                    const isFuture = currentStepIdx >= 0 && idx > currentStepIdx;
                    const isLast = idx === visibleEntries.length - 1;
                    const isFoundation = entry.entry_type === 'module' && entry.module?.module_type === 'foundation';

                    return (
                      <Box key={entry.id} sx={{ display: 'flex', gap: 0 }}>
                        {/* Stepper rail: circle + connector line with arrow */}
                        <Box
                          sx={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            width: 40,
                            flexShrink: 0,
                          }}
                        >
                          {/* Step circle */}
                          <Box
                            sx={{
                              width: 32,
                              height: 32,
                              borderRadius: '50%',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              mt: 2,
                              ...(isCompleted && {
                                bgcolor: theme.palette.success.main,
                                color: '#fff',
                              }),
                              ...(isCurrent && {
                                bgcolor: theme.palette.primary.main,
                                color: '#fff',
                                boxShadow: `0 0 0 4px ${alpha(theme.palette.primary.main, 0.2)}`,
                              }),
                              ...(isFuture && {
                                bgcolor: alpha(theme.palette.text.disabled, 0.12),
                                color: 'text.disabled',
                              }),
                              ...(!isCompleted && !isCurrent && !isFuture && {
                                bgcolor: alpha(theme.palette.text.disabled, 0.12),
                                color: 'text.disabled',
                              }),
                            }}
                          >
                            {isCompleted ? (
                              <CheckCircleOutlinedIcon sx={{ fontSize: '1.1rem' }} />
                            ) : (
                              <Typography variant="caption" sx={{ fontWeight: 700, fontSize: '0.75rem', lineHeight: 1 }}>
                                {idx + 1}
                              </Typography>
                            )}
                          </Box>
                          {/* Connector line with arrow */}
                          {!isLast && (
                            <Box
                              sx={{
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                flex: 1,
                                minHeight: 20,
                              }}
                            >
                              <Box
                                sx={{
                                  width: 2,
                                  flex: 1,
                                  bgcolor: isCompleted
                                    ? alpha(theme.palette.success.main, 0.3)
                                    : alpha(theme.palette.divider, 1),
                                }}
                              />
                              {/* Small arrow triangle */}
                              <Box
                                sx={{
                                  width: 0,
                                  height: 0,
                                  borderLeft: '5px solid transparent',
                                  borderRight: '5px solid transparent',
                                  borderTop: `6px solid ${
                                    isCompleted
                                      ? alpha(theme.palette.success.main, 0.4)
                                      : alpha(theme.palette.text.disabled, 0.3)
                                  }`,
                                  mb: -0.25,
                                }}
                              />
                            </Box>
                          )}
                        </Box>

                        {/* Entry content */}
                        <Box sx={{ flex: 1, minWidth: 0, pb: isLast ? 0 : 1 }}>
                          {entry.entry_type === 'simple_item' ? (
                            <Paper
                              elevation={0}
                              sx={{
                                px: 2,
                                py: 1.5,
                                borderRadius: 2.5,
                                border: `1px solid ${
                                  isCompleted
                                    ? alpha(theme.palette.success.main, 0.3)
                                    : isCurrent
                                      ? alpha(theme.palette.primary.main, 0.3)
                                      : theme.palette.divider
                                }`,
                                bgcolor: isCompleted
                                  ? alpha(theme.palette.success.main, 0.03)
                                  : isCurrent
                                    ? alpha(theme.palette.primary.main, 0.02)
                                    : 'background.paper',
                                opacity: isFuture ? 0.5 : 1,
                                transition: 'all 250ms ease',
                              }}
                            >
                              <Typography
                                variant="body2"
                                sx={{
                                  fontWeight: isCompleted ? 500 : 600,
                                  textDecoration: isCompleted ? 'line-through' : 'none',
                                  color: isFuture ? 'text.disabled' : isCompleted ? 'text.secondary' : 'text.primary',
                                  lineHeight: 1.4,
                                  mb: 1,
                                }}
                              >
                                {entry.title}
                              </Typography>

                              {/* Resources (visible when current or in_progress) */}
                              {entry.resources && entry.resources.length > 0 && !isFuture && !isCompleted && (
                                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 1 }}>
                                  {entry.resources.map((res) => (
                                    <Chip
                                      key={res.id}
                                      component="a"
                                      href={res.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      clickable
                                      icon={resourceIcon(res.resource_type)}
                                      label={
                                        res.resource_type === 'youtube'
                                          ? 'Video'
                                          : res.resource_type.toUpperCase()
                                      }
                                      size="small"
                                      sx={{
                                        height: 26,
                                        fontSize: '0.675rem',
                                        fontWeight: 600,
                                        bgcolor: alpha(resourceColor(res.resource_type), 0.08),
                                        color: resourceColor(res.resource_type),
                                        border: `1px solid ${alpha(resourceColor(res.resource_type), 0.15)}`,
                                        '& .MuiChip-icon': { color: resourceColor(res.resource_type) },
                                        '&:hover': { bgcolor: alpha(resourceColor(res.resource_type), 0.14) },
                                      }}
                                    />
                                  ))}
                                </Box>
                              )}

                              {/* Action buttons */}
                              {isCompleted ? (
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                  <CheckCircleOutlinedIcon sx={{ fontSize: '1rem', color: 'success.main' }} />
                                  <Typography variant="caption" color="success.main" sx={{ fontWeight: 600 }}>
                                    Completed
                                  </Typography>
                                </Box>
                              ) : isCurrent && status === 'not_started' ? (
                                <Button
                                  variant="contained"
                                  size="small"
                                  startIcon={<PlayArrowIcon />}
                                  onClick={() => handleStartEntry(entry.id)}
                                  disabled={actioningIds.has(entry.id)}
                                  sx={{
                                    minHeight: 36,
                                    borderRadius: 2,
                                    textTransform: 'none',
                                    fontWeight: 600,
                                    fontSize: '0.8rem',
                                  }}
                                >
                                  Start
                                </Button>
                              ) : isCurrent && status === 'in_progress' ? (
                                <Button
                                  variant="contained"
                                  color="success"
                                  size="small"
                                  startIcon={<CheckCircleOutlinedIcon />}
                                  onClick={() => handleCompleteEntry(entry.id)}
                                  disabled={actioningIds.has(entry.id)}
                                  sx={{
                                    minHeight: 36,
                                    borderRadius: 2,
                                    textTransform: 'none',
                                    fontWeight: 600,
                                    fontSize: '0.8rem',
                                  }}
                                >
                                  Mark Complete
                                </Button>
                              ) : isFuture ? (
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                  <LockOutlinedIcon sx={{ fontSize: '0.9rem', color: 'text.disabled' }} />
                                  <Typography variant="caption" color="text.disabled" sx={{ fontStyle: 'italic' }}>
                                    Complete previous steps first
                                  </Typography>
                                </Box>
                              ) : null}
                            </Paper>
                          ) : isFoundation && foundation ? (
                            /* Foundation module */
                            isFuture ? (
                              <Paper
                                elevation={0}
                                sx={{
                                  p: 2,
                                  borderRadius: 2.5,
                                  border: `1px solid ${theme.palette.divider}`,
                                  borderLeft: `4px solid ${entry.module!.color || theme.palette.primary.main}`,
                                  opacity: 0.5,
                                }}
                              >
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                                  {entry.module!.icon && (
                                    <span className="material-icons" style={{ fontSize: '1.2rem', lineHeight: 1 }}>{entry.module!.icon}</span>
                                  )}
                                  <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'text.disabled' }}>
                                    {entry.module!.title}
                                  </Typography>
                                </Box>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                  <LockOutlinedIcon sx={{ fontSize: '0.9rem', color: 'text.disabled' }} />
                                  <Typography variant="caption" color="text.disabled" sx={{ fontStyle: 'italic' }}>
                                    Complete previous steps first
                                  </Typography>
                                </Box>
                              </Paper>
                            ) : (
                              <Box sx={{ transition: 'all 250ms ease' }}>
                                <FoundationOverviewCard
                                  chapters={foundation.chapters}
                                  loading={false}
                                  onContinue={(chapterId) => router.push(`/student/foundation/${chapterId}`)}
                                  onViewAll={() => router.push('/student/foundation')}
                                />
                              </Box>
                            )
                          ) : entry.entry_type === 'module' && entry.module ? (() => {
                            const moduleItems = entry.module.items || [];
                            const progressMap = new Map(
                              (entry.module_item_progress || []).map((p) => [p.module_item_id, p])
                            );
                            const completedItems = moduleItems.filter(
                              (i) => progressMap.get(i.id)?.is_completed
                            ).length;
                            const moduleStatus = status;

                            return (
                              <Paper
                                elevation={0}
                                sx={{
                                  p: 2,
                                  borderRadius: 2.5,
                                  border: `1px solid ${
                                    isCompleted
                                      ? alpha(theme.palette.success.main, 0.3)
                                      : isCurrent
                                        ? alpha(theme.palette.primary.main, 0.3)
                                        : theme.palette.divider
                                  }`,
                                  borderLeft: `4px solid ${entry.module!.color || theme.palette.primary.main}`,
                                  opacity: isFuture ? 0.5 : 1,
                                  bgcolor: isCurrent ? alpha(theme.palette.primary.main, 0.02) : 'background.paper',
                                  transition: 'all 250ms ease',
                                  ...(isCurrent && !isFuture && {
                                    cursor: 'pointer',
                                    '&:hover': {
                                      borderColor: alpha(theme.palette.primary.main, 0.5),
                                      boxShadow: `0 2px 8px ${alpha(theme.palette.primary.main, 0.1)}`,
                                    },
                                  }),
                                }}
                                onClick={
                                  isCurrent && !isFuture && entry.module
                                    ? () => handleStartModule(entry.id, entry.module!.id)
                                    : undefined
                                }
                              >
                                {/* Module Header */}
                                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    {entry.module!.icon && (
                                      <span className="material-icons" style={{ fontSize: '1.2rem', lineHeight: 1 }}>{entry.module!.icon}</span>
                                    )}
                                    <Typography
                                      variant="subtitle2"
                                      sx={{
                                        fontWeight: 700,
                                        color: isFuture ? 'text.disabled' : isCompleted ? 'text.secondary' : 'text.primary',
                                        textDecoration: isCompleted ? 'line-through' : 'none',
                                      }}
                                    >
                                      {entry.module!.title}
                                    </Typography>
                                  </Box>
                                  <Chip
                                    label={`${completedItems}/${moduleItems.length}`}
                                    size="small"
                                    sx={{
                                      height: 22,
                                      fontSize: '0.7rem',
                                      fontWeight: 700,
                                      bgcolor:
                                        completedItems === moduleItems.length && moduleItems.length > 0
                                          ? alpha(theme.palette.success.main, 0.1)
                                          : alpha(theme.palette.primary.main, 0.08),
                                      color:
                                        completedItems === moduleItems.length && moduleItems.length > 0
                                          ? 'success.main'
                                          : 'primary.main',
                                    }}
                                  />
                                </Box>

                                {/* Module progress bar */}
                                {moduleItems.length > 0 && !isFuture && (
                                  <LinearProgress
                                    variant="determinate"
                                    value={moduleItems.length > 0 ? (completedItems / moduleItems.length) * 100 : 0}
                                    sx={{
                                      height: 4,
                                      borderRadius: 2,
                                      mb: 1,
                                      bgcolor: alpha(theme.palette.primary.main, 0.08),
                                      '& .MuiLinearProgress-bar': {
                                        borderRadius: 2,
                                        bgcolor: completedItems === moduleItems.length
                                          ? theme.palette.success.main
                                          : theme.palette.primary.main,
                                      },
                                    }}
                                  />
                                )}

                                {/* Action area */}
                                {isCompleted ? (
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                    <CheckCircleOutlinedIcon sx={{ fontSize: '1rem', color: 'success.main' }} />
                                    <Typography variant="caption" color="success.main" sx={{ fontWeight: 600 }}>
                                      All items completed
                                    </Typography>
                                  </Box>
                                ) : isCurrent && moduleStatus === 'not_started' ? (
                                  <Button
                                    variant="contained"
                                    size="small"
                                    startIcon={<PlayArrowIcon />}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleStartModule(entry.id, entry.module!.id);
                                    }}
                                    sx={{
                                      minHeight: 36,
                                      borderRadius: 2,
                                      textTransform: 'none',
                                      fontWeight: 600,
                                      fontSize: '0.8rem',
                                    }}
                                  >
                                    Start Module
                                  </Button>
                                ) : isCurrent && moduleStatus === 'in_progress' ? (
                                  <Button
                                    variant="outlined"
                                    size="small"
                                    endIcon={<ArrowForwardIcon />}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      router.push(`/student/modules/${entry.module!.id}`);
                                    }}
                                    sx={{
                                      minHeight: 36,
                                      borderRadius: 2,
                                      textTransform: 'none',
                                      fontWeight: 600,
                                      fontSize: '0.8rem',
                                    }}
                                  >
                                    Continue ({completedItems}/{moduleItems.length})
                                  </Button>
                                ) : isFuture ? (
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                    <LockOutlinedIcon sx={{ fontSize: '0.9rem', color: 'text.disabled' }} />
                                    <Typography variant="caption" color="text.disabled" sx={{ fontStyle: 'italic' }}>
                                      Complete previous steps first
                                    </Typography>
                                  </Box>
                                ) : null}
                              </Paper>
                            );
                          })() : null}
                        </Box>
                      </Box>
                    );
                  })}
                </Box>
              </Box>
            );
          })()}
        </>
      )}
    </Box>
  );
}
