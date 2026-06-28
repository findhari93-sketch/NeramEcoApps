'use client';

import { useState } from 'react';
import {
  Box,
  Typography,
  Button,
  TextField,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Divider,
  Alert,
  CircularProgress,
} from '@neram/ui';
import useMediaQuery from '@mui/material/useMediaQuery';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import { Field, SectionCard } from './uiPrimitives';
import { ACCENT } from './theme';

interface PersonalDetailsPanelProps {
  user: any;
  leadProfile: any;
  userId: string;
  adminId: string | null;
  onSaved?: () => void;
}

const GENDERS = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
];

function fmtDate(d?: string | null): string {
  if (!d) return '';
  const dt = new Date(d);
  return Number.isNaN(dt.getTime()) ? String(d) : dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

/**
 * Display + inline-edit a student's core personal details. Pulls from `users`
 * (name, phone, email, personal Gmail, DOB, gender) and `lead_profiles` (father's
 * name, city, state, school). Used in the student drawer, alumni drawer and the
 * full profile page. Saves via PATCH /api/crm/alumni/[id]/personal.
 */
export default function PersonalDetailsPanel({ user, leadProfile, userId, adminId, onSaved }: PersonalDetailsPanelProps) {
  const fullScreen = useMediaQuery('(max-width:599px)');
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState<any>({});

  const dob = user?.date_of_birth || leadProfile?.date_of_birth || null;
  const gender = user?.gender || leadProfile?.gender || null;

  const openEdit = () => {
    setForm({
      name: user?.name || '',
      phone: user?.phone || '',
      personal_email: user?.personal_email || '',
      date_of_birth: (user?.date_of_birth || leadProfile?.date_of_birth || '').slice(0, 10),
      gender: user?.gender || leadProfile?.gender || '',
      father_name: leadProfile?.father_name || '',
      city: leadProfile?.city || '',
      state: leadProfile?.state || '',
      school_college: leadProfile?.school_college || '',
    });
    setError('');
    setOpen(true);
  };

  const set = (k: string) => (e: any) => setForm((f: any) => ({ ...f, [k]: e.target.value }));

  const save = async () => {
    if (!adminId) {
      setError('Admin session not ready, try again in a moment.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      // Send only non-empty edits (empty string clears a field intentionally is out of scope for v1).
      const fields: any = {};
      for (const [k, v] of Object.entries(form)) {
        if (v !== '' && v !== null && v !== undefined) fields[k] = v;
      }
      const res = await fetch(`/api/crm/alumni/${userId}/personal`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields, adminId }),
      });
      const out = await res.json();
      if (!res.ok) throw new Error(out.error || 'Save failed');
      setOpen(false);
      onSaved?.();
    } catch (e: any) {
      setError(e?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SectionCard
      title="Personal details"
      action={
        <Button
          size="small"
          variant="text"
          startIcon={<EditOutlinedIcon sx={{ fontSize: 16 }} />}
          onClick={openEdit}
          sx={{ textTransform: 'none', color: ACCENT }}
        >
          Edit
        </Button>
      }
    >
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, columnGap: 3 }}>
        <Field label="Name" value={user?.name} />
        <Field label="Father's name" value={leadProfile?.father_name} />
        <Field label="Date of birth" value={fmtDate(dob)} />
        <Field label="Gender" value={gender ? gender.replace(/_/g, ' ') : ''} />
        <Field label="City" value={leadProfile?.city} />
        <Field label="State" value={leadProfile?.state} />
        <Field label="School / College" value={leadProfile?.school_college} />
        <Field label="Phone" value={user?.phone} />
        <Field label="Email (primary)" value={user?.email} />
        <Field label="Personal Gmail" value={user?.personal_email} />
      </Box>

      <Dialog open={open} onClose={() => !saving && setOpen(false)} maxWidth="sm" fullWidth fullScreen={fullScreen}>
        <DialogTitle fontWeight={700}>Edit personal details</DialogTitle>
        <Divider />
        <DialogContent sx={{ pt: 2 }}>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
            <TextField label="Name" size="small" value={form.name || ''} onChange={set('name')} />
            <TextField label="Father's name" size="small" value={form.father_name || ''} onChange={set('father_name')} />
            <TextField
              label="Date of birth"
              type="date"
              size="small"
              value={form.date_of_birth || ''}
              onChange={set('date_of_birth')}
              InputLabelProps={{ shrink: true }}
            />
            <TextField label="Gender" select size="small" value={form.gender || ''} onChange={set('gender')}>
              <MenuItem value="">Not set</MenuItem>
              {GENDERS.map((g) => (
                <MenuItem key={g.value} value={g.value}>
                  {g.label}
                </MenuItem>
              ))}
            </TextField>
            <TextField label="City" size="small" value={form.city || ''} onChange={set('city')} />
            <TextField label="State" size="small" value={form.state || ''} onChange={set('state')} />
            <TextField label="School / College" size="small" value={form.school_college || ''} onChange={set('school_college')} />
            <TextField label="Phone" size="small" value={form.phone || ''} onChange={set('phone')} />
            <TextField
              label="Personal Gmail"
              size="small"
              value={form.personal_email || ''}
              onChange={set('personal_email')}
              sx={{ gridColumn: { sm: '1 / -1' } }}
            />
          </Box>
        </DialogContent>
        <Divider />
        <DialogActions sx={{ p: 2, gap: 1 }}>
          <Button onClick={() => setOpen(false)} disabled={saving} sx={{ textTransform: 'none' }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={save}
            disabled={saving}
            startIcon={saving ? <CircularProgress size={16} color="inherit" /> : null}
            sx={{ textTransform: 'none', bgcolor: ACCENT, '&:hover': { bgcolor: '#92400E' }, minWidth: 120 }}
          >
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>
    </SectionCard>
  );
}
