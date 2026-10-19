'use client';

/**
 * Link a parent account to a child (user_guardian_links, migration 20261209090000).
 *
 * One side is known (the parent from the People banner, or the person open in
 * User 360); staff search for the other. Search reuses the demo desk's people
 * search, which covers leads, students and parent accounts.
 */

import { useEffect, useState } from 'react';
import {
  Autocomplete,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  TextField,
  Typography,
} from '@neram/ui';
import type { DemoPerson } from '@/app/api/demo-requests/people/route';

type Relationship = 'parent' | 'guardian' | 'other';

interface LinkParentDialogProps {
  open: boolean;
  onClose: () => void;
  onLinked: () => void;
  /** The known person and which side they are on. */
  known: { id: string; name: string | null; role: 'guardian' | 'student' };
  /** Starts the search, e.g. the child's name from the demo booking. */
  initialQuery?: string;
}

export default function LinkParentDialog({ open, onClose, onLinked, known, initialQuery = '' }: LinkParentDialogProps) {
  const [query, setQuery] = useState(initialQuery);
  const [options, setOptions] = useState<DemoPerson[]>([]);
  const [picked, setPicked] = useState<DemoPerson | null>(null);
  const [relationship, setRelationship] = useState<Relationship>('parent');
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setQuery(initialQuery);
      setPicked(null);
      setRelationship('parent');
      setError('');
    }
  }, [open, initialQuery]);

  useEffect(() => {
    const q = query.trim();
    if (!open || q.length < 2) {
      setOptions([]);
      return;
    }
    const timer = setTimeout(() => {
      setSearching(true);
      fetch(`/api/demo-requests/people?q=${encodeURIComponent(q)}`)
        .then((r) => r.json())
        .then((d) => setOptions(((d.people || []) as DemoPerson[]).filter((p) => p.id !== known.id)))
        .catch(() => setOptions([]))
        .finally(() => setSearching(false));
    }, 250);
    return () => clearTimeout(timer);
  }, [query, open, known.id]);

  const otherSide = known.role === 'guardian' ? 'student' : 'parent';

  const save = async () => {
    if (!picked) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/crm/guardians', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          guardianUserId: known.role === 'guardian' ? known.id : picked.id,
          studentUserId: known.role === 'guardian' ? picked.id : known.id,
          relationship,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not link them.');
      onLinked();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={() => !saving && onClose()} maxWidth="sm" fullWidth>
      <DialogTitle>
        {known.role === 'guardian' ? `Link ${known.name || 'this parent'} to their child` : `Add a parent for ${known.name || 'this student'}`}
      </DialogTitle>
      <DialogContent sx={{ display: 'grid', gap: 2, pt: '8px !important' }}>
        <Typography variant="body2" color="text.secondary">
          {known.role === 'guardian'
            ? 'Find the student account (often their Microsoft @neramclasses.com account). The parent then shows on the student’s row and leaves the People list.'
            : 'Find the parent’s account (often the one that booked the demo or paid). It then shows on this student’s row and leaves the People list.'}
        </Typography>
        <Autocomplete
          options={options}
          value={picked}
          onChange={(_, v) => setPicked(v)}
          inputValue={query}
          onInputChange={(_, v, reason) => reason !== 'reset' && setQuery(v)}
          filterOptions={(x) => x}
          getOptionLabel={(o) => o.name || o.email || o.phone || 'Unnamed'}
          isOptionEqualToValue={(a, b) => a.id === b.id}
          loading={searching}
          noOptionsText={query.trim().length < 2 ? 'Type at least 2 letters' : 'Nobody found'}
          renderOption={(props, o) => (
            <Box component="li" {...props} key={o.id} sx={{ display: 'block !important', py: '8px !important' }}>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {o.name || 'Unnamed'}
                {o.is_parent_account && (
                  <Typography component="span" variant="caption" color="text.secondary">
                    {' '}
                    (parent account)
                  </Typography>
                )}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {[o.email, o.phone, o.user_type].filter(Boolean).join(' · ')}
              </Typography>
            </Box>
          )}
          renderInput={(params) => (
            <TextField
              {...params}
              autoFocus
              label={`Search the ${otherSide} by name, email or phone`}
              InputProps={{
                ...params.InputProps,
                endAdornment: (
                  <>
                    {searching && <CircularProgress size={18} />}
                    {params.InputProps.endAdornment}
                  </>
                ),
              }}
            />
          )}
        />
        <TextField select label="Relationship" value={relationship} onChange={(e) => setRelationship(e.target.value as Relationship)}>
          <MenuItem value="parent">Parent</MenuItem>
          <MenuItem value="guardian">Guardian</MenuItem>
          <MenuItem value="other">Other family</MenuItem>
        </TextField>
        {error && (
          <Typography color="error" variant="body2" role="alert">
            {error}
          </Typography>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving} sx={{ minHeight: 44 }}>
          Cancel
        </Button>
        <Button variant="contained" onClick={save} disabled={!picked || saving} sx={{ minHeight: 44 }}>
          {saving ? 'Linking' : 'Link'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
