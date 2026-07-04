'use client';

import { useState, useEffect } from 'react';
import {
  Typography,
  Box,
  TextField,
  Button,
  Alert,
  CircularProgress,
  Autocomplete,
} from '@neram/ui';
import PersonAddAlt1Icon from '@mui/icons-material/PersonAddAlt1';
import { COURSE_OPTIONS, INK, MUTED, ACCENT } from './theme';
import { academicYearOptions, ACADEMIC_YEAR_REGEX } from '../crm/academic-years';

interface CollegeOption {
  id: string;
  name: string;
  city?: string | null;
}

interface SingleAlumnusFormProps {
  adminId: string | null;
  onAdded: (userId: string) => void;
  onCancel: () => void;
}

/**
 * Add one historical alumnus (pre-system batches): creates a users row
 * (is_alumni, no auth) + their directory profile. Extracted from the former
 * AlumniManualAddDialog so it can live inside the tabbed Add drawer.
 */
export default function SingleAlumnusForm({ adminId, onAdded, onCancel }: SingleAlumnusFormProps) {
  const yearOptions = academicYearOptions();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [academicYear, setAcademicYear] = useState('');
  const [college, setCollege] = useState<CollegeOption | string | null>(null);
  const [collegeOptions, setCollegeOptions] = useState<CollegeOption[]>([]);
  const [collegeInput, setCollegeInput] = useState('');
  const [course, setCourse] = useState('Architecture (B.Arch)');
  const [linkedin, setLinkedin] = useState('');
  const [instagram, setInstagram] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const q = collegeInput.trim();
    if (q.length < 2) return;
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/crm/alumni/college-search?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        setCollegeOptions(data.colleges || []);
      } catch {
        /* ignore */
      }
    }, 250);
    return () => clearTimeout(t);
  }, [collegeInput]);

  const yearValid = !academicYear || ACADEMIC_YEAR_REGEX.test(academicYear);
  const canSave = !!name.trim() && yearValid && !saving;

  const handleSave = async () => {
    if (!canSave) return;
    if (!adminId) {
      setError('Admin session not ready, try again in a moment.');
      return;
    }
    setSaving(true);
    setError('');

    const collegeId = college && typeof college === 'object' ? college.id : null;
    const collegeName =
      college && typeof college === 'object' ? college.name : typeof college === 'string' ? college.trim() : null;

    try {
      const res = await fetch('/api/crm/alumni/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminId,
          name: name.trim(),
          email: email.trim() || null,
          phone: phone.trim() || null,
          academicYear: academicYear.trim() || null,
          college_id: collegeId,
          college_name: collegeId ? null : collegeName || null,
          course_branch: course || 'Architecture (B.Arch)',
          linkedin_url: linkedin.trim() || null,
          instagram_url: instagram.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add alumnus');
      onAdded(data.userId);
    } catch (err: any) {
      setError(err?.message || 'Failed to add alumnus');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Typography variant="body2" sx={{ color: MUTED, mb: 2 }}>
        For older batches who never had a Neram account.
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <TextField size="small" fullWidth required label="Full name" value={name} onChange={(e) => setName(e.target.value)} sx={{ mb: 2 }} />

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2, mb: 2 }}>
        <TextField size="small" label="Email (optional)" value={email} onChange={(e) => setEmail(e.target.value)} />
        <TextField size="small" label="Phone (optional)" value={phone} onChange={(e) => setPhone(e.target.value)} />
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2, mb: 2 }}>
        <Autocomplete
          freeSolo
          size="small"
          value={academicYear}
          options={yearOptions}
          onChange={(_, v) => setAcademicYear((v as string) || '')}
          onInputChange={(_, v) => setAcademicYear(v)}
          renderInput={(p) => (
            <TextField
              {...p}
              label="Batch (academic year)"
              error={!!academicYear && !yearValid}
              helperText={!!academicYear && !yearValid ? 'YYYY-YY' : ' '}
            />
          )}
        />
        <Autocomplete
          freeSolo
          size="small"
          value={course}
          options={COURSE_OPTIONS}
          onChange={(_, v) => setCourse((v as string) || '')}
          onInputChange={(_, v) => setCourse(v)}
          renderInput={(p) => <TextField {...p} label="Course / branch" />}
        />
      </Box>

      <Typography variant="body2" fontWeight={600} sx={{ mb: 1, color: INK }}>
        College
      </Typography>
      <Autocomplete
        freeSolo
        size="small"
        value={college as any}
        options={collegeOptions}
        filterOptions={(x) => x}
        getOptionLabel={(opt: any) => (typeof opt === 'string' ? opt : `${opt.name}${opt.city ? `, ${opt.city}` : ''}`)}
        onChange={(_, v) => setCollege(v)}
        onInputChange={(_, v) => setCollegeInput(v)}
        renderInput={(p) => <TextField {...p} placeholder="Search colleges, or type a name" />}
        sx={{ mb: 2 }}
      />

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
        <TextField size="small" label="LinkedIn URL" value={linkedin} onChange={(e) => setLinkedin(e.target.value)} />
        <TextField size="small" label="Instagram" value={instagram} onChange={(e) => setInstagram(e.target.value)} />
      </Box>

      <Box sx={{ flex: 1 }} />

      <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mt: 3 }}>
        <Button onClick={onCancel} disabled={saving} sx={{ textTransform: 'none' }}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={!canSave}
          startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <PersonAddAlt1Icon />}
          sx={{ textTransform: 'none', minWidth: 140, bgcolor: ACCENT, '&:hover': { bgcolor: '#92400E' } }}
        >
          {saving ? 'Adding...' : 'Add alumnus'}
        </Button>
      </Box>
    </Box>
  );
}
