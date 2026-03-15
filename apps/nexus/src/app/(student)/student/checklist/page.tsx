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
import CalculateOutlinedIcon from '@mui/icons-material/CalculateOutlined';
import PsychologyOutlinedIcon from '@mui/icons-material/PsychologyOutlined';
import BrushOutlinedIcon from '@mui/icons-material/BrushOutlined';
import AccountBalanceOutlinedIcon from '@mui/icons-material/AccountBalanceOutlined';
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined';
import EmojiEventsOutlinedIcon from '@mui/icons-material/EmojiEventsOutlined';
import { useRouter } from 'next/navigation';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import PageHeader from '@/components/PageHeader';
import FoundationOverviewCard from '@/components/foundation/FoundationOverviewCard';
import type { NexusFoundationChapterWithProgress } from '@neram/database/types';

interface ChecklistItem {
  id: string;
  title: string;
  is_completed: boolean;
  topic: { id: string; title: string; category: string } | null;
  resources?: { id: string; url: string; type: string }[];
}

const categoryConfig: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
  mathematics: { icon: <CalculateOutlinedIcon />, color: '#1976D2', label: 'Mathematics' },
  aptitude: { icon: <PsychologyOutlinedIcon />, color: '#E65100', label: 'Aptitude' },
  drawing: { icon: <BrushOutlinedIcon />, color: '#7B1FA2', label: 'Drawing' },
  architecture_awareness: { icon: <AccountBalanceOutlinedIcon />, color: '#00695C', label: 'Architecture' },
  general: { icon: <FolderOutlinedIcon />, color: '#546E7A', label: 'General' },
};

const getCategoryConfig = (category: string) =>
  categoryConfig[category] || categoryConfig.general;

const resourceIcon = (type: string) => {
  switch (type) {
    case 'youtube': return <PlayCircleOutlinedIcon sx={{ fontSize: '1.1rem' }} />;
    case 'pdf': return <PictureAsPdfOutlinedIcon sx={{ fontSize: '1.1rem' }} />;
    case 'onenote': return <NoteOutlinedIcon sx={{ fontSize: '1.1rem' }} />;
    case 'image': return <ImageOutlinedIcon sx={{ fontSize: '1.1rem' }} />;
    default: return <LinkOutlinedIcon sx={{ fontSize: '1.1rem' }} />;
  }
};

const resourceColor = (type: string) => {
  switch (type) {
    case 'youtube': return '#FF0000';
    case 'pdf': return '#D32F2F';
    case 'onenote': return '#7B1FA2';
    default: return '#1976D2';
  }
};

export default function StudentChecklist() {
  const theme = useTheme();
  const router = useRouter();
  const { user, activeClassroom, getToken, loading: authLoading } = useNexusAuthContext();
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set());
  const [foundationChapters, setFoundationChapters] = useState<NexusFoundationChapterWithProgress[] | null>(null);
  const [foundationLoading, setFoundationLoading] = useState(true);

  // Fetch foundation chapters
  const fetchFoundation = useCallback(async () => {
    setFoundationLoading(true);
    try {
      const token = await getToken();
      if (!token) return;

      const res = await fetch('/api/foundation/chapters', {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        setFoundationChapters(data.chapters || []);
      }
    } catch (err) {
      console.error('Failed to load foundation:', err);
    } finally {
      setFoundationLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    if (!authLoading) fetchFoundation();
  }, [authLoading, fetchFoundation]);

  const fetchChecklist = useCallback(async () => {
    if (!activeClassroom) {
      if (!authLoading) setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) return;

      const res = await fetch(
        `/api/checklist?classroom=${activeClassroom.id}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (res.ok) {
        const data = await res.json();
        setItems(data.items || []);
      }
    } catch (err) {
      console.error('Failed to load checklist:', err);
    } finally {
      setLoading(false);
    }
  }, [activeClassroom, getToken]);

  useEffect(() => {
    fetchChecklist();
  }, [fetchChecklist]);

  const handleToggle = async (itemId: string, completed: boolean) => {
    setTogglingIds((prev) => new Set(prev).add(itemId));

    // Optimistic update
    setItems((prev) =>
      prev.map((item) =>
        item.id === itemId ? { ...item, is_completed: completed } : item
      )
    );

    try {
      const token = await getToken();
      if (!token) return;

      const res = await fetch('/api/checklist/toggle', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ item_id: itemId, completed }),
      });

      if (!res.ok) {
        setItems((prev) =>
          prev.map((item) =>
            item.id === itemId ? { ...item, is_completed: !completed } : item
          )
        );
      }
    } catch (err) {
      console.error('Failed to toggle checklist item:', err);
      setItems((prev) =>
        prev.map((item) =>
          item.id === itemId ? { ...item, is_completed: !completed } : item
        )
      );
    } finally {
      setTogglingIds((prev) => {
        const next = new Set(prev);
        next.delete(itemId);
        return next;
      });
    }
  };

  // Group items by topic category
  const groupedItems = items.reduce<Record<string, ChecklistItem[]>>((acc, item) => {
    const category = item.topic?.category || 'general';
    if (!acc[category]) acc[category] = [];
    acc[category].push(item);
    return acc;
  }, {});

  const completedCount = items.filter((i) => i.is_completed).length;
  const totalCount = items.length;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const allDone = totalCount > 0 && completedCount === totalCount;

  return (
    <Box sx={{ pb: 4 }}>
      <PageHeader
        title="My Checklist"
        subtitle={`${user?.name?.split(' ')[0] || 'Student'}'s learning tasks`}
      />

      {/* Foundation Module Card */}
      <FoundationOverviewCard
        chapters={foundationChapters}
        loading={foundationLoading}
        onContinue={(chapterId) => router.push(`/student/foundation/${chapterId}`)}
        onViewAll={() => router.push('/student/foundation')}
      />

      {/* Progress Card */}
      {!loading && totalCount > 0 && (
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
              sx={{
                fontWeight: 800,
                color: allDone ? 'success.main' : 'primary.main',
                fontSize: '1.1rem',
              }}
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
            {completedCount} of {totalCount} items completed
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
      ) : totalCount === 0 ? (
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
            No Checklist Items
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Your teacher hasn&apos;t added any checklist items yet. Check back soon!
          </Typography>
        </Paper>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {Object.entries(groupedItems)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([category, categoryItems]) => {
              const config = getCategoryConfig(category);
              const catCompleted = categoryItems.filter((i) => i.is_completed).length;
              const catPct = Math.round((catCompleted / categoryItems.length) * 100);

              return (
                <Box key={category}>
                  {/* Category Header */}
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5, px: 0.5 }}>
                    <Box
                      sx={{
                        width: 28,
                        height: 28,
                        borderRadius: 1.5,
                        bgcolor: alpha(config.color, 0.1),
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        '& .MuiSvgIcon-root': { fontSize: '0.95rem', color: config.color },
                      }}
                    >
                      {config.icon}
                    </Box>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700, flex: 1, color: config.color }}>
                      {config.label}
                    </Typography>
                    <Chip
                      label={`${catCompleted}/${categoryItems.length}`}
                      size="small"
                      sx={{
                        height: 22,
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        bgcolor: catPct === 100 ? alpha(theme.palette.success.main, 0.1) : alpha(config.color, 0.08),
                        color: catPct === 100 ? 'success.main' : config.color,
                      }}
                    />
                  </Box>

                  {/* Items */}
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    {categoryItems.map((item, idx) => (
                      <Paper
                        key={item.id}
                        elevation={0}
                        sx={{
                          px: 1.5,
                          py: 1.5,
                          borderRadius: 2.5,
                          border: `1px solid ${item.is_completed ? alpha(theme.palette.success.main, 0.3) : theme.palette.divider}`,
                          bgcolor: item.is_completed ? alpha(theme.palette.success.main, 0.03) : 'background.paper',
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
                        {/* Custom Checkbox */}
                        <Checkbox
                          checked={item.is_completed}
                          onChange={(e) => handleToggle(item.id, e.target.checked)}
                          disabled={togglingIds.has(item.id)}
                          icon={<RadioButtonUncheckedIcon sx={{ fontSize: '1.4rem', color: alpha(config.color, 0.4) }} />}
                          checkedIcon={<CheckCircleOutlinedIcon sx={{ fontSize: '1.4rem', color: 'success.main' }} />}
                          sx={{ p: 0.5, mt: -0.25 }}
                        />

                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography
                            variant="body2"
                            sx={{
                              fontWeight: item.is_completed ? 500 : 600,
                              textDecoration: item.is_completed ? 'line-through' : 'none',
                              color: item.is_completed ? 'text.secondary' : 'text.primary',
                              lineHeight: 1.4,
                            }}
                          >
                            {item.title}
                          </Typography>

                          {/* Resources row */}
                          {item.resources && item.resources.length > 0 && (
                            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.75 }}>
                              {item.resources.map((res) => (
                                <Chip
                                  key={res.id}
                                  component="a"
                                  href={res.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  clickable
                                  icon={resourceIcon(res.type)}
                                  label={res.type === 'youtube' ? 'Video' : res.type.toUpperCase()}
                                  size="small"
                                  sx={{
                                    height: 26,
                                    fontSize: '0.675rem',
                                    fontWeight: 600,
                                    bgcolor: alpha(resourceColor(res.type), 0.08),
                                    color: resourceColor(res.type),
                                    border: `1px solid ${alpha(resourceColor(res.type), 0.15)}`,
                                    '& .MuiChip-icon': { color: resourceColor(res.type) },
                                    '&:hover': { bgcolor: alpha(resourceColor(res.type), 0.14) },
                                  }}
                                />
                              ))}
                            </Box>
                          )}
                        </Box>
                      </Paper>
                    ))}
                  </Box>
                </Box>
              );
            })}
        </Box>
      )}
    </Box>
  );
}
