'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  Typography,
  UserAvatar,
  Chip,
  Paper,
  Card,
  CircularProgress,
  Alert,
  Rating,
  IconButton,
  Tooltip,
  TextField,
  MenuItem,
  InputAdornment,
  ToggleButton,
  ToggleButtonGroup,
  Autocomplete,
  Switch,
  FormControlLabel,
  Button,
  Divider,
  Tabs,
  Tab,
} from '@neram/ui';
import EmojiEventsOutlinedIcon from '@mui/icons-material/EmojiEventsOutlined';
import StarIcon from '@mui/icons-material/Star';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import VisibilityIcon from '@mui/icons-material/Visibility';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined';
import SearchIcon from '@mui/icons-material/Search';
import VerifiedIcon from '@mui/icons-material/Verified';
import HistoryEduOutlinedIcon from '@mui/icons-material/HistoryEduOutlined';
import { useAdminProfile } from '@/contexts/AdminProfileContext';
import { academicYearOptions } from '../../../../components/crm/academic-years';
import AlumniEditDialog from '../../../../components/alumni/AlumniEditDialog';
import { ACCENT, ACCENT_SOFT, INK, MUTED, LINE } from '../../../../components/alumni/theme';

interface GalleryItem {
  id: string;
  original_image_url: string;
  reviewed_at: string | null;
  tutor_rating: number | null;
  alumni_featured: boolean;
  student?: { id: string; name: string; avatar_url: string | null; academic_year?: string | null };
}

interface SeniorEntry {
  id: string;
  name: string | null;
  email: string | null;
  avatar_url: string | null;
  academic_year: string | null;
  submission_count: number;
  college_id: string | null;
  college_name: string | null;
  course_branch: string | null;
  is_verified: boolean;
  is_hall_of_fame: boolean;
  exam_name: string | null;
  exam_result: string | null;
  achievement_note: string | null;
}

interface AlumniCollege {
  id: string;
  name: string;
  short_name: string | null;
  city: string | null;
  state: string | null;
}

const collegeLabel = (c: AlumniCollege) => [c.name, c.city, c.state].filter(Boolean).join(', ');

export default function AlumniGalleryPage() {
  const router = useRouter();
  const { supabaseUserId } = useAdminProfile();
  const [tab, setTab] = useState(0); // 0 = Seniors, 1 = Works
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Shared filters
  const [yearFilter, setYearFilter] = useState('');
  const [colleges, setColleges] = useState<AlumniCollege[]>([]);
  const [collegeId, setCollegeId] = useState('');

  // ---- Seniors tab ----
  const [seniors, setSeniors] = useState<SeniorEntry[]>([]);
  const [seniorsLoading, setSeniorsLoading] = useState(false);
  const [sSearch, setSSearch] = useState('');
  const [showcaseOnly, setShowcaseOnly] = useState(false);
  const [editProfile, setEditProfile] = useState<any | null>(null);
  const [editUserId, setEditUserId] = useState<string | null>(null);
  const [editCollege, setEditCollege] = useState<any | null>(null);

  // ---- Works tab ----
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [worksLoading, setWorksLoading] = useState(false);
  const [visibility, setVisibility] = useState<'visible' | 'hidden'>('visible');

  // Distinct colleges seniors attended (for the college filter).
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch('/api/crm/alumni/colleges');
        const data = await res.json();
        if (active) setColleges(data.colleges || []);
      } catch {
        if (active) setColleges([]);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const loadSeniors = useCallback(async () => {
    setSeniorsLoading(true);
    try {
      const params = new URLSearchParams();
      if (yearFilter) params.set('academicYear', yearFilter);
      if (collegeId) params.set('collegeId', collegeId);
      const res = await fetch(`/api/crm/alumni?${params}`, { cache: 'no-store' });
      const data = await res.json();
      setSeniors(data.alumni || []);
    } catch {
      setBanner({ type: 'error', text: 'Failed to load seniors' });
    } finally {
      setSeniorsLoading(false);
    }
  }, [yearFilter, collegeId]);

  const loadWorks = useCallback(async () => {
    if (!supabaseUserId) return;
    setWorksLoading(true);
    try {
      const params = new URLSearchParams({ adminId: supabaseUserId, limit: '60' });
      if (yearFilter) params.set('academicYear', yearFilter);
      if (collegeId) params.set('collegeId', collegeId);
      if (visibility === 'hidden') params.set('visibility', 'hidden');
      const res = await fetch(`/api/crm/alumni/gallery?${params}`);
      const data = await res.json();
      setItems(data.posts || []);
    } catch {
      setBanner({ type: 'error', text: 'Failed to load works' });
    } finally {
      setWorksLoading(false);
    }
  }, [supabaseUserId, yearFilter, collegeId, visibility]);

  useEffect(() => {
    if (tab === 0) loadSeniors();
    else loadWorks();
  }, [tab, loadSeniors, loadWorks]);

  const filteredSeniors = useMemo(() => {
    let r = seniors;
    const q = sSearch.trim().toLowerCase();
    if (q) r = r.filter((s) => (s.name || '').toLowerCase().includes(q) || (s.email || '').toLowerCase().includes(q));
    if (showcaseOnly) r = r.filter((s) => s.is_hall_of_fame);
    return r;
  }, [seniors, sSearch, showcaseOnly]);

  const showcasedCount = useMemo(() => seniors.filter((s) => s.is_hall_of_fame).length, [seniors]);

  const toggleShowcase = async (s: SeniorEntry, value: boolean) => {
    if (!supabaseUserId) return;
    setSeniors((prev) => prev.map((x) => (x.id === s.id ? { ...x, is_hall_of_fame: value } : x)));
    try {
      const res = await fetch('/api/crm/alumni/gallery/hall-of-fame', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: s.id, value, adminId: supabaseUserId }),
      });
      if (!res.ok) throw new Error();
      setBanner({
        type: 'success',
        text: value ? `${s.name || 'Senior'} now appears in the student Hall of Fame.` : `${s.name || 'Senior'} removed from the Hall of Fame.`,
      });
    } catch {
      setSeniors((prev) => prev.map((x) => (x.id === s.id ? { ...x, is_hall_of_fame: !value } : x)));
      setBanner({ type: 'error', text: 'Failed to update showcase status' });
    }
  };

  // Open the achievement editor with the FULL profile (the directory row omits bio /
  // other links, so editing from it would wipe them). Fetch detail first.
  const openEdit = async (userId: string) => {
    try {
      const res = await fetch(`/api/crm/alumni/${userId}`);
      const data = await res.json();
      setEditProfile(data?.alumniProfile || {});
      setEditCollege(
        data?.college ? { id: data.college.id, name: data.college.name, city: data.college.city, state: data.college.state } : null,
      );
      setEditUserId(userId);
    } catch {
      setBanner({ type: 'error', text: 'Failed to open editor' });
    }
  };

  const toggleFeature = async (id: string, featured: boolean) => {
    setItems((prev) => prev.map((p) => (p.id === id ? { ...p, alumni_featured: featured } : p)));
    try {
      const res = await fetch('/api/crm/alumni/gallery/feature', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submissionId: id, featured }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setItems((prev) => prev.map((p) => (p.id === id ? { ...p, alumni_featured: !featured } : p)));
      setBanner({ type: 'error', text: 'Failed to update feature status' });
    }
  };

  const setItemVisibility = async (id: string, visible: boolean) => {
    const prev = items;
    setItems((cur) => cur.filter((p) => p.id !== id));
    try {
      const res = await fetch('/api/crm/alumni/gallery/visibility', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submissionId: id, visible }),
      });
      if (!res.ok) throw new Error();
      setBanner({ type: 'success', text: visible ? 'Restored to the student Hall of Fame.' : 'Hidden from students.' });
    } catch {
      setItems(prev);
      setBanner({ type: 'error', text: 'Failed to update visibility' });
    }
  };

  const yearSelect = (
    <TextField
      select
      size="small"
      label="Cohort year"
      value={yearFilter}
      onChange={(e) => setYearFilter(e.target.value)}
      sx={{ minWidth: 150 }}
    >
      <MenuItem value="">All years</MenuItem>
      {academicYearOptions().map((y) => (
        <MenuItem key={y} value={y}>
          {y}
        </MenuItem>
      ))}
    </TextField>
  );

  const collegeSelect = (
    <Autocomplete
      size="small"
      options={colleges}
      value={colleges.find((c) => c.id === collegeId) || null}
      getOptionLabel={(opt: any) => (typeof opt === 'string' ? opt : collegeLabel(opt))}
      isOptionEqualToValue={(opt: any, val: any) => opt?.id === val?.id}
      onChange={(_, v: any) => setCollegeId(v?.id || '')}
      renderInput={(p) => <TextField {...p} label="College" placeholder="All colleges" />}
      sx={{ minWidth: 230 }}
    />
  );

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1240, mx: 'auto' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, mb: 2 }}>
        <IconButton onClick={() => router.push('/alumni')} aria-label="Back to alumni" sx={{ mt: 0.25 }}>
          <ArrowBackIcon />
        </IconButton>
        <Box sx={{ width: 42, height: 42, borderRadius: 2, display: 'grid', placeItems: 'center', bgcolor: ACCENT_SOFT, color: ACCENT, flexShrink: 0 }}>
          <EmojiEventsOutlinedIcon />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="h5" fontWeight={800} color={INK} lineHeight={1.15}>
            Hall of Fame curation
          </Typography>
          <Typography variant="body2" sx={{ color: MUTED }}>
            Pick the seniors and the works that inspire current students in the Nexus app. Nothing here is shown inside admin, it feeds the student Hall of Fame.
          </Typography>
        </Box>
      </Box>

      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v)}
        sx={{
          mb: 2,
          minHeight: 40,
          borderBottom: 1,
          borderColor: LINE,
          '& .MuiTab-root': { textTransform: 'none', fontWeight: 700, minHeight: 40, color: MUTED },
          '& .Mui-selected': { color: `${INK} !important` },
          '& .MuiTabs-indicator': { backgroundColor: ACCENT },
        }}
      >
        <Tab label="Seniors" />
        <Tab label="Works" />
      </Tabs>

      {banner && (
        <Alert severity={banner.type} sx={{ mb: 2 }} onClose={() => setBanner(null)}>
          {banner.text}
        </Alert>
      )}

      {/* ============ SENIORS TAB ============ */}
      {tab === 0 && (
        <>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1, mb: 2 }}>
            <TextField
              size="small"
              placeholder="Search name or email"
              value={sSearch}
              onChange={(e) => setSSearch(e.target.value)}
              sx={{ minWidth: 220, flex: 1 }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" sx={{ color: MUTED }} />
                  </InputAdornment>
                ),
              }}
            />
            {yearSelect}
            {collegeSelect}
            <ToggleButtonGroup
              value={showcaseOnly ? 'showcased' : 'all'}
              exclusive
              size="small"
              onChange={(_, v) => v && setShowcaseOnly(v === 'showcased')}
              aria-label="Showcase filter"
            >
              <ToggleButton value="all" sx={{ textTransform: 'none' }}>
                All
              </ToggleButton>
              <ToggleButton value="showcased" sx={{ textTransform: 'none' }}>
                <EmojiEventsOutlinedIcon sx={{ fontSize: 16, mr: 0.5 }} />
                Showcased {showcasedCount}
              </ToggleButton>
            </ToggleButtonGroup>
          </Box>

          {seniorsLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
              <CircularProgress />
            </Box>
          ) : filteredSeniors.length === 0 ? (
            <Paper variant="outlined" sx={{ textAlign: 'center', py: 8, borderRadius: 2, borderColor: LINE }}>
              <HistoryEduOutlinedIcon sx={{ fontSize: 44, color: 'text.disabled', mb: 1 }} />
              <Typography color="text.secondary">
                {seniors.length === 0 ? 'No alumni yet.' : 'No seniors match these filters.'}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {seniors.length === 0
                  ? 'Graduate a batch from the Students tab, then showcase the standouts here.'
                  : 'Try clearing the showcase or cohort filter.'}
              </Typography>
            </Paper>
          ) : (
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(3, 1fr)' }, gap: 1.5 }}>
              {filteredSeniors.map((s) => (
                <Card
                  key={s.id}
                  variant="outlined"
                  sx={{
                    p: 1.5,
                    borderRadius: 2,
                    borderColor: s.is_hall_of_fame ? ACCENT : LINE,
                    boxShadow: s.is_hall_of_fame ? `inset 0 0 0 1px ${ACCENT}` : 'none',
                    bgcolor: s.is_hall_of_fame ? '#FFFBF5' : 'background.paper',
                    transition: 'border-color 150ms, box-shadow 150ms',
                  }}
                >
                  <Box sx={{ display: 'flex', gap: 1.25, alignItems: 'flex-start' }}>
                    <UserAvatar src={s.avatar_url} name={s.name} size={44} />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <Typography variant="body2" fontWeight={700} color={INK} noWrap>
                          {s.name || 'Unnamed'}
                        </Typography>
                        {s.is_verified && <VerifiedIcon sx={{ fontSize: 15, color: '#16a34a', flexShrink: 0 }} />}
                      </Box>
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.5 }}>
                        {s.academic_year && (
                          <Chip label={`Batch ${s.academic_year}`} size="small" sx={{ height: 20, fontSize: 11, bgcolor: ACCENT_SOFT, color: ACCENT, fontWeight: 700 }} />
                        )}
                        {s.course_branch && (
                          <Chip label={s.course_branch} size="small" variant="outlined" sx={{ height: 20, fontSize: 11, borderColor: LINE }} />
                        )}
                      </Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
                        <SchoolOutlinedIcon sx={{ fontSize: 15, color: s.college_name ? MUTED : '#CBD5E1' }} />
                        <Typography variant="caption" sx={{ color: s.college_name ? INK : '#94A3B8' }} noWrap>
                          {s.college_name || 'College not set'}
                        </Typography>
                      </Box>
                      {(s.exam_name || s.exam_result) && (
                        <Chip
                          icon={<EmojiEventsOutlinedIcon sx={{ fontSize: '0.85rem !important' }} />}
                          label={[s.exam_name, s.exam_result].filter(Boolean).join(': ')}
                          size="small"
                          sx={{ mt: 0.75, height: 22, fontSize: 11, bgcolor: 'rgba(217,119,6,0.12)', color: '#92400E', fontWeight: 700, '& .MuiChip-icon': { color: '#B45309' } }}
                        />
                      )}
                      {s.achievement_note && (
                        <Typography variant="caption" sx={{ color: MUTED, display: 'block', mt: 0.5, fontStyle: 'italic' }}>
                          {s.achievement_note}
                        </Typography>
                      )}
                    </Box>
                  </Box>

                  <Divider sx={{ my: 1.25 }} />

                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <FormControlLabel
                      control={<Switch size="small" checked={s.is_hall_of_fame} onChange={(e) => toggleShowcase(s, e.target.checked)} />}
                      label={<Typography variant="caption" sx={{ color: MUTED, fontWeight: 600 }}>Showcase</Typography>}
                      sx={{ ml: 0, mr: 0 }}
                    />
                    <Button
                      size="small"
                      variant="text"
                      startIcon={<EditOutlinedIcon fontSize="small" />}
                      onClick={() => openEdit(s.id)}
                      sx={{ textTransform: 'none', color: INK }}
                    >
                      Achievement
                    </Button>
                  </Box>
                </Card>
              ))}
            </Box>
          )}
        </>
      )}

      {/* ============ WORKS TAB ============ */}
      {tab === 1 && (
        <>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1, mb: 2 }}>
            <ToggleButtonGroup
              value={visibility}
              exclusive
              size="small"
              onChange={(_, val) => val && setVisibility(val)}
              aria-label="Visibility scope"
            >
              <ToggleButton value="visible" sx={{ textTransform: 'none' }}>
                <VisibilityIcon sx={{ fontSize: 16, mr: 0.5 }} />
                Visible
              </ToggleButton>
              <ToggleButton value="hidden" sx={{ textTransform: 'none' }}>
                <VisibilityOffIcon sx={{ fontSize: 16, mr: 0.5 }} />
                Hidden
              </ToggleButton>
            </ToggleButtonGroup>
            <Box sx={{ flex: 1 }} />
            {yearSelect}
            {collegeSelect}
          </Box>

          {worksLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
              <CircularProgress />
            </Box>
          ) : items.length === 0 ? (
            <Paper variant="outlined" sx={{ textAlign: 'center', py: 8, borderRadius: 2, borderColor: LINE }}>
              <EmojiEventsOutlinedIcon sx={{ fontSize: 44, color: 'text.disabled', mb: 1 }} />
              {visibility === 'hidden' ? (
                <>
                  <Typography color="text.secondary">No alumni works are hidden from students.</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Anything you hide from the Visible view shows up here to review or restore.
                  </Typography>
                </>
              ) : (
                <>
                  <Typography color="text.secondary">No alumni work in the gallery yet.</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Graduate a batch, then their reviewed drawings appear here to feature.
                  </Typography>
                </>
              )}
            </Paper>
          ) : (
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)', lg: 'repeat(4, 1fr)' }, gap: 2 }}>
              {items.map((item) => (
                <Paper key={item.id} variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden', position: 'relative', borderColor: LINE }}>
                  {visibility === 'hidden' && (
                    <Chip
                      icon={<VisibilityOffIcon sx={{ fontSize: '0.85rem !important' }} />}
                      label="Hidden from students"
                      size="small"
                      sx={{ position: 'absolute', top: 8, left: 8, zIndex: 2, height: 22, bgcolor: 'rgba(180,83,9,0.92)', color: '#fff', fontSize: '0.62rem', fontWeight: 700, '& .MuiChip-icon': { color: '#fff' } }}
                    />
                  )}
                  {item.alumni_featured && (
                    <Chip
                      icon={<StarIcon sx={{ fontSize: '0.85rem !important' }} />}
                      label="Featured"
                      size="small"
                      sx={{ position: 'absolute', top: 8, right: 8, zIndex: 2, height: 22, bgcolor: 'rgba(217,119,6,0.95)', color: '#fff', fontSize: '0.65rem', fontWeight: 700, '& .MuiChip-icon': { color: '#fff' } }}
                    />
                  )}
                  {/* Internal admin tool: plain img avoids next/image remotePattern config. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={item.original_image_url}
                    alt={`Drawing by ${item.student?.name || 'alumnus'}`}
                    style={{ width: '100%', height: 200, objectFit: 'cover', display: 'block', background: '#f3f4f6' }}
                  />
                  <Box sx={{ p: 1.5 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                      <UserAvatar src={item.student?.avatar_url} name={item.student?.name} size={28} />
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="body2" fontWeight={600} noWrap>
                          {item.student?.name || 'Unknown'}
                        </Typography>
                        {item.student?.academic_year && (
                          <Typography variant="caption" color="text.secondary">
                            Batch {item.student.academic_year}
                          </Typography>
                        )}
                      </Box>
                      {item.tutor_rating ? <Rating value={item.tutor_rating} readOnly size="small" /> : null}
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 0.5 }}>
                      <Tooltip title={item.alumni_featured ? 'Unfeature' : 'Feature in Hall of Fame'}>
                        <IconButton size="small" onClick={() => toggleFeature(item.id, !item.alumni_featured)} sx={{ color: item.alumni_featured ? '#D97706' : 'text.disabled' }}>
                          {item.alumni_featured ? <StarIcon fontSize="small" /> : <StarBorderIcon fontSize="small" />}
                        </IconButton>
                      </Tooltip>
                      {visibility === 'hidden' ? (
                        <Tooltip title="Restore to student Hall of Fame">
                          <IconButton size="small" color="success" onClick={() => setItemVisibility(item.id, true)}>
                            <VisibilityIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      ) : (
                        <Tooltip title="Hide from students">
                          <IconButton size="small" color="warning" onClick={() => setItemVisibility(item.id, false)}>
                            <VisibilityOffIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                    </Box>
                  </Box>
                </Paper>
              ))}
            </Box>
          )}
        </>
      )}

      {editUserId && (
        <AlumniEditDialog
          open={!!editUserId}
          userId={editUserId}
          adminId={supabaseUserId}
          profile={editProfile}
          initialCollege={editCollege}
          onClose={() => setEditUserId(null)}
          onSaved={() => {
            setEditUserId(null);
            loadSeniors();
          }}
        />
      )}
    </Box>
  );
}
