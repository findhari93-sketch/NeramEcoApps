'use client';

import { useRouter } from 'next/navigation';
import {
  Box,
  Typography,
  useMediaQuery,
  useTheme,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  Paper,
} from '@neram/ui';
import EngagementStatusDot from './EngagementStatusDot';
import StudentEngagementCard from './StudentEngagementCard';
import StudentAvatar from '@/components/students/StudentAvatar';
import StudentListToolbar, { PausedFootnote } from '@/components/students/list/StudentListToolbar';
import { useStudentListView } from '@/components/students/list/useStudentListView';
import type { ExtraSort, ListAccessors } from '@/lib/student-list-view';

interface StudentData {
  id: string;
  first_name: string;
  last_name: string;
  avatar_url: string | null;
  engagement_status: 'active' | 'moderate' | 'inactive' | 'new';
  engagement_score: number;
  videos_watched: number;
  total_watch_hours: number;
  avg_completion_pct: number;
  current_streak: number;
  last_active: string | null;
  bookmark_count: number;
  rewind_ratio: number;
}

interface StudentEngagementListProps {
  students: StudentData[];
}

type SortKey = 'name' | 'videos_watched' | 'total_watch_hours' | 'avg_completion_pct' | 'current_streak' | 'engagement_score';

const fullName = (s: StudentData) => `${s.first_name || ''} ${s.last_name || ''}`.trim();

const ACCESSORS: ListAccessors<StudentData> = { id: (s) => s.id, name: fullName };

const highFirst = (pick: (s: StudentData) => number) => (a: StudentData, b: StudentData) => pick(b) - pick(a);

const SORTS: ExtraSort<StudentData, SortKey>[] = [
  { key: 'engagement_score', label: 'Highest score', compare: highFirst((s) => s.engagement_score) },
  { key: 'videos_watched', label: 'Most videos', compare: highFirst((s) => s.videos_watched) },
  { key: 'total_watch_hours', label: 'Most hours', compare: highFirst((s) => s.total_watch_hours) },
  { key: 'avg_completion_pct', label: 'Highest completion', compare: highFirst((s) => s.avg_completion_pct) },
  { key: 'current_streak', label: 'Longest streak', compare: highFirst((s) => s.current_streak) },
];

function formatHours(hours: number): string {
  if (hours <= 0) return '0m';
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

export default function StudentEngagementList({ students }: StudentEngagementListProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const router = useRouter();

  // The shared student list: ranked search, sort (these columns plus name and
  // join date), stage filter, paused students hidden, all in the URL.
  const view = useStudentListView<StudentData, SortKey>({
    rows: students,
    accessors: ACCESSORS,
    extraSorts: SORTS,
    defaultSort: 'engagement_score',
    storageKey: 'nexus:library-engagement:sort',
  });
  const filteredStudents = view.shown;
  const sortKey = view.sort;
  const handleSort = (key: SortKey) => view.setSort(key);

  return (
    <Box>
      <StudentListToolbar view={view} />

      {isMobile ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {filteredStudents.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
              No students found
            </Typography>
          ) : (
            filteredStudents.map((student) => (
              <StudentEngagementCard key={student.id} student={student} />
            ))
          )}
        </Box>
      ) : (
        <TableContainer
          component={Paper}
          elevation={0}
          sx={{ border: `1px solid ${theme.palette.divider}`, borderRadius: 2 }}
        >
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem' }}>Status</TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem' }}>
                  <TableSortLabel
                    active={sortKey === 'name'}
                    direction="asc"
                    onClick={() => handleSort('name')}
                  >
                    Name
                  </TableSortLabel>
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.75rem' }}>
                  <TableSortLabel
                    active={sortKey === 'videos_watched'}
                    direction="desc"
                    onClick={() => handleSort('videos_watched')}
                  >
                    Videos
                  </TableSortLabel>
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.75rem' }}>
                  <TableSortLabel
                    active={sortKey === 'total_watch_hours'}
                    direction="desc"
                    onClick={() => handleSort('total_watch_hours')}
                  >
                    Hours
                  </TableSortLabel>
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.75rem' }}>
                  <TableSortLabel
                    active={sortKey === 'avg_completion_pct'}
                    direction="desc"
                    onClick={() => handleSort('avg_completion_pct')}
                  >
                    Completion
                  </TableSortLabel>
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.75rem' }}>
                  <TableSortLabel
                    active={sortKey === 'current_streak'}
                    direction="desc"
                    onClick={() => handleSort('current_streak')}
                  >
                    Streak
                  </TableSortLabel>
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.75rem' }}>
                  <TableSortLabel
                    active={sortKey === 'engagement_score'}
                    direction="desc"
                    onClick={() => handleSort('engagement_score')}
                  >
                    Score
                  </TableSortLabel>
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredStudents.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} sx={{ textAlign: 'center', py: 4 }}>
                    <Typography variant="body2" color="text.secondary">
                      No students found
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                filteredStudents.map((student) => (
                  <TableRow
                    key={student.id}
                    hover
                    onClick={() => router.push(`/teacher/library/engagement/${student.id}`)}
                    sx={{ cursor: 'pointer' }}
                  >
                    <TableCell>
                      <EngagementStatusDot status={student.engagement_status} />
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <StudentAvatar
                          userId={student.id}
                          src={student.avatar_url}
                          name={`${student.first_name} ${student.last_name}`}
                          size={28}
                          tapToView={false}
                        />
                        <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.8rem' }}>
                          {student.first_name} {student.last_name}
                        </Typography>
                      </Box>
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="caption" sx={{ fontWeight: 500 }}>
                        {student.videos_watched}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="caption" sx={{ fontWeight: 500 }}>
                        {formatHours(student.total_watch_hours)}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="caption" sx={{ fontWeight: 500 }}>
                        {student.avg_completion_pct}%
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="caption" sx={{ fontWeight: 500 }}>
                        {student.current_streak > 0 ? `${student.current_streak}d` : '-'}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="caption" sx={{ fontWeight: 700 }}>
                        {student.engagement_score}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}
      <PausedFootnote count={view.pausedHidden} />
    </Box>
  );
}
