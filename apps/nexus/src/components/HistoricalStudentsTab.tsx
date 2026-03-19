'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Box,
  Typography,
  Avatar,
  Chip,
  Paper,
  TextField,
  Button,
  CircularProgress,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  InputAdornment,
  LinearProgress,
  Skeleton,
} from '@neram/ui';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import SearchIcon from '@mui/icons-material/Search';
import RestoreIcon from '@mui/icons-material/Restore';
import PersonOffIcon from '@mui/icons-material/PersonOff';
import type { HistoricalStudent, RemovalReasonCategory } from '@neram/database';

const REASON_LABELS: Record<RemovalReasonCategory, string> = {
  fee_nonpayment: 'Fee Non-payment',
  course_completed: 'Completed',
  college_admitted: 'College',
  self_withdrawal: 'Withdrawal',
  disciplinary: 'Disciplinary',
  other: 'Other',
};

const REASON_COLORS: Record<RemovalReasonCategory, 'error' | 'success' | 'info' | 'warning' | 'default' | 'secondary'> = {
  fee_nonpayment: 'error',
  course_completed: 'success',
  college_admitted: 'info',
  self_withdrawal: 'warning',
  disciplinary: 'error',
  other: 'default',
};

interface HistoricalStudentsTabProps {
  classroomId: string;
  getToken: () => Promise<string | null>;
  onRestored?: () => void;
}

export default function HistoricalStudentsTab({
  classroomId,
  getToken,
  onRestored,
}: HistoricalStudentsTabProps) {
  const [students, setStudents] = useState<HistoricalStudent[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [reasonFilter, setReasonFilter] = useState<string>('');
  const [page, setPage] = useState(1);
  const searchTimeout = useRef<ReturnType<typeof setTimeout>>();

  const fetchStudents = useCallback(async (p: number, append = false) => {
    try {
      if (p === 1) setLoading(true);
      else setLoadingMore(true);

      const token = await getToken();
      if (!token) return;
      const params = new URLSearchParams({ page: String(p), limit: '20' });
      if (reasonFilter) params.set('reason', reasonFilter);
      if (search.trim()) params.set('search', search.trim());

      const res = await fetch(
        `/api/classrooms/${classroomId}/historical-students?${params}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (!res.ok) throw new Error('Failed to load');
      const data = await res.json();

      if (append) {
        setStudents((prev) => [...prev, ...data.students]);
      } else {
        setStudents(data.students);
      }
      setTotal(data.total);
    } catch (err) {
      console.error('Failed to fetch historical students:', err);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [classroomId, getToken, reasonFilter, search]);

  useEffect(() => {
    setPage(1);
    fetchStudents(1);
  }, [fetchStudents]);

  const handleSearchChange = (value: string) => {
    setSearch(value);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      setPage(1);
    }, 400);
  };

  const handleLoadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchStudents(nextPage, true);
  };

  const handleRestore = async (enrollmentId: string) => {
    setRestoringId(enrollmentId);
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(`/api/classrooms/${classroomId}/enrollments/restore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ enrollment_id: enrollmentId }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to restore');
      }

      // Remove from local list
      setStudents((prev) => prev.filter((s) => s.enrollment_id !== enrollmentId));
      setTotal((prev) => prev - 1);
      onRestored?.();
    } catch (err) {
      console.error('Failed to restore student:', err);
    } finally {
      setRestoringId(null);
    }
  };

  const getInitials = (name: string) =>
    name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const filterChips: { label: string; value: string }[] = [
    { label: 'All', value: '' },
    { label: 'Fee Non-payment', value: 'fee_nonpayment' },
    { label: 'Completed', value: 'course_completed' },
    { label: 'College', value: 'college_admitted' },
    { label: 'Withdrawal', value: 'self_withdrawal' },
    { label: 'Disciplinary', value: 'disciplinary' },
    { label: 'Other', value: 'other' },
  ];

  return (
    <Box>
      {/* Search */}
      <TextField
        fullWidth
        size="small"
        placeholder="Search by name or email..."
        value={search}
        onChange={(e) => handleSearchChange(e.target.value)}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon fontSize="small" />
            </InputAdornment>
          ),
        }}
        sx={{ mb: 2 }}
      />

      {/* Filter chips */}
      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mb: 2 }}>
        {filterChips.map((chip) => (
          <Chip
            key={chip.value}
            label={chip.label}
            size="small"
            variant={reasonFilter === chip.value ? 'filled' : 'outlined'}
            color={reasonFilter === chip.value ? 'primary' : 'default'}
            onClick={() => setReasonFilter(chip.value)}
            sx={{ minHeight: 32 }}
          />
        ))}
      </Box>

      {/* Loading skeleton */}
      {loading && (
        <Box>
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} variant="rounded" height={80} sx={{ mb: 1 }} />
          ))}
        </Box>
      )}

      {/* Empty state */}
      {!loading && students.length === 0 && (
        <Box sx={{ textAlign: 'center', py: 6 }}>
          <PersonOffIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
          <Typography variant="body1" color="text.secondary">
            No historical students found
          </Typography>
          <Typography variant="body2" color="text.disabled">
            {search || reasonFilter
              ? 'Try adjusting your search or filters'
              : 'Students removed from this classroom will appear here'}
          </Typography>
        </Box>
      )}

      {/* Student cards */}
      {!loading && students.map((student) => (
        <Accordion
          key={student.enrollment_id}
          disableGutters
          sx={{ mb: 1, '&:before': { display: 'none' }, border: '1px solid', borderColor: 'divider', borderRadius: '8px !important' }}
        >
          <AccordionSummary
            expandIcon={<ExpandMoreIcon />}
            sx={{ minHeight: 64, '& .MuiAccordionSummary-content': { alignItems: 'center', gap: 1.5 } }}
          >
            <Avatar src={student.user.avatar_url || undefined} sx={{ width: 40, height: 40 }}>
              {getInitials(student.user.name)}
            </Avatar>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="body2" fontWeight={600} noWrap>
                {student.user.name}
              </Typography>
              <Typography variant="caption" color="text.secondary" noWrap>
                {student.user.email}
              </Typography>
            </Box>
            <Chip
              label={REASON_LABELS[student.reason_category]}
              size="small"
              color={REASON_COLORS[student.reason_category]}
              sx={{ display: { xs: 'none', sm: 'inline-flex' } }}
            />
          </AccordionSummary>
          <AccordionDetails sx={{ pt: 0, px: { xs: 1.5, sm: 3 } }}>
            {/* Reason chip on mobile */}
            <Box sx={{ display: { xs: 'block', sm: 'none' }, mb: 1 }}>
              <Chip
                label={REASON_LABELS[student.reason_category]}
                size="small"
                color={REASON_COLORS[student.reason_category]}
              />
            </Box>

            {/* Removal info */}
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mb: 2 }}>
              <Box>
                <Typography variant="caption" color="text.disabled">Removed</Typography>
                <Typography variant="body2">{formatDate(student.removed_at)}</Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.disabled">By</Typography>
                <Typography variant="body2">{student.removed_by.name}</Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.disabled">Enrolled</Typography>
                <Typography variant="body2">{formatDate(student.enrolled_at)}</Typography>
              </Box>
              {student.batch_name && (
                <Box>
                  <Typography variant="caption" color="text.disabled">Batch</Typography>
                  <Typography variant="body2">{student.batch_name}</Typography>
                </Box>
              )}
            </Box>

            {/* Notes */}
            {student.notes && (
              <Box sx={{ mb: 2, p: 1, bgcolor: 'grey.50', borderRadius: 1 }}>
                <Typography variant="caption" color="text.disabled">Notes</Typography>
                <Typography variant="body2">{student.notes}</Typography>
              </Box>
            )}

            {/* Progress snapshot */}
            {student.progress_snapshot && (
              <Box sx={{ mb: 2 }}>
                <Typography variant="caption" color="text.disabled" sx={{ mb: 1, display: 'block' }}>
                  Progress at Removal
                </Typography>
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr 1fr' }, gap: 1.5 }}>
                  {/* Attendance */}
                  <Paper variant="outlined" sx={{ p: 1.5 }}>
                    <Typography variant="caption" color="text.secondary">Attendance</Typography>
                    <Typography variant="body2" fontWeight={600}>
                      {student.progress_snapshot.attendance.attended}/{student.progress_snapshot.attendance.total}
                      {' '}({student.progress_snapshot.attendance.percentage}%)
                    </Typography>
                    <LinearProgress
                      variant="determinate"
                      value={student.progress_snapshot.attendance.percentage}
                      sx={{ mt: 0.5, height: 4, borderRadius: 2 }}
                    />
                  </Paper>
                  {/* Topics */}
                  <Paper variant="outlined" sx={{ p: 1.5 }}>
                    <Typography variant="caption" color="text.secondary">Topics</Typography>
                    <Typography variant="body2" fontWeight={600}>
                      {student.progress_snapshot.topics.completed}/{student.progress_snapshot.topics.total}
                    </Typography>
                    <LinearProgress
                      variant="determinate"
                      value={student.progress_snapshot.topics.total > 0
                        ? (student.progress_snapshot.topics.completed / student.progress_snapshot.topics.total) * 100
                        : 0}
                      sx={{ mt: 0.5, height: 4, borderRadius: 2 }}
                    />
                  </Paper>
                  {/* Checklist */}
                  <Paper variant="outlined" sx={{ p: 1.5 }}>
                    <Typography variant="caption" color="text.secondary">Checklist</Typography>
                    <Typography variant="body2" fontWeight={600}>
                      {student.progress_snapshot.checklist.completed}/{student.progress_snapshot.checklist.total}
                    </Typography>
                    <LinearProgress
                      variant="determinate"
                      value={student.progress_snapshot.checklist.total > 0
                        ? (student.progress_snapshot.checklist.completed / student.progress_snapshot.checklist.total) * 100
                        : 0}
                      sx={{ mt: 0.5, height: 4, borderRadius: 2 }}
                    />
                  </Paper>
                </Box>
              </Box>
            )}

            {/* Restore button */}
            <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button
                size="small"
                variant="outlined"
                startIcon={restoringId === student.enrollment_id ? <CircularProgress size={16} /> : <RestoreIcon />}
                onClick={() => handleRestore(student.enrollment_id)}
                disabled={restoringId !== null}
              >
                {restoringId === student.enrollment_id ? 'Restoring...' : 'Restore Student'}
              </Button>
            </Box>
          </AccordionDetails>
        </Accordion>
      ))}

      {/* Load more */}
      {!loading && students.length < total && (
        <Box sx={{ textAlign: 'center', mt: 2 }}>
          <Button
            variant="outlined"
            size="small"
            onClick={handleLoadMore}
            disabled={loadingMore}
          >
            {loadingMore ? 'Loading...' : `Load More (${students.length}/${total})`}
          </Button>
        </Box>
      )}
    </Box>
  );
}
