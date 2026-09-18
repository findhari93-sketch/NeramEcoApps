'use client';

/**
 * Everyone in one class, in four groups, with the time each was in the room.
 *
 * The numbers are the filters: a teacher who reads "Missed, no reason 16" wants
 * those sixteen, so the tile that says it is the button that shows them. One
 * level, no tabs inside tabs.
 */
import { useEffect, useMemo, useState } from 'react';
import { Box, Collapse, Stack, Typography, useMediaQuery } from '@neram/ui';
import StudentStageAvatar from '@/components/students/StudentStageAvatar';
import StudentStatFilters, { type StatFilterTile } from '@/components/tests/StudentStatFilters';
import StudentListToolbar, { PausedFootnote } from '@/components/students/list/StudentListToolbar';
import { useStudentListView } from '@/components/students/list/useStudentListView';
import { suggestedOrder, type ListAccessors } from '@/lib/student-list-view';
import { stageKeyOf } from '@/lib/student-stage';
import { reasonShortLabel } from '@/lib/rsvp-reasons';
import { RADIUS, REDUCED_MOTION_QUERY } from '@/components/timetable/timetable-theme';
import { GROUP_LABEL, GROUP_ORDER, GROUP_TONE, describePresence, type RegisterGroup } from '@/lib/attendance-register';
import type { Insights, StudentInsight } from '@/components/timetable/attendance/types';
import PresenceStrip from './PresenceStrip';
import { formatClock } from './attendance-format';

type TileKey = RegisterGroup | 'all';
type SortKey = 'suggested' | 'least_time';
// The shared rules module's own order, minus joined_later: that group is
// never a section here, it is the collapsible note below the toolbar. Reusing
// GROUP_ORDER rather than a second hand-written list is what stops this
// screen and RegisterGrid's legend from being able to drift apart on the
// order a teacher reads the four groups in.
const SECTIONS: RegisterGroup[] = GROUP_ORDER.filter((g) => g !== 'joined_later');

const ACCESSORS: ListAccessors<StudentInsight> = {
  id: (s) => s.id,
  name: (s) => s.name,
  joinedAt: (s) => s.enrolled_at,
  dormant: (s) => s.dormant,
};

/**
 * What a missed student told us, and who told us.
 *
 * The free text note, when there is one, says more than the category
 * ("had fever" over "Unwell"), so it wins. That is the same preference
 * describeReason already uses; this line just also names who said it and when.
 */
function missedLine(s: StudentInsight): string {
  const absence = s.absence;
  if (absence?.excused_at) return 'Excused by a teacher.';
  const code = absence?.reason_code || (s.rsvp === 'not_attending' ? s.reason : null);
  const note = absence?.reason_note?.trim();
  if (!code && !note) return 'No reason given.';
  const who = absence?.reason_source === 'parent' ? 'Parent said' : 'Said';
  const when = s.rsvp === 'not_attending' ? 'in advance' : 'afterwards';
  const label = note || (code ? reasonShortLabel(code) : 'Reason given');
  return `${who} ${when}: ${label}.`;
}

/** How far a missed student has got with making it up. */
function catchupLine(s: StudentInsight): string {
  if (s.absence?.caught_up_at) return 'Caught up.';
  if (s.absence?.recording_watched_at) return 'Watched the recording.';
  return 'Recording not watched.';
}

export default function ClassRegisterList({
  insights,
  highlightStudentId,
}: {
  insights: Insights;
  highlightStudentId: string | null;
}) {
  const [active, setActive] = useState<TileKey>('all');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showLater, setShowLater] = useState(false);

  // The joined-later note and the student detail both open with a Collapse,
  // which always height-animates. A viewer who asked their OS for less motion
  // gets the same open and closed states, just without the animated height:
  // a 0ms timeout makes Collapse apply them immediately instead of tweening.
  const prefersReducedMotion = useMediaQuery(REDUCED_MOTION_QUERY);
  const collapseTimeout = prefersReducedMotion ? 0 : undefined;

  const held = insights.summary.held;

  /**
   * The shared list: ranked search, the stage filter that matches the avatar
   * rings, and the sort menu, exactly as every other full list of students in
   * this app. The sections below group whatever survives it, so a search for one
   * name still shows which group that student is in.
   */
  const view = useStudentListView<StudentInsight, SortKey>({
    rows: insights.students,
    accessors: ACCESSORS,
    extraSorts: [
      suggestedOrder<StudentInsight>('Group order'),
      {
        key: 'least_time',
        label: 'Least time first',
        compare: (a: StudentInsight, b: StudentInsight) => a.minutesIn - b.minutesIn,
      },
    ],
    defaultSort: 'suggested',
    urlKeys: false,
    storageKey: 'nexus:class-register:sort',
  });

  // A grid cell links here with ?student=<id>, and the row highlights, but on
  // a long class that row can land off screen with nothing to say it exists.
  // Scrolling to it is the other half of that link: honouring the viewer's
  // own reduced-motion preference the same way the Collapse timeout above does.
  useEffect(() => {
    if (!highlightStudentId) return;
    const el = document.getElementById(`student-${highlightStudentId}`);
    el?.scrollIntoView?.({ behavior: prefersReducedMotion ? 'auto' : 'smooth', block: 'center' });
  }, [highlightStudentId, prefersReducedMotion]);

  const byGroup = useMemo(() => {
    const map: Record<RegisterGroup, StudentInsight[]> = {
      whole: [], partly: [], reason: [], no_reason: [], joined_later: [],
    };
    for (const s of view.shown) map[s.group].push(s);
    // Shortest time in the room first: the people who were barely there head the
    // list a teacher reads.
    map.partly.sort((a, b) => a.minutesIn - b.minutesIn);
    return map;
  }, [view.shown]);

  /**
   * The tiles count the whole class, never the search results. "Missed, no
   * reason 16" is a fact about the night, and a number that shrank as someone
   * typed a name would stop being one.
   */
  const classTally = useMemo(() => {
    const t: Record<RegisterGroup, number> = { whole: 0, partly: 0, reason: 0, no_reason: 0, joined_later: 0 };
    for (const s of insights.students) t[s.group]++;
    return t;
  }, [insights.students]);

  // Tones read off the shared module rather than repeated here, so a tile and
  // the register grid's own tint for the same group cannot drift apart.
  const tiles: StatFilterTile<TileKey>[] = [
    { key: 'whole', label: 'Whole class', value: classTally.whole, hint: 'Stayed throughout', tone: GROUP_TONE.whole },
    { key: 'partly', label: 'Partly there', value: classTally.partly, hint: 'Late, early or stepped out', tone: GROUP_TONE.partly },
    { key: 'reason', label: 'Missed, reason', value: classTally.reason, hint: 'Told us why', tone: GROUP_TONE.reason },
    { key: 'no_reason', label: 'Missed, no reason', value: classTally.no_reason, hint: 'Nothing said', tone: GROUP_TONE.no_reason },
  ];

  const sections = SECTIONS.filter((g) => (active === 'all' || active === g) && byGroup[g].length > 0);

  return (
    <Box>
      <StudentStatFilters<TileKey>
        tiles={tiles}
        active={active}
        onChange={setActive}
        allKey="all"
        phoneLayout="grid"
      />

      <StudentListToolbar view={view} searchLabel="Find a student" />

      {classTally.joined_later > 0 && (
        <Box sx={{ mb: 1.5 }}>
          <Box
            component="button"
            type="button"
            onClick={() => setShowLater((v) => !v)}
            sx={{
              appearance: 'none',
              border: 'none',
              bgcolor: 'transparent',
              font: 'inherit',
              color: 'text.secondary',
              p: 0,
              minHeight: 44,
              cursor: 'pointer',
              textAlign: 'left',
              '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main' },
            }}
          >
            <Typography variant="caption">
              {classTally.joined_later} joined the course after this class
            </Typography>
          </Box>
          <Collapse in={showLater} timeout={collapseTimeout}>
            <Stack spacing={0.5} sx={{ mt: 0.5 }}>
              {byGroup.joined_later.map((s) => (
                <Typography key={s.id} variant="caption" color="text.secondary">
                  {s.name}
                </Typography>
              ))}
            </Stack>
          </Collapse>
        </Box>
      )}

      {sections.map((group) => (
        <Box key={group} sx={{ mb: 2.5 }}>
          <Typography
            variant="caption"
            sx={{ fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase', color: 'text.secondary' }}
          >
            {GROUP_LABEL[group]}, {byGroup[group].length}
          </Typography>

          <Stack spacing={1} sx={{ mt: 1 }}>
            {byGroup[group].map((s) => {
              const present = group === 'whole' || group === 'partly';
              // The same sentence the rules module writes everywhere else, so
              // the register and the panel cannot word the same night differently.
              const description = present
                ? describePresence({
                    minutesIn: s.minutesIn,
                    segments: [],
                    lateByMin: s.lateByMin,
                    leftEarlyByMin: s.leftEarlyByMin,
                    outMin: s.outMin,
                    barelyThere: s.barelyAttended,
                    timesKnown: s.segments.length > 0,
                  })
                : `${missedLine(s)} ${catchupLine(s)}`;

              const rowSx = {
                p: 1.5,
                borderRadius: RADIUS.card,
                border: '1px solid',
                borderColor: highlightStudentId === s.id ? 'primary.main' : 'divider',
                bgcolor: 'background.paper',
                minHeight: 64,
              } as const;

              const rowContent = (
                <>
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1.25,
                      flexWrap: { xs: 'wrap', md: 'nowrap' },
                    }}
                  >
                    <StudentStageAvatar
                      userId={s.id}
                      name={s.name}
                      src={s.avatar_url}
                      stage={stageKeyOf(s.study_stage)}
                      size={32}
                      tapToView={false}
                    />
                    <Typography sx={{ fontWeight: 700, fontSize: '0.9rem', flex: 1, minWidth: 120 }} noWrap>
                      {s.name}
                    </Typography>
                    {present && (
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ fontVariantNumeric: 'tabular-nums' }}
                      >
                        {s.minutesIn} of {held.minutes} min
                      </Typography>
                    )}
                  </Box>

                  {present && (
                    <Box sx={{ mt: 1 }}>
                      <PresenceStrip
                        held={held}
                        segments={s.segments}
                        tone={group === 'whole' ? 'success' : 'warning'}
                        label={`${s.name}, ${s.minutesIn} of ${held.minutes} min. ${description || 'Stayed the whole class.'}`}
                      />
                    </Box>
                  )}

                  {description && (
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }}>
                      {description}
                    </Typography>
                  )}

                  {present && (
                    <Collapse in={expanded === s.id} id={`student-${s.id}-detail`} timeout={collapseTimeout}>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                        {s.segments.length
                          ? s.segments.map((seg) => `in ${formatClock(seg.start)} to ${formatClock(seg.end)}`).join(', ')
                          : 'Marked present by hand, no times.'}
                      </Typography>
                    </Collapse>
                  )}
                </>
              );

              // Only a present row expands, so only it gets button semantics: a
              // real <button> is keyboard reachable and Enter/Space activate it
              // the way any native control does, with no hand-rolled key
              // handling to keep in sync with the click handler. A missed row has
              // nothing to expand, so it stays a plain, non-interactive card.
              return present ? (
                <Box
                  key={s.id}
                  id={`student-${s.id}`}
                  component="button"
                  type="button"
                  onClick={() => setExpanded(expanded === s.id ? null : s.id)}
                  aria-expanded={expanded === s.id}
                  aria-controls={`student-${s.id}-detail`}
                  sx={{
                    ...rowSx,
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    font: 'inherit',
                    color: 'inherit',
                    appearance: 'none',
                    cursor: 'pointer',
                    '&:focus-visible': {
                      outline: '2px solid',
                      outlineColor: 'primary.main',
                      outlineOffset: 2,
                    },
                  }}
                >
                  {rowContent}
                </Box>
              ) : (
                <Box key={s.id} id={`student-${s.id}`} sx={{ ...rowSx, cursor: 'default' }}>
                  {rowContent}
                </Box>
              );
            })}
          </Stack>
        </Box>
      ))}

      {sections.length === 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
          Nobody matches this filter.
        </Typography>
      )}

      <PausedFootnote count={view.pausedHidden} />
    </Box>
  );
}
