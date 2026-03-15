'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  Typography,
  Paper,
  Chip,
  Skeleton,
  TextField,
} from '@neram/ui';
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
  const router = useRouter();
  const { activeClassroom, getToken } = useNexusAuthContext();
  const [students, setStudents] = useState<EnrolledStudent[]>([]);
  const [batches, setBatches] = useState<StudentBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [batchFilter, setBatchFilter] = useState<string | null>(null);

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

  return (
    <Box>
      <Typography variant="h5" component="h1" sx={{ fontWeight: 700, mb: 2 }}>
        Students
      </Typography>

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
          {filteredStudents.map((student) => (
            <Paper
              key={student.id}
              variant="outlined"
              onClick={() => router.push(`/teacher/students/${student.id}`)}
              sx={{
                p: 2,
                display: 'flex',
                alignItems: 'center',
                gap: 2,
                cursor: 'pointer',
                minHeight: 48,
                '&:hover': { backgroundColor: 'action.hover' },
                '&:active': { backgroundColor: 'action.selected' },
              }}
            >
              <GraphAvatar
                msOid={student.ms_oid}
                name={student.name}
                size={48}
                presenceStatus={student.ms_oid ? presenceMap[student.ms_oid]?.availability : undefined}
              />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Typography variant="body1" sx={{ fontWeight: 600 }} noWrap>
                    {student.name}
                  </Typography>
                  {student.batch && (
                    <Chip
                      label={student.batch.name}
                      size="small"
                      variant="outlined"
                      sx={{ height: 20, fontSize: '0.7rem' }}
                    />
                  )}
                </Box>
                {student.email && (
                  <Typography variant="body2" color="text.secondary" noWrap>
                    {student.email}
                  </Typography>
                )}
              </Box>
              <Box sx={{ display: 'flex', gap: 0.5, flexShrink: 0 }}>
                <Chip
                  label={`${student.attendance.percentage}% att`}
                  size="small"
                  color={student.attendance.percentage >= 75 ? 'success' : 'warning'}
                  variant="outlined"
                />
                <Chip
                  label={`${student.checklist.total > 0 ? Math.round((student.checklist.completed / student.checklist.total) * 100) : 0}% done`}
                  size="small"
                  color={student.checklist.total > 0 && (student.checklist.completed / student.checklist.total) >= 0.5 ? 'info' : 'default'}
                  variant="outlined"
                />
              </Box>
            </Paper>
          ))}
        </Box>
      )}
    </Box>
  );
}
