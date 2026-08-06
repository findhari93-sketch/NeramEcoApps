'use client';

/**
 * Who to call today, at a size a real cohort actually reaches.
 *
 * This tab used to draw the same array three times: a red chase list, an
 * "everyone else" list, and then a "where each one is stuck" list that repeated
 * every student from both. Sections one and two were by construction the whole
 * cohort, so every person appeared exactly twice. At a hundred students that is
 * two hundred rows and roughly thirteen thousand pixels of scroll, with the
 * actions split across the two copies: Call and Nudge on the first, the gates
 * and Excuse on the second.
 *
 * Now there is one row per student, in a group named for what is actually wrong,
 * and the big groups start collapsed. The sixty-eight who have not started
 * anything are one line until you ask for them.
 *
 * Nothing here fetches. The payload is already in memory, so the search and the
 * filter pills cost no requests and no function invocations.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  alpha,
  useMediaQuery,
  useTheme,
} from '@neram/ui';
import StudentAvatar from '@/components/students/StudentAvatar';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ViewAgendaOutlinedIcon from '@mui/icons-material/ViewAgendaOutlined';
import GridOnOutlinedIcon from '@mui/icons-material/GridOnOutlined';
import { reasonShortLabel } from '@/lib/rsvp-reasons';
import { BUCKET_META, BUCKET_ORDER, type CatchupBucket } from '@/lib/catchup-buckets';
import { Gates, shortDate } from './shared';
import StudentRow, { itemLine } from './StudentRow';
import CatchupFilterBar from './CatchupFilterBar';
import BulkNudgeBar, { MAX_BULK_NUDGE } from './BulkNudgeBar';
import type { Row, TabProps } from './types';

const VIEW_STORAGE_KEY = 'nexus:catchup:view';
const GROUPS_STORAGE_KEY = 'nexus:catchup:groups';

/**
 * How many rows an open group renders before it offers to show the rest.
 *
 * The cap, not virtualization: there is no virtual-list library anywhere in this
 * monorepo, and pulling one in to solve a list that is already grouped, filtered
 * and searchable would cost every page in the app some bundle for one screen's
 * worst case.
 */
const GROUP_PAGE = 15;

/** Above this the grid stops being readable and starts being a rendering cost. */
const MATRIX_LIMIT = 30;

function matches(row: Row, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    (row.student.name || '').toLowerCase().includes(q) ||
    (row.student.email || '').toLowerCase().includes(q)
  );
}

export default function NeedsActionTab({ data, busy, onAct, onNudge, onNudgeMany }: TabProps) {
  const theme = useTheme();
  const canShowMatrix = useMediaQuery(theme.breakpoints.up('md'));

  const [query, setQuery] = useState('');
  const [bucketFilter, setBucketFilter] = useState<CatchupBucket | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [view, setView] = useState<'cards' | 'matrix'>('cards');
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [showAll, setShowAll] = useState<Record<string, boolean>>({});
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const savedView = window.localStorage.getItem(VIEW_STORAGE_KEY);
    if (savedView === 'matrix' || savedView === 'cards') setView(savedView);
    try {
      const savedGroups = window.localStorage.getItem(GROUPS_STORAGE_KEY);
      if (savedGroups) setOpenGroups(JSON.parse(savedGroups));
    } catch {
      // A corrupt preference is not worth failing a page over.
    }
  }, []);

  const filtered = useMemo(
    () =>
      data.students.filter(
        (s) => (bucketFilter === null || s.bucket === bucketFilter) && matches(s, query),
      ),
    [data.students, bucketFilter, query],
  );

  const groups = useMemo(
    () =>
      BUCKET_ORDER.map((bucket) => ({
        bucket,
        rows: filtered.filter((r) => r.bucket === bucket),
      })).filter((g) => g.rows.length > 0),
    [filtered],
  );

  // Once you have narrowed the list yourself, being made to open a group as well
  // is one interaction too many: you already said what you wanted to see.
  const narrowing = bucketFilter !== null || query.trim() !== '';

  const isOpen = useCallback(
    (bucket: CatchupBucket, index: number) =>
      narrowing || (openGroups[bucket] ?? index === 0),
    [narrowing, openGroups],
  );

  const toggleGroup = useCallback(
    (bucket: CatchupBucket, index: number) => {
      setOpenGroups((prev) => {
        const next = { ...prev, [bucket]: !(prev[bucket] ?? index === 0) };
        try {
          window.localStorage.setItem(GROUPS_STORAGE_KEY, JSON.stringify(next));
        } catch {
          // Private browsing. The preference is cosmetic.
        }
        return next;
      });
    },
    [],
  );

  const clearSelection = useCallback(() => {
    setSelected(new Set());
    setSelectMode(false);
  }, []);

  const selectGroup = useCallback((rows: Row[]) => {
    setSelectMode(true);
    setSelected((prev) => {
      const next = new Set(prev);
      const everyOneAlready = rows.every((r) => next.has(r.student.id));
      for (const r of rows) {
        if (everyOneAlready) next.delete(r.student.id);
        else next.add(r.student.id);
      }
      return next;
    });
  }, []);

  const sendBulk = useCallback(async () => {
    // Capped here as well as described in the dialog, so the limit holds even if
    // the confirmation is ever bypassed.
    const ids = [...selected].slice(0, MAX_BULK_NUDGE);
    const journeyIds = data.students
      .filter((s) => ids.includes(s.student.id) && s.journey_id)
      .map((s) => s.journey_id as string);
    setSending(true);
    try {
      await onNudgeMany(ids, journeyIds);
      clearSelection();
    } finally {
      setSending(false);
    }
  }, [selected, data.students, onNudgeMany, clearSelection]);

  const showMatrix = canShowMatrix && view === 'matrix';
  const matrixTooBig = showMatrix && filtered.length > MATRIX_LIMIT;

  if (data.students.length === 0) {
    return (
      <>
        <Alert severity="success" sx={{ borderRadius: 2 }}>
          Nobody is behind. Every student has cleared the classes they missed.
        </Alert>
        <HiddenDormantNote count={data.totals.hiddenDormant} />
      </>
    );
  }

  return (
    <>
      <CatchupFilterBar
        query={query}
        onQuery={setQuery}
        bucket={bucketFilter}
        onBucket={setBucketFilter}
        tally={data.totals.byBucket}
        total={data.students.length}
      />

      {data.students.length > 0 && canShowMatrix && (
        <Stack direction="row" alignItems="center" justifyContent="flex-end" sx={{ mb: 1 }}>
          <ToggleButtonGroup
            size="small"
            exclusive
            value={view}
            onChange={(_e, v) => {
              if (!v) return;
              setView(v);
              window.localStorage.setItem(VIEW_STORAGE_KEY, v);
            }}
            aria-label="How to show the students"
          >
            <ToggleButton value="cards" aria-label="One row per student" sx={{ px: 1.25 }}>
              <ViewAgendaOutlinedIcon sx={{ fontSize: 18 }} />
            </ToggleButton>
            <ToggleButton value="matrix" aria-label="Grid of every class" sx={{ px: 1.25 }}>
              <GridOnOutlinedIcon sx={{ fontSize: 18 }} />
            </ToggleButton>
          </ToggleButtonGroup>
        </Stack>
      )}

      {filtered.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 5 }}>
          <Typography sx={{ fontWeight: 700, mb: 0.5 }}>
            {query.trim() ? `No student matches "${query.trim()}"` : 'Nobody is in that state'}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Try a different name, or clear the filter to see everyone still catching up.
          </Typography>
          <Button
            variant="outlined"
            onClick={() => {
              setQuery('');
              setBucketFilter(null);
            }}
            sx={{ textTransform: 'none', minHeight: 44 }}
          >
            Show everyone
          </Button>
        </Box>
      ) : showMatrix ? (
        <MatrixView data={data} rows={filtered} tooBig={matrixTooBig} />
      ) : (
        <Stack spacing={2.5}>
          {groups.map(({ bucket, rows }, index) => {
            const meta = BUCKET_META[bucket];
            const open = isOpen(bucket, index);
            const expandedAll = !!showAll[bucket];
            const visible = expandedAll ? rows : rows.slice(0, GROUP_PAGE);
            const allSelected = rows.every((r) => selected.has(r.student.id));
            const tint =
              meta.tone === 'bad'
                ? theme.palette.error.main
                : meta.tone === 'warn'
                  ? theme.palette.warning.dark
                  : theme.palette.text.secondary;

            return (
              <Box key={bucket}>
                <Stack direction="row" alignItems="flex-start" sx={{ gap: 1, mb: open ? 1 : 0 }}>
                  <Box
                    component="button"
                    type="button"
                    aria-expanded={open}
                    onClick={() => toggleGroup(bucket, index)}
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
                      font: 'inherit',
                      '&:focus-visible': {
                        outline: `2px solid ${theme.palette.primary.main}`,
                        outlineOffset: 2,
                      },
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
                        sx={{
                          fontSize: '0.6875rem',
                          fontWeight: 800,
                          letterSpacing: '.1em',
                          textTransform: 'uppercase',
                          color: tint,
                        }}
                      >
                        {meta.label} · {rows.length}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                        {meta.hint}
                      </Typography>
                    </Box>
                  </Box>

                  {meta.nudgeable && rows.length > 1 && (
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
                    {visible.map((row) => (
                      <StudentRow
                        key={row.student.id}
                        row={row}
                        expanded={expanded === row.student.id}
                        onToggle={() =>
                          setExpanded(expanded === row.student.id ? null : row.student.id)
                        }
                        selected={selectMode ? selected.has(row.student.id) : null}
                        onSelect={(next) =>
                          setSelected((prev) => {
                            const s = new Set(prev);
                            if (next) s.add(row.student.id);
                            else s.delete(row.student.id);
                            return s;
                          })
                        }
                        nudgeable={meta.nudgeable}
                        busy={busy}
                        onAct={onAct}
                        onNudge={onNudge}
                      />
                    ))}

                    {rows.length > visible.length && (
                      <Button
                        onClick={() => setShowAll((prev) => ({ ...prev, [bucket]: true }))}
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
        <BulkNudgeBar
          count={selected.size}
          onClear={clearSelection}
          onConfirm={sendBulk}
          sending={sending}
        />
      )}

      <HiddenDormantNote count={data.totals.hiddenDormant} />
    </>
  );
}

/**
 * A student who vanishes without explanation reads as a bug, so the count that
 * left the screen is stated rather than dropped in silence.
 */
function HiddenDormantNote({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <Typography
      variant="caption"
      color="text.disabled"
      sx={{ display: 'block', mt: 3, textAlign: 'center' }}
    >
      {count === 1 ? '1 dormant student is' : `${count} dormant students are`} hidden here and left
      out of the counts above. Dormant students keep their Nexus access; they are only excluded from
      chasing. Manage them in Students.
    </Typography>
  );
}

/**
 * The student-by-class grid, kept because it genuinely reads well for a small
 * group, but held to the filtered set and capped. A hundred students against
 * sixty classes is six thousand cells, which is not a view of anything.
 */
function MatrixView({
  data,
  rows,
  tooBig,
}: {
  data: TabProps['data'];
  rows: Row[];
  tooBig: boolean;
}) {
  const theme = useTheme();

  if (tooBig) {
    return (
      <Alert severity="info" sx={{ borderRadius: 2 }}>
        The grid reads well up to {MATRIX_LIMIT} students and there are {rows.length} here. Search a
        name or pick one of the filters above, and the grid will come back.
      </Alert>
    );
  }

  return (
    <>
      <Box sx={{ overflowX: 'auto', border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
        <Box component="table" sx={{ borderCollapse: 'collapse', minWidth: '100%' }}>
          <Box component="thead">
            <Box component="tr">
              <Box
                component="th"
                sx={{
                  position: 'sticky',
                  left: 0,
                  zIndex: 2,
                  bgcolor: 'background.paper',
                  textAlign: 'left',
                  p: 1.25,
                  minWidth: 190,
                  borderBottom: '1px solid',
                  borderColor: 'divider',
                  fontSize: '0.75rem',
                }}
              >
                Student
              </Box>
              {data.classes.map((c) => (
                <Box
                  key={c.id}
                  component="th"
                  title={c.title || ''}
                  sx={{
                    p: 1.25,
                    minWidth: 92,
                    borderBottom: '1px solid',
                    borderColor: 'divider',
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    color: 'text.secondary',
                    whiteSpace: 'nowrap',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {shortDate(c.scheduled_date)}
                </Box>
              ))}
            </Box>
          </Box>
          <Box component="tbody">
            {rows.map((s) => (
              <Box component="tr" key={s.student.id}>
                <Box
                  component="td"
                  sx={{
                    position: 'sticky',
                    left: 0,
                    zIndex: 1,
                    bgcolor: 'background.paper',
                    p: 1.25,
                    borderBottom: '1px solid',
                    borderColor: 'divider',
                  }}
                >
                  <Stack direction="row" spacing={1} alignItems="center">
                    <StudentAvatar
                      userId={s.student.id}
                      src={s.student.avatar_url}
                      name={s.student.name || ''}
                      size={28}
                    />
                    <Box sx={{ minWidth: 0 }}>
                      <Typography sx={{ fontWeight: 700, fontSize: '0.82rem' }} noWrap>
                        {s.student.name || s.student.email || 'Student'}
                      </Typography>
                      <Typography variant="caption" color="text.disabled">
                        {s.missedTotals.completed + s.totals.completed}/
                        {s.missedTotals.total + s.totals.total}
                      </Typography>
                    </Box>
                  </Stack>
                </Box>
                {data.classes.map((c) => {
                  const item = s.items.find((i) => i.scheduled_class_id === c.id);
                  return (
                    <Box
                      key={c.id}
                      component="td"
                      title={item ? itemLine(item) : ''}
                      sx={{
                        p: 1.25,
                        textAlign: 'center',
                        borderBottom: '1px solid',
                        borderColor: 'divider',
                        bgcolor: item?.overdue ? alpha(theme.palette.error.main, 0.06) : 'transparent',
                      }}
                    >
                      {item ? <Gates item={item} /> : null}
                    </Box>
                  );
                })}
              </Box>
            ))}
          </Box>
        </Box>
      </Box>
      <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 1 }}>
        The grid shows progress only. Switch back to rows to read what each student said, including
        anyone who chose {reasonShortLabel('other').toLowerCase()}.
      </Typography>
    </>
  );
}
