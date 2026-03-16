'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Paper,
  Chip,
  Skeleton,
  Checkbox,
  LinearProgress,
  Tabs,
  Tab,
  alpha,
  useTheme,
} from '@neram/ui';
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import PlayCircleOutlinedIcon from '@mui/icons-material/PlayCircleOutlined';
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined';
import LinkOutlinedIcon from '@mui/icons-material/LinkOutlined';
import NoteOutlinedIcon from '@mui/icons-material/NoteOutlined';
import ImageOutlinedIcon from '@mui/icons-material/ImageOutlined';
import EmojiEventsOutlinedIcon from '@mui/icons-material/EmojiEventsOutlined';
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
  completed_at: string | null;
}

interface ModuleItemProgress {
  id: string;
  student_id: string;
  module_item_id: string;
  is_completed: boolean;
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
      return '#FF0000';
    case 'pdf':
      return '#D32F2F';
    case 'onenote':
      return '#7B1FA2';
    default:
      return '#1976D2';
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

// --- Component ---

export default function StudentChecklist() {
  const theme = useTheme();
  const router = useRouter();
  const { user, activeClassroom, getToken, loading: authLoading } = useNexusAuthContext();

  const [checklists, setChecklists] = useState<ChecklistV2[]>([]);
  const [foundation, setFoundation] = useState<FoundationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(0);
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set());

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

  // Toggle simple entry completion
  const handleToggleEntry = async (entryId: string, isCompleted: boolean) => {
    setTogglingIds((prev) => new Set(prev).add(entryId));

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
                  is_completed: isCompleted,
                  completed_at: isCompleted ? new Date().toISOString() : null,
                } as EntryProgress,
              }
            : e
        ),
      }))
    );

    try {
      const token = await getToken();
      if (!token) return;

      const res = await fetch('/api/checklists/student/toggle', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ entry_id: entryId, is_completed: isCompleted }),
      });

      if (!res.ok) {
        // Revert on failure
        setChecklists((prev) =>
          prev.map((cl) => ({
            ...cl,
            entries: cl.entries.map((e) =>
              e.id === entryId
                ? {
                    ...e,
                    progress: e.progress
                      ? { ...e.progress, is_completed: !isCompleted, completed_at: null }
                      : null,
                  }
                : e
            ),
          }))
        );
      }
    } catch (err) {
      console.error('Failed to toggle entry:', err);
    } finally {
      setTogglingIds((prev) => {
        const next = new Set(prev);
        next.delete(entryId);
        return next;
      });
    }
  };

  // Toggle module item completion
  const handleToggleModuleItem = async (
    entryId: string,
    moduleItemId: string,
    isCompleted: boolean
  ) => {
    const key = `mi-${moduleItemId}`;
    setTogglingIds((prev) => new Set(prev).add(key));

    // Optimistic update
    setChecklists((prev) =>
      prev.map((cl) => ({
        ...cl,
        entries: cl.entries.map((e) => {
          if (e.id !== entryId) return e;
          const existing = (e.module_item_progress || []).find(
            (p) => p.module_item_id === moduleItemId
          );
          const updatedProgress = existing
            ? (e.module_item_progress || []).map((p) =>
                p.module_item_id === moduleItemId
                  ? { ...p, is_completed: isCompleted, completed_at: isCompleted ? new Date().toISOString() : null }
                  : p
              )
            : [
                ...(e.module_item_progress || []),
                {
                  id: '',
                  student_id: '',
                  module_item_id: moduleItemId,
                  is_completed: isCompleted,
                  completed_at: isCompleted ? new Date().toISOString() : null,
                },
              ];
          return { ...e, module_item_progress: updatedProgress };
        }),
      }))
    );

    try {
      const token = await getToken();
      if (!token) return;

      await fetch('/api/checklists/student/toggle', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ module_item_id: moduleItemId, is_completed: isCompleted }),
      });
    } catch (err) {
      console.error('Failed to toggle module item:', err);
    } finally {
      setTogglingIds((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
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

  // Check if active checklist has a foundation entry
  const activeHasFoundation =
    activeChecklist?.entries.some(
      (e) => e.entry_type === 'module' && e.module?.module_type === 'foundation'
    ) ?? false;

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

          {/* Active Checklist Entries */}
          {activeChecklist && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              {/* Foundation Module Card (if this checklist has it) */}
              {activeHasFoundation && foundation && (
                <Box sx={{ mb: 1 }}>
                  <FoundationOverviewCard
                    chapters={foundation.chapters}
                    loading={false}
                    onContinue={(chapterId) => router.push(`/student/foundation/${chapterId}`)}
                    onViewAll={() => router.push('/student/foundation')}
                  />
                </Box>
              )}

              {activeChecklist.entries.map((entry, idx) => {
                // Skip foundation module entries in the list (shown as the card above)
                if (
                  entry.entry_type === 'module' &&
                  entry.module?.module_type === 'foundation'
                ) {
                  return null;
                }

                if (entry.entry_type === 'simple_item') {
                  const isCompleted = entry.progress?.is_completed ?? false;
                  return (
                    <Paper
                      key={entry.id}
                      elevation={0}
                      sx={{
                        px: 1.5,
                        py: 1.5,
                        borderRadius: 2.5,
                        border: `1px solid ${isCompleted ? alpha(theme.palette.success.main, 0.3) : theme.palette.divider}`,
                        bgcolor: isCompleted
                          ? alpha(theme.palette.success.main, 0.03)
                          : 'background.paper',
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 1,
                        transition: 'all 250ms ease',
                        animation: `fadeIn 300ms ease ${idx * 30}ms both`,
                        '@keyframes fadeIn': {
                          from: { opacity: 0, transform: 'translateY(4px)' },
                          to: { opacity: 1, transform: 'translateY(0)' },
                        },
                      }}
                    >
                      <Checkbox
                        checked={isCompleted}
                        onChange={(e) => handleToggleEntry(entry.id, e.target.checked)}
                        disabled={togglingIds.has(entry.id)}
                        icon={
                          <RadioButtonUncheckedIcon
                            sx={{ fontSize: '1.4rem', color: alpha(theme.palette.primary.main, 0.4) }}
                          />
                        }
                        checkedIcon={
                          <CheckCircleOutlinedIcon sx={{ fontSize: '1.4rem', color: 'success.main' }} />
                        }
                        sx={{ p: 0.5, mt: -0.25 }}
                      />
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography
                          variant="body2"
                          sx={{
                            fontWeight: isCompleted ? 500 : 600,
                            textDecoration: isCompleted ? 'line-through' : 'none',
                            color: isCompleted ? 'text.secondary' : 'text.primary',
                            lineHeight: 1.4,
                          }}
                        >
                          {entry.title}
                        </Typography>
                        {entry.resources && entry.resources.length > 0 && (
                          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.75 }}>
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
                      </Box>
                    </Paper>
                  );
                }

                // Module entry — show module items as sub-checkboxes
                if (entry.entry_type === 'module' && entry.module) {
                  const moduleItems = entry.module.items || [];
                  const progressMap = new Map(
                    (entry.module_item_progress || []).map((p) => [p.module_item_id, p])
                  );
                  const completedItems = moduleItems.filter(
                    (i) => progressMap.get(i.id)?.is_completed
                  ).length;

                  return (
                    <Paper
                      key={entry.id}
                      elevation={0}
                      sx={{
                        p: 2,
                        borderRadius: 2.5,
                        border: `1px solid ${theme.palette.divider}`,
                        borderLeft: `4px solid ${entry.module.color || theme.palette.primary.main}`,
                        animation: `fadeIn 300ms ease ${idx * 30}ms both`,
                        '@keyframes fadeIn': {
                          from: { opacity: 0, transform: 'translateY(4px)' },
                          to: { opacity: 1, transform: 'translateY(0)' },
                        },
                      }}
                    >
                      {/* Module Header */}
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          {entry.module.icon && (
                            <Typography sx={{ fontSize: '1.2rem' }}>{entry.module.icon}</Typography>
                          )}
                          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                            {entry.module.title}
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

                      {/* Module Items */}
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, pl: 0.5 }}>
                        {moduleItems.map((item) => {
                          const itemCompleted = progressMap.get(item.id)?.is_completed ?? false;
                          const toggleKey = `mi-${item.id}`;
                          return (
                            <Box
                              key={item.id}
                              sx={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 0.75,
                                py: 0.5,
                              }}
                            >
                              <Checkbox
                                checked={itemCompleted}
                                onChange={(e) =>
                                  handleToggleModuleItem(entry.id, item.id, e.target.checked)
                                }
                                disabled={togglingIds.has(toggleKey)}
                                icon={
                                  <RadioButtonUncheckedIcon
                                    sx={{ fontSize: '1.2rem', color: alpha(theme.palette.primary.main, 0.35) }}
                                  />
                                }
                                checkedIcon={
                                  <CheckCircleOutlinedIcon sx={{ fontSize: '1.2rem', color: 'success.main' }} />
                                }
                                sx={{ p: 0.25 }}
                              />
                              <Typography
                                variant="body2"
                                sx={{
                                  fontSize: '0.85rem',
                                  fontWeight: itemCompleted ? 500 : 600,
                                  textDecoration: itemCompleted ? 'line-through' : 'none',
                                  color: itemCompleted ? 'text.secondary' : 'text.primary',
                                }}
                              >
                                {item.title}
                              </Typography>
                            </Box>
                          );
                        })}
                      </Box>
                    </Paper>
                  );
                }

                return null;
              })}
            </Box>
          )}
        </>
      )}
    </Box>
  );
}
