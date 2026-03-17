'use client';

import { Box, Typography, Paper, Skeleton, alpha, useTheme, LinearProgress, Chip } from '@neram/ui';
import { useRouter, useParams } from 'next/navigation';
import { useCallback, useState, useEffect } from 'react';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import PageHeader from '@/components/PageHeader';
import FoundationChapterListContent from '@/components/foundation/FoundationChapterListContent';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import PlayCircleFilledIcon from '@mui/icons-material/PlayCircleFilled';
import LockIcon from '@mui/icons-material/Lock';

interface ModuleItem {
  id: string;
  title: string;
  description: string | null;
  item_type: string;
  video_source: string | null;
  youtube_video_id: string | null;
  chapter_number: number | null;
  sort_order: number;
  status: 'locked' | 'in_progress' | 'completed';
  last_video_position_seconds: number | null;
}

interface ModuleDetail {
  id: string;
  title: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  module_type: string;
}

export default function StudentModuleDetailPage() {
  const theme = useTheme();
  const router = useRouter();
  const params = useParams();
  const moduleId = params.id as string;
  const { getToken, loading: authLoading } = useNexusAuthContext();

  const [module, setModule] = useState<ModuleDetail | null>(null);
  const [items, setItems] = useState<ModuleItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchModuleData = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) return;

      const res = await fetch(`/api/modules/student/${moduleId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        setModule(data.module || null);
        setItems(data.items || []);
      }
    } catch (err) {
      console.error('Failed to load module details:', err);
    } finally {
      setLoading(false);
    }
  }, [getToken, moduleId]);

  useEffect(() => {
    if (!authLoading) fetchModuleData();
  }, [authLoading, fetchModuleData]);

  const completedCount = items.filter((item) => item.status === 'completed').length;
  const progressPercent = items.length > 0 ? Math.round((completedCount / items.length) * 100) : 0;

  const handleItemClick = (item: ModuleItem) => {
    if (item.status === 'locked') return;
    router.push(`/student/modules/${moduleId}/items/${item.id}`);
  };

  // Foundation module: delegate to rich Foundation UI
  if (!loading && module?.module_type === 'foundation') {
    return (
      <Box>
        <PageHeader
          title={module.title || 'Foundation Module'}
          subtitle={module.description || undefined}
          breadcrumbs={[
            { label: 'Checklist', href: '/student/checklist' },
            { label: module.title || 'Foundation Module' },
          ]}
        />
        <FoundationChapterListContent
          hideHeader
          chapterLinkPrefix={`/student/modules/${moduleId}/chapters`}
        />
      </Box>
    );
  }

  return (
    <Box>
      <PageHeader
        title={loading ? 'Loading...' : module?.title || 'Module'}
        subtitle={module?.description || undefined}
        breadcrumbs={[
          { label: 'Checklist', href: '/student/checklist' },
          { label: module?.title || 'Module' },
        ]}
      />

      {/* Overall Progress */}
      {!loading && items.length > 0 && (
        <Paper
          elevation={0}
          sx={{
            p: { xs: 2, sm: 2.5 },
            mb: 3,
            borderRadius: 3,
            border: `1px solid ${theme.palette.divider}`,
            bgcolor: 'background.paper',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
            <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.secondary' }}>
              Overall Progress
            </Typography>
            <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>
              {completedCount} / {items.length} completed
            </Typography>
          </Box>
          <LinearProgress
            variant="determinate"
            value={progressPercent}
            sx={{
              height: 8,
              borderRadius: 4,
              bgcolor: alpha(theme.palette.primary.main, 0.1),
              '& .MuiLinearProgress-bar': {
                borderRadius: 4,
                bgcolor: completedCount === items.length ? theme.palette.success.main : theme.palette.primary.main,
              },
            }}
          />
          <Typography
            variant="caption"
            sx={{ mt: 0.5, display: 'block', color: 'text.disabled', fontSize: '0.7rem' }}
          >
            {progressPercent}% complete
          </Typography>
        </Paper>
      )}

      {/* Items List */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        {loading
          ? Array.from({ length: 5 }).map((_, i) => (
              <Skeleton
                key={i}
                variant="rectangular"
                height={100}
                sx={{ borderRadius: 3 }}
              />
            ))
          : items.map((item, index) => {
              const isLocked = item.status === 'locked';
              const isCompleted = item.status === 'completed';
              const isInProgress = item.status === 'in_progress';
              const itemNumber = item.chapter_number ?? index + 1;

              const borderLeftColor = isCompleted
                ? theme.palette.success.main
                : isInProgress
                  ? theme.palette.primary.main
                  : theme.palette.action.disabled;

              return (
                <Paper
                  key={item.id}
                  elevation={0}
                  onClick={() => handleItemClick(item)}
                  sx={{
                    p: { xs: 2, sm: 2.5 },
                    borderRadius: 3,
                    borderLeft: `4px solid ${borderLeftColor}`,
                    border: `1px solid ${isInProgress ? alpha(theme.palette.primary.main, 0.3) : theme.palette.divider}`,
                    borderLeftWidth: '4px',
                    borderLeftStyle: 'solid',
                    borderLeftColor: borderLeftColor,
                    bgcolor: isLocked ? alpha(theme.palette.action.disabled, 0.03) : 'background.paper',
                    opacity: isLocked ? 0.5 : 1,
                    cursor: isLocked ? 'not-allowed' : 'pointer',
                    pointerEvents: isLocked ? 'none' : 'auto',
                    transition: 'all 200ms ease',
                    animation: `fadeInUp 400ms cubic-bezier(0.05, 0.7, 0.1, 1) ${index * 50}ms both`,
                    '@keyframes fadeInUp': {
                      from: { opacity: 0, transform: 'translateY(12px)' },
                      to: { opacity: 1, transform: 'translateY(0)' },
                    },
                    ...(!isLocked && {
                      '&:hover': {
                        transform: 'translateY(-2px)',
                        boxShadow: `0 4px 16px ${alpha(theme.palette.primary.main, 0.1)}`,
                        borderColor: alpha(theme.palette.primary.main, 0.4),
                        borderLeftColor: borderLeftColor,
                      },
                      '&:active': {
                        transform: 'translateY(0)',
                      },
                    }),
                  }}
                >
                  <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
                    {/* Item Number Circle */}
                    <Box
                      sx={{
                        width: 44,
                        height: 44,
                        borderRadius: '50%',
                        bgcolor: isCompleted
                          ? alpha(theme.palette.success.main, 0.1)
                          : isInProgress
                            ? alpha(theme.palette.primary.main, 0.1)
                            : alpha(theme.palette.action.disabled, 0.08),
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      {isCompleted ? (
                        <CheckCircleIcon sx={{ fontSize: '1.5rem', color: theme.palette.success.main }} />
                      ) : isLocked ? (
                        <LockIcon sx={{ fontSize: '1.25rem', color: theme.palette.text.disabled }} />
                      ) : (
                        <Typography
                          sx={{
                            fontWeight: 800,
                            fontSize: '1.1rem',
                            color: theme.palette.primary.main,
                          }}
                        >
                          {itemNumber}
                        </Typography>
                      )}
                    </Box>

                    {/* Content */}
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                        <Typography
                          variant="subtitle2"
                          sx={{
                            fontWeight: 700,
                            color: isLocked ? 'text.disabled' : 'text.primary',
                            lineHeight: 1.3,
                            flex: 1,
                          }}
                        >
                          {item.title}
                        </Typography>
                        {isCompleted && (
                          <Chip
                            label="Completed"
                            size="small"
                            color="success"
                            sx={{ height: 22, fontSize: '0.65rem', fontWeight: 700 }}
                          />
                        )}
                        {isInProgress && (
                          <Chip
                            label="Continue"
                            size="small"
                            color="primary"
                            sx={{ height: 22, fontSize: '0.65rem', fontWeight: 700 }}
                          />
                        )}
                        {isLocked && (
                          <Chip
                            label="Locked"
                            size="small"
                            sx={{
                              height: 22,
                              fontSize: '0.65rem',
                              fontWeight: 700,
                              bgcolor: alpha(theme.palette.action.disabled, 0.1),
                              color: 'text.disabled',
                            }}
                          />
                        )}
                      </Box>

                      {item.description && (
                        <Typography
                          variant="body2"
                          sx={{
                            color: isLocked ? 'text.disabled' : 'text.secondary',
                            fontSize: '0.8rem',
                            lineHeight: 1.4,
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                          }}
                        >
                          {item.description}
                        </Typography>
                      )}
                    </Box>

                    {/* Play icon for in-progress items */}
                    {isInProgress && (
                      <PlayCircleFilledIcon
                        sx={{
                          fontSize: '2rem',
                          color: alpha(theme.palette.primary.main, 0.7),
                          flexShrink: 0,
                          alignSelf: 'center',
                        }}
                      />
                    )}
                  </Box>
                </Paper>
              );
            })}
      </Box>

      {/* Empty State */}
      {!loading && items.length === 0 && (
        <Box
          sx={{
            textAlign: 'center',
            py: 6,
            px: 2,
          }}
        >
          <Typography variant="h6" sx={{ color: 'text.secondary', mb: 1 }}>
            No items available yet
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.disabled' }}>
            Module content will appear here once published.
          </Typography>
        </Box>
      )}
    </Box>
  );
}
