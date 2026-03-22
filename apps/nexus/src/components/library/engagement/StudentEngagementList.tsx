'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  Typography,
  TextField,
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
  Avatar,
  InputAdornment,
} from '@neram/ui';
import SearchIcon from '@mui/icons-material/Search';
import EngagementStatusDot from './EngagementStatusDot';
import StudentEngagementCard from './StudentEngagementCard';

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

  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('engagement_score');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const filteredStudents = useMemo(() => {
    let list = students;

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (s) =>
          s.first_name.toLowerCase().includes(q) ||
          s.last_name.toLowerCase().includes(q)
      );
    }

    list = [...list].sort((a, b) => {
      let aVal: string | number;
      let bVal: string | number;

      switch (sortKey) {
        case 'name':
          aVal = `${a.first_name} ${a.last_name}`;
          bVal = `${b.first_name} ${b.last_name}`;
          break;
        case 'videos_watched':
          aVal = a.videos_watched;
          bVal = b.videos_watched;
          break;
        case 'total_watch_hours':
          aVal = a.total_watch_hours;
          bVal = b.total_watch_hours;
          break;
        case 'avg_completion_pct':
          aVal = a.avg_completion_pct;
          bVal = b.avg_completion_pct;
          break;
        case 'current_streak':
          aVal = a.current_streak;
          bVal = b.current_streak;
          break;
        default:
          aVal = a.engagement_score;
          bVal = b.engagement_score;
      }

      if (typeof aVal === 'string') {
        return sortDir === 'asc' ? aVal.localeCompare(bVal as string) : (bVal as string).localeCompare(aVal);
      }
      return sortDir === 'asc' ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
    });

    return list;
  }, [students, search, sortKey, sortDir]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  return (
    <Box>
      <TextField
        size="small"
        placeholder="Search students..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon sx={{ fontSize: '1.1rem', color: 'text.disabled' }} />
            </InputAdornment>
          ),
        }}
        sx={{
          mb: 2,
          width: '100%',
          '& .MuiOutlinedInput-root': {
            borderRadius: 2,
            fontSize: '0.85rem',
          },
        }}
      />

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
                    direction={sortKey === 'name' ? sortDir : 'asc'}
                    onClick={() => handleSort('name')}
                  >
                    Name
                  </TableSortLabel>
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.75rem' }}>
                  <TableSortLabel
                    active={sortKey === 'videos_watched'}
                    direction={sortKey === 'videos_watched' ? sortDir : 'desc'}
                    onClick={() => handleSort('videos_watched')}
                  >
                    Videos
                  </TableSortLabel>
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.75rem' }}>
                  <TableSortLabel
                    active={sortKey === 'total_watch_hours'}
                    direction={sortKey === 'total_watch_hours' ? sortDir : 'desc'}
                    onClick={() => handleSort('total_watch_hours')}
                  >
                    Hours
                  </TableSortLabel>
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.75rem' }}>
                  <TableSortLabel
                    active={sortKey === 'avg_completion_pct'}
                    direction={sortKey === 'avg_completion_pct' ? sortDir : 'desc'}
                    onClick={() => handleSort('avg_completion_pct')}
                  >
                    Completion
                  </TableSortLabel>
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.75rem' }}>
                  <TableSortLabel
                    active={sortKey === 'current_streak'}
                    direction={sortKey === 'current_streak' ? sortDir : 'desc'}
                    onClick={() => handleSort('current_streak')}
                  >
                    Streak
                  </TableSortLabel>
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.75rem' }}>
                  <TableSortLabel
                    active={sortKey === 'engagement_score'}
                    direction={sortKey === 'engagement_score' ? sortDir : 'desc'}
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
                        <Avatar
                          src={student.avatar_url || undefined}
                          sx={{ width: 28, height: 28, fontSize: '0.7rem' }}
                        >
                          {student.first_name?.[0]}{student.last_name?.[0]}
                        </Avatar>
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
    </Box>
  );
}
