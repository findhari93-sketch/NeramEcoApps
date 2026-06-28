'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box,
  Typography,
  Button,
  TextField,
  InputAdornment,
  UserAvatar,
  Paper,
  Card,
  Stack,
  CircularProgress,
  Alert,
  Checkbox,
  Tooltip,
  IconButton,
} from '@neram/ui';
import useMediaQuery from '@mui/material/useMediaQuery';
import LaptopMacIcon from '@mui/icons-material/LaptopMac';
import SearchIcon from '@mui/icons-material/Search';
import CloseIcon from '@mui/icons-material/Close';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useAdminProfile } from '@/contexts/AdminProfileContext';
import StudentDetailDrawer from '../../../components/alumni/StudentDetailDrawer';
import { formatDate } from '../../../components/crm/academic-years';

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

// Match the /alumni screen's enterprise-neutral palette + single brand accent.
const ACCENT = '#B45309';
const ACCENT_SOFT = 'rgba(180,83,9,0.10)';
const INK = '#0F172A';
const MUTED = '#64748B';
const LINE = '#E2E8F0';
const LINE_SOFT = '#EEF2F6';
const HEAD_BG = '#F8FAFC';
const SEL_BG = '#FFF8F1';
const numSx = { fontVariantNumeric: 'tabular-nums' } as const;
const colHeadSx = { fontSize: 11, fontWeight: 700, letterSpacing: 0.6, color: MUTED } as const;
const GRID = '44px 1fr 150px';

export default function SoftwarePage() {
  const { supabaseUserId } = useAdminProfile();
  const isMobile = useMediaQuery('(max-width:899px)', { noSsr: true });

  const [allStudents, setAllStudents] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [drawer, setDrawer] = useState<StudentRow | null>(null);
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/crm/alumni/students?program=software', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load software course students');
      setAllStudents(data.students || []);
      setSelection(new Set());
    } catch (err: any) {
      setBanner({ type: 'error', text: err?.message || 'Failed to load software course students' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allStudents;
    return allStudents.filter(
      (s) => (s.name || '').toLowerCase().includes(q) || (s.email || '').toLowerCase().includes(q),
    );
  }, [allStudents, search]);

  const allFilteredSelected = filtered.length > 0 && filtered.every((s) => selection.has(s.id));
  const someFilteredSelected = filtered.some((s) => selection.has(s.id));

  const toggleOne = (id: string) =>
    setSelection((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAll = () =>
    setSelection((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) filtered.forEach((s) => next.delete(s.id));
      else filtered.forEach((s) => next.add(s.id));
      return next;
    });

  // Move students back into the architecture program: they leave this page and
  // reappear in the /alumni Students list. Reverses "Move to Software course".
  const moveBack = useCallback(
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
          body: JSON.stringify({ userIds: ids, program: 'architecture', adminId: supabaseUserId }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to move students');
        const moved = new Set(ids);
        setAllStudents((prev) => prev.filter((s) => !moved.has(s.id)));
        setSelection(new Set());
        setDrawer(null);
        setBanner({ type: 'success', text: `Moved ${data.updated} student(s) back to the Students list.` });
      } catch (err: any) {
        setBanner({ type: 'error', text: err?.message || 'Failed to move students' });
      }
    },
    [supabaseUserId],
  );

  return (
    <Box sx={{ p: { xs: 1.5, md: 3 }, maxWidth: 1240, mx: 'auto' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2.5 }}>
        <Box sx={{ width: 42, height: 42, borderRadius: 2, display: 'grid', placeItems: 'center', bgcolor: ACCENT_SOFT, color: ACCENT }}>
          <LaptopMacIcon />
        </Box>
        <Box>
          <Typography variant="h5" fontWeight={800} lineHeight={1.15} color={INK}>
            Software course
          </Typography>
          <Typography variant="body2" sx={{ color: MUTED }}>
            Students in the separate software program (college and working architects), kept out of the architecture Students list and out of Nexus for now.
          </Typography>
        </Box>
      </Box>

      {banner && (
        <Alert severity={banner.type} sx={{ mb: 2, borderRadius: 2 }} onClose={() => setBanner(null)}>
          {banner.text}
        </Alert>
      )}

      {/* Count tile */}
      <Stack direction="row" spacing={1.5} sx={{ mb: 2 }}>
        <Card variant="outlined" sx={{ px: 1.5, py: 1.25, display: 'flex', alignItems: 'center', gap: 1.25, borderRadius: 2, borderColor: LINE, minWidth: 180 }}>
          <Box sx={{ width: 32, height: 32, borderRadius: 1.25, display: 'grid', placeItems: 'center', bgcolor: `${ACCENT}14`, color: ACCENT }}>
            <LaptopMacIcon fontSize="small" />
          </Box>
          <Box>
            <Typography variant="h6" fontWeight={800} lineHeight={1.05} color={INK} sx={numSx}>
              {allStudents.length}
            </Typography>
            <Typography sx={colHeadSx} noWrap>
              SOFTWARE STUDENTS
            </Typography>
          </Box>
        </Card>
      </Stack>

      {/* Toolbar */}
      <Box sx={{ position: 'sticky', top: 0, zIndex: 5, bgcolor: 'background.default', pt: 0.5, pb: 1, mb: 1.25 }}>
        <Paper variant="outlined" sx={{ p: 1, borderRadius: 2, borderColor: LINE }}>
          <TextField
            size="small"
            fullWidth
            placeholder="Search name or email"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            sx={{ bgcolor: 'background.paper' }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" sx={{ color: MUTED }} />
                </InputAdornment>
              ),
              endAdornment: search ? (
                <InputAdornment position="end">
                  <IconButton size="small" onClick={() => setSearch('')} edge="end" aria-label="Clear search">
                    <CloseIcon fontSize="small" />
                  </IconButton>
                </InputAdornment>
              ) : undefined,
            }}
          />
        </Paper>

        {selection.size > 0 && (
          <Paper
            elevation={0}
            sx={{ mt: 1, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1, px: 1.5, py: 1, borderRadius: 2, bgcolor: ACCENT_SOFT, border: '1px solid', borderColor: 'rgba(180,83,9,0.25)' }}
          >
            <Typography variant="body2" fontWeight={700} sx={{ color: ACCENT, ...numSx }}>
              {selection.size} selected
            </Typography>
            <Box sx={{ flex: 1 }} />
            <Button
              size="small"
              startIcon={<ArrowBackIcon />}
              variant="outlined"
              onClick={() => moveBack([...selection])}
              sx={{ textTransform: 'none', borderRadius: 2, borderColor: LINE, color: INK, bgcolor: 'background.paper' }}
            >
              Move back to students
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
        {loading ? 'LOADING...' : `SHOWING ${filtered.length} OF ${allStudents.length}`}
      </Typography>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      ) : allStudents.length === 0 ? (
        <Paper variant="outlined" sx={{ textAlign: 'center', py: 8, borderRadius: 2, borderColor: LINE }}>
          <LaptopMacIcon sx={{ fontSize: 44, color: 'text.disabled', mb: 1 }} />
          <Typography sx={{ color: MUTED, mb: 0.5 }}>No software course students yet.</Typography>
          <Typography variant="caption" sx={{ color: '#94A3B8' }}>
            Select students on the Alumni &amp; graduation screen and use &quot;Move to Software course&quot; to add them here.
          </Typography>
        </Paper>
      ) : filtered.length === 0 ? (
        <Paper variant="outlined" sx={{ textAlign: 'center', py: 8, borderRadius: 2, borderColor: LINE }}>
          <Typography sx={{ color: MUTED }}>No students match this search.</Typography>
        </Paper>
      ) : isMobile ? (
        /* ---- Mobile: cards ---- */
        <Stack spacing={1.25}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 0.5 }}>
            <Checkbox size="small" checked={allFilteredSelected} indeterminate={!allFilteredSelected && someFilteredSelected} onChange={toggleAll} />
            <Typography variant="body2" sx={{ color: MUTED }}>
              Select all {filtered.length}
            </Typography>
          </Box>
          {filtered.map((s) => {
            const checked = selection.has(s.id);
            return (
              <Card
                key={s.id}
                variant="outlined"
                onClick={() => setDrawer(s)}
                sx={{ p: 1.5, borderRadius: 2, cursor: 'pointer', borderColor: checked ? ACCENT : LINE, bgcolor: checked ? SEL_BG : 'background.paper' }}
              >
                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.25 }}>
                  <Checkbox size="small" checked={checked} onClick={(e) => e.stopPropagation()} onChange={() => toggleOne(s.id)} sx={{ p: 0.25, mt: -0.25 }} />
                  <UserAvatar src={s.avatar_url} name={s.name} size={40} tapToView={false} />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" fontWeight={700} color={INK} noWrap>
                      {s.name || 'Unnamed'}
                    </Typography>
                    <Typography variant="caption" sx={{ color: MUTED, display: 'block', wordBreak: 'break-all' }}>
                      {s.email || 'No email'}
                    </Typography>
                    <Typography variant="caption" sx={{ color: '#94A3B8' }}>
                      {s.last_login_at ? `Last login ${formatDate(s.last_login_at)}` : 'Never logged in'}
                    </Typography>
                  </Box>
                </Box>
              </Card>
            );
          })}
        </Stack>
      ) : (
        /* ---- Desktop: table ---- */
        <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden', borderColor: LINE }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: GRID, alignItems: 'center', px: 1.5, py: 1, bgcolor: HEAD_BG, borderBottom: '1px solid', borderColor: LINE }}>
            <Checkbox size="small" checked={allFilteredSelected} indeterminate={!allFilteredSelected && someFilteredSelected} onChange={toggleAll} sx={{ p: 0.5 }} />
            <Typography sx={colHeadSx}>STUDENT</Typography>
            <Typography sx={colHeadSx}>LAST LOGIN</Typography>
          </Box>
          {filtered.map((s) => {
            const checked = selection.has(s.id);
            return (
              <Box
                key={s.id}
                onClick={() => setDrawer(s)}
                sx={{
                  display: 'grid',
                  gridTemplateColumns: GRID,
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
                <Checkbox size="small" checked={checked} onClick={(e) => e.stopPropagation()} onChange={() => toggleOne(s.id)} sx={{ p: 0.5, ml: '-3px' }} />
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
                <Typography variant="body2" sx={{ color: MUTED, ...numSx }}>
                  {s.last_login_at ? formatDate(s.last_login_at) : 'Never'}
                </Typography>
              </Box>
            );
          })}
        </Paper>
      )}

      <StudentDetailDrawer
        open={!!drawer}
        student={drawer}
        adminId={supabaseUserId}
        onClose={() => setDrawer(null)}
        moveAction={{ label: 'Move back to students', icon: <ArrowBackIcon />, onClick: (id) => moveBack([id]) }}
      />
    </Box>
  );
}
