'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  Typography,
  Paper,
  Chip,
  Skeleton,
  TextField,
  IconButton,
  Snackbar,
  Tooltip,
  Tabs,
  Tab,
  useTheme,
  useMediaQuery,
  alpha,
} from '@neram/ui';
import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined';
import MapOutlinedIcon from '@mui/icons-material/MapOutlined';
import PeopleOutlinedIcon from '@mui/icons-material/PeopleOutlined';
import GraphAvatar from '@/components/GraphAvatar';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { usePresence } from '@/hooks/usePresence';

interface StudentBatch {
  id: string;
  name: string;
}

interface EnrolledStudent {
  id: string;
  name: string;
  email: string | null;
  avatar_url: string | null;
  ms_oid: string | null;
  batch: StudentBatch | null;
  attendance: { attended: number; total: number; percentage: number };
  checklist: { completed: number; total: number };
}

export default function TeacherStudents() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const router = useRouter();
  const { activeClassroom, getToken } = useNexusAuthContext();
  const [students, setStudents] = useState<EnrolledStudent[]>([]);
  const [batches, setBatches] = useState<StudentBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [batchFilter, setBatchFilter] = useState<string | null>(null);
  const [snackbar, setSnackbar] = useState<string | null>(null);

  useEffect(() => {
    if (!activeClassroom) return;

    async function fetchStudents() {
      setLoading(true);
      try {
        const token = await getToken();
        if (!token) return;

        let url = `/api/students?classroom=${activeClassroom!.id}`;
        if (batchFilter) url += `&batch=${batchFilter}`;

        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (res.ok) {
          const data = await res.json();
          setStudents(data.students || []);
          if (data.batches) setBatches(data.batches);
        }
      } catch (err) {
        console.error('Failed to load students:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchStudents();
  }, [activeClassroom, getToken, batchFilter]);

  // Bulk presence for all loaded students
  const { presenceMap } = usePresence(students.map((s) => s.ms_oid));

  const filteredStudents = students.filter((s) => {
    const query = searchQuery.toLowerCase();
    return (
      s.name.toLowerCase().includes(query) ||
      (s.email && s.email.toLowerCase().includes(query))
    );
  });

  const handleCopyEmail = useCallback((e: React.MouseEvent, email: string) => {
    e.stopPropagation(); // Don't navigate to student detail
    navigator.clipboard.writeText(email).then(() => {
      setSnackbar(`Copied ${email}`);
    });
  }, []);

  return (
    <Box>
      <Typography variant="h5" component="h1" sx={{ fontWeight: 700, mb: 1 }}>
        Students
      </Typography>

      {/* Tab navigation */}
      <Tabs
        value={0}
        sx={{
          mb: 2,
          minHeight: 40,
          '& .MuiTab-root': { minHeight: 40, textTransform: 'none', fontWeight: 600 },
        }}
      >
        <Tab icon={<PeopleOutlinedIcon sx={{ fontSize: 18 }} />} iconPosition="start" label="All Students" />
        <Tab
          icon={<MapOutlinedIcon sx={{ fontSize: 18 }} />}
          iconPosition="start"
          label="City-Wise"
          onClick={() => router.push('/teacher/students/city-wise')}
        />
      </Tabs>

      {/* Search */}
      <TextField
        fullWidth
        placeholder="Search by name or email..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        size="small"
        sx={{ mb: 1.5 }}
        inputProps={{ style: { minHeight: 24 } }}
      />

      {/* Batch filter chips */}
      {batches.length > 0 && (
        <Box sx={{ display: 'flex', gap: 1, mb: 2, overflowX: 'auto', pb: 0.5 }}>
          <Chip
            label="All"
            size="small"
            variant={batchFilter === null ? 'filled' : 'outlined'}
            color={batchFilter === null ? 'primary' : 'default'}
            onClick={() => setBatchFilter(null)}
            sx={{ minHeight: 32 }}
          />
          {batches.map((b) => (
            <Chip
              key={b.id}
              label={b.name}
              size="small"
              variant={batchFilter === b.id ? 'filled' : 'outlined'}
              color={batchFilter === b.id ? 'primary' : 'default'}
              onClick={() => setBatchFilter(b.id)}
              sx={{ minHeight: 32 }}
            />
          ))}
          <Chip
            label="Unassigned"
            size="small"
            variant={batchFilter === 'unassigned' ? 'filled' : 'outlined'}
            color={batchFilter === 'unassigned' ? 'warning' : 'default'}
            onClick={() => setBatchFilter('unassigned')}
            sx={{ minHeight: 32 }}
          />
        </Box>
      )}

      {/* Student List */}
      {loading ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} variant="rectangular" height={80} sx={{ borderRadius: 1 }} />
          ))}
        </Box>
      ) : filteredStudents.length === 0 ? (
        <Paper sx={{ p: 3, textAlign: 'center' }}>
          <Typography variant="body2" color="text.secondary">
            {searchQuery
              ? 'No students match your search.'
              : batchFilter
                ? 'No students in this batch.'
                : 'No students enrolled.'}
          </Typography>
        </Paper>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {filteredStudents.map((student) => {
            const checklistPct = student.checklist.total > 0
              ? Math.round((student.checklist.completed / student.checklist.total) * 100)
              : 0;

            return (
              <Paper
                key={student.id}
                variant="outlined"
                onClick={() => router.push(`/teacher/students/${student.id}`)}
                sx={{
                  p: 2,
                  cursor: 'pointer',
                  minHeight: 48,
                  borderRadius: 2,
                  '&:hover': { backgroundColor: 'action.hover' },
                  '&:active': { backgroundColor: 'action.selected' },
                }}
              >
                {/* Top row: Avatar + Name + Email action */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <GraphAvatar
                    msOid={student.ms_oid}
                    name={student.name}
                    size={isMobile ? 44 : 48}
                    presenceStatus={student.ms_oid ? presenceMap[student.ms_oid]?.availability : undefined}
                  />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <Typography
                        variant="body1"
                        sx={{ fontWeight: 600, fontSize: { xs: '0.9rem', sm: '1rem' } }}
                        noWrap
                      >
                        {student.name}
                      </Typography>
                      {student.batch && (
                        <Chip
                          label={student.batch.name}
                          size="small"
                          variant="outlined"
                          sx={{ height: 20, fontSize: '0.7rem', flexShrink: 0 }}
                        />
                      )}
                    </Box>

                    {/* Email: visible on desktop, hidden on mobile */}
                    {student.email && !isMobile && (
                      <Typography variant="body2" color="text.secondary" noWrap>
                        {student.email}
                      </Typography>
                    )}
                  </Box>

                  {/* Copy email icon on mobile */}
                  {student.email && isMobile && (
                    <Tooltip title={student.email} arrow>
                      <IconButton
                        size="small"
                        onClick={(e) => handleCopyEmail(e, student.email!)}
                        sx={{
                          flexShrink: 0,
                          width: 36,
                          height: 36,
                          bgcolor: alpha(theme.palette.primary.main, 0.08),
                          color: 'primary.main',
                          '&:active': { bgcolor: alpha(theme.palette.primary.main, 0.16) },
                        }}
                      >
                        <ContentCopyOutlinedIcon sx={{ fontSize: '1rem' }} />
                      </IconButton>
                    </Tooltip>
                  )}

                  {/* Copy email icon on desktop (inline after email) */}
                  {student.email && !isMobile && (
                    <Tooltip title="Copy email">
                      <IconButton
                        size="small"
                        onClick={(e) => handleCopyEmail(e, student.email!)}
                        sx={{ flexShrink: 0, opacity: 0.5, '&:hover': { opacity: 1 } }}
                      >
                        <ContentCopyOutlinedIcon sx={{ fontSize: '0.9rem' }} />
                      </IconButton>
                    </Tooltip>
                  )}
                </Box>

                {/* Bottom row: Stats */}
                <Box
                  sx={{
                    display: 'flex',
                    gap: 0.75,
                    mt: 1,
                    ml: { xs: 0, sm: 7.5 },
                    alignItems: 'center',
                  }}
                >
                  <Chip
                    label={`${student.attendance.percentage}% att`}
                    size="small"
                    color={student.attendance.percentage >= 75 ? 'success' : 'warning'}
                    variant="outlined"
                    sx={{ height: 22, fontSize: '0.7rem', fontWeight: 600 }}
                  />
                  <Chip
                    label={`${checklistPct}% done`}
                    size="small"
                    color={checklistPct >= 50 ? 'info' : 'default'}
                    variant="outlined"
                    sx={{ height: 22, fontSize: '0.7rem', fontWeight: 600 }}
                  />
                  {/* Show truncated email as subtle text on mobile */}
                  {student.email && isMobile && (
                    <Typography
                      variant="caption"
                      color="text.disabled"
                      noWrap
                      sx={{ ml: 'auto', maxWidth: 120, fontSize: '0.65rem' }}
                    >
                      {student.email}
                    </Typography>
                  )}
                </Box>
              </Paper>
            );
          })}
        </Box>
      )}

      {/* Copy confirmation snackbar */}
      <Snackbar
        open={!!snackbar}
        autoHideDuration={2000}
        onClose={() => setSnackbar(null)}
        message={snackbar}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        sx={{
          '& .MuiSnackbarContent-root': {
            minWidth: 'auto',
            borderRadius: 2,
            fontSize: '0.85rem',
          },
        }}
      />
    </Box>
  );
}
