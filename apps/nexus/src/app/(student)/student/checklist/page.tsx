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
  IconButton,
} from '@neram/ui';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';

interface ChecklistItem {
  id: string;
  title: string;
  is_completed: boolean;
  topic: { id: string; title: string; category: string } | null;
  resources?: { id: string; url: string; type: string }[];
}

export default function StudentChecklist() {
  const { activeClassroom, getToken } = useNexusAuthContext();
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set());

  const fetchChecklist = useCallback(async () => {
    if (!activeClassroom) return;
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
        // Revert on failure
        setItems((prev) =>
          prev.map((item) =>
            item.id === itemId ? { ...item, is_completed: !completed } : item
          )
        );
      }
    } catch (err) {
      console.error('Failed to toggle checklist item:', err);
      // Revert on error
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
    const category = item.topic?.category || 'General';
    if (!acc[category]) acc[category] = [];
    acc[category].push(item);
    return acc;
  }, {});

  const completedCount = items.filter((i) => i.is_completed).length;
  const totalCount = items.length;
  const progressPercent = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  return (
    <Box>
      <Typography variant="h5" component="h1" sx={{ fontWeight: 700, mb: 2 }}>
        Theory Checklist
      </Typography>

      {/* Progress Summary */}
      {!loading && totalCount > 0 && (
        <Paper sx={{ p: 2, mb: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              Progress
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {completedCount} of {totalCount} completed
            </Typography>
          </Box>
          <LinearProgress
            variant="determinate"
            value={progressPercent}
            sx={{ height: 8, borderRadius: 4 }}
          />
        </Paper>
      )}

      {/* Loading State */}
      {loading ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Skeleton variant="rectangular" height={48} sx={{ borderRadius: 1 }} />
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} variant="rectangular" height={56} sx={{ borderRadius: 1 }} />
          ))}
        </Box>
      ) : totalCount === 0 ? (
        <Paper sx={{ p: 3, textAlign: 'center' }}>
          <Typography variant="body2" color="text.secondary">
            No checklist items available for this classroom.
          </Typography>
        </Paper>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {Object.entries(groupedItems)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([category, categoryItems]) => (
              <Box key={category}>
                <Typography
                  variant="subtitle2"
                  sx={{ fontWeight: 600, mb: 1, color: 'text.secondary', textTransform: 'capitalize' }}
                >
                  {category}
                </Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {categoryItems.map((item) => (
                    <Paper
                      key={item.id}
                      variant="outlined"
                      sx={{
                        p: 1.5,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1,
                        opacity: item.is_completed ? 0.7 : 1,
                      }}
                    >
                      <Checkbox
                        checked={item.is_completed}
                        onChange={(e) => handleToggle(item.id, e.target.checked)}
                        disabled={togglingIds.has(item.id)}
                        sx={{ minWidth: 48, minHeight: 48, p: 0 }}
                      />
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography
                          variant="body2"
                          sx={{
                            fontWeight: 500,
                            textDecoration: item.is_completed ? 'line-through' : 'none',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {item.title}
                        </Typography>
                      </Box>
                      <Box sx={{ display: 'flex', gap: 0.5, flexShrink: 0 }}>
                        {item.resources?.map((res) => (
                          <IconButton
                            key={res.id}
                            component="a"
                            href={res.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            size="small"
                            sx={{
                              minWidth: 48,
                              minHeight: 48,
                              color: res.type === 'youtube' ? 'error.main' : 'primary.main',
                            }}
                            aria-label={`Open ${res.type} resource`}
                          >
                            <Typography variant="caption" sx={{ fontSize: 14, fontWeight: 700 }}>
                              {res.type === 'youtube' ? '▶' : res.type.toUpperCase()}
                            </Typography>
                          </IconButton>
                        ))}
                      </Box>
                    </Paper>
                  ))}
                </Box>
              </Box>
            ))}
        </Box>
      )}
    </Box>
  );
}
