'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Typography,
  Box,
  TextField,
  MenuItem,
  Button,
  Alert,
  CircularProgress,
  Divider,
  Autocomplete,
  Switch,
  FormControlLabel,
} from '@neram/ui';
import useMediaQuery from '@mui/material/useMediaQuery';
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined';
import { COURSE_OPTIONS, INK, MUTED } from './theme';

interface CollegeOption {
  id: string;
  name: string;
  short_name?: string | null;
  city?: string | null;
  state?: string | null;
}

interface AlumniProfileShape {
  college_id?: string | null;
  college_name?: string | null;
  course_branch?: string | null;
  college_start_year?: number | null;
  expected_graduation_year?: number | null;
  college_status?: string | null;
  linkedin_url?: string | null;
  instagram_url?: string | null;
  portfolio_url?: string | null;
  bio?: string | null;
  is_verified?: boolean;
}

interface AlumniEditDialogProps {
  open: boolean;
  userId: string;
  adminId: string | null;
  profile: AlumniProfileShape | null;
  /** Resolved college (from the detail endpoint) to seed the picker. */
  initialCollege?: CollegeOption | null;
  onClose: () => void;
  onSaved: (profile: any) => void;
}

export default function AlumniEditDialog({
  open,
  userId,
  adminId,
  profile,
  initialCollege,
  onClose,
  onSaved,
}: AlumniEditDialogProps) {
  const fullScreen = useMediaQuery('(max-width:599px)');

  const [college, setCollege] = useState<CollegeOption | string | null>(null);
  const [collegeOptions, setCollegeOptions] = useState<CollegeOption[]>([]);
  const [collegeInput, setCollegeInput] = useState('');
  const [course, setCourse] = useState('Architecture (B.Arch)');
  const [startYear, setStartYear] = useState('');
  const [status, setStatus] = useState('');
  const [linkedin, setLinkedin] = useState('');
  const [instagram, setInstagram] = useState('');
  const [portfolio, setPortfolio] = useState('');
  const [bio, setBio] = useState('');
  const [verified, setVerified] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setCollege(initialCollege || profile?.college_name || null);
    setCollegeOptions(initialCollege ? [initialCollege] : []);
    setCollegeInput('');
    setCourse(profile?.course_branch || 'Architecture (B.Arch)');
    setStartYear(profile?.college_start_year ? String(profile.college_start_year) : '');
    setStatus(profile?.college_status || '');
    setLinkedin(profile?.linkedin_url || '');
    setInstagram(profile?.instagram_url || '');
    setPortfolio(profile?.portfolio_url || '');
    setBio(profile?.bio || '');
    setVerified(!!profile?.is_verified);
    setError('');
  }, [open, profile, initialCollege]);

  // Debounced college search.
  useEffect(() => {
    if (!open) return;
    const q = collegeInput.trim();
    if (q.length < 2) return;
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/crm/alumni/college-search?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        setCollegeOptions(data.colleges || []);
      } catch {
        /* ignore search errors */
      }
    }, 250);
    return () => clearTimeout(t);
  }, [collegeInput, open]);

  const handleSave = async () => {
    if (!adminId) {
      setError('Admin session not ready, try again in a moment.');
      return;
    }
    setSaving(true);
    setError('');

    const collegeId = college && typeof college === 'object' ? college.id : null;
    const collegeName =
      college && typeof college === 'object' ? college.name : typeof college === 'string' ? college.trim() : null;
    const startYearNum = startYear ? parseInt(startYear, 10) : null;

    const fields: AlumniProfileShape = {
      college_id: collegeId,
      college_name: collegeId ? null : collegeName || null,
      course_branch: course || 'Architecture (B.Arch)',
      college_start_year: startYearNum,
      expected_graduation_year:
        profile?.expected_graduation_year ?? (startYearNum ? startYearNum + 5 : null),
      college_status: status || null,
      linkedin_url: linkedin.trim() || null,
      instagram_url: instagram.trim() || null,
      portfolio_url: portfolio.trim() || null,
      bio: bio.trim() || null,
      is_verified: verified,
    };

    try {
      const res = await fetch(`/api/crm/alumni/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields, adminId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save');
      onSaved(data.profile);
    } catch (err: any) {
      setError(err?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={() => !saving && onClose()} maxWidth="sm" fullWidth fullScreen={fullScreen}>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5, pb: 1 }}>
        <SchoolOutlinedIcon sx={{ color: INK }} />
        <Box>
          <Typography variant="h6" fontWeight={700}>
            Edit alumnus details
          </Typography>
          <Typography variant="caption" sx={{ color: MUTED }}>
            College, course and how to stay in touch.
          </Typography>
        </Box>
      </DialogTitle>
      <Divider />
      <DialogContent sx={{ pt: 2 }}>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Typography variant="body2" fontWeight={600} sx={{ mb: 1 }}>
          College
        </Typography>
        <Autocomplete
          freeSolo
          size="small"
          value={college as any}
          options={collegeOptions}
          filterOptions={(x) => x}
          getOptionLabel={(opt: any) =>
            typeof opt === 'string' ? opt : `${opt.name}${opt.city ? `, ${opt.city}` : ''}`
          }
          onChange={(_, v) => setCollege(v)}
          onInputChange={(_, v) => setCollegeInput(v)}
          renderInput={(p) => (
            <TextField {...p} placeholder="Search colleges, or type a name" helperText="Pick from the list, or type a college not in the catalog" />
          )}
          sx={{ mb: 2 }}
        />

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2, mb: 2 }}>
          <Autocomplete
            freeSolo
            size="small"
            value={course}
            options={COURSE_OPTIONS}
            onChange={(_, v) => setCourse((v as string) || '')}
            onInputChange={(_, v) => setCourse(v)}
            renderInput={(p) => <TextField {...p} label="Course / branch" />}
          />
          <TextField
            select
            size="small"
            label="College status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <MenuItem value="">Not set</MenuItem>
            <MenuItem value="counseling">In counseling</MenuItem>
            <MenuItem value="studying">Studying</MenuItem>
            <MenuItem value="graduated">Graduated</MenuItem>
          </TextField>
        </Box>

        <TextField
          size="small"
          fullWidth
          type="number"
          label="College start year"
          placeholder="e.g. 2026"
          value={startYear}
          onChange={(e) => setStartYear(e.target.value)}
          helperText="Used to show current year of study and the Graduate Architect badge"
          sx={{ mb: 2 }}
        />

        <Typography variant="body2" fontWeight={600} sx={{ mb: 1 }}>
          Stay in touch
        </Typography>
        <TextField size="small" fullWidth label="LinkedIn URL" value={linkedin} onChange={(e) => setLinkedin(e.target.value)} sx={{ mb: 1.5 }} />
        <TextField size="small" fullWidth label="Instagram URL or handle" value={instagram} onChange={(e) => setInstagram(e.target.value)} sx={{ mb: 1.5 }} />
        <TextField size="small" fullWidth label="Portfolio / website" value={portfolio} onChange={(e) => setPortfolio(e.target.value)} sx={{ mb: 2 }} />

        <TextField
          size="small"
          fullWidth
          multiline
          minRows={2}
          label="About (notes)"
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          sx={{ mb: 1 }}
        />

        <FormControlLabel
          control={<Switch checked={verified} onChange={(e) => setVerified(e.target.checked)} />}
          label={<Typography variant="body2">Verified details</Typography>}
        />
      </DialogContent>
      <Divider />
      <DialogActions sx={{ p: 2, gap: 1 }}>
        <Button onClick={onClose} disabled={saving} sx={{ textTransform: 'none' }}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={saving}
          startIcon={saving ? <CircularProgress size={16} color="inherit" /> : undefined}
          sx={{ textTransform: 'none', minWidth: 120, bgcolor: '#B45309', '&:hover': { bgcolor: '#92400E' } }}
        >
          {saving ? 'Saving...' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
