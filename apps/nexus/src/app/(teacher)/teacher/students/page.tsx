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
  MenuItem,
  IconButton,
  Snackbar,
  Tooltip,
  ToggleButton,
  ToggleButtonGroup,
  useTheme,
  useMediaQuery,
  alpha,
} from '@neram/ui';
import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined';
import PeopleOutlinedIcon from '@mui/icons-material/PeopleOutlined';
import EventAvailableOutlinedIcon from '@mui/icons-material/EventAvailableOutlined';
import DensitySmallOutlinedIcon from '@mui/icons-material/DensitySmallOutlined';
import GridViewOutlinedIcon from '@mui/icons-material/GridViewOutlined';
import ViewAgendaOutlinedIcon from '@mui/icons-material/ViewAgendaOutlined';
import GraphAvatar from '@/components/GraphAvatar';
import ViewAsStudentButton from '@/components/ViewAsStudentButton';
import AvailableStudentsSection from '@/components/AvailableStudentsSection';
import EmailDomainFlag from '@/components/students/EmailDomainFlag';
import type { EmailDomainStatus } from '@/lib/classroom-email';
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
  email_status: EmailDomainStatus; // class-domain status of the shown email
  avatar_url: string | null;
  ms_oid: string | null;
  batch: StudentBatch | null; // classroom section (nexus_batches)
  exam_batch: string | null; // exam-year cohort (users.academic_year)
  attendance: { attended: number; total: number; percentage: number };
  checklist: { completed: number; total: number };
}

/** Thin labeled progress bar (attendance / checklist), clearer than a plain chip. */
function Meter({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <Box sx={{ minWidth: 92, flex: '0 1 130px' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', mb: 0.25 }}>
        <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.68rem', fontWeight: 600 }}>
          {label}
        </Typography>
        <Typography variant="caption" sx={{ fontSize: '0.72rem', fontWeight: 700, color }}>
          {value}%
        </Typography>
      </Box>
      <Box sx={{ height: 5, borderRadius: 3, bgcolor: alpha(color, 0.16), overflow: 'hidden' }}>
        <Box sx={{ height: '100%', width: `${Math.min(100, Math.max(0, value))}%`, bgcolor: color, borderRadius: 3, transition: 'width .3s ease' }} />
      </Box>
    </Box>
  );
}

/** Density modes for the roster: dense scan list, avatar card grid, or roomy rows. */
type ViewMode = 'compact' | 'cards' | 'detailed';
const VIEW_STORAGE_KEY = 'nexus:students:view';

/** Compact colored pill showing a single percentage stat (used in the dense list). */
function StatPill({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <Box
      sx={{ display: 'flex', alignItems: 'center', gap: 0.5, px: 0.85, height: 22, borderRadius: 1.5, bgcolor: alpha(color, 0.12), flexShrink: 0 }}
    >
      <Typography component="span" sx={{ fontSize: '0.58rem', fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '0.3px', lineHeight: 1 }}>
        {label}
      </Typography>
      <Typography component="span" sx={{ fontSize: '0.72rem', fontWeight: 800, color, lineHeight: 1 }}>
        {value}%
      </Typography>
    </Box>
  );
}

/** Copy-email icon button shared by every view mode. */
function CopyEmailButton({ email, title, onCopy }: { email: string; title: string; onCopy: (e: React.MouseEvent, email: string) => void }) {
  return (
    <Tooltip title={title} arrow>
      <IconButton
        size="small"
        aria-label="Copy email"
        onClick={(e) => onCopy(e, email)}
        sx={{
          flexShrink: 0,
          width: 40,
          height: 40,
          color: 'primary.main',
          bgcolor: (t) => alpha(t.palette.primary.main, 0.06),
          '&:hover': { bgcolor: (t) => alpha(t.palette.primary.main, 0.14) },
        }}
      >
        <ContentCopyOutlinedIcon sx={{ fontSize: '1rem' }} />
      </IconButton>
    </Tooltip>
  );
}

interface StudentRowProps {
  student: EnrolledStudent;
  checklistPct: number;
  attColor: string;
  doneColor: string;
  presenceStatus?: string | null;
  isMobile: boolean;
  onOpen: () => void;
  onCopy: (e: React.MouseEvent, email: string) => void;
}

/** Compact: single-line scan row. Small avatar, name, muted email, tiny stat pills. */
function CompactRow({ student, checklistPct, attColor, doneColor, presenceStatus, onOpen, onCopy }: StudentRowProps) {
  return (
    <Paper
      variant="outlined"
      onClick={onOpen}
      sx={{
        px: 1.5,
        py: 1,
        cursor: 'pointer',
        minHeight: 56,
        display: 'flex',
        alignItems: 'center',
        gap: 1.25,
        borderRadius: 2,
        transition: 'background-color .2s, border-color .2s',
        '&:hover': { backgroundColor: 'action.hover', borderColor: (t) => alpha(t.palette.primary.main, 0.4) },
        '&:active': { backgroundColor: 'action.selected' },
      }}
    >
      <GraphAvatar msOid={student.ms_oid} name={student.name} size={36} tapToView={false} presenceStatus={presenceStatus} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0 }}>
          <Typography noWrap sx={{ fontWeight: 700, fontSize: '0.9rem' }}>
            {student.name}
          </Typography>
          {student.exam_batch && (
            <Chip label={student.exam_batch} size="small" color="primary" sx={{ height: 18, fontSize: '0.62rem', fontFamily: 'monospace', flexShrink: 0 }} />
          )}
          <EmailDomainFlag status={student.email_status} />
        </Box>
        {student.email && (
          <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block', fontSize: '0.72rem', lineHeight: 1.3 }}>
            {student.email}
          </Typography>
        )}
      </Box>
      <Box sx={{ display: { xs: 'none', sm: 'flex' }, gap: 0.75, flexShrink: 0 }}>
        <StatPill label="Att" value={student.attendance.percentage} color={attColor} />
        <StatPill label="List" value={checklistPct} color={doneColor} />
      </Box>
      {student.email && <CopyEmailButton email={student.email} title="Copy email" onCopy={onCopy} />}
      <Box onClick={(e) => e.stopPropagation()} sx={{ display: 'flex', flexShrink: 0 }}>
        <ViewAsStudentButton studentId={student.id} reason={`Student list: ${student.name}`} iconOnly />
      </Box>
    </Paper>
  );
}

/** Cards: avatar tile with chips + both progress meters, laid out in a grid. */
function StudentCard({ student, checklistPct, attColor, doneColor, presenceStatus, onOpen, onCopy }: StudentRowProps) {
  return (
    <Paper
      variant="outlined"
      onClick={onOpen}
      sx={{
        p: 2,
        cursor: 'pointer',
        borderRadius: 2.5,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: 1.25,
        transition: 'background-color .2s, border-color .2s, box-shadow .2s',
        '&:hover': {
          backgroundColor: 'action.hover',
          borderColor: (t) => alpha(t.palette.primary.main, 0.4),
          boxShadow: (t) => `0 4px 14px ${alpha(t.palette.primary.main, 0.1)}`,
        },
        '&:active': { backgroundColor: 'action.selected' },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
        <GraphAvatar msOid={student.ms_oid} name={student.name} size={48} tapToView={false} presenceStatus={presenceStatus} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography noWrap sx={{ fontWeight: 700, fontSize: '0.95rem' }}>
            {student.name}
          </Typography>
          {student.email && (
            <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
              {student.email}
            </Typography>
          )}
          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.5 }}>
            {student.exam_batch && (
              <Chip label={student.exam_batch} size="small" color="primary" sx={{ height: 20, fontSize: '0.68rem', fontFamily: 'monospace' }} />
            )}
            {student.batch && <Chip label={student.batch.name} size="small" variant="outlined" sx={{ height: 20, fontSize: '0.68rem' }} />}
            <EmailDomainFlag status={student.email_status} />
          </Box>
        </Box>
      </Box>
      <Box sx={{ display: 'flex', gap: 2, mt: 'auto', pt: 0.5 }}>
        <Meter label="Attendance" value={student.attendance.percentage} color={attColor} />
        <Meter label="Checklist" value={checklistPct} color={doneColor} />
      </Box>
      <Box onClick={(e) => e.stopPropagation()} sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end', alignItems: 'center' }}>
        {student.email && <CopyEmailButton email={student.email} title="Copy email" onCopy={onCopy} />}
        <ViewAsStudentButton studentId={student.id} reason={`Student list: ${student.name}`} iconOnly />
      </Box>
    </Paper>
  );
}

/** Detailed: the roomy two-row layout (avatar + chips on top, full meters below). */
function DetailedRow({ student, checklistPct, attColor, doneColor, presenceStatus, isMobile, onOpen, onCopy }: StudentRowProps) {
  return (
    <Paper
      variant="outlined"
      onClick={onOpen}
      sx={{
        p: 2,
        cursor: 'pointer',
        minHeight: 48,
        borderRadius: 2,
        transition: 'background-color .2s, border-color .2s, box-shadow .2s',
        '&:hover': {
          backgroundColor: 'action.hover',
          borderColor: (t) => alpha(t.palette.primary.main, 0.4),
          boxShadow: (t) => `0 2px 10px ${alpha(t.palette.primary.main, 0.08)}`,
        },
        '&:active': { backgroundColor: 'action.selected' },
      }}
    >
      {/* Top row: Avatar + Name + actions */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <GraphAvatar msOid={student.ms_oid} name={student.name} size={isMobile ? 44 : 48} tapToView={false} presenceStatus={presenceStatus} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
            <Typography variant="body1" sx={{ fontWeight: 700, fontSize: { xs: '0.92rem', sm: '1rem' } }} noWrap>
              {student.name}
            </Typography>
            {student.exam_batch && (
              <Chip label={student.exam_batch} size="small" color="primary" sx={{ height: 20, fontSize: '0.7rem', flexShrink: 0, fontFamily: 'monospace' }} />
            )}
            {student.batch && <Chip label={student.batch.name} size="small" variant="outlined" sx={{ height: 20, fontSize: '0.7rem', flexShrink: 0 }} />}
            <EmailDomainFlag status={student.email_status} />
          </Box>
          {student.email && !isMobile && (
            <Typography variant="body2" color="text.secondary" noWrap>
              {student.email}
            </Typography>
          )}
        </Box>
        {student.email && <CopyEmailButton email={student.email} title={isMobile ? student.email : 'Copy email'} onCopy={onCopy} />}
        <Box onClick={(e) => e.stopPropagation()} sx={{ display: 'flex', flexShrink: 0 }}>
          <ViewAsStudentButton studentId={student.id} reason={`Student list: ${student.name}`} iconOnly />
        </Box>
      </Box>
      {/* Bottom row: progress meters */}
      <Box sx={{ display: 'flex', gap: 2, mt: 1.25, ml: { xs: 0, sm: 7.5 }, alignItems: 'center', flexWrap: 'wrap' }}>
        <Meter label="Attendance" value={student.attendance.percentage} color={attColor} />
        <Meter label="Checklist" value={checklistPct} color={doneColor} />
        {student.email && isMobile && (
          <Typography variant="caption" color="text.disabled" noWrap sx={{ ml: 'auto', maxWidth: 130, fontSize: '0.65rem' }}>
            {student.email}
          </Typography>
        )}
      </Box>
    </Paper>
  );
}

/** Per-view loading skeleton (shape matches the chosen density). */
function StudentListSkeleton({ viewMode }: { viewMode: ViewMode }) {
  if (viewMode === 'cards') {
    return (
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' }, gap: 1.5 }}>
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <Skeleton key={i} variant="rectangular" height={158} sx={{ borderRadius: 2.5 }} />
        ))}
      </Box>
    );
  }
  const h = viewMode === 'compact' ? 56 : 92;
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: viewMode === 'compact' ? 1 : 1.5 }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Skeleton key={i} variant="rectangular" height={h} sx={{ borderRadius: 2 }} />
      ))}
    </Box>
  );
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
  // Exam-year cohort filter (users.academic_year). Default to the ACTIVE cohort
  // (current + upcoming years); graduated/alumni students are never shown.
  const [examBatches, setExamBatches] = useState<{ code: string }[]>([]);
  // Default 'current' = the current exam-year cohort PLUS any upcoming years
  // (and untagged), so the primary view is the batch the teacher runs now
  // together with students already enrolled for a future batch. Past cohorts are
  // hidden by default (near-zero hold access, and they are managed in Admin);
  // switch to 'All with access' to include any re-added past student.
  const [examBatchFilter, setExamBatchFilter] = useState<string>('current');
  const [currentBatch, setCurrentBatch] = useState<string | null>(null);
  const [snackbar, setSnackbar] = useState<string | null>(null);
  // Density mode for the roster. Default 'compact' (best for scanning a long
  // list); restored from localStorage after mount to avoid SSR hydration drift.
  const [viewMode, setViewMode] = useState<ViewMode>('compact');

  useEffect(() => {
    try {
      const saved = localStorage.getItem(VIEW_STORAGE_KEY);
      if (saved === 'compact' || saved === 'cards' || saved === 'detailed') setViewMode(saved);
    } catch {
      /* localStorage unavailable, keep default */
    }
  }, []);

  const handleViewModeChange = useCallback((_e: React.MouseEvent<HTMLElement>, next: ViewMode | null) => {
    if (!next) return; // ignore de-select (a mode is always active)
    setViewMode(next);
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, next);
    } catch {
      /* non-fatal */
    }
  }, []);

  // Load the exam-year batch list once (for the filter dropdown).
  useEffect(() => {
    async function loadExamBatches() {
      try {
        const token = await getToken();
        if (!token) return;
        const res = await fetch('/api/batches', { headers: { Authorization: `Bearer ${token}` } });
        if (res.ok) {
          const data = await res.json();
          setExamBatches(data.batches || []);
          if (data.current?.code) setCurrentBatch(data.current.code);
        }
      } catch {
        /* non-fatal */
      }
    }
    loadExamBatches();
  }, [getToken]);

  const fetchStudents = useCallback(async () => {
    if (!activeClassroom) return;
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) return;

      let url = `/api/students?classroom=${activeClassroom.id}`;
      if (batchFilter) url += `&batch=${batchFilter}`;
      if (examBatchFilter && examBatchFilter !== 'all') url += `&examBatch=${examBatchFilter}`;

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        setStudents(data.students || []);
        if (data.batches) setBatches(data.batches);
        if (data.currentBatch) setCurrentBatch(data.currentBatch);
      }
    } catch (err) {
      console.error('Failed to load students:', err);
    } finally {
      setLoading(false);
    }
  }, [activeClassroom, getToken, batchFilter, examBatchFilter]);

  useEffect(() => {
    fetchStudents();
  }, [fetchStudents]);

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
      {/* Context header: scope of what's shown (active students only) */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 2 }}>
        <Chip
          icon={<PeopleOutlinedIcon sx={{ fontSize: 18 }} />}
          label={loading ? 'Loading…' : `${filteredStudents.length} active`}
          color="primary"
          sx={{ fontWeight: 700 }}
        />
        {currentBatch && (
          <Chip
            icon={<EventAvailableOutlinedIcon sx={{ fontSize: 18 }} />}
            label={`Current batch ${currentBatch}`}
            variant="outlined"
            sx={{ fontWeight: 600 }}
          />
        )}
        <Typography variant="caption" color="text.secondary" sx={{ ml: { sm: 'auto' }, width: { xs: '100%', sm: 'auto' } }}>
          Current and upcoming batches with Nexus access. Add anyone not yet in class below. Switch Exam year to All with access to see re-added past students. Graduated students are managed in Admin.
        </Typography>
      </Box>

      {/* Sticky search + filters */}
      <Box
        sx={{
          position: 'sticky',
          top: 0,
          zIndex: 5,
          pt: 0.5,
          pb: 1,
          mb: 1,
          bgcolor: (t) => (t.palette.mode === 'light' ? '#FAFAFA' : t.palette.background.default),
        }}
      >
        <TextField
          fullWidth
          placeholder="Search by name or email..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          size="small"
          sx={{ mb: 1.5, '& .MuiOutlinedInput-root': { borderRadius: 2.5, bgcolor: 'background.paper' } }}
          inputProps={{ style: { minHeight: 24 } }}
        />

        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Exam-year cohort filter (users.academic_year) */}
          <TextField
            select
            size="small"
            label="Exam year"
            value={examBatchFilter}
            onChange={(e) => setExamBatchFilter(e.target.value)}
            sx={{ minWidth: 190, '& .MuiOutlinedInput-root': { borderRadius: 2, bgcolor: 'background.paper' } }}
          >
            <MenuItem value="current">Current + upcoming</MenuItem>
            <MenuItem value="all">All with access</MenuItem>
            {examBatches.map((b) => (
              <MenuItem key={b.code} value={b.code}>
                {b.code}
              </MenuItem>
            ))}
            <MenuItem value="none">No exam year set</MenuItem>
          </TextField>

          {/* Classroom section (nexus_batches) filter chips */}
          {batches.length > 0 && (
            <Box sx={{ display: 'flex', gap: 0.75, overflowX: 'auto', pb: 0.5, '&::-webkit-scrollbar': { display: 'none' } }}>
              <Chip
                label="All sections"
                size="small"
                variant={batchFilter === null ? 'filled' : 'outlined'}
                color={batchFilter === null ? 'primary' : 'default'}
                onClick={() => setBatchFilter(null)}
                sx={{ minHeight: 32, flexShrink: 0 }}
              />
              {batches.map((b) => (
                <Chip
                  key={b.id}
                  label={b.name}
                  size="small"
                  variant={batchFilter === b.id ? 'filled' : 'outlined'}
                  color={batchFilter === b.id ? 'primary' : 'default'}
                  onClick={() => setBatchFilter(b.id)}
                  sx={{ minHeight: 32, flexShrink: 0 }}
                />
              ))}
              <Chip
                label="Unassigned"
                size="small"
                variant={batchFilter === 'unassigned' ? 'filled' : 'outlined'}
                color={batchFilter === 'unassigned' ? 'warning' : 'default'}
                onClick={() => setBatchFilter('unassigned')}
                sx={{ minHeight: 32, flexShrink: 0 }}
              />
            </Box>
          )}

          {/* Density switch: dense scan list / avatar cards / roomy rows */}
          <ToggleButtonGroup
            value={viewMode}
            exclusive
            onChange={handleViewModeChange}
            size="small"
            aria-label="Student list layout"
            sx={{
              ml: { sm: 'auto' },
              bgcolor: 'background.paper',
              borderRadius: 2,
              '& .MuiToggleButton-root': {
                minWidth: 44,
                minHeight: 40,
                px: 1.25,
                borderRadius: 2,
                color: 'text.secondary',
              },
              '& .Mui-selected': {
                bgcolor: (t) => alpha(t.palette.primary.main, 0.14),
                color: 'primary.main',
                '&:hover': { bgcolor: (t) => alpha(t.palette.primary.main, 0.2) },
              },
            }}
          >
            <ToggleButton value="compact" aria-label="Compact list">
              <Tooltip title="Compact" arrow>
                <DensitySmallOutlinedIcon fontSize="small" />
              </Tooltip>
            </ToggleButton>
            <ToggleButton value="cards" aria-label="Card grid">
              <Tooltip title="Cards" arrow>
                <GridViewOutlinedIcon fontSize="small" />
              </Tooltip>
            </ToggleButton>
            <ToggleButton value="detailed" aria-label="Detailed rows">
              <Tooltip title="Detailed" arrow>
                <ViewAgendaOutlinedIcon fontSize="small" />
              </Tooltip>
            </ToggleButton>
          </ToggleButtonGroup>
        </Box>
      </Box>

      {/* Student List */}
      {loading ? (
        <StudentListSkeleton viewMode={viewMode} />
      ) : filteredStudents.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 5, textAlign: 'center', borderRadius: 2, borderStyle: 'dashed' }}>
          <PeopleOutlinedIcon sx={{ fontSize: 44, color: 'text.disabled', mb: 1 }} />
          <Typography variant="body1" sx={{ fontWeight: 600 }}>
            {searchQuery
              ? 'No students match your search'
              : batchFilter
                ? 'No students in this section'
                : examBatchFilter === 'none'
                  ? 'No students without an exam year'
                  : 'No active students yet'}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {searchQuery
              ? 'Try a different name or email.'
              : 'Students appear here once you add them to the class below.'}
          </Typography>
        </Paper>
      ) : (
        <Box
          sx={
            viewMode === 'cards'
              ? { display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' }, gap: 1.5 }
              : { display: 'flex', flexDirection: 'column', gap: viewMode === 'compact' ? 1 : 1.5 }
          }
        >
          {filteredStudents.map((student) => {
            const checklistPct = student.checklist.total > 0
              ? Math.round((student.checklist.completed / student.checklist.total) * 100)
              : 0;
            const attColor = student.attendance.percentage >= 75 ? theme.palette.success.main : theme.palette.warning.main;
            const doneColor = checklistPct >= 50 ? theme.palette.info.main : theme.palette.text.disabled;
            const presenceStatus = student.ms_oid ? presenceMap[student.ms_oid]?.availability : undefined;

            const rowProps = {
              student,
              checklistPct,
              attColor,
              doneColor,
              presenceStatus,
              isMobile,
              onOpen: () => router.push(`/teacher/students/${student.id}`),
              onCopy: handleCopyEmail,
            };

            if (viewMode === 'compact') return <CompactRow key={student.id} {...rowProps} />;
            if (viewMode === 'cards') return <StudentCard key={student.id} {...rowProps} />;
            return <DetailedRow key={student.id} {...rowProps} />;
          })}
        </Box>
      )}

      {/* Add students who are not yet in this classroom (reads the live Microsoft
          directory, so their @neramclasses.com address shows correctly). */}
      {activeClassroom && (
        <Box sx={{ mt: 2 }}>
          <AvailableStudentsSection
            classroomId={activeClassroom.id}
            getToken={getToken}
            onEnrolled={fetchStudents}
          />
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
