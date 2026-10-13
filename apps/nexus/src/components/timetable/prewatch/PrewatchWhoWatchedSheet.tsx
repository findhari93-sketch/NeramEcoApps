'use client';

/**
 * Who watched the "watch before class" videos.
 *
 * A full list of the class's students, so it is the shared list (search, sort,
 * stage filter, dormant students left out with the footnote), with tiles for
 * Watched all, Some and Not yet. Each student shows one mark per video, in the
 * order the videos are listed on the class.
 *
 * Dialog on desktop, bottom drawer on mobile.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Button,
  Dialog,
  Drawer,
  Skeleton,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from '@neram/ui';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import TimelapseIcon from '@mui/icons-material/Timelapse';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import StudentAvatar from '@/components/students/StudentAvatar';
import StudentListToolbar, { PausedFootnote } from '@/components/students/list/StudentListToolbar';
import { useStudentListView } from '@/components/students/list/useStudentListView';
import StudentStatFilters, { type StatFilterTile } from '@/components/tests/StudentStatFilters';
import type { ListAccessors } from '@/lib/student-list-view';
import type { PrewatchItem, PrewatchState } from '@/lib/prewatch';
import { RADIUS } from '../timetable-theme';

interface StudentRow {
  student_id: string;
  name: string | null;
  avatar_url: string | null;
  states: Record<string, PrewatchState>;
}

type Group = 'all' | 'watched' | 'some' | 'none';

const ACCESSORS: ListAccessors<StudentRow> = {
  id: (s) => s.student_id,
  name: (s) => s.name,
};

function groupOf(row: StudentRow, items: PrewatchItem[]): Exclude<Group, 'all'> {
  const states = items.map((i) => row.states[i.id] || 'not_started');
  if (states.length && states.every((s) => s === 'watched')) return 'watched';
  if (states.some((s) => s !== 'not_started')) return 'some';
  return 'none';
}

const MARK: Record<PrewatchState, { Icon: typeof CheckCircleIcon; color: string; label: string }> = {
  watched: { Icon: CheckCircleIcon, color: 'success.main', label: 'Watched' },
  started: { Icon: TimelapseIcon, color: 'warning.dark', label: 'Started' },
  not_started: { Icon: RadioButtonUncheckedIcon, color: 'text.disabled', label: 'Not yet' },
};

interface Props {
  open: boolean;
  onClose: () => void;
  classId: string;
  items: PrewatchItem[];
  getToken: () => Promise<string | null>;
}

export default function PrewatchWhoWatchedSheet({ open, onClose, classId, items, getToken }: Props) {
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('sm'));
  const [rows, setRows] = useState<StudentRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [active, setActive] = useState<Group>('all');
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setRows(null);
    setFailed(false);
    setActive('all');
    (async () => {
      try {
        const token = await getTokenRef.current();
        const res = await fetch(`/api/timetable/${classId}/prewatch?detail=1`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(String(res.status));
        const body = await res.json();
        if (!cancelled) setRows(body.students || []);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, classId]);

  const view = useStudentListView<StudentRow>({
    rows,
    accessors: ACCESSORS,
    defaultSort: 'name',
    prefilter: active === 'all' ? undefined : (row) => groupOf(row, items) === active,
    urlKeys: false,
    storageKey: 'nexus:prewatch-who:sort',
  });

  // The tiles count the whole class, never the search results.
  const tally = useMemo(() => {
    const t = { watched: 0, some: 0, none: 0 };
    for (const r of rows || []) t[groupOf(r, items)] += 1;
    return t;
  }, [rows, items]);

  const tiles: StatFilterTile<Group>[] = [
    { key: 'watched', label: 'Watched all', value: tally.watched, hint: 'Every video', tone: 'success' },
    { key: 'some', label: 'Some', value: tally.some, hint: 'Started or watched one', tone: 'warning' },
    { key: 'none', label: 'Not yet', value: tally.none, hint: 'Nothing played', tone: 'neutral' },
  ];

  const body = (
    <Box sx={{ display: 'flex', flexDirection: 'column', maxHeight: { xs: '88vh', sm: 680 } }}>
      <Box sx={{ p: 2.5, pb: 1 }}>
        <Typography component="h2" sx={{ fontWeight: 800, fontSize: '1.0625rem' }}>
          Who watched before class
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
          Watched means at least 80% actually played. Marks follow the order of the videos on the class.
        </Typography>
      </Box>

      <Box sx={{ px: 2.5, overflowY: 'auto', flex: 1 }}>
        {failed ? (
          <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
            Could not load the list. Close this and try again.
          </Typography>
        ) : !rows ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, py: 1 }} aria-busy>
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} variant="rounded" height={56} />
            ))}
          </Box>
        ) : (
          <>
            <Box sx={{ mb: 1.5 }}>
              <StudentStatFilters<Group> tiles={tiles} active={active} onChange={setActive} allKey="all" phoneLayout="pills" />
            </Box>
            <StudentListToolbar view={view} searchLabel="Find a student" compact />
            {view.shown.length ? (
              <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, mt: 1 }}>
                {view.shown.map((row) => (
                  <Box
                    component="li"
                    key={row.student_id}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1.25,
                      py: 1,
                      minHeight: 56,
                      borderBottom: `1px solid ${theme.palette.divider}`,
                    }}
                  >
                    <StudentAvatar userId={row.student_id} name={row.name || 'Student'} src={row.avatar_url} size={36} />
                    <Typography variant="body2" sx={{ fontWeight: 600, flex: 1, minWidth: 0 }} noWrap>
                      {row.name || 'Student'}
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 0.5 }}>
                      {items.map((item, index) => {
                        const state = row.states[item.id] || 'not_started';
                        const { Icon, color, label } = MARK[state];
                        return (
                          <Tooltip key={item.id} title={`${index + 1}. ${item.title}: ${label}`}>
                            <Icon
                              role="img"
                              aria-label={`Video ${index + 1}, ${item.title}: ${label}`}
                              sx={{ fontSize: 22, color }}
                            />
                          </Tooltip>
                        );
                      })}
                    </Box>
                  </Box>
                ))}
              </Box>
            ) : (
              <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
                {rows.length ? 'No student matches.' : 'No students in this classroom yet.'}
              </Typography>
            )}
            <PausedFootnote count={view.pausedHidden} />
          </>
        )}
      </Box>

      <Box
        sx={{
          display: 'flex',
          justifyContent: 'flex-end',
          px: 2.5,
          py: 1.5,
          borderTop: `1px solid ${theme.palette.divider}`,
          pb: { xs: 'calc(12px + env(safe-area-inset-bottom))', sm: 1.5 },
        }}
      >
        <Button onClick={onClose} sx={{ textTransform: 'none', minHeight: 44, borderRadius: RADIUS.control }}>
          Close
        </Button>
      </Box>
    </Box>
  );

  if (isDesktop) {
    return (
      <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth aria-label="Who watched before class">
        {body}
      </Dialog>
    );
  }
  return (
    <Drawer
      anchor="bottom"
      open={open}
      onClose={onClose}
      sx={{ zIndex: (t) => t.zIndex.modal + 1 }}
      PaperProps={{ sx: { borderTopLeftRadius: 16, borderTopRightRadius: 16 } }}>
      {body}
    </Drawer>
  );
}
