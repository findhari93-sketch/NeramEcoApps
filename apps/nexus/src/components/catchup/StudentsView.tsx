'use client';

/**
 * The Students view of Catch-up: who is behind, why, and what to do about it.
 *
 * Replaces the Needs action, Reasons and Standing tabs (2026-10). Those split
 * one question across three screens: the tiles said WHAT the clock thought (Run
 * over, Not started), the Reasons feed was one card per student per class with
 * no way to find anyone, and Standing repeated everyone who had finished.
 *
 * Now there is one list. The page's stat cards ARE its filter (diagnosis: Stuck,
 * Stopped, Not started, ...), the reason chips narrow it further (AND), and
 * every row carries its reason inline and a one-sentence diagnosis. Tapping a
 * row opens the student sheet: every class, why they missed it, how far they
 * got. The All clear card shows the wall of students who owe nothing.
 *
 * Nothing here fetches: the overview payload is in memory, so search and
 * filters cost no requests.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  IconButton,
  InputAdornment,
  Stack,
  TextField,
  Typography,
  useTheme,
} from '@neram/ui';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import StageFilter from '@/components/students/list/StageFilter';
import { useStudentListView } from '@/components/students/list/useStudentListView';
import { suggestedOrder, type ListAccessors } from '@/lib/student-list-view';
import { DIAGNOSIS_META, DIAGNOSIS_ORDER, type Diagnosis } from '@/lib/catchup-diagnosis';
import { RSVP_REASONS } from '@/lib/rsvp-reasons';
import type { ReasonFilterKey } from '@/lib/absence-reason';
import StudentRow, { useDiagnosisColor } from './StudentRow';
import StudentSheet from './StudentSheet';
import BulkNudgeBar, { MAX_BULK_NUDGE } from './BulkNudgeBar';
import NeedsACall from './NeedsACall';
import AllClearWall from './AllClearWall';
import type { Row, TabProps } from './types';

const GROUPS_STORAGE_KEY = 'nexus:catchup:diag-groups';

/** Rows an open group renders before it offers the rest. */
const GROUP_PAGE = 15;

const ACCESSORS: ListAccessors<Row> = {
  id: (r) => r.student.id,
  name: (r) => r.student.name,
  email: (r) => r.student.email,
};
const SORTS = [suggestedOrder<Row>()];

/**
 * A row's diagnosis, or the nearest one for a payload cached before
 * diagnoses existed, so an old cache never renders a blank state.
 */
export function stateOf(row: Row): Diagnosis {
  if (row.diagnosis) return row.diagnosis.state;
  switch (row.bucket) {
    case 'all_clear':
      return 'all_clear';
    case 'waiting_on_us':
      return 'waiting_on_us';
    case 'run_over':
      return 'over_time';
    case 'not_started':
      return 'not_started';
    case 'behind':
      return 'stopped';
    default:
      return 'on_track';
  }
}

/** Is this item still owed by the student (not cleared, not excused)? */
function isOpenItem(i: Row['items'][number]): boolean {
  return i.status !== 'done' && i.status !== 'excused';
}

/** The reason keys among a student's open classes. */
export function reasonKeysOf(row: Row): Set<ReasonFilterKey> {
  const out = new Set<ReasonFilterKey>();
  for (const i of row.items) {
    if (!isOpenItem(i) || i.kind === 'late_joiner') continue;
    const code = i.reason?.code ?? i.reason_code;
    out.add(code === 'unwell' || code === 'family' || code === 'clash' || code === 'other' ? code : 'none');
  }
  return out;
}

export interface StudentsViewProps extends TabProps {
  /** The stat card that is pressed, or null for everyone still catching up. */
  diagnosis: Diagnosis | null;
  onDiagnosis: (next: Diagnosis | null) => void;
  reason: ReasonFilterKey | null;
  onReason: (next: ReasonFilterKey | null) => void;
  /** True while a note or a mark is being saved. */
  celebrating?: boolean;
}

export default function StudentsView({
  data,
  busy,
  onAct,
  onNudge,
  onNudgeMany,
  onNote,
  onMarkCelebrated,
  diagnosis,
  onDiagnosis,
  reason,
  onReason,
  celebrating,
}: StudentsViewProps) {
  const theme = useTheme();
  const toneColor = useDiagnosisColor();

  const [openId, setOpenId] = useState<string | null>(null);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [showAll, setShowAll] = useState<Record<string, boolean>>({});
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(GROUPS_STORAGE_KEY);
      if (saved) setOpenGroups(JSON.parse(saved));
    } catch {
      // A corrupt or blocked preference is not worth failing a page over.
    }
  }, []);

  const allClear = diagnosis === 'all_clear';
  const universe = useMemo(
    () => data.students.filter((s) => (allClear ? stateOf(s) === 'all_clear' : stateOf(s) !== 'all_clear')),
    [data.students, allClear],
  );

  const matches = useCallback(
    (s: Row) =>
      (diagnosis === null || allClear || stateOf(s) === diagnosis) &&
      (reason === null || allClear || reasonKeysOf(s).has(reason)),
    [diagnosis, reason, allClear],
  );
  const listView = useStudentListView<Row, 'suggested'>({
    rows: universe,
    accessors: ACCESSORS,
    extraSorts: SORTS,
    defaultSort: 'suggested',
    prefilter: matches,
    urlKeys: false,
  });
  const { query, setQuery } = listView;
  const filtered = listView.shown;

  // Students (not classes) per reason, among those the diagnosis card keeps, so
  // the chip's number is how many rows it will show.
  const reasonCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of universe) {
      if (diagnosis !== null && !allClear && stateOf(s) !== diagnosis) continue;
      for (const k of reasonKeysOf(s)) counts[k] = (counts[k] || 0) + 1;
    }
    return counts;
  }, [universe, diagnosis, allClear]);

  const needsACall = useMemo(
    () =>
      universe
        .filter((s) => s.standing.unresponsive)
        .sort(
          (a, b) =>
            b.standing.ownOpen - a.standing.ownOpen ||
            (b.standing.oldestOpenDays ?? 0) - (a.standing.oldestOpenDays ?? 0),
        ),
    [universe],
  );

  const narrowing = diagnosis !== null || reason !== null || query.trim() !== '' || listView.stages.length > 0;

  const groups = useMemo(
    () =>
      DIAGNOSIS_ORDER.filter((d) => d !== 'all_clear')
        .map((d) => ({ d, rows: filtered.filter((r) => stateOf(r) === d) }))
        .filter((g) => g.rows.length > 0),
    [filtered],
  );

  const isOpen = useCallback(
    (d: Diagnosis, index: number) => narrowing || (openGroups[d] ?? index < 2),
    [narrowing, openGroups],
  );
  const toggleGroup = useCallback((d: Diagnosis, index: number) => {
    setOpenGroups((prev) => {
      const next = { ...prev, [d]: !(prev[d] ?? index < 2) };
      try {
        window.localStorage.setItem(GROUPS_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Private browsing. The preference is cosmetic.
      }
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelected(new Set());
    setSelectMode(false);
  }, []);
  const selectGroup = useCallback((rows: Row[]) => {
    setSelectMode(true);
    setSelected((prev) => {
      const next = new Set(prev);
      const all = rows.every((r) => next.has(r.student.id));
      for (const r of rows) {
        if (all) next.delete(r.student.id);
        else next.add(r.student.id);
      }
      return next;
    });
  }, []);
  const sendBulk = useCallback(async () => {
    const ids = [...selected].slice(0, MAX_BULK_NUDGE);
    const journeyIds = universe
      .filter((s) => ids.includes(s.student.id) && s.journey_id)
      .map((s) => s.journey_id as string);
    setSending(true);
    try {
      await onNudgeMany(ids, journeyIds);
      clearSelection();
    } finally {
      setSending(false);
    }
  }, [selected, universe, onNudgeMany, clearSelection]);

  const openRow = openId ? data.students.find((s) => s.student.id === openId) ?? null : null;

  const renderRow = (row: Row) => (
    <StudentRow
      key={row.student.id}
      row={row}
      onOpen={() => setOpenId(row.student.id)}
      selected={selectMode ? selected.has(row.student.id) : null}
      onSelect={(next) =>
        setSelected((prev) => {
          const s = new Set(prev);
          if (next) s.add(row.student.id);
          else s.delete(row.student.id);
          return s;
        })
      }
      nudgeable={DIAGNOSIS_META[stateOf(row)].nudge}
      busy={busy}
      onNudge={onNudge}
    />
  );

  const searchBar = (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1, mb: 1 }}>
      <TextField
        size="small"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search students"
        inputProps={{ 'aria-label': 'Search students', style: { fontSize: 16 } }}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon fontSize="small" sx={{ color: 'text.disabled' }} />
            </InputAdornment>
          ),
          endAdornment: query ? (
            <InputAdornment position="end">
              <IconButton size="small" aria-label="Clear the search" onClick={() => setQuery('')} sx={{ width: 40, height: 40 }}>
                <ClearIcon fontSize="small" />
              </IconButton>
            </InputAdornment>
          ) : null,
        }}
        sx={{
          flex: '1 1 180px',
          minWidth: 0,
          '& .MuiOutlinedInput-root': { borderRadius: 2.5, bgcolor: 'background.paper', minHeight: 48 },
        }}
      />
      {!allClear && (
        <StageFilter
          value={listView.stages}
          counts={listView.stageCounts}
          onToggle={listView.toggleStage}
          onClear={listView.clearStages}
          disabled={!listView.stageReady}
        />
      )}
    </Box>
  );

  // ── All clear: the wall ───────────────────────────────────────────────────
  if (allClear) {
    return (
      <>
        {searchBar}
        <AllClearWall
          students={filtered}
          onNote={onNote}
          onMarkCelebrated={onMarkCelebrated}
          celebrationsUnavailable={data.celebrationsUnavailable}
          busy={celebrating}
        />
      </>
    );
  }

  if (universe.length === 0) {
    return (
      <Alert severity="success" sx={{ borderRadius: 2 }}>
        Nobody is behind. Every student has cleared the classes they missed.
      </Alert>
    );
  }

  const reasonChips: Array<{ key: ReasonFilterKey; label: string }> = [
    ...RSVP_REASONS.map((r) => ({ key: r.code as ReasonFilterKey, label: r.shortLabel })),
    { key: 'none', label: 'No reason' },
  ];

  return (
    <>
      {searchBar}

      {/* Why they missed class, as a filter. Combines with the card above. */}
      <Box
        role="group"
        aria-label="Filter by the reason they gave"
        sx={{
          display: 'flex',
          gap: 1,
          mb: 2,
          overflowX: 'auto',
          pb: 0.5,
          overscrollBehaviorX: 'contain',
          '&::-webkit-scrollbar': { display: 'none' },
          scrollbarWidth: 'none',
          '& .MuiChip-root': { height: 44, borderRadius: 22, px: 0.5, flexShrink: 0, fontWeight: 700 },
          [theme.breakpoints.down('sm')]: {
            mx: -2,
            px: 2,
            maskImage: 'linear-gradient(to right, #000 calc(100% - 32px), transparent)',
            WebkitMaskImage: 'linear-gradient(to right, #000 calc(100% - 32px), transparent)',
          },
        }}
      >
        <Chip
          label="Any reason"
          onClick={() => onReason(null)}
          color={reason === null ? 'primary' : 'default'}
          variant={reason === null ? 'filled' : 'outlined'}
        />
        {reasonChips
          .filter((c) => (reasonCounts[c.key] || 0) > 0 || reason === c.key)
          .map((c) => (
            <Chip
              key={c.key}
              label={`${c.label} ${reasonCounts[c.key] || 0}`}
              onClick={() => onReason(reason === c.key ? null : c.key)}
              color={reason === c.key ? (c.key === 'none' ? 'error' : 'primary') : 'default'}
              variant={reason === c.key ? 'filled' : 'outlined'}
              aria-pressed={reason === c.key}
            />
          ))}
      </Box>

      {!narrowing && <NeedsACall rows={needsACall} onSelect={selectGroup} />}

      {filtered.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 5 }}>
          <Typography sx={{ fontWeight: 700, mb: 0.5 }}>
            {query.trim() ? `No student matches "${query.trim()}"` : 'Nobody matches these filters'}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Try a different name, or clear the filters to see everyone still catching up.
          </Typography>
          <Button
            variant="outlined"
            onClick={() => {
              setQuery('');
              onDiagnosis(null);
              onReason(null);
              listView.clearStages();
            }}
            sx={{ textTransform: 'none', minHeight: 44 }}
          >
            Show everyone
          </Button>
        </Box>
      ) : (
        <Stack spacing={2.5}>
          {groups.map(({ d, rows }, index) => {
            const meta = DIAGNOSIS_META[d];
            const open = isOpen(d, index);
            const visible = showAll[d] ? rows : rows.slice(0, GROUP_PAGE);
            const allSelected = rows.every((r) => selected.has(r.student.id));
            const tint = toneColor(meta.tone);
            return (
              <Box key={d}>
                <Stack direction="row" alignItems="flex-start" sx={{ gap: 1, mb: open ? 1 : 0 }}>
                  <Box
                    component="button"
                    type="button"
                    aria-expanded={open}
                    onClick={() => toggleGroup(d, index)}
                    sx={{
                      flex: 1,
                      minWidth: 0,
                      minHeight: 48,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 0.75,
                      px: 0.5,
                      border: 'none',
                      bgcolor: 'transparent',
                      textAlign: 'left',
                      cursor: 'pointer',
                      borderRadius: 1,
                      color: 'inherit',
                      fontFamily: 'inherit',
                      '&:focus-visible': { outline: `2px solid ${theme.palette.primary.main}`, outlineOffset: 2 },
                    }}
                  >
                    <ExpandMoreIcon
                      sx={{
                        fontSize: 20,
                        color: tint,
                        transform: open ? 'none' : 'rotate(-90deg)',
                        transition: 'transform 200ms ease',
                        '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
                      }}
                    />
                    <Box sx={{ minWidth: 0 }}>
                      <Typography
                        component="h3"
                        sx={{ fontSize: '0.6875rem', fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: tint }}
                      >
                        {meta.label} · {rows.length}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                        {meta.hint}
                      </Typography>
                    </Box>
                  </Box>
                  {meta.nudge && rows.length > 1 && (
                    <Button
                      size="small"
                      onClick={() => selectGroup(rows)}
                      sx={{ textTransform: 'none', minHeight: 44, flexShrink: 0 }}
                    >
                      {allSelected ? 'Clear' : 'Select all'}
                    </Button>
                  )}
                </Stack>
                {open && (
                  <Stack spacing={1}>
                    {visible.map(renderRow)}
                    {rows.length > visible.length && (
                      <Button
                        onClick={() => setShowAll((prev) => ({ ...prev, [d]: true }))}
                        sx={{ textTransform: 'none', minHeight: 44, alignSelf: 'flex-start' }}
                      >
                        Show all {rows.length}
                      </Button>
                    )}
                  </Stack>
                )}
              </Box>
            );
          })}
        </Stack>
      )}

      {selectMode && selected.size > 0 && (
        <BulkNudgeBar count={selected.size} onClear={clearSelection} onConfirm={sendBulk} sending={sending} />
      )}

      {data.totals.hiddenDormant + listView.pausedHidden > 0 && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 3, textAlign: 'center' }}>
          {data.totals.hiddenDormant + listView.pausedHidden === 1
            ? '1 paused student is'
            : `${data.totals.hiddenDormant + listView.pausedHidden} paused students are`}{' '}
          not shown here and left out of the counts above. Manage them in Students.
        </Typography>
      )}

      <StudentSheet row={openRow} onClose={() => setOpenId(null)} busy={busy} onAct={onAct} onNudge={onNudge} />
    </>
  );
}
