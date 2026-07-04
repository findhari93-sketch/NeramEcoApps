'use client';

import { useState, useEffect, useCallback, useMemo, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  Typography,
  Button,
  TextField,
  MenuItem,
  InputAdornment,
  UserAvatar,
  Chip,
  Paper,
  Card,
  Stack,
  CircularProgress,
  Alert,
  Checkbox,
  Tooltip,
  IconButton,
  Tabs,
  Tab,
  Link,
} from '@neram/ui';
import useMediaQuery from '@mui/material/useMediaQuery';
import HistoryEduIcon from '@mui/icons-material/HistoryEdu';
import EmojiEventsOutlinedIcon from '@mui/icons-material/EmojiEventsOutlined';
import RestoreIcon from '@mui/icons-material/Restore';
import EventIcon from '@mui/icons-material/Event';
import SearchIcon from '@mui/icons-material/Search';
import CloseIcon from '@mui/icons-material/Close';
import PeopleAltOutlinedIcon from '@mui/icons-material/PeopleAltOutlined';
import EventBusyOutlinedIcon from '@mui/icons-material/EventBusyOutlined';
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined';
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined';
import LinkedInIcon from '@mui/icons-material/LinkedIn';
import InstagramIcon from '@mui/icons-material/Instagram';
import VerifiedIcon from '@mui/icons-material/Verified';
import PersonAddAlt1Icon from '@mui/icons-material/PersonAddAlt1';
import LaptopMacIcon from '@mui/icons-material/LaptopMac';
import BadgeOutlinedIcon from '@mui/icons-material/BadgeOutlined';
import { useAdminProfile } from '@/contexts/AdminProfileContext';
import GraduateDialog from '../../../components/crm/GraduateDialog';
import SetAcademicYearDialog from '../../../components/crm/SetAcademicYearDialog';
import AlumniDetailDrawer from '../../../components/alumni/AlumniDetailDrawer';
import StudentDetailDrawer from '../../../components/alumni/StudentDetailDrawer';
import MarkStaffDialog from '../../../components/alumni/MarkStaffDialog';
import AlumniManualAddDialog from '../../../components/alumni/AlumniManualAddDialog';
import { academicYearOptions, currentAcademicYear, formatDate } from '../../../components/crm/academic-years';
import { useBatches } from '@/contexts/BatchContext';

interface StudentRow {
  id: string;
  name: string | null;
  email: string | null;
  avatar_url: string | null;
  ms_oid: string | null;
  academic_year: string | null;
  last_login_at: string | null;
  submission_count: number;
}

interface AlumniRow {
  id: string;
  name: string | null;
  email: string | null;
  avatar_url: string | null;
  academic_year: string | null;
  alumni_since: string | null;
  submission_count?: number;
  college_id?: string | null;
  college_name?: string | null;
  course_branch?: string | null;
  college_status?: string | null;
  linkedin_url?: string | null;
  instagram_url?: string | null;
  portfolio_url?: string | null;
  is_verified?: boolean;
  college_start_year?: number | null;
  expected_graduation_year?: number | null;
}

// ---- Enterprise neutral palette + single brand accent ----
const ACCENT = '#B45309'; // brand amber (primary actions / alumni)
const ACCENT_SOFT = 'rgba(180,83,9,0.10)';
const INK = '#0F172A'; // slate-900
const MUTED = '#64748B'; // slate-500
const LINE = '#E2E8F0'; // slate-200 (borders)
const LINE_SOFT = '#EEF2F6'; // row dividers
const HEAD_BG = '#F8FAFC'; // slate-50
const SEL_BG = '#FFF8F1'; // very soft amber for selected rows
const YEAR_OPTIONS = academicYearOptions();
const PAGE_SIZE = 30;
const numSx = { fontVariantNumeric: 'tabular-nums' } as const;

const yearChipSx = {
  height: 22,
  fontSize: 11,
  bgcolor: ACCENT_SOFT,
  color: ACCENT,
  fontWeight: 700,
  letterSpacing: 0.2,
} as const;

const colHeadSx = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: 0.6,
  color: MUTED,
} as const;

const STUDENT_GRID = '44px 1fr 132px 150px 120px';
const ALUMNI_GRID = '44px 1fr 132px 150px 72px';

function yearLabel(v: string): string {
  return v === 'all' ? 'All years' : v === 'none' ? 'No year set' : v;
}
function activityLabel(v: string): string {
  return v === 'all' ? 'All activity' : 'Inactive';
}

function StatTile({
  icon,
  label,
  value,
  color,
  active,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  value: number | string;
  color: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <Card
      onClick={onClick}
      variant="outlined"
      sx={{
        flex: 1,
        minWidth: 150,
        px: 1.5,
        py: 1.25,
        display: 'flex',
        alignItems: 'center',
        gap: 1.25,
        cursor: onClick ? 'pointer' : 'default',
        borderColor: active ? color : LINE,
        boxShadow: active ? `inset 0 0 0 1px ${color}` : 'none',
        borderRadius: 2,
        bgcolor: active ? `${color}0A` : 'background.paper',
        transition: 'border-color 150ms, background-color 150ms',
        '&:hover': onClick ? { borderColor: color } : undefined,
      }}
    >
      <Box sx={{ width: 32, height: 32, borderRadius: 1.25, display: 'grid', placeItems: 'center', bgcolor: `${color}14`, color, flexShrink: 0 }}>
        {icon}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="h6" fontWeight={800} lineHeight={1.05} color={INK} sx={numSx}>
          {value}
        </Typography>
        <Typography sx={{ ...colHeadSx }} noWrap>
          {label}
        </Typography>
      </Box>
    </Card>
  );
}

function ActivityCell({ count }: { count: number }) {
  if (count === 0) {
    return (
      <Chip
        label="No work yet"
        size="small"
        sx={{ height: 22, fontSize: 11, bgcolor: 'rgba(100,116,139,0.12)', color: '#475569', fontWeight: 600 }}
      />
    );
  }
  return (
    <Typography variant="body2" color="text.secondary" sx={numSx}>
      {count} submission{count === 1 ? '' : 's'}
    </Typography>
  );
}

/** Compact, label-prefixed filter select (no floating-label notch). */
function FilterSelect({
  value,
  onChange,
  prefix,
  render,
  children,
}: {
  value: string;
  onChange: (v: string) => void;
  prefix: string;
  render: (v: string) => string;
  children: ReactNode;
}) {
  return (
    <TextField
      select
      size="small"
      fullWidth
      value={value}
      onChange={(e) => onChange(e.target.value)}
      sx={{ bgcolor: 'background.paper' }}
      SelectProps={{
        renderValue: (v) => (
          <Box component="span" sx={{ fontSize: 14 }}>
            <Box component="span" sx={{ color: MUTED, fontWeight: 600 }}>
              {prefix}:
            </Box>{' '}
            {render(v as string)}
          </Box>
        ),
      }}
    >
      {children}
    </TextField>
  );
}

export default function AlumniPage() {
  const router = useRouter();
  const { supabaseUserId } = useAdminProfile();
  // Follow the global exam-batch switch (profile menu) for the active-students tab.
  const { selectedBatch, resolvedBatchCode } = useBatches();
  const isMobile = useMediaQuery('(max-width:899px)', { noSsr: true });

  const [tab, setTab] = useState(0);
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  // Alumni headcount for the tab badge, fetched cheaply on mount so it is correct on
  // first paint while the full directory stays lazy (loaded only when the tab opens).
  const [alumniCount, setAlumniCount] = useState(0);

  // ---- Students (active) tab ----
  const [allStudents, setAllStudents] = useState<StudentRow[]>([]);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [sSearch, setSSearch] = useState('');
  const [sYear, setSYear] = useState('all'); // 'all' | 'none' | 'YYYY-YY'; synced from the global batch
  const [sActivity, setSActivity] = useState('all'); // 'all' | 'inactive'
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [graduateOpen, setGraduateOpen] = useState(false);
  const [setYearOpen, setSetYearOpen] = useState(false);
  const [studentDrawer, setStudentDrawer] = useState<StudentRow | null>(null);
  // People queued for the "Mark as staff" dialog (bulk selection or a single drawer row).
  const [markStaff, setMarkStaff] = useState<StudentRow[] | null>(null);

  // Follow the global exam-batch switch for the active-students tab. The alumni
  // directory tab (inherently past cohorts) keeps its own cohort browse below.
  useEffect(() => {
    if (selectedBatch === 'all') setSYear('all');
    else if (selectedBatch === 'none') setSYear('none');
    else if (resolvedBatchCode) setSYear(resolvedBatchCode);
  }, [selectedBatch, resolvedBatchCode]);

  // ---- Alumni tab (directory) ----
  const [alumni, setAlumni] = useState<AlumniRow[]>([]);
  const [alumniLoading, setAlumniLoading] = useState(false);
  const [aSearch, setASearch] = useState('');
  const [aYear, setAYear] = useState('');
  const [aCollege, setACollege] = useState('all');
  const [aCourse, setACourse] = useState('all');
  const [aVerified, setAVerified] = useState('all'); // 'all' | 'verified' | 'unverified'
  const [drawerUserId, setDrawerUserId] = useState<string | null>(null);
  const [manualAddOpen, setManualAddOpen] = useState(false);

  const loadStudents = useCallback(async () => {
    setStudentsLoading(true);
    try {
      const res = await fetch('/api/crm/alumni/students', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load students');
      setAllStudents(data.students || []);
      setSelection(new Set());
    } catch (err: any) {
      setBanner({ type: 'error', text: err?.message || 'Failed to load students' });
    } finally {
      setStudentsLoading(false);
    }
  }, []);

  const loadAlumni = useCallback(async () => {
    setAlumniLoading(true);
    try {
      const res = await fetch('/api/crm/alumni', { cache: 'no-store' });
      const data = await res.json();
      const list = data.alumni || [];
      setAlumni(list);
      setAlumniCount(list.length);
    } catch {
      setBanner({ type: 'error', text: 'Failed to load alumni' });
    } finally {
      setAlumniLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === 0) loadStudents();
    else loadAlumni();
  }, [tab, loadStudents, loadAlumni]);

  // Cheap headcount on mount so the Alumni tab badge is right from the start without
  // pulling the whole directory. The lazy list (loadAlumni) still owns the count once
  // the tab is opened; this only seeds the badge before that.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch('/api/crm/alumni/counts', { cache: 'no-store' });
        const data = await res.json();
        if (active && typeof data.alumni === 'number') setAlumniCount(data.alumni);
      } catch {
        /* badge falls back to the loaded list length */
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [sSearch, sYear, sActivity]);

  const stats = useMemo(
    () => ({
      total: allStudents.length,
      noYear: allStudents.filter((s) => !s.academic_year).length,
      inactive: allStudents.filter((s) => s.submission_count === 0).length,
    }),
    [allStudents],
  );

  const filteredStudents = useMemo(() => {
    let r = allStudents;
    const q = sSearch.trim().toLowerCase();
    if (q) r = r.filter((s) => (s.name || '').toLowerCase().includes(q) || (s.email || '').toLowerCase().includes(q));
    if (sYear === 'none') r = r.filter((s) => !s.academic_year);
    else if (sYear !== 'all') r = r.filter((s) => s.academic_year === sYear);
    if (sActivity === 'inactive') r = r.filter((s) => s.submission_count === 0);
    return r;
  }, [allStudents, sSearch, sYear, sActivity]);

  const visibleStudents = filteredStudents.slice(0, visibleCount);
  const selectedStudents = useMemo(() => allStudents.filter((s) => selection.has(s.id)), [allStudents, selection]);

  const allFilteredSelected = filteredStudents.length > 0 && filteredStudents.every((s) => selection.has(s.id));
  const someFilteredSelected = filteredStudents.some((s) => selection.has(s.id));

  const toggleStudent = (id: string) =>
    setSelection((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleSelectAllFiltered = () =>
    setSelection((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) filteredStudents.forEach((s) => next.delete(s.id));
      else filteredStudents.forEach((s) => next.add(s.id));
      return next;
    });

  const graduateDefaultYear = useMemo(() => {
    const years = new Set(selectedStudents.map((s) => s.academic_year).filter(Boolean) as string[]);
    if (years.size === 1) return [...years][0];
    if (sYear !== 'all' && sYear !== 'none') return sYear;
    return currentAcademicYear();
  }, [selectedStudents, sYear]);

  const setYearDefault = sYear !== 'all' && sYear !== 'none' ? sYear : currentAcademicYear();

  const handleSetYear = useCallback(
    async (academicYear: string) => {
      if (!supabaseUserId) throw new Error('Admin session not ready, try again in a moment.');
      const res = await fetch('/api/crm/alumni/set-year', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userIds: [...selection], academicYear, adminId: supabaseUserId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to set academic year');
      setSetYearOpen(false);
      setBanner({ type: 'success', text: `Set academic year ${academicYear} on ${data.updated} student(s).` });
      loadStudents();
    },
    [supabaseUserId, selection, loadStudents],
  );

  // Move the selected students into the Software course program. They leave the
  // architecture Students list (and its counts) and show up on the /software page,
  // and their Nexus access is kept off. Mirrors the graduate flow: drop the moved
  // rows immediately so the list behind the action is already correct.
  const moveToSoftware = useCallback(
    async (ids: string[]) => {
      if (!ids.length) return;
      if (!supabaseUserId) {
        setBanner({ type: 'error', text: 'Admin session not ready, try again in a moment.' });
        return;
      }
      try {
        const res = await fetch('/api/crm/alumni/set-program', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userIds: ids, program: 'software', adminId: supabaseUserId }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to move students');
        const moved = new Set(ids);
        setAllStudents((prev) => prev.filter((s) => !moved.has(s.id)));
        setSelection(new Set());
        setStudentDrawer(null);
        setBanner({ type: 'success', text: `Moved ${data.updated} student(s) to Software course.` });
      } catch (err: any) {
        setBanner({ type: 'error', text: err?.message || 'Failed to move students' });
      }
    },
    [supabaseUserId],
  );

  const handleGraduate = useCallback(
    async (opts: { academicYear: string; reason: string; offboardMicrosoft: boolean }) => {
      if (!supabaseUserId) throw new Error('Admin session not ready, try again in a moment.');
      const graduatedIds = [...selection];
      const res = await fetch('/api/crm/alumni/graduate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userIds: graduatedIds, adminId: supabaseUserId, ...opts }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to graduate students');
      // They are alumni now, drop them from the active list immediately (the list
      // behind the dialog is already correct before close) and refresh the alumni
      // tab so they appear there. A full reload still happens on close.
      const graduated = new Set(graduatedIds);
      setAllStudents((prev) => prev.filter((s) => !graduated.has(s.id)));
      setSelection(new Set());
      loadAlumni();
      return data;
    },
    [supabaseUserId, selection, loadAlumni],
  );

  const closeGraduate = useCallback(() => {
    setGraduateOpen(false);
    loadStudents();
  }, [loadStudents]);

  // Graduate a single student straight from their detail drawer: pre-select just
  // them and reuse the same GraduateDialog + handleGraduate flow as the batch path.
  const graduateSingle = useCallback((id: string) => {
    setStudentDrawer(null);
    setSelection(new Set([id]));
    setGraduateOpen(true);
  }, []);

  // "Mark as staff": someone tagged as a student is actually a staff member (e.g.
  // swept in by the Entra sync, which defaults imports to user_type='student').
  // Open the confirm dialog pre-loaded with the selection or a single drawer row.
  const markStaffSingle = useCallback(
    (id: string) => {
      const row = allStudents.find((s) => s.id === id);
      if (row) setMarkStaff([row]);
    },
    [allStudents],
  );

  // Confirm handler for MarkStaffDialog: set the chosen staff role, then drop the
  // moved rows from the Students list (they no longer match user_type='student').
  // Throws on failure so the dialog surfaces the error inline.
  const markAsStaff = useCallback(
    async (role: 'teacher' | 'admin') => {
      const ids = (markStaff || []).map((s) => s.id);
      if (!ids.length) return;
      if (!supabaseUserId) throw new Error('Admin session not ready, try again in a moment.');
      const res = await fetch('/api/crm/alumni/set-role', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userIds: ids, role, adminId: supabaseUserId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update role');
      const moved = new Set(ids);
      setAllStudents((prev) => prev.filter((s) => !moved.has(s.id)));
      setSelection(new Set());
      setStudentDrawer(null);
      const noun = data.updated === 1 ? 'person' : 'people';
      setBanner({ type: 'success', text: `Marked ${data.updated} ${noun} as ${role === 'admin' ? 'admin' : 'staff'}.` });
    },
    [markStaff, supabaseUserId],
  );

  const filteredAlumni = useMemo(() => {
    let r = alumni;
    const q = aSearch.trim().toLowerCase();
    if (q) r = r.filter((a) => (a.name || '').toLowerCase().includes(q) || (a.email || '').toLowerCase().includes(q));
    if (aYear) r = r.filter((a) => a.academic_year === aYear);
    if (aCollege !== 'all') r = r.filter((a) => (a.college_name || '(No college)') === aCollege);
    if (aCourse !== 'all') r = r.filter((a) => (a.course_branch || '(No course)') === aCourse);
    if (aVerified !== 'all') r = r.filter((a) => !!a.is_verified === (aVerified === 'verified'));
    return r;
  }, [alumni, aSearch, aYear, aCollege, aCourse, aVerified]);

  const alumniYears = useMemo(() => {
    const set = new Set<string>();
    for (const a of alumni) if (a.academic_year) set.add(a.academic_year);
    return Array.from(set).sort().reverse();
  }, [alumni]);

  const alumniColleges = useMemo(() => {
    const set = new Set<string>();
    for (const a of alumni) if (a.college_name) set.add(a.college_name);
    return Array.from(set).sort();
  }, [alumni]);

  const alumniCourses = useMemo(() => {
    const set = new Set<string>();
    for (const a of alumni) if (a.course_branch) set.add(a.course_branch);
    return Array.from(set).sort();
  }, [alumni]);

  const tabCount = (n: number) => (
    <Box
      component="span"
      sx={{ ml: 0.75, px: 0.75, py: 0.1, borderRadius: 1, fontSize: 11, fontWeight: 700, bgcolor: 'rgba(15,23,42,0.06)', color: MUTED, ...numSx }}
    >
      {n}
    </Box>
  );

  return (
    <Box sx={{ p: { xs: 1.5, md: 3 }, maxWidth: 1240, mx: 'auto' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 1.5, mb: 2.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box sx={{ width: 42, height: 42, borderRadius: 2, display: 'grid', placeItems: 'center', bgcolor: ACCENT_SOFT, color: ACCENT }}>
            <HistoryEduIcon />
          </Box>
          <Box>
            <Typography variant="h5" fontWeight={800} lineHeight={1.15} color={INK}>
              Alumni &amp; graduation
            </Typography>
            <Typography variant="body2" sx={{ color: MUTED }}>
              Tag students by year, graduate a finished batch, curate the Hall of Fame.
            </Typography>
          </Box>
        </Box>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <Button
            variant="outlined"
            startIcon={<PersonAddAlt1Icon />}
            onClick={() => setManualAddOpen(true)}
            sx={{ textTransform: 'none', borderRadius: 2, borderColor: LINE, color: INK }}
          >
            Add alumnus
          </Button>
          <Button
            variant="outlined"
            startIcon={<EmojiEventsOutlinedIcon />}
            onClick={() => router.push('/alumni/gallery')}
            sx={{ textTransform: 'none', borderRadius: 2, borderColor: LINE, color: INK }}
          >
            Hall of Fame
          </Button>
        </Box>
      </Box>

      {banner && (
        <Alert severity={banner.type} sx={{ mb: 2, borderRadius: 2 }} onClose={() => setBanner(null)}>
          {banner.text}
        </Alert>
      )}

      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v)}
        sx={{
          mb: 2.5,
          minHeight: 40,
          borderBottom: 1,
          borderColor: LINE,
          '& .MuiTab-root': { textTransform: 'none', fontWeight: 700, minHeight: 40, color: MUTED },
          '& .Mui-selected': { color: `${INK} !important` },
          '& .MuiTabs-indicator': { backgroundColor: ACCENT },
        }}
      >
        <Tab label={<Box sx={{ display: 'flex', alignItems: 'center' }}>Students{tabCount(stats.total)}</Box>} />
        <Tab label={<Box sx={{ display: 'flex', alignItems: 'center' }}>Alumni{tabCount(alumni.length || alumniCount)}</Box>} />
      </Tabs>

      {/* ============ STUDENTS TAB ============ */}
      {tab === 0 && (
        <>
          {/* KPI tiles (also quick filters) */}
          <Stack direction="row" spacing={1.5} sx={{ mb: 2, overflowX: 'auto', pb: 0.5 }}>
            <StatTile
              icon={<PeopleAltOutlinedIcon fontSize="small" />}
              label="ACTIVE STUDENTS"
              value={stats.total}
              color="#334155"
              active={sYear === 'all' && sActivity === 'all' && !sSearch}
              onClick={() => {
                setSYear('all');
                setSActivity('all');
                setSSearch('');
              }}
            />
            <StatTile
              icon={<EventBusyOutlinedIcon fontSize="small" />}
              label="NO ACADEMIC YEAR"
              value={stats.noYear}
              color={ACCENT}
              active={sYear === 'none'}
              onClick={() => {
                setSYear('none');
                setSActivity('all');
              }}
            />
            <StatTile
              icon={<VisibilityOffOutlinedIcon fontSize="small" />}
              label="INACTIVE (NO WORK)"
              value={stats.inactive}
              color="#64748B"
              active={sActivity === 'inactive'}
              onClick={() => {
                setSActivity('inactive');
                setSYear('all');
              }}
            />
          </Stack>

          {/* Sticky toolbar */}
          <Box sx={{ position: 'sticky', top: 0, zIndex: 5, bgcolor: 'background.default', pt: 0.5, pb: 1, mb: 1.25 }}>
            <Paper variant="outlined" sx={{ p: 1, borderRadius: 2, borderColor: LINE }}>
              <Box sx={{ display: 'grid', gap: 1, gridTemplateColumns: { xs: '1fr', sm: '1fr 200px 190px' } }}>
                <TextField
                  size="small"
                  fullWidth
                  placeholder="Search name or email"
                  value={sSearch}
                  onChange={(e) => setSSearch(e.target.value)}
                  sx={{ bgcolor: 'background.paper' }}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchIcon fontSize="small" sx={{ color: MUTED }} />
                      </InputAdornment>
                    ),
                    endAdornment: sSearch ? (
                      <InputAdornment position="end">
                        <IconButton size="small" onClick={() => setSSearch('')} edge="end" aria-label="Clear search">
                          <CloseIcon fontSize="small" />
                        </IconButton>
                      </InputAdornment>
                    ) : undefined,
                  }}
                />
                <FilterSelect value={sYear} onChange={setSYear} prefix="Year" render={yearLabel}>
                  <MenuItem value="all">All years</MenuItem>
                  <MenuItem value="none">No year set</MenuItem>
                  {YEAR_OPTIONS.map((y) => (
                    <MenuItem key={y} value={y}>
                      {y}
                    </MenuItem>
                  ))}
                </FilterSelect>
                <FilterSelect value={sActivity} onChange={setSActivity} prefix="Activity" render={activityLabel}>
                  <MenuItem value="all">All activity</MenuItem>
                  <MenuItem value="inactive">Inactive (no work)</MenuItem>
                </FilterSelect>
              </Box>
            </Paper>

            {selection.size > 0 && (
              <Paper
                elevation={0}
                sx={{
                  mt: 1,
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  gap: 1,
                  px: 1.5,
                  py: 1,
                  borderRadius: 2,
                  bgcolor: ACCENT_SOFT,
                  border: '1px solid',
                  borderColor: 'rgba(180,83,9,0.25)',
                }}
              >
                <Typography variant="body2" fontWeight={700} sx={{ color: ACCENT, ...numSx }}>
                  {selection.size} selected
                </Typography>
                <Box sx={{ flex: 1 }} />
                <Button size="small" startIcon={<EventIcon />} variant="outlined" onClick={() => setSetYearOpen(true)} sx={{ textTransform: 'none', borderRadius: 2, borderColor: LINE, color: INK, bgcolor: 'background.paper' }}>
                  Set year
                </Button>
                <Tooltip title="These students are in the software course, not architecture exam prep. Move them to the Software page and out of Nexus.">
                  <Button size="small" startIcon={<LaptopMacIcon />} variant="outlined" onClick={() => moveToSoftware([...selection])} sx={{ textTransform: 'none', borderRadius: 2, borderColor: LINE, color: INK, bgcolor: 'background.paper' }}>
                    Move to Software course
                  </Button>
                </Tooltip>
                <Tooltip title="These are staff (teachers/admins), not students. Mark them as staff to remove them from this list and give them the right Nexus access.">
                  <Button size="small" startIcon={<BadgeOutlinedIcon />} variant="outlined" onClick={() => setMarkStaff(selectedStudents)} sx={{ textTransform: 'none', borderRadius: 2, borderColor: LINE, color: INK, bgcolor: 'background.paper' }}>
                    Mark as staff
                  </Button>
                </Tooltip>
                <Button size="small" startIcon={<HistoryEduIcon />} variant="contained" onClick={() => setGraduateOpen(true)} sx={{ textTransform: 'none', borderRadius: 2, bgcolor: ACCENT, '&:hover': { bgcolor: '#92400E' } }}>
                  Graduate
                </Button>
                <Tooltip title="Clear selection">
                  <IconButton size="small" onClick={() => setSelection(new Set())}>
                    <CloseIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Paper>
            )}
          </Box>

          <Typography sx={{ ...colHeadSx, display: 'block', mb: 1 }}>
            {studentsLoading ? 'LOADING...' : `SHOWING ${visibleStudents.length} OF ${filteredStudents.length}`}
          </Typography>

          {studentsLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
              <CircularProgress />
            </Box>
          ) : filteredStudents.length === 0 ? (
            <Paper variant="outlined" sx={{ textAlign: 'center', py: 8, borderRadius: 2, borderColor: LINE }}>
              <PeopleAltOutlinedIcon sx={{ fontSize: 44, color: 'text.disabled', mb: 1 }} />
              <Typography sx={{ color: MUTED }}>No students match these filters.</Typography>
            </Paper>
          ) : isMobile ? (
            /* ---- Mobile: cards ---- */
            <Stack spacing={1.25}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 0.5 }}>
                <Checkbox size="small" checked={allFilteredSelected} indeterminate={!allFilteredSelected && someFilteredSelected} onChange={toggleSelectAllFiltered} />
                <Typography variant="body2" sx={{ color: MUTED }}>
                  Select all {filteredStudents.length}
                </Typography>
              </Box>
              {visibleStudents.map((s) => {
                const checked = selection.has(s.id);
                return (
                  <Card
                    key={s.id}
                    variant="outlined"
                    onClick={() => setStudentDrawer(s)}
                    sx={{
                      p: 1.5,
                      borderRadius: 2,
                      cursor: 'pointer',
                      borderColor: checked ? ACCENT : LINE,
                      bgcolor: checked ? SEL_BG : 'background.paper',
                      transition: 'border-color 150ms, background-color 150ms',
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.25 }}>
                      <Checkbox
                        size="small"
                        checked={checked}
                        onClick={(e) => e.stopPropagation()}
                        onChange={() => toggleStudent(s.id)}
                        sx={{ p: 0.25, mt: -0.25 }}
                      />
                      <UserAvatar src={s.avatar_url} name={s.name} size={40} tapToView={false} />
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="body2" fontWeight={700} color={INK} noWrap>
                          {s.name || 'Unnamed'}
                        </Typography>
                        <Typography variant="caption" sx={{ color: MUTED, display: 'block', mb: 0.75, wordBreak: 'break-all' }}>
                          {s.email || 'No email'}
                        </Typography>
                        <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap alignItems="center">
                          {s.academic_year ? (
                            <Chip label={s.academic_year} size="small" sx={yearChipSx} />
                          ) : (
                            <Chip label="No year" size="small" variant="outlined" sx={{ height: 22, fontSize: 11, borderColor: LINE }} />
                          )}
                          <ActivityCell count={s.submission_count} />
                          <Typography variant="caption" sx={{ color: '#94A3B8' }}>
                            · {s.last_login_at ? formatDate(s.last_login_at) : 'Never logged in'}
                          </Typography>
                        </Stack>
                      </Box>
                    </Box>
                  </Card>
                );
              })}
            </Stack>
          ) : (
            /* ---- Desktop: table ---- */
            <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden', borderColor: LINE }}>
              <Box sx={{ display: 'grid', gridTemplateColumns: STUDENT_GRID, alignItems: 'center', px: 1.5, py: 1, bgcolor: HEAD_BG, borderBottom: '1px solid', borderColor: LINE }}>
                <Checkbox size="small" checked={allFilteredSelected} indeterminate={!allFilteredSelected && someFilteredSelected} onChange={toggleSelectAllFiltered} sx={{ p: 0.5 }} />
                <Typography sx={colHeadSx}>STUDENT</Typography>
                <Typography sx={colHeadSx}>ACADEMIC YEAR</Typography>
                <Typography sx={colHeadSx}>ACTIVITY</Typography>
                <Typography sx={colHeadSx}>LAST LOGIN</Typography>
              </Box>
              {visibleStudents.map((s) => {
                const checked = selection.has(s.id);
                return (
                  <Box
                    key={s.id}
                    onClick={() => setStudentDrawer(s)}
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: STUDENT_GRID,
                      alignItems: 'center',
                      px: 1.5,
                      py: 0.75,
                      minHeight: 52,
                      cursor: 'pointer',
                      borderBottom: '1px solid',
                      borderColor: LINE_SOFT,
                      borderLeft: '3px solid',
                      borderLeftColor: checked ? ACCENT : 'transparent',
                      bgcolor: checked ? SEL_BG : 'transparent',
                      transition: 'background-color 120ms',
                      '&:hover': { bgcolor: checked ? SEL_BG : HEAD_BG },
                      '&:last-of-type': { borderBottom: 'none' },
                    }}
                  >
                    <Checkbox
                      size="small"
                      checked={checked}
                      onClick={(e) => e.stopPropagation()}
                      onChange={() => toggleStudent(s.id)}
                      sx={{ p: 0.5, ml: '-3px' }}
                    />
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0, pr: 1 }}>
                      <UserAvatar src={s.avatar_url} name={s.name} size={34} tapToView={false} />
                      <Box sx={{ minWidth: 0 }}>
                        <Typography variant="body2" fontWeight={600} color={INK} noWrap>
                          {s.name || 'Unnamed'}
                        </Typography>
                        <Typography variant="caption" sx={{ color: MUTED }} noWrap>
                          {s.email || 'No email'}
                        </Typography>
                      </Box>
                    </Box>
                    <Box>
                      {s.academic_year ? (
                        <Chip label={s.academic_year} size="small" sx={yearChipSx} />
                      ) : (
                        <Typography variant="caption" sx={{ color: '#94A3B8' }}>Not set</Typography>
                      )}
                    </Box>
                    <Box>
                      <ActivityCell count={s.submission_count} />
                    </Box>
                    <Typography variant="body2" sx={{ color: MUTED, ...numSx }}>
                      {s.last_login_at ? formatDate(s.last_login_at) : 'Never'}
                    </Typography>
                  </Box>
                );
              })}
            </Paper>
          )}

          {visibleCount < filteredStudents.length && (
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
              <Button variant="outlined" onClick={() => setVisibleCount((c) => c + PAGE_SIZE)} sx={{ textTransform: 'none', borderRadius: 2, borderColor: LINE, color: INK }}>
                Show more ({filteredStudents.length - visibleCount} remaining)
              </Button>
            </Box>
          )}
        </>
      )}

      {/* ============ ALUMNI TAB ============ */}
      {tab === 1 && (
        <>
          <Box sx={{ position: 'sticky', top: 0, zIndex: 5, bgcolor: 'background.default', pt: 0.5, pb: 1, mb: 1.25 }}>
            <Paper variant="outlined" sx={{ p: 1, borderRadius: 2, borderColor: LINE }}>
              <Box sx={{ display: 'grid', gap: 1, gridTemplateColumns: { xs: '1fr', md: '1fr 165px 1fr 165px 150px' } }}>
                <TextField
                  size="small"
                  fullWidth
                  placeholder="Search name or email"
                  value={aSearch}
                  onChange={(e) => setASearch(e.target.value)}
                  sx={{ bgcolor: 'background.paper' }}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchIcon fontSize="small" sx={{ color: MUTED }} />
                      </InputAdornment>
                    ),
                  }}
                />
                <FilterSelect value={aYear || 'all'} onChange={(v) => setAYear(v === 'all' ? '' : v)} prefix="Cohort" render={(v) => (v === 'all' ? 'All years' : v)}>
                  <MenuItem value="all">All years</MenuItem>
                  {alumniYears.map((y) => (
                    <MenuItem key={y} value={y}>
                      {y}
                    </MenuItem>
                  ))}
                </FilterSelect>
                <FilterSelect value={aCollege} onChange={setACollege} prefix="College" render={(v) => (v === 'all' ? 'All colleges' : v)}>
                  <MenuItem value="all">All colleges</MenuItem>
                  {alumniColleges.map((c) => (
                    <MenuItem key={c} value={c}>
                      {c}
                    </MenuItem>
                  ))}
                </FilterSelect>
                <FilterSelect value={aCourse} onChange={setACourse} prefix="Course" render={(v) => (v === 'all' ? 'All courses' : v)}>
                  <MenuItem value="all">All courses</MenuItem>
                  {alumniCourses.map((c) => (
                    <MenuItem key={c} value={c}>
                      {c}
                    </MenuItem>
                  ))}
                </FilterSelect>
                <FilterSelect value={aVerified} onChange={setAVerified} prefix="Status" render={(v) => (v === 'all' ? 'All' : v === 'verified' ? 'Verified' : 'Unverified')}>
                  <MenuItem value="all">All</MenuItem>
                  <MenuItem value="verified">Verified</MenuItem>
                  <MenuItem value="unverified">Unverified</MenuItem>
                </FilterSelect>
              </Box>
            </Paper>
          </Box>

          <Typography sx={{ ...colHeadSx, display: 'block', mb: 1 }}>
            {alumniLoading ? 'LOADING...' : `${filteredAlumni.length} ALUMNI`}
          </Typography>

          {alumniLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
              <CircularProgress />
            </Box>
          ) : filteredAlumni.length === 0 ? (
            <Paper variant="outlined" sx={{ textAlign: 'center', py: 8, borderRadius: 2, borderColor: LINE }}>
              <HistoryEduIcon sx={{ fontSize: 44, color: 'text.disabled', mb: 1 }} />
              <Typography sx={{ color: MUTED }}>No alumni match these filters.</Typography>
              <Typography variant="body2" sx={{ color: MUTED }}>
                Graduate a year&apos;s students from the Students tab, then enrich their profiles here.
              </Typography>
            </Paper>
          ) : (
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(3, 1fr)' }, gap: 1.5 }}>
              {filteredAlumni.map((a) => (
                <Card
                  key={a.id}
                  variant="outlined"
                  onClick={() => setDrawerUserId(a.id)}
                  sx={{
                    p: 1.5,
                    borderRadius: 2,
                    borderColor: LINE,
                    cursor: 'pointer',
                    transition: 'border-color 150ms, box-shadow 150ms',
                    '&:hover': { borderColor: ACCENT, boxShadow: 1 },
                  }}
                >
                  <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
                    <UserAvatar src={a.avatar_url} name={a.name} size={44} tapToView={false} />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <Typography variant="body2" fontWeight={700} color={INK} noWrap>
                          {a.name || 'Unnamed'}
                        </Typography>
                        {a.is_verified && <VerifiedIcon sx={{ fontSize: 15, color: '#16a34a', flexShrink: 0 }} />}
                      </Box>
                      <Typography variant="caption" sx={{ color: MUTED, display: 'block' }} noWrap>
                        {a.email || 'No email'}
                      </Typography>
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.75 }}>
                        {a.academic_year && <Chip label={a.academic_year} size="small" sx={yearChipSx} />}
                        {a.course_branch && <Chip label={a.course_branch} size="small" variant="outlined" sx={{ height: 22, fontSize: 11, borderColor: LINE }} />}
                      </Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.75 }}>
                        <SchoolOutlinedIcon sx={{ fontSize: 15, color: a.college_name ? MUTED : '#CBD5E1' }} />
                        <Typography variant="caption" sx={{ color: a.college_name ? INK : '#94A3B8' }} noWrap>
                          {a.college_name || 'College not set'}
                        </Typography>
                      </Box>
                    </Box>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }} onClick={(e) => e.stopPropagation()}>
                      {a.linkedin_url && (
                        <IconButton size="small" component={Link} href={a.linkedin_url.startsWith('http') ? a.linkedin_url : `https://${a.linkedin_url}`} target="_blank" rel="noopener" sx={{ color: '#0A66C2' }}>
                          <LinkedInIcon fontSize="small" />
                        </IconButton>
                      )}
                      {a.instagram_url && (
                        <IconButton size="small" component={Link} href={a.instagram_url.startsWith('http') ? a.instagram_url : `https://instagram.com/${a.instagram_url.replace(/^@/, '')}`} target="_blank" rel="noopener" sx={{ color: '#E1306C' }}>
                          <InstagramIcon fontSize="small" />
                        </IconButton>
                      )}
                    </Box>
                  </Box>
                </Card>
              ))}
            </Box>
          )}
        </>
      )}

      <AlumniDetailDrawer
        open={!!drawerUserId}
        userId={drawerUserId}
        adminId={supabaseUserId}
        onClose={() => setDrawerUserId(null)}
        onChanged={loadAlumni}
      />

      <StudentDetailDrawer
        open={!!studentDrawer}
        student={studentDrawer}
        adminId={supabaseUserId}
        onClose={() => setStudentDrawer(null)}
        onGraduate={graduateSingle}
        moveAction={{ label: 'Move to Software course', icon: <LaptopMacIcon />, onClick: (id) => moveToSoftware([id]) }}
        staffAction={{ label: 'Mark as staff', icon: <BadgeOutlinedIcon />, onClick: markStaffSingle }}
      />

      <AlumniManualAddDialog
        open={manualAddOpen}
        adminId={supabaseUserId}
        onClose={() => setManualAddOpen(false)}
        onAdded={(newId) => {
          setManualAddOpen(false);
          setTab(1);
          loadAlumni();
          setDrawerUserId(newId);
        }}
      />

      <SetAcademicYearDialog
        open={setYearOpen}
        count={selection.size}
        defaultYear={setYearDefault}
        onClose={() => setSetYearOpen(false)}
        onConfirm={handleSetYear}
      />

      <GraduateDialog
        open={graduateOpen}
        students={selectedStudents}
        defaultYear={graduateDefaultYear}
        onClose={closeGraduate}
        onConfirm={handleGraduate}
      />

      <MarkStaffDialog
        open={!!markStaff}
        people={markStaff || []}
        onClose={() => setMarkStaff(null)}
        onConfirm={markAsStaff}
      />
    </Box>
  );
}
