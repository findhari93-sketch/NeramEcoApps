'use client';

/**
 * Who to ring tonight.
 *
 * The register answers "who was in the room". This answers the question that
 * follows it, and the two are not the same: a student who misses every live
 * class but watches every recap and clears every catch-up item is fine, and on
 * the register they look identical to one who has simply stopped coming.
 *
 * Read only, exactly like the register. Every row links out to Catch-up and the
 * Watchlist, which is where chasing already works. Adding a third place to send
 * a message would be a third place for the three to disagree about what was
 * already sent.
 *
 * Ordered worst first, because the order IS the answer.
 */

import { useMemo } from 'react';
import Link from 'next/link';
import { Box, Chip, Typography, alpha, useTheme, type Theme } from '@neram/ui';
import StudentStageAvatar from '@/components/students/StudentStageAvatar';
import StudentStatFilters, { type StatFilterTile } from '@/components/tests/StudentStatFilters';
import StudentListToolbar, { PausedFootnote } from '@/components/students/list/StudentListToolbar';
import { useStudentListView } from '@/components/students/list/useStudentListView';
import { suggestedOrder, type ListAccessors } from '@/lib/student-list-view';
import { knownStageKey } from '@/lib/student-stage';
import { RADIUS } from '@/components/timetable/timetable-theme';
import {
  STANDING_META,
  STANDING_ORDER,
  type Standing,
} from '@/lib/attendance-standing';
import type { StandingResponse, StandingRow } from '@/app/api/attendance/standing/route';

const ACCESSORS: ListAccessors<StandingRow> = {
  id: (s) => s.id,
  name: (s) => s.name,
  joinedAt: (s) => s.enrolled_at,
};

/**
 * "Most concern first" is the screen's own sort and its default. Alphabetical
 * would bury the two students this list exists to surface among thirty names.
 */
const CONCERN_SORT = [suggestedOrder<StandingRow>('Most concern first')];

const RANK = new Map<Standing, number>(STANDING_ORDER.map((s, i) => [s, i]));

/** Theme tone to a palette colour, with neutral falling through to grey. */
function toneColor(theme: Theme, standing: Standing): string {
  const tone = STANDING_META[standing].tone;
  if (tone === 'neutral') return theme.palette.grey[500];
  return theme.palette[tone].main;
}

export default function StandingList({ data }: { data: StandingResponse }) {
  const theme = useTheme();

  // Sorted before the hook sees it, so "Most concern first" is simply the
  // incoming order and the other sorts still work off the same rows.
  const rows = useMemo(
    () =>
      [...data.students].sort(
        (a, b) =>
          (RANK.get(a.standing) ?? 99) - (RANK.get(b.standing) ?? 99) ||
          (a.rate ?? 101) - (b.rate ?? 101) ||
          a.name.localeCompare(b.name),
      ),
    [data.students],
  );

  const view = useStudentListView<StandingRow, string, Standing>({
    rows,
    accessors: ACCESSORS,
    extraSorts: CONCERN_SORT,
    defaultSort: 'suggested',
    status: { of: (s) => s.standing, order: STANDING_ORDER },
    urlKeys: false,
    storageKey: 'attendance-standing',
  });

  // Only the standings anybody is actually in, so a teacher whose class is all
  // clear does not read five zeroes before the one number that matters.
  const tiles: StatFilterTile<Standing | 'all'>[] = STANDING_ORDER.filter(
    (s) => view.statusCounts[s] > 0,
  ).map((s) => ({
    key: s,
    label: STANDING_META[s].label,
    value: view.statusCounts[s],
    hint: STANDING_META[s].hint,
    tone: STANDING_META[s].tone === 'neutral' ? 'neutral' : STANDING_META[s].tone,
  }));

  return (
    <Box>
      {data.unmeasured_classes > 0 && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
          {data.unmeasured_classes} class{data.unmeasured_classes === 1 ? '' : 'es'} in this range
          {' '}have not been read from Teams yet, so they count for nobody.
        </Typography>
      )}

      <StudentListToolbar
        view={view}
        searchLabel="Find a student"
        statusSlot={
          tiles.length > 0 ? (
            <StudentStatFilters<Standing | 'all'>
              tiles={tiles}
              active={view.status}
              onChange={(k) => view.setStatus(k as Standing | 'all')}
              phoneLayout="grid"
            />
          ) : undefined
        }
      />

      {view.shown.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
          No students match.
        </Typography>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
          {view.shown.map((s) => {
            const color = toneColor(theme, s.standing);
            return (
              <Box
                key={s.id}
                sx={{
                  p: 1.75,
                  borderRadius: RADIUS.card,
                  border: `1px solid ${theme.palette.divider}`,
                  // A tinted left edge rather than a coloured row: the chip and
                  // the words already carry the standing, so colour stays
                  // reinforcement and never the only signal.
                  borderLeft: `4px solid ${color}`,
                  bgcolor: 'background.paper',
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.25 }}>
                  <StudentStageAvatar
                    userId={s.id}
                    name={s.name}
                    src={s.avatar_url}
                    stage={knownStageKey(s.study_stage)}
                    size={40}
                  />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>
                      <Typography sx={{ fontWeight: 700, minWidth: 0 }}>{s.name}</Typography>
                      <Chip
                        size="small"
                        label={STANDING_META[s.standing].label}
                        sx={{
                          fontWeight: 700,
                          // text.primary on a light tint, the same contrast
                          // choice the register grid's letters settled on after
                          // the tone colours themselves measured under 4.5:1.
                          color: 'text.primary',
                          bgcolor: alpha(color, 0.16),
                        }}
                      />
                    </Box>

                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                      {s.reasons.join('. ')}
                      {s.reasons.length ? '.' : ''}
                    </Typography>

                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, mt: 0.75 }}>
                      <Typography variant="caption" color="text.secondary">
                        {/*
                          Null and 0 are different answers and are written
                          differently. A dash means nothing was measured; 0%
                          would be an accusation.
                        */}
                        {s.rate === null
                          ? 'Attendance not measured'
                          : `${s.rate}%, ${s.present} of ${s.counted}`}
                        {s.away > 0 ? `, ${s.away} away` : ''}
                      </Typography>
                      {s.open_backlog > 0 && (
                        <Typography variant="caption" color="text.secondary">
                          {s.open_backlog} to catch up
                        </Typography>
                      )}
                      {s.blocked_on_us > 0 && (
                        <Typography variant="caption" color="text.secondary">
                          {s.blocked_on_us} waiting on us
                        </Typography>
                      )}
                    </Box>

                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mt: 1 }}>
                      <Typography
                        component={Link}
                        href="/teacher/catch-up?tab=students"
                        variant="caption"
                        sx={{
                          fontWeight: 700,
                          color: 'primary.main',
                          textDecoration: 'none',
                          display: 'inline-flex',
                          alignItems: 'center',
                          minHeight: 44,
                          '&:focus-visible': {
                            outline: '2px solid',
                            outlineColor: 'primary.main',
                            outlineOffset: 2,
                          },
                        }}
                      >
                        Follow up in Catch-up
                      </Typography>
                      <Typography
                        component={Link}
                        href="/teacher/students/watchlist"
                        variant="caption"
                        sx={{
                          fontWeight: 700,
                          color: 'primary.main',
                          textDecoration: 'none',
                          display: 'inline-flex',
                          alignItems: 'center',
                          minHeight: 44,
                          '&:focus-visible': {
                            outline: '2px solid',
                            outlineColor: 'primary.main',
                            outlineOffset: 2,
                          },
                        }}
                      >
                        Open the watchlist
                      </Typography>
                    </Box>
                  </Box>
                </Box>
              </Box>
            );
          })}
        </Box>
      )}

      <PausedFootnote count={data.paused_hidden} />
    </Box>
  );
}
