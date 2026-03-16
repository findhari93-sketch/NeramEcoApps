'use client';

import { useState, useEffect, useCallback } from 'react';
import { Box, Typography, Paper, Skeleton, alpha, useTheme, LinearProgress, Chip } from '@neram/ui';
import { useRouter } from 'next/navigation';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import PageHeader from '@/components/PageHeader';

interface StudentModule {
  id: string;
  title: string;
  description: string;
  icon: string;
  color: string;
  module_type: string;
  itemCount: number;
  completedCount: number;
}

export default function StudentModuleLibrary() {
  const theme = useTheme();
  const router = useRouter();
  const { activeClassroom, getToken, loading: authLoading } = useNexusAuthContext();
  const [modules, setModules] = useState<StudentModule[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchModules = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) return;

      const classroomParam = activeClassroom ? `?classroom=${activeClassroom.id}` : '';
      const res = await fetch(`/api/modules/student${classroomParam}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        setModules(data.modules || []);
      }
    } catch (err) {
      console.error('Failed to load modules:', err);
    } finally {
      setLoading(false);
    }
  }, [getToken, activeClassroom]);

  useEffect(() => {
    if (!authLoading) fetchModules();
  }, [authLoading, fetchModules]);

  const getProgressPercent = (completed: number, total: number) => {
    if (total === 0) return 0;
    return Math.round((completed / total) * 100);
  };

  return (
    <Box>
      <PageHeader
        title="Module Library"
        subtitle="Explore all available learning modules"
      />

      {/* Module Grid */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: {
            xs: '1fr',
            sm: 'repeat(2, 1fr)',
            lg: 'repeat(3, 1fr)',
          },
          gap: 2,
        }}
      >
        {loading
          ? Array.from({ length: 6 }).map((_, i) => (
              <Skeleton
                key={i}
                variant="rectangular"
                height={180}
                sx={{ borderRadius: 3 }}
              />
            ))
          : modules.map((mod) => {
              const progress = getProgressPercent(mod.completedCount, mod.itemCount);
              const moduleColor = mod.color || theme.palette.primary.main;

              return (
                <Paper
                  key={mod.id}
                  elevation={0}
                  onClick={() => router.push(`/student/modules/${mod.id}`)}
                  sx={{
                    position: 'relative',
                    overflow: 'hidden',
                    borderRadius: 3,
                    border: `1px solid ${theme.palette.divider}`,
                    borderLeft: `4px solid ${moduleColor}`,
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    minHeight: 48,
                    '&:hover': {
                      borderColor: alpha(moduleColor, 0.5),
                      boxShadow: `0 4px 12px ${alpha(moduleColor, 0.15)}`,
                      transform: 'translateY(-1px)',
                    },
                    '&:active': {
                      transform: 'translateY(0)',
                    },
                  }}
                >
                  <Box sx={{ p: 2.5 }}>
                    {/* Header row: icon + badge */}
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        mb: 1.5,
                      }}
                    >
                      <Box
                        sx={{
                          width: 40,
                          height: 40,
                          borderRadius: 2,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          bgcolor: alpha(moduleColor, 0.1),
                          color: moduleColor,
                          fontSize: '1.1rem',
                          fontWeight: 600,
                          flexShrink: 0,
                        }}
                      >
                        <span className="material-icons" style={{ fontSize: '1.25rem', lineHeight: 1 }}>{mod.icon || 'menu_book'}</span>
                      </Box>

                      {mod.module_type === 'foundation' && (
                        <Chip
                          label="Foundation"
                          size="small"
                          sx={{
                            height: 24,
                            fontSize: '0.7rem',
                            fontWeight: 600,
                            bgcolor: alpha(theme.palette.warning.main, 0.1),
                            color: theme.palette.warning.dark,
                            border: `1px solid ${alpha(theme.palette.warning.main, 0.3)}`,
                          }}
                        />
                      )}
                    </Box>

                    {/* Title */}
                    <Typography
                      variant="subtitle1"
                      sx={{
                        fontWeight: 700,
                        lineHeight: 1.3,
                        mb: 0.5,
                      }}
                    >
                      {mod.title}
                    </Typography>

                    {/* Description (truncated to 2 lines) */}
                    {mod.description && (
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{
                          mb: 2,
                          lineHeight: 1.4,
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                        }}
                      >
                        {mod.description}
                      </Typography>
                    )}

                    {/* Item count */}
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ fontWeight: 500, mb: 1, display: 'block' }}
                    >
                      {mod.itemCount} {mod.itemCount === 1 ? 'item' : 'items'}
                    </Typography>

                    {/* Progress bar */}
                    {mod.itemCount > 0 && (
                      <Box>
                        <Box
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            mb: 0.5,
                          }}
                        >
                          <Typography
                            variant="caption"
                            sx={{
                              fontWeight: 600,
                              color: progress === 100
                                ? theme.palette.success.main
                                : 'text.secondary',
                            }}
                          >
                            {progress}%
                          </Typography>
                          <Typography variant="caption" color="text.disabled">
                            {mod.completedCount}/{mod.itemCount}
                          </Typography>
                        </Box>
                        <LinearProgress
                          variant="determinate"
                          value={progress}
                          sx={{
                            height: 6,
                            borderRadius: 3,
                            bgcolor: alpha(moduleColor, 0.1),
                            '& .MuiLinearProgress-bar': {
                              borderRadius: 3,
                              bgcolor: progress === 100
                                ? theme.palette.success.main
                                : moduleColor,
                            },
                          }}
                        />
                      </Box>
                    )}
                  </Box>
                </Paper>
              );
            })}
      </Box>

      {/* Empty state */}
      {!loading && modules.length === 0 && (
        <Box
          sx={{
            textAlign: 'center',
            py: 6,
            px: 2,
          }}
        >
          <Typography variant="h6" sx={{ color: 'text.secondary', mb: 1 }}>
            No modules available yet
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.disabled' }}>
            Learning modules will appear here once published.
          </Typography>
        </Box>
      )}
    </Box>
  );
}
