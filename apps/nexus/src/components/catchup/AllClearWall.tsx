'use client';

/**
 * Everyone who owes nothing.
 *
 * The one screen in Nexus that says something good about a student by name, and
 * the reason it did not exist before is structural rather than an oversight: the
 * overview route dropped anyone with no open work before the page saw them, so
 * the only group worth congratulating was the only group deleted from the
 * payload.
 *
 * Three rules hold this together, and all three are about not turning it into a
 * ranking by accident:
 *
 * It is ordered by who finished most recently, never by how fast or how much. A
 * list of people sorted by achievement has a bottom, and the student at the
 * bottom of a wall of winners learns something we did not mean to teach.
 *
 * Nothing here is numbered. No positions, no medals, no "top three".
 *
 * And there is no counterpart. Whoever is behind is on the Needs action tab,
 * which students never see, and no number from that tab is repeated here. This
 * list can be read out in class or posted to Teams exactly as it stands, which
 * is the test it has to pass.
 *
 * It is split in two by one question: has this student already been
 * congratulated? The share used to name everyone who was clear on every press,
 * and a teacher who had named two students twice had no way to name only the
 * one who was new. The ones not yet congratulated are ticked for the teacher;
 * the ones already named are shown with when, and are left unticked.
 */
import { useMemo, useState } from 'react';
import { Alert, Box, Button, Checkbox, Chip, Stack, Typography, alpha, useTheme } from '@neram/ui';
import EmojiEventsOutlinedIcon from '@mui/icons-material/EmojiEventsOutlined';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CampaignOutlinedIcon from '@mui/icons-material/CampaignOutlined';
import AutorenewIcon from '@mui/icons-material/Autorenew';
import DoneAllIcon from '@mui/icons-material/DoneAll';
import { RADIUS } from '@/components/timetable/timetable-theme';
import StudentAvatar from '@/components/students/StudentAvatar';
import { isDueCelebration } from '@/lib/catchup-celebration';
import { SECTION_HEADING_SX, timeAgo } from './shared';
import type { Row } from './types';

/** Shown before "show everyone", so a big cohort does not bury the feed below. */
const FIRST_PAGE = 12;

export interface AllClearWallProps {
  students: Row[];
  /** Opens the Teams preview for the selected students. Absent when this classroom has nowhere to post. */
  onShare?: (students: Row[]) => void;
  /** Records the selected students as congratulated without posting. */
  onMarkCelebrated?: (students: Row[]) => void;
  /**
   * The congratulation records could not be read, so nobody is ticked: "never
   * congratulated" and "could not tell" are the same on a row.
   */
  celebrationsUnavailable?: boolean;
  busy?: boolean;
}

export default function AllClearWall({
  students,
  onShare,
  onMarkCelebrated,
  celebrationsUnavailable = false,
  busy,
}: AllClearWallProps) {
  const selectable = !!(onShare || onMarkCelebrated);

  // Most recently finished first. `lastClearedAt` is null for a student who has
  // never missed a class at all, and they sort last rather than first: they
  // belong here (they owe nothing) but they did not just do anything, so leading
  // the list with them would bury the person who cleared their backlog today.
  const ordered = useMemo(
    () =>
      [...students].sort((a, b) => {
        const av = a.standing.lastClearedAt;
        const bv = b.standing.lastClearedAt;
        if (av && bv) return bv.localeCompare(av);
        if (av) return -1;
        if (bv) return 1;
        return (a.student.name || '').localeCompare(b.student.name || '');
      }),
    [students],
  );

  const due = useMemo(() => ordered.filter((r) => isDueCelebration(r.celebration)), [ordered]);
  const done = useMemo(() => ordered.filter((r) => !isDueCelebration(r.celebration)), [ordered]);

  // The ticks start on whoever is due, and start again whenever that set
  // changes (a post or a mark moves people across). Reset during render rather
  // than in an effect, so the first frame after a refetch is already right
  // instead of flashing the old selection.
  const dueKey = `${celebrationsUnavailable ? 'x' : ''}${due.map((r) => r.student.id).join(',')}`;
  const initial = () =>
    new Set<string>(celebrationsUnavailable ? [] : due.map((r) => r.student.id));
  const [selected, setSelected] = useState<Set<string>>(initial);
  const [selectionKey, setSelectionKey] = useState(dueKey);
  if (selectionKey !== dueKey) {
    setSelectionKey(dueKey);
    setSelected(initial());
  }

  // Walked from `ordered`, so the preview names people in the order the screen
  // shows them, and anyone who stopped being clear since the tick drops out.
  const selectedRows = ordered.filter((r) => selected.has(r.student.id));

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const allDueSelected = due.length > 0 && due.every((r) => selected.has(r.student.id));
  const toggleAllDue = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const r of due) {
        if (allDueSelected) next.delete(r.student.id);
        else next.add(r.student.id);
      }
      return next;
    });

  if (ordered.length === 0) {
    return (
      <Box
        sx={{
          p: 2.5,
          mb: 3,
          borderRadius: RADIUS.card,
          border: '1px dashed',
          borderColor: 'divider',
          textAlign: 'center',
        }}
      >
        <EmojiEventsOutlinedIcon sx={{ color: 'text.disabled', fontSize: 28, mb: 0.5 }} />
        <Typography sx={{ fontWeight: 700, fontSize: '0.95rem' }}>
          Nobody is completely clear yet
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          A student lands here the moment they have nothing left to catch up on. Clearing the
          recaps they are waiting on is usually the quickest way to fill this.
        </Typography>
      </Box>
    );
  }

  const n = selectedRows.length;

  return (
    <Box sx={{ mb: 3 }}>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        alignItems={{ xs: 'stretch', sm: 'center' }}
        justifyContent="space-between"
        sx={{ mb: 1, gap: 1 }}
      >
        <Typography sx={{ ...SECTION_HEADING_SX, mb: 0 }}>All clear ({ordered.length})</Typography>
        {selectable && (
          // Stacked full width on a phone: side by side, both labels wrapped to
          // two lines and neither read as a button.
          <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ gap: 1 }}>
            {onMarkCelebrated && (
              <Button
                size="small"
                variant="text"
                disabled={busy || n === 0}
                startIcon={<DoneAllIcon />}
                onClick={() => onMarkCelebrated(selectedRows)}
                sx={{ textTransform: 'none', fontWeight: 700, minHeight: 44, borderRadius: 2 }}
              >
                Mark as congratulated
              </Button>
            )}
            {onShare && (
              <Button
                size="small"
                variant="outlined"
                color="success"
                disabled={busy || n === 0}
                startIcon={<CampaignOutlinedIcon />}
                onClick={() => onShare(selectedRows)}
                // 44px is the minimum comfortable tap target, and a teacher presses
                // this on a phone between classes.
                sx={{ textTransform: 'none', fontWeight: 700, minHeight: 44, borderRadius: 2 }}
              >
                {n > 0 ? `Congratulate (${n}) in Teams` : 'Congratulate in Teams'}
              </Button>
            )}
          </Stack>
        )}
      </Stack>

      {celebrationsUnavailable && selectable && (
        <Alert severity="warning" sx={{ mb: 1.5, borderRadius: 2 }}>
          Could not check who has already been congratulated, so nobody is ticked. Tick the students
          you mean to name.
        </Alert>
      )}

      <WallSection
        tone="due"
        heading={selectable ? `Not congratulated yet (${due.length})` : null}
        intro="These students have nothing left to catch up on. Worth saying so out loud."
        rows={due}
        selectable={selectable}
        selected={selected}
        onToggle={toggle}
        headerAction={
          selectable && due.length > 1 ? (
            <Button
              size="small"
              onClick={toggleAllDue}
              sx={{ textTransform: 'none', fontWeight: 700, minHeight: 44 }}
            >
              {allDueSelected ? 'Clear' : 'Select all'}
            </Button>
          ) : null
        }
        empty="Everyone here has been congratulated. A student shows up here again when they clear a new class."
      />

      {done.length > 0 && (
        <WallSection
          tone="done"
          heading={`Already congratulated (${done.length})`}
          intro={null}
          rows={done}
          selectable={selectable}
          selected={selected}
          onToggle={toggle}
          headerAction={null}
          empty={null}
        />
      )}
    </Box>
  );
}

function WallSection({
  tone,
  heading,
  intro,
  rows,
  selectable,
  selected,
  onToggle,
  headerAction,
  empty,
}: {
  tone: 'due' | 'done';
  heading: string | null;
  intro: string | null;
  rows: Row[];
  selectable: boolean;
  selected: Set<string>;
  onToggle: (id: string) => void;
  headerAction: React.ReactNode;
  empty: string | null;
}) {
  const theme = useTheme();
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? rows : rows.slice(0, FIRST_PAGE);
  const good = tone === 'due';

  return (
    <Box
      sx={{
        p: { xs: 1.5, sm: 2 },
        mb: 1.5,
        borderRadius: RADIUS.card,
        border: '1px solid',
        borderColor: good ? alpha(theme.palette.success.main, 0.35) : 'divider',
        bgcolor: good ? alpha(theme.palette.success.main, 0.05) : 'background.default',
      }}
    >
      {(heading || headerAction) && (
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ gap: 1, mb: 0.5 }}>
          {heading && (
            <Typography component="h3" sx={{ fontWeight: 800, fontSize: '0.9rem' }}>
              {heading}
            </Typography>
          )}
          {headerAction}
        </Stack>
      )}

      {intro && rows.length > 0 && (
        <Typography variant="body2" sx={{ mb: 1.5, fontWeight: 600 }}>
          {intro}
        </Typography>
      )}

      {rows.length === 0 && empty ? (
        <Typography variant="body2" color="text.secondary" sx={{ py: 0.5 }}>
          {empty}
        </Typography>
      ) : (
        <Box
          sx={{
            display: 'grid',
            gap: 1,
            mt: heading && !intro ? 1 : 0,
            // minmax(0, ...) at every width. A bare `1fr` floors at the
            // min-content of a no-wrap name and pushed cards past a phone's
            // edge, clipped so no overflow check could see it.
            gridTemplateColumns: {
              xs: 'minmax(0, 1fr)',
              sm: 'repeat(2, minmax(0, 1fr))',
              md: 'repeat(3, minmax(0, 1fr))',
            },
          }}
        >
          {shown.map((row) => (
            <WallCard
              key={row.student.id}
              row={row}
              good={good}
              selectable={selectable}
              checked={selected.has(row.student.id)}
              onToggle={() => onToggle(row.student.id)}
            />
          ))}
        </Box>
      )}

      {rows.length > FIRST_PAGE && (
        <Button
          size="small"
          onClick={() => setExpanded((v) => !v)}
          sx={{ mt: 1, textTransform: 'none', fontWeight: 700, minHeight: 44 }}
        >
          {expanded ? 'Show fewer' : `Show all ${rows.length}`}
        </Button>
      )}
    </Box>
  );
}

function WallCard({
  row,
  good,
  selectable,
  checked,
  onToggle,
}: {
  row: Row;
  good: boolean;
  selectable: boolean;
  checked: boolean;
  onToggle: () => void;
}) {
  const theme = useTheme();
  const name = row.student.name || row.student.email || 'Student';
  const status = describeCelebration(row);

  return (
    <Stack
      // A label, so a tap anywhere on the card ticks it. On a phone the
      // checkbox alone is a small target inside a big card.
      component={selectable ? 'label' : 'div'}
      direction="row"
      alignItems="center"
      spacing={1.25}
      sx={{
        p: 1,
        minHeight: 56,
        borderRadius: RADIUS.control,
        bgcolor: 'background.paper',
        border: '1px solid',
        borderColor: good ? alpha(theme.palette.success.main, 0.25) : 'divider',
        ...(selectable && {
          cursor: 'pointer',
          transition: 'border-color .15s, box-shadow .15s',
          '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
          '&:hover': { borderColor: alpha(theme.palette.success.main, 0.6) },
          '&:has(input:focus-visible)': {
            outline: `2px solid ${theme.palette.primary.main}`,
            outlineOffset: 2,
          },
        }),
        // Inset shadow rather than a thicker border, so ticking a card does not
        // shift the text inside it.
        ...(checked && {
          borderColor: 'success.main',
          boxShadow: `inset 0 0 0 1px ${theme.palette.success.main}`,
        }),
      }}
    >
      <StudentAvatar
        userId={row.student.id}
        src={row.student.avatar_url}
        name={row.student.name || ''}
        size={36}
      />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontWeight: 700, fontSize: '0.9rem' }} noWrap>
          {name}
        </Typography>
        <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
          {describeClear(row)}
        </Typography>
        {status && (
          // Top-aligned, so on a line that wraps the icon sits beside the first
          // line rather than floating between the two.
          <Stack direction="row" alignItems="flex-start" spacing={0.5} sx={{ mt: 0.25 }}>
            {status.again ? (
              <AutorenewIcon aria-hidden sx={{ fontSize: 14, mt: '2px', color: 'success.dark', flexShrink: 0 }} />
            ) : (
              <CampaignOutlinedIcon aria-hidden sx={{ fontSize: 14, mt: '2px', color: 'text.secondary', flexShrink: 0 }} />
            )}
            <Typography
              variant="caption"
              sx={{ fontWeight: status.again ? 700 : 600, color: status.again ? 'text.primary' : 'text.secondary' }}
            >
              {status.text}
            </Typography>
          </Stack>
        )}
      </Box>
      {selectable ? (
        <Checkbox
          checked={checked}
          onChange={onToggle}
          color="success"
          inputProps={{ 'aria-label': `Select ${name}` }}
          // 44px hit area, the minimum for a thumb.
          sx={{ width: 44, height: 44, flexShrink: 0 }}
        />
      ) : (
        // A tick as well as the green, because colour on its own is not a label
        // to anyone who cannot separate these two greens.
        <CheckCircleIcon aria-hidden sx={{ color: 'success.main', fontSize: 20, flexShrink: 0 }} />
      )}
    </Stack>
  );
}

/**
 * The one line under a name.
 *
 * Says what they did and when, and nothing comparative. A student who never
 * missed a class has no catch-up history to report, so they get their own
 * sentence rather than a hollow "cleared 0 classes".
 */
function describeClear(row: Row): string {
  const { clearedTotal, lastClearedAt } = row.standing;
  if (clearedTotal === 0) return 'Has not missed a class';
  const what = clearedTotal === 1 ? 'Cleared 1 class' : `Cleared ${clearedTotal} classes`;
  const when = lastClearedAt ? timeAgo(lastClearedAt) : '';
  return when ? `${what} · last one ${when}` : what;
}

/** The line that says whether, and when, they were congratulated. Null when never. */
export function describeCelebration(row: Row): { text: string; again: boolean } | null {
  const c = row.celebration;
  if (!c) return null;
  if (c.state === 'cleared_again') {
    return { text: 'Cleared again since last congratulated', again: true };
  }
  const when = timeAgo(c.lastAt);
  const verb = c.source === 'marked' ? 'Marked as congratulated' : 'Congratulated in Teams';
  const times = c.count > 1 ? ` (${c.count} times)` : '';
  return { text: when ? `${verb} ${when}${times}` : `${verb}${times}`, again: false };
}

/** Exported for the Teams preview, which names the same people in the same order. */
export function allClearNames(students: Row[]): string[] {
  return students.map((s) => s.student.name || s.student.email || 'Student');
}

/** The chip the tab header uses, kept here so the wording lives with the wall. */
export function AllClearCountChip({ n }: { n: number }) {
  return (
    <Chip
      size="small"
      color="success"
      label={`${n} all clear`}
      sx={{ height: 22, fontWeight: 700, fontSize: '0.7rem' }}
    />
  );
}
