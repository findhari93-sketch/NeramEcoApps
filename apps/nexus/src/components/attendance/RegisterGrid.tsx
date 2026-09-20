'use client';

/**
 * The paper register: students down the side, class dates across.
 *
 * Newest class on the left, against the convention of a paper book, because a
 * phone shows the leftmost columns first and the class a teacher asks about is
 * almost always the most recent one. The grid is the one place in this app
 * allowed to scroll sideways, and it does so inside its own container with the
 * name column pinned, so the page itself never does.
 */
import Link from 'next/link';
import { Box, Typography, alpha, useTheme, type Theme } from '@neram/ui';
import StudentStageAvatar from '@/components/students/StudentStageAvatar';
import StudentListToolbar, { PausedFootnote } from '@/components/students/list/StudentListToolbar';
import { useStudentListView } from '@/components/students/list/useStudentListView';
import { knownStageKey } from '@/lib/student-stage';
import type { ListAccessors } from '@/lib/student-list-view';
import { RADIUS } from '@/components/timetable/timetable-theme';
import { GROUP_LABEL, GROUP_LETTER, GROUP_ORDER, type RegisterGroup } from '@/lib/attendance-register';
import type { RegisterCell, RegisterResponse, RegisterStudent } from '@/app/api/attendance/register/route';
import { formatClassDate } from './attendance-format';

const ACCESSORS: ListAccessors<RegisterStudent> = {
  id: (s) => s.id,
  name: (s) => s.name,
  joinedAt: (s) => s.enrolled_at,
};

/**
 * The two pinned columns, and the class cells that scroll between them.
 *
 * `NAME_COL` varies at `xs` alone, and that distinction is the whole reason it
 * used to be a plain px: from `md` up this app reserves a 248px sidebar, so the
 * window's own breakpoints measure more room than the content actually has, and
 * a width keyed off them would shrink the column on a screen with room to
 * spare. At `xs` there is no sidebar, so the breakpoint is honest, and `xs` is
 * also the only place the room is genuinely scarce: both edges of this grid are
 * pinned now, so 132 + 56 still leaves about 187px in the middle for roughly
 * four class columns at 375px. 132 fits the 38px avatar (30, plus the 8px its
 * ring is drawn in), the 8px gap, and about eleven characters of name.
 */
const NAME_COL = { xs: 132, sm: 168 };
const CELL_W = 48;
/** Fixed, so the pinned right edge lands in the same place on every row. */
const RATE_COL = 56;

/**
 * Seams for the pinned columns and the pinned header, as inset shadows.
 *
 * Under `borderCollapse: collapse` a collapsed border is painted by the TABLE
 * rather than by the cell, so a border on a cell that is being held in place is
 * left behind the moment the table scrolls under it: the header's rule slides
 * away as you scroll down, and the pinned columns read as floating with no edge
 * at all. An inset shadow is painted by the cell, so it travels with it.
 */
const SEAM = {
  right: 'inset -1px 0 0 0 ',
  left: 'inset 1px 0 0 0 ',
  bottom: 'inset 0 -1px 0 0 ',
} as const;

function seam(theme: Theme, ...sides: (keyof typeof SEAM)[]): string {
  return sides.map((side) => `${SEAM[side]}${theme.palette.divider}`).join(', ');
}

/**
 * Round 1 tried making the letter itself carry the group, in colour:
 * `warning.main` measured about 3.1:1 on white, so it moved to `warning.dark`,
 * which still only reaches about 3.79:1 with this app's actual warning tokens,
 * short of the 4.5:1 body text needs. No tone in this palette is guaranteed to
 * clear that bar as literal text, so the letter stops carrying colour at all.
 *
 * The letter (F, P, A, R, X) is already the real signal, colour was always
 * reinforcement, so ink is now one fixed, high-contrast `text.primary` for
 * every real group, and the group lives in the cell's background instead: a
 * light tint of its tone, via `alpha()`. `joined_later` keeps the existing
 * `text.disabled` treatment and no tint, unchanged, same as the "no data" `?`
 * cell: that pairing is a separate, already-flagged theme-wide gap, not
 * something this pass is re-opening.
 *
 * `away` takes full-contrast ink with NO tint, which makes it the only
 * combination of the two and so distinct from all five other cells. That is
 * deliberate on both halves. No tint, because a planned absence is settled and
 * a fifth tone would mean redoing the contrast exercise below. Full ink,
 * because the other two untinted cells (`joined_later` and "no data") are
 * absences of information, while a declared window is a recorded fact, and a
 * run of A's has to read as a block of leave at a glance.
 */
const LETTER_COLOR: Record<RegisterGroup, string> = {
  whole: 'text.primary',
  partly: 'text.primary',
  away: 'text.primary',
  reason: 'text.primary',
  no_reason: 'text.primary',
  joined_later: 'text.disabled',
};

/** Which theme tone tints a group's cell background. `null` paints no tint. */
const TONE_KEY: Record<RegisterGroup, 'success' | 'warning' | 'info' | 'error' | null> = {
  whole: 'success',
  partly: 'warning',
  away: null,
  reason: 'info',
  no_reason: 'error',
  joined_later: null,
};

/**
 * A light background tint for a group's cell, or `undefined` for `joined_later`
 * (and for "no data", which never calls this at all). 0.16 alpha was checked
 * against every one of the four tones over this theme's `background.paper`:
 * with `text.primary` ink on top, the tightest of the four (info) still comes
 * in around 12.6:1, comfortably clear of the 4.5:1 floor with room to spare
 * even if the underlying tone or surface colour drifts a little.
 */
function toneBg(theme: Theme, group: RegisterGroup): string | undefined {
  const key = TONE_KEY[group];
  return key ? alpha(theme.palette[key].main, 0.16) : undefined;
}

/**
 * "Tue" and "15 Sep" from formatClassDate's unsplit "Tue 15 Sep": split once
 * on the first space rather than pick a fixed array index, so the month token
 * can never again vanish by landing at the wrong index if the format changes.
 */
function splitClassDate(ymd: string): { weekday: string; dayMonth: string } {
  const full = formatClassDate(ymd);
  const spaceAt = full.indexOf(' ');
  return spaceAt === -1
    ? { weekday: full, dayMonth: '' }
    : { weekday: full.slice(0, spaceAt), dayMonth: full.slice(spaceAt + 1) };
}

/**
 * "partly there, 45 min, left 25 min early"
 *
 * A cell can be missing for two different reasons, and they must not read the
 * same: an unmeasured class has nothing recorded for anybody (the whole
 * column is a "?"), while a measured class can still have no cell for one
 * student because a batch-scoped class simply is not about them. "Nothing
 * recorded" used to cover both, which told a batch-excluded student's teacher
 * that a reading had been attempted and come back empty, rather than that the
 * student was never in scope for this class at all.
 */
function describeCell(cell: RegisterCell | undefined, measured: boolean): string {
  if (!cell) return measured ? 'not part of this class' : 'attendance not read from Teams yet';
  const bits = [GROUP_LABEL[cell.g].toLowerCase()];
  if (cell.min != null) bits.push(`${cell.min} min`);
  if (cell.late) bits.push(`joined ${cell.late} min late`);
  if (cell.early) bits.push(`left ${cell.early} min early`);
  if (cell.out) bits.push(`stepped out ${cell.out} min`);
  return bits.join(', ');
}

export default function RegisterGrid({
  data,
  classHref,
}: {
  data: RegisterResponse;
  classHref: (classId: string) => string;
}) {
  const theme = useTheme();

  const view = useStudentListView<RegisterStudent, 'suggested'>({
    rows: data.students,
    accessors: ACCESSORS,
    extraSorts: [
      {
        key: 'suggested',
        label: 'Lowest attendance first',
        compare: (a: RegisterStudent, b: RegisterStudent) => (a.rate ?? 101) - (b.rate ?? 101),
      },
    ],
    defaultSort: 'suggested',
    urlKeys: false,
    storageKey: 'nexus:attendance-register:sort',
  });

  return (
    <Box>
      <StudentListToolbar view={view} searchLabel="Find a student" />

      {view.shown.length === 0 ? (
        <Box
          sx={{
            border: `1px solid ${theme.palette.divider}`,
            borderRadius: RADIUS.card,
            bgcolor: 'background.paper',
            py: 4,
          }}
        >
          <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center' }}>
            {view.total === 0 ? 'No students in this classroom yet.' : 'Nobody matches this filter.'}
          </Typography>
        </Box>
      ) : (
        <Box
          sx={{
            /**
             * Bounded on purpose. Left free to grow, this container puts its one
             * horizontal scrollbar below every student row, so looking sideways
             * at the student at the TOP of the list meant scrolling to the
             * bottom of the page, dragging, and scrolling back up. Capping the
             * height keeps that scrollbar on screen, and it is also what lets
             * the date headers stay put: sticky needs a scrollport to stick to,
             * and without one a header pinned at `top: 0` pins to a box that
             * never scrolls.
             *
             * A share of the viewport rather than `calc(100dvh - chrome)`: the
             * chrome above this grid differs by breakpoint, and again while the
             * impersonation banner is showing, so any subtracted constant is
             * wrong somewhere. No minHeight, so a classroom of four students
             * still gets a short box that never scrolls at all.
             */
            maxHeight: { xs: '62vh', md: '70vh' },
            '@supports (height: 1dvh)': {
              maxHeight: '62dvh',
              [theme.breakpoints.up('md')]: { maxHeight: '70dvh' },
            },
            overflow: 'auto',
            // Without this, a sideways swipe that runs out of grid carries on
            // into the browser's back gesture.
            overscrollBehavior: 'contain',
            WebkitOverflowScrolling: 'touch',
            border: `1px solid ${theme.palette.divider}`,
            borderRadius: RADIUS.card,
            bgcolor: 'background.paper',
          }}
        >
          <Box sx={{ display: 'table', borderCollapse: 'collapse', minWidth: '100%' }} role="table">
            <Box sx={{ display: 'table-row' }} role="row">
              {/*
                Pinned on both axes, so it outranks the columns that are pinned
                on one. The ladder is corners 4, header row 3, pinned columns 2,
                class cells unset.
              */}
              <Box
                role="columnheader"
                sx={{
                  display: 'table-cell',
                  position: 'sticky',
                  top: 0,
                  left: 0,
                  zIndex: 4,
                  bgcolor: 'background.paper',
                  boxShadow: seam(theme, 'right', 'bottom'),
                  p: 1,
                  width: NAME_COL,
                  minWidth: NAME_COL,
                }}
              >
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>
                  Student
                </Typography>
              </Box>
              {data.classes.map((cls) => {
                const full = formatClassDate(cls.scheduled_date);
                const { weekday, dayMonth } = splitClassDate(cls.scheduled_date);
                return (
                  <Box
                    key={cls.id}
                    role="columnheader"
                    sx={{
                      display: 'table-cell',
                      position: 'sticky',
                      top: 0,
                      zIndex: 3,
                      // Opaque, or the rows scroll visibly through the dates.
                      bgcolor: 'background.paper',
                      boxShadow: seam(theme, 'bottom'),
                      p: 0.5,
                      width: CELL_W,
                      minWidth: CELL_W,
                      textAlign: 'center',
                    }}
                  >
                    <Box
                      component={Link}
                      href={classHref(cls.id)}
                      aria-label={full}
                      sx={{
                        display: 'block',
                        mx: '2px',
                        py: 0.75,
                        color: 'text.secondary',
                        textDecoration: 'none',
                        borderRadius: 1,
                        minHeight: 44,
                        '&:hover': { color: 'text.primary' },
                        '&:active': { bgcolor: 'action.selected' },
                        '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main' },
                      }}
                    >
                      <Typography
                        variant="caption"
                        noWrap
                        sx={{ display: 'block', fontWeight: 700, lineHeight: 1.2 }}
                      >
                        {dayMonth}
                      </Typography>
                      <Typography variant="caption" noWrap sx={{ display: 'block', lineHeight: 1.2 }}>
                        {weekday}
                      </Typography>
                    </Box>
                  </Box>
                );
              })}
              {/*
                The rate is pinned to the right edge rather than left to sit at
                the end of the row. At a 90 day range this table runs to about
                2000px, so the one number the default sort ORDERS BY was the one
                number a teacher could not see without dragging the whole grid
                sideways.
              */}
              <Box
                role="columnheader"
                sx={{
                  display: 'table-cell',
                  position: 'sticky',
                  top: 0,
                  right: 0,
                  zIndex: 4,
                  bgcolor: 'background.paper',
                  boxShadow: seam(theme, 'left', 'bottom'),
                  p: 1,
                  textAlign: 'right',
                  width: RATE_COL,
                  minWidth: RATE_COL,
                }}
              >
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>
                  %
                </Typography>
              </Box>
            </Box>

            {view.shown.map((student) => (
              <Box key={student.id} sx={{ display: 'table-row' }} role="row">
                <Box
                  role="rowheader"
                  sx={{
                    display: 'table-cell',
                    position: 'sticky',
                    left: 0,
                    zIndex: 2,
                    bgcolor: 'background.paper',
                    borderTop: `1px solid ${theme.palette.divider}`,
                    boxShadow: seam(theme, 'right'),
                    p: 1,
                    width: NAME_COL,
                    minWidth: NAME_COL,
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
                    {/*
                      `userId` is what draws the language mark: without it the
                      lookup returns null, the language resolves to English and
                      the mark renders nothing. It now also supplies the ring
                      whenever this payload has no class, which is why the stage
                      goes through knownStageKey rather than stageKeyOf: the
                      latter would assert "Not set" over a class the app knows.
                      30 rather than 26 because StudentStageAvatar suppresses
                      BOTH corner marks below 28, so a smaller face here quietly
                      dropped the stage glyph too.
                    */}
                    <StudentStageAvatar
                      userId={student.id}
                      name={student.name}
                      src={student.avatar_url}
                      stage={knownStageKey(student.study_stage)}
                      size={30}
                      tapToView={false}
                    />
                    <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>
                      {student.name}
                    </Typography>
                  </Box>
                </Box>

                {data.classes.map((cls) => {
                  const cell = data.cells[cls.id]?.[student.id];
                  return (
                    <Box
                      key={cls.id}
                      role="cell"
                      sx={{
                        display: 'table-cell',
                        borderTop: `1px solid ${theme.palette.divider}`,
                        textAlign: 'center',
                        width: CELL_W,
                        minWidth: CELL_W,
                      }}
                    >
                      <Box
                        component={Link}
                        href={`${classHref(cls.id)}${classHref(cls.id).includes('?') ? '&' : '?'}student=${student.id}`}
                        aria-label={`${student.name}, ${formatClassDate(cls.scheduled_date)}: ${describeCell(cell, cls.measured)}`}
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          // A small inset, not a real gap: this grid exists to fit
                          // many classes on a phone, so the column itself stays
                          // flush at CELL_W. The inset just keeps a mistap on the
                          // boundary between two 48px targets from landing on the
                          // wrong class.
                          mx: '2px',
                          minHeight: 44,
                          borderRadius: 1,
                          textDecoration: 'none',
                          fontWeight: 800,
                          color: cell ? LETTER_COLOR[cell.g] : 'text.disabled',
                          bgcolor: cell ? toneBg(theme, cell.g) : undefined,
                          '&:hover': { bgcolor: 'action.hover' },
                          '&:active': { bgcolor: 'action.selected' },
                          '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main' },
                        }}
                      >
                        {cell ? GROUP_LETTER[cell.g] : '?'}
                      </Box>
                    </Box>
                  );
                })}

                <Box
                  role="cell"
                  sx={{
                    display: 'table-cell',
                    position: 'sticky',
                    right: 0,
                    zIndex: 2,
                    bgcolor: 'background.paper',
                    borderTop: `1px solid ${theme.palette.divider}`,
                    boxShadow: seam(theme, 'left'),
                    p: 1,
                    textAlign: 'right',
                    width: RATE_COL,
                    minWidth: RATE_COL,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>
                    {student.rate == null ? '–' : `${student.rate}%`}
                  </Typography>
                </Box>
              </Box>
            ))}
          </Box>
        </Box>
      )}

      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, mt: 1 }}>
        {GROUP_ORDER.map((g) => (
          <Typography
            key={g}
            variant="caption"
            color="text.secondary"
            sx={{ display: 'inline-flex', alignItems: 'center' }}
          >
            {/* Same ink, same tint as the cells above, so the legend is read
                as one system with the grid rather than a second, drifting copy. */}
            <Box
              component="span"
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                minWidth: 20,
                height: 20,
                borderRadius: 1,
                fontWeight: 800,
                color: LETTER_COLOR[g],
                bgcolor: toneBg(theme, g),
                mr: 0.75,
              }}
            >
              {GROUP_LETTER[g]}
            </Box>
            {GROUP_LABEL[g]}
          </Typography>
        ))}
      </Box>

      <PausedFootnote count={data.paused_hidden} />
    </Box>
  );
}
