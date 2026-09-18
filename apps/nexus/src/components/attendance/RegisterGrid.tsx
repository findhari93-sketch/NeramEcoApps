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
import { Box, Typography, useTheme } from '@neram/ui';
import StudentStageAvatar from '@/components/students/StudentStageAvatar';
import StudentListToolbar, { PausedFootnote } from '@/components/students/list/StudentListToolbar';
import { useStudentListView } from '@/components/students/list/useStudentListView';
import { stageKeyOf } from '@/lib/student-stage';
import type { ListAccessors } from '@/lib/student-list-view';
import { GROUP_LABEL, GROUP_LETTER, type RegisterGroup } from '@/lib/attendance-register';
import type { RegisterCell, RegisterResponse, RegisterStudent } from '@/app/api/attendance/register/route';
import { formatClassDate } from './attendance-format';

const ACCESSORS: ListAccessors<RegisterStudent> = {
  id: (s) => s.id,
  name: (s) => s.name,
  joinedAt: (s) => s.enrolled_at,
};

const NAME_COL = { xs: 132, sm: 180 };
const CELL_W = 48;

const TONE_COLOR: Record<RegisterGroup, string> = {
  whole: 'success.main',
  partly: 'warning.main',
  reason: 'info.main',
  no_reason: 'error.main',
  joined_later: 'text.disabled',
};

/** "partly there, 45 min, left 25 min early" */
function describeCell(cell: RegisterCell | undefined): string {
  if (!cell) return 'nothing recorded';
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

      <Box
        sx={{
          overflowX: 'auto',
          border: `1px solid ${theme.palette.divider}`,
          borderRadius: 2,
          bgcolor: 'background.paper',
        }}
      >
        <Box sx={{ display: 'table', borderCollapse: 'collapse', minWidth: '100%' }} role="table">
          <Box sx={{ display: 'table-row' }} role="row">
            <Box
              role="columnheader"
              sx={{
                display: 'table-cell',
                position: 'sticky',
                left: 0,
                zIndex: 2,
                bgcolor: 'background.paper',
                borderBottom: `1px solid ${theme.palette.divider}`,
                p: 1,
                width: NAME_COL,
                minWidth: NAME_COL,
              }}
            >
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>
                Student
              </Typography>
            </Box>
            {data.classes.map((cls) => (
              <Box
                key={cls.id}
                role="columnheader"
                sx={{
                  display: 'table-cell',
                  borderBottom: `1px solid ${theme.palette.divider}`,
                  p: 0.5,
                  width: CELL_W,
                  minWidth: CELL_W,
                  textAlign: 'center',
                }}
              >
                <Box
                  component={Link}
                  href={classHref(cls.id)}
                  sx={{
                    display: 'block',
                    py: 0.75,
                    color: 'text.secondary',
                    textDecoration: 'none',
                    borderRadius: 1,
                    minHeight: 44,
                    '&:hover': { color: 'text.primary' },
                    '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main' },
                  }}
                >
                  <Typography variant="caption" sx={{ display: 'block', fontWeight: 700, lineHeight: 1.2 }}>
                    {formatClassDate(cls.scheduled_date).split(' ')[1]}
                  </Typography>
                  <Typography variant="caption" sx={{ display: 'block', lineHeight: 1.2 }}>
                    {formatClassDate(cls.scheduled_date).split(' ')[0]}
                  </Typography>
                </Box>
              </Box>
            ))}
            <Box
              role="columnheader"
              sx={{
                display: 'table-cell',
                borderBottom: `1px solid ${theme.palette.divider}`,
                p: 1,
                textAlign: 'right',
                minWidth: 56,
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
                  zIndex: 1,
                  bgcolor: 'background.paper',
                  borderTop: `1px solid ${theme.palette.divider}`,
                  p: 1,
                  width: NAME_COL,
                  minWidth: NAME_COL,
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
                  <StudentStageAvatar
                    userId={student.id}
                    name={student.name}
                    src={student.avatar_url}
                    stage={stageKeyOf(student.study_stage)}
                    size={26}
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
                      aria-label={`${student.name}, ${formatClassDate(cls.scheduled_date)}: ${describeCell(cell)}`}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        minHeight: 44,
                        textDecoration: 'none',
                        fontWeight: 800,
                        color: cell ? TONE_COLOR[cell.g] : 'text.disabled',
                        '&:hover': { bgcolor: 'action.hover' },
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
                  borderTop: `1px solid ${theme.palette.divider}`,
                  p: 1,
                  textAlign: 'right',
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

      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, mt: 1 }}>
        {(['whole', 'partly', 'reason', 'no_reason', 'joined_later'] as RegisterGroup[]).map((g) => (
          <Typography key={g} variant="caption" color="text.secondary">
            <Box component="span" sx={{ fontWeight: 800, color: TONE_COLOR[g], mr: 0.5 }}>
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
