'use client';

/**
 * Builder middle panel: the computed day-by-day roll-out of the plan queue.
 * One row per class day; multi-session topics span several rows ("day k of
 * N"); pinned tests render as fixed rows the topics flow around. Rows accept
 * drops (desktop) and taps in placing mode (mobile-first) to insert before
 * them; past rows are locked.
 */
import { useMemo, useState } from 'react';
import { Box, Typography, Stack, Chip, alpha } from '@neram/ui';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import CloseIcon from '@mui/icons-material/Close';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
import PushPinOutlinedIcon from '@mui/icons-material/PushPinOutlined';
import FlagOutlinedIcon from '@mui/icons-material/FlagOutlined';
import WarningAmberOutlinedIcon from '@mui/icons-material/WarningAmberOutlined';
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined';
import type { NexusTeachingPlanDetail } from '@neram/database';
import type { FlowResult } from '@/lib/plan-flow';
import { entryTitle, entryColor, entrySpan, fmtShort, fmtTime, TEST_COLOR, type Entry } from './common';

export default function FlowList({
  plan,
  flow,
  today,
  placing,
  onInsertBefore,
  onDropBefore,
  onEntryClick,
  onRemove,
  onSetSpan,
  onDragEntryStart,
  onDragEnd,
  dragging,
}: {
  plan: NexusTeachingPlanDetail;
  flow: FlowResult;
  today: string;
  /** Label of the topic being placed (tap-to-place mode), or null. */
  placing: string | null;
  /** Insert the placing topic before this entry (null = at the end). */
  onInsertBefore: (beforeEntryId: string | null) => void;
  /** A drag payload was dropped before this entry (null = at the end). */
  onDropBefore: (beforeEntryId: string | null) => void;
  onEntryClick: (entry: Entry) => void;
  onRemove: (entry: Entry) => void;
  /** Change how many class days a placed topic occupies (recomputes dates). */
  onSetSpan: (entry: Entry, span: number) => void;
  onDragEntryStart: (e: React.DragEvent, entryId: string) => void;
  onDragEnd: () => void;
  /** True while any drag is in flight (enables drop highlights). */
  dragging: boolean;
}) {
  const [overKey, setOverKey] = useState<string | null>(null);
  const entriesById = useMemo(() => new Map(plan.entries.map((e) => [e.id, e])), [plan.entries]);

  /** For each free day, the pinned test entry it precedes (insert lands before it). */
  const nextTestAfter = (date: string): string | null => {
    const later = flow.days.find((d) => d.date > date && d.isTest && d.entryId);
    return later?.entryId ?? null;
  };

  const offCalendar = useMemo(
    () =>
      plan.entries
        .filter((e) => e.entry_type === 'self_learning' || e.status === 'skipped')
        .sort((a, b) => a.position - b.position),
    [plan.entries],
  );

  // End summary: computed end vs target vs exam.
  const summary = useMemo(() => {
    const end = flow.computedEndDate;
    if (!end) return null;
    const target = plan.expected_end_date;
    const exam = plan.exam_date;
    const over = end > target;
    let buffer: number | null = null;
    if (exam) {
      buffer = Math.round((new Date(exam + 'T00:00:00Z').getTime() - new Date(end + 'T00:00:00Z').getTime()) / 86400000);
    }
    return { end, over, buffer };
  }, [flow.computedEndDate, plan.expected_end_date, plan.exam_date]);

  const targetProps = (key: string, beforeEntryId: string | null, droppable: boolean) => ({
    onDragOver: (e: React.DragEvent) => {
      if (!droppable || !dragging) return;
      e.preventDefault();
      if (overKey !== key) setOverKey(key);
    },
    onDragLeave: () => overKey === key && setOverKey(null),
    onDrop: (e: React.DragEvent) => {
      if (!droppable) return;
      e.preventDefault();
      setOverKey(null);
      onDropBefore(beforeEntryId);
    },
  });

  const dateCol = (label: string, color?: string) => (
    <Typography
      sx={{
        width: 64,
        flexShrink: 0,
        fontSize: '0.62rem',
        fontWeight: 700,
        textAlign: 'right',
        lineHeight: 1.3,
        pt: 1.25,
        color: color || 'text.disabled',
        textTransform: 'uppercase',
      }}
    >
      {label}
    </Typography>
  );

  const marker = (key: string) =>
    overKey === key && (
      <Box sx={{ height: 3, borderRadius: 2, ml: '74px', mb: 0.5, bgcolor: 'primary.main' }} />
    );

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.25, flexWrap: 'wrap' }}>
        <Typography sx={{ fontWeight: 700, fontSize: '0.9rem' }}>
          Schedule · {fmtShort(plan.start_date)} onwards
        </Typography>
        {summary && (
          <Chip
            icon={
              summary.over ? (
                <WarningAmberOutlinedIcon sx={{ fontSize: 14 }} />
              ) : (
                <FlagOutlinedIcon sx={{ fontSize: 14 }} />
              )
            }
            label={
              summary.over
                ? `Ends ${fmtShort(summary.end)}, past the ${fmtShort(plan.expected_end_date)} target${summary.buffer !== null ? ` · ${summary.buffer} days before the exam` : ''}`
                : `Ends ${fmtShort(summary.end)}${summary.buffer !== null ? ` · ${summary.buffer} days buffer before the exam` : ''}`
            }
            size="small"
            sx={{
              fontWeight: 700,
              fontSize: '0.68rem',
              bgcolor: summary.over ? 'rgba(198,40,40,0.1)' : 'rgba(46,125,50,0.12)',
              color: summary.over ? '#C62828' : '#1B5E20',
            }}
          />
        )}
      </Box>

      {flow.days.length === 0 && (
        <Box
          sx={{ textAlign: 'center', py: 4, px: 2, border: '1.5px dashed', borderColor: 'divider', borderRadius: 3 }}
        >
          <Typography variant="body2" color="text.disabled">
            Nothing planned yet. Pick topics from a subject on the left to start building.
          </Typography>
          <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 1 }}>
            Repository = your library of subjects and topics. Drag topics here to set the teaching order,
            then Schedule lays them onto real dates automatically.
          </Typography>
        </Box>
      )}

      <Stack spacing={0.75}>
        {flow.days.map((d) => {
          const entry = d.entryId ? entriesById.get(d.entryId) : null;
          const key = `${d.date}:${d.entryId ?? 'free'}:${d.sessionIndex}`;

          // Pinned test row.
          if (d.isTest && entry) {
            return (
              <Box key={key}>
                {marker(key)}
                <Box sx={{ display: 'flex', gap: 1.25 }} {...targetProps(key, entry.id, !d.locked)}>
                  {dateCol(fmtShort(d.date) + (d.isToday ? ' · today' : ''), TEST_COLOR)}
                  <Box
                    role="button"
                    tabIndex={0}
                    onClick={() => (placing ? onInsertBefore(entry.id) : onEntryClick(entry))}
                    onKeyDown={(e) => e.key === 'Enter' && onEntryClick(entry)}
                    sx={{
                      flex: 1,
                      minWidth: 0,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1,
                      px: 1.5,
                      py: 1.1,
                      minHeight: 48,
                      borderRadius: 2.5,
                      cursor: 'pointer',
                      bgcolor: alpha(TEST_COLOR, 0.05),
                      border: `1px dashed ${alpha(TEST_COLOR, 0.4)}`,
                    }}
                  >
                    <Typography sx={{ fontWeight: 700, fontSize: '0.82rem', color: TEST_COLOR, flex: 1 }} noWrap>
                      ◈ {entryTitle(entry)}
                    </Typography>
                    <Stack direction="row" spacing={0.5} alignItems="center" sx={{ color: alpha(TEST_COLOR, 0.75) }}>
                      <PushPinOutlinedIcon sx={{ fontSize: 13 }} />
                      <Typography variant="caption" sx={{ fontWeight: 700 }}>
                        pinned date
                      </Typography>
                    </Stack>
                  </Box>
                </Box>
              </Box>
            );
          }

          // Free day (queue ran out before the last pinned test).
          if (!entry) {
            const before = nextTestAfter(d.date);
            return (
              <Box key={key}>
                {marker(key)}
                <Box sx={{ display: 'flex', gap: 1.25 }} {...targetProps(key, before, !d.locked)}>
                  {dateCol(fmtShort(d.date) + (d.isToday ? ' · today' : ''))}
                  <Box
                    role="button"
                    tabIndex={0}
                    onClick={() => placing && onInsertBefore(before)}
                    sx={{
                      flex: 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      minHeight: 48,
                      borderRadius: 2.5,
                      border: '1.5px dashed',
                      borderColor: overKey === key ? 'primary.main' : 'divider',
                      color: 'text.disabled',
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      cursor: placing ? 'pointer' : 'default',
                      bgcolor: overKey === key ? alpha('#7C3AED', 0.05) : 'transparent',
                    }}
                  >
                    {placing || dragging ? 'Insert here' : 'Free day'}
                  </Box>
                </Box>
              </Box>
            );
          }

          // Topic session row.
          const span = entrySpan(entry);
          const isFirst = d.sessionIndex === 0;
          const locked = flow.lockedEntryIds.has(entry.id) || d.locked;
          // The span floor is whatever has already been taught (never below 1).
          const minSpan = Math.max(1, entry.completed_sessions ?? 0);
          const canEditSpan = isFirst && !locked && entry.entry_type === 'live_class';
          const cls = entry.classes?.find((c) => c.scheduled_date === d.date) || entry.classes?.[0];
          // A day whose date has passed is treated as done (the schedule has
          // moved on); the teacher backfills its recording from Class Day.
          const isPast = d.date < today;
          const statusLabel = d.isCovered
            ? '✓ covered'
            : d.isToday
              ? cls?.start_time
                ? `◷ today, ${fmtTime(cls.start_time)}`
                : '◷ today'
              : isPast
                ? '✓ done'
                : 'planned';
          const statusColor = d.isCovered
            ? '#1B5E20'
            : d.isToday
              ? TEST_COLOR
              : isPast
                ? '#1B5E20'
                : 'text.disabled';

          return (
            <Box key={key}>
              {isFirst && marker(key)}
              <Box sx={{ display: 'flex', gap: 1.25 }} {...(isFirst ? targetProps(key, entry.id, !locked) : {})}>
                {dateCol(fmtShort(d.date) + (d.isToday ? ' · today' : ''), d.isToday ? '#7C3AED' : undefined)}
                <Box
                  role="button"
                  tabIndex={0}
                  draggable={isFirst && !locked}
                  onDragStart={(e) => {
                    if (!isFirst || locked) {
                      e.preventDefault();
                      return;
                    }
                    onDragEntryStart(e, entry.id);
                  }}
                  onDragEnd={onDragEnd}
                  onClick={() => (placing && isFirst && !locked ? onInsertBefore(entry.id) : onEntryClick(entry))}
                  onKeyDown={(e) => e.key === 'Enter' && onEntryClick(entry)}
                  sx={{
                    flex: 1,
                    minWidth: 0,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    px: 1.25,
                    py: 1.1,
                    minHeight: 48,
                    borderRadius: 2.5,
                    bgcolor: 'background.paper',
                    border: '1px solid',
                    borderColor: d.isToday ? alpha('#7C3AED', 0.55) : 'divider',
                    borderLeft: `3px solid ${entryColor(entry)}`,
                    opacity: d.isCovered || isPast ? 0.55 : 1,
                    cursor: locked ? 'pointer' : 'grab',
                    boxShadow: d.isToday ? `0 0 0 3px ${alpha('#7C3AED', 0.08)}` : 'none',
                    '&:hover': { borderColor: alpha('#7C3AED', 0.4) },
                  }}
                >
                  {isFirst && !locked ? (
                    <DragIndicatorIcon sx={{ fontSize: 16, color: 'text.disabled', flexShrink: 0 }} />
                  ) : (
                    <Box sx={{ width: 16, flexShrink: 0 }} />
                  )}
                  <Typography sx={{ fontWeight: 700, fontSize: '0.82rem', minWidth: 0, flex: 1 }} noWrap>
                    {entryTitle(entry)}
                    {span > 1 && (
                      <Typography component="span" sx={{ fontWeight: 600, fontSize: '0.78rem', color: 'text.disabled' }}>
                        {' '}· day {d.sessionIndex + 1} of {span}
                      </Typography>
                    )}
                    {entry.is_unplanned && (
                      <Typography component="span" sx={{ fontWeight: 700, fontSize: '0.66rem', color: '#B54700' }}>
                        {' '}· UNPLANNED
                      </Typography>
                    )}
                  </Typography>
                  {canEditSpan && (
                    <Stack
                      direction="row"
                      alignItems="center"
                      onClick={(e) => e.stopPropagation()}
                      sx={{ flexShrink: 0, border: '1px solid', borderColor: 'divider', borderRadius: 1.5, overflow: 'hidden' }}
                    >
                      <Box
                        role="button"
                        tabIndex={0}
                        aria-label="One fewer class day"
                        title="One fewer class day"
                        onClick={() => span > minSpan && onSetSpan(entry, span - 1)}
                        sx={{
                          width: 28,
                          height: 28,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: span > minSpan ? 'text.secondary' : 'text.disabled',
                          cursor: span > minSpan ? 'pointer' : 'default',
                          '&:hover': span > minSpan ? { bgcolor: alpha('#7C3AED', 0.08) } : {},
                        }}
                      >
                        <RemoveIcon sx={{ fontSize: 15 }} />
                      </Box>
                      <Typography
                        sx={{ minWidth: 16, textAlign: 'center', fontSize: '0.72rem', fontWeight: 700 }}
                        title="Class days for this topic"
                      >
                        {span}
                      </Typography>
                      <Box
                        role="button"
                        tabIndex={0}
                        aria-label="One more class day"
                        title="One more class day"
                        onClick={() => span < 30 && onSetSpan(entry, span + 1)}
                        sx={{
                          width: 28,
                          height: 28,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: span < 30 ? 'text.secondary' : 'text.disabled',
                          cursor: span < 30 ? 'pointer' : 'default',
                          '&:hover': span < 30 ? { bgcolor: alpha('#7C3AED', 0.08) } : {},
                        }}
                      >
                        <AddIcon sx={{ fontSize: 15 }} />
                      </Box>
                    </Stack>
                  )}
                  <Typography variant="caption" sx={{ fontWeight: 700, color: statusColor, flexShrink: 0 }}>
                    {statusLabel}
                  </Typography>
                  {isFirst && !locked && (
                    <Box
                      role="button"
                      tabIndex={0}
                      aria-label="Remove from plan"
                      title="Remove, returns to repository"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemove(entry);
                      }}
                      sx={{
                        width: 28,
                        height: 28,
                        borderRadius: 1.5,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'text.disabled',
                        flexShrink: 0,
                        '&:hover': { bgcolor: 'rgba(198,40,40,0.08)', color: '#C62828' },
                      }}
                    >
                      <CloseIcon sx={{ fontSize: 15 }} />
                    </Box>
                  )}
                </Box>
              </Box>
            </Box>
          );
        })}

        {/* Trailing add-at-end zone */}
        <Box sx={{ display: 'flex', gap: 1.25 }} {...targetProps('END', null, true)}>
          <Box sx={{ width: 64, flexShrink: 0 }} />
          <Box
            role="button"
            tabIndex={0}
            onClick={() => placing && onInsertBefore(null)}
            sx={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: 48,
              borderRadius: 2.5,
              border: '2px dashed',
              borderColor: overKey === 'END' ? 'primary.main' : 'divider',
              color: overKey === 'END' ? 'primary.main' : 'text.disabled',
              fontSize: '0.78rem',
              fontWeight: 700,
              cursor: placing ? 'pointer' : 'default',
              bgcolor: overKey === 'END' ? alpha('#7C3AED', 0.05) : 'transparent',
            }}
          >
            ＋ Drop or tap here to add at the end
          </Box>
        </Box>
      </Stack>

      {/* Off-calendar entries: self-learning and skipped */}
      {offCalendar.length > 0 && (
        <Box sx={{ mt: 2.5 }}>
          <Typography
            sx={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'text.disabled', mb: 1 }}
          >
            Off calendar · self-learning and skipped
          </Typography>
          <Stack spacing={0.75}>
            {offCalendar.map((e) => (
              <Box
                key={e.id}
                role="button"
                tabIndex={0}
                onClick={() => onEntryClick(e)}
                onKeyDown={(ev) => ev.key === 'Enter' && onEntryClick(e)}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  px: 1.25,
                  py: 1,
                  minHeight: 48,
                  borderRadius: 2.5,
                  border: '1px dashed',
                  borderColor: 'divider',
                  cursor: 'pointer',
                  ml: '74px',
                }}
              >
                <MenuBookOutlinedIcon sx={{ fontSize: 15, color: e.status === 'skipped' ? 'text.disabled' : '#00897B' }} />
                <Typography
                  sx={{
                    fontWeight: 600,
                    fontSize: '0.82rem',
                    flex: 1,
                    minWidth: 0,
                    ...(e.status === 'skipped' ? { textDecoration: 'line-through', color: 'text.disabled' } : {}),
                  }}
                  noWrap
                >
                  {entryTitle(e)}
                </Typography>
                <Typography variant="caption" sx={{ fontWeight: 700, color: e.status === 'skipped' ? '#C62828' : '#00695C' }}>
                  {e.status === 'skipped' ? 'Skipped' : 'Self-learning'}
                </Typography>
              </Box>
            ))}
          </Stack>
        </Box>
      )}
    </Box>
  );
}
