'use client';

/**
 * Builder left panel: the Repository. Collapsible modules with "placed x/y"
 * counts; unplaced topics can be dragged onto the calendar (desktop) or
 * tapped to enter placing mode (tap a day to insert). Placed topics show
 * their computed first class date.
 */
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Box, Typography, Stack, Chip, Button, Collapse, Skeleton, alpha } from '@neram/ui';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import AddIcon from '@mui/icons-material/Add';
import { useAuthFetch } from '@/components/curriculum/shared';
import { PRIORITY_DISPLAY, fmtShort, type Entry } from './common';
import type { FlowResult } from '@/lib/plan-flow';

interface RepoTopicRow {
  id: string;
  title: string;
  priority: string;
  status: string;
  estimated_sessions: number;
}
interface RepoModuleRow {
  id: string;
  title: string;
  color: string | null;
  topics: RepoTopicRow[];
}

const PRIORITY_CHIP: Record<string, { bg: string; color: string }> = {
  mandatory: { bg: 'rgba(124,58,237,0.12)', color: '#5B21B6' },
  high: { bg: 'rgba(249,168,37,0.18)', color: '#8D5A00' },
  medium: { bg: 'rgba(139,149,161,0.15)', color: '#5A6672' },
  low: { bg: 'rgba(46,125,50,0.12)', color: '#1B5E20' },
};

export default function RepositoryPanel({
  entries,
  flow,
  placingTopicId,
  onPickTopic,
  onDragTopicStart,
  onDragEnd,
}: {
  entries: Entry[];
  flow: FlowResult | null;
  placingTopicId: string | null;
  /** Tap an unplaced topic: enter (or cancel) placing mode. */
  onPickTopic: (topic: { id: string; title: string }) => void;
  onDragTopicStart: (e: React.DragEvent, topicId: string) => void;
  onDragEnd: () => void;
}) {
  const router = useRouter();
  const authFetch = useAuthFetch();
  const [modules, setModules] = useState<RepoModuleRow[] | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let alive = true;
    authFetch('/api/curriculum')
      .then((res) => {
        if (!alive) return;
        const mods = (res.modules as RepoModuleRow[]) || [];
        setModules(mods);
        // Open modules that still have unplaced topics.
        setOpen((prev) => (Object.keys(prev).length ? prev : Object.fromEntries(mods.slice(0, 2).map((m) => [m.id, true]))));
      })
      .catch(() => alive && setModules([]));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** topic_id -> its plan entry (topics can appear once per plan). */
  const entryByTopic = useMemo(() => {
    const map = new Map<string, Entry>();
    for (const e of entries) if (e.topic_id) map.set(e.topic_id, e);
    return map;
  }, [entries]);

  const placedInfo = (topicId: string): string | null => {
    const entry = entryByTopic.get(topicId);
    if (!entry) return null;
    if (entry.status === 'skipped') return 'Skipped';
    if (entry.entry_type === 'self_learning') return 'Self-learning';
    const dates = flow?.entryDates.get(entry.id);
    return dates && dates.length ? `✓ ${fmtShort(dates[0])}` : 'Placed';
  };

  const unplacedCount = useMemo(() => {
    if (!modules) return 0;
    return modules.reduce(
      (sum, m) => sum + m.topics.filter((t) => !entryByTopic.has(t.id)).length,
      0,
    );
  }, [modules, entryByTopic]);

  if (!modules) {
    return (
      <Stack spacing={1}>
        <Skeleton variant="rounded" height={48} sx={{ borderRadius: 2.5 }} />
        <Skeleton variant="rounded" height={48} sx={{ borderRadius: 2.5 }} />
        <Skeleton variant="rounded" height={48} sx={{ borderRadius: 2.5 }} />
      </Stack>
    );
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
        <Typography
          sx={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'text.disabled' }}
        >
          Repository
        </Typography>
        <Button
          size="small"
          startIcon={<AddIcon sx={{ fontSize: 14 }} />}
          onClick={() => router.push('/teacher/curriculum')}
          sx={{ ml: 'auto', minHeight: 32, fontSize: '0.72rem' }}
        >
          Module
        </Button>
      </Box>
      <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mb: 1 }}>
        Drag a topic onto the calendar, or tap it and pick a day. {unplacedCount} unplaced.
      </Typography>
      <Stack spacing={1}>
        {modules.length === 0 && (
          <Typography variant="body2" color="text.disabled" sx={{ textAlign: 'center', py: 2 }}>
            The repository is empty. Add modules and topics first.
          </Typography>
        )}
        {modules.map((m, mi) => {
          const color = m.color || ['#7C3AED', '#00897B', '#EF6C00', '#1565C0'][mi % 4];
          const placed = m.topics.filter((t) => entryByTopic.has(t.id)).length;
          const isOpen = !!open[m.id];
          return (
            <Box key={m.id} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2.5, overflow: 'hidden', bgcolor: 'background.paper' }}>
              <Box
                role="button"
                tabIndex={0}
                onClick={() => setOpen((p) => ({ ...p, [m.id]: !p[m.id] }))}
                onKeyDown={(e) => e.key === 'Enter' && setOpen((p) => ({ ...p, [m.id]: !p[m.id] }))}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  px: 1.25,
                  py: 1,
                  minHeight: 48,
                  cursor: 'pointer',
                  bgcolor: alpha('#1A2027', 0.02),
                  '&:hover': { bgcolor: alpha('#1A2027', 0.045) },
                }}
              >
                {isOpen ? (
                  <ExpandMoreIcon sx={{ fontSize: 18, color: 'text.disabled' }} />
                ) : (
                  <ChevronRightIcon sx={{ fontSize: 18, color: 'text.disabled' }} />
                )}
                <Box sx={{ width: 9, height: 9, borderRadius: 0.75, bgcolor: color, flexShrink: 0 }} />
                <Typography sx={{ fontWeight: 700, fontSize: '0.82rem', flex: 1, minWidth: 0 }} noWrap>
                  {m.title}
                </Typography>
                <Typography variant="caption" color="text.disabled" sx={{ fontWeight: 700 }}>
                  {placed}/{m.topics.length} placed
                </Typography>
              </Box>
              <Collapse in={isOpen}>
                {m.topics.map((t) => {
                  const info = placedInfo(t.id);
                  const isPlaced = info !== null;
                  const isPicking = placingTopicId === t.id;
                  const pr = PRIORITY_CHIP[t.priority] || PRIORITY_CHIP.medium;
                  return (
                    <Box
                      key={t.id}
                      role={isPlaced ? undefined : 'button'}
                      tabIndex={isPlaced ? undefined : 0}
                      draggable={!isPlaced}
                      onDragStart={(e) => {
                        if (isPlaced) {
                          e.preventDefault();
                          return;
                        }
                        onDragTopicStart(e, t.id);
                      }}
                      onDragEnd={onDragEnd}
                      onClick={() => !isPlaced && onPickTopic({ id: t.id, title: t.title })}
                      onKeyDown={(e) => e.key === 'Enter' && !isPlaced && onPickTopic({ id: t.id, title: t.title })}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1,
                        px: 1.25,
                        py: 1,
                        minHeight: 48,
                        borderTop: '1px solid',
                        borderColor: alpha('#1A2027', 0.05),
                        cursor: isPlaced ? 'default' : 'grab',
                        opacity: isPlaced ? 0.55 : 1,
                        bgcolor: isPicking ? alpha('#7C3AED', 0.08) : 'transparent',
                        boxShadow: isPicking ? `inset 0 0 0 1.5px #7C3AED` : 'none',
                        '&:hover': isPlaced ? {} : { bgcolor: alpha('#7C3AED', 0.04) },
                      }}
                    >
                      <DragIndicatorIcon sx={{ fontSize: 16, color: 'text.disabled', flexShrink: 0 }} />
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography sx={{ fontWeight: 600, fontSize: '0.8rem', lineHeight: 1.3 }}>{t.title}</Typography>
                        <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mt: 0.25 }}>
                          <Chip
                            label={PRIORITY_DISPLAY[t.priority] || t.priority}
                            size="small"
                            sx={{ bgcolor: pr.bg, color: pr.color, fontWeight: 700, height: 17, fontSize: '0.6rem' }}
                          />
                          <Typography variant="caption" color="text.disabled">
                            {t.estimated_sessions} {t.estimated_sessions > 1 ? 'classes' : 'class'}
                          </Typography>
                        </Stack>
                      </Box>
                      <Typography
                        variant="caption"
                        sx={{ fontWeight: 700, flexShrink: 0, color: isPlaced ? '#1B5E20' : 'text.disabled' }}
                      >
                        {info || 'unplaced'}
                      </Typography>
                    </Box>
                  );
                })}
                {m.topics.length === 0 && (
                  <Typography variant="caption" color="text.disabled" sx={{ display: 'block', px: 1.5, py: 1 }}>
                    No topics in this module yet
                  </Typography>
                )}
              </Collapse>
            </Box>
          );
        })}
      </Stack>
    </Box>
  );
}
