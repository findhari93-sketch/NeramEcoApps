'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Alert, Button, CircularProgress, Typography } from '@neram/ui';
import { useFirebaseAuth } from '@neram/auth';
import BookmarkAddOutlinedIcon from '@mui/icons-material/BookmarkAddOutlined';
import BookmarkAddedRoundedIcon from '@mui/icons-material/BookmarkAddedRounded';
import type { BookSuggestion } from '@/lib/aintra/booking';
import { getSavedColleges, toggleSavedCollege } from '@/components/college-hub/SaveCollegeButton';
import { currentIdToken } from '@/components/demo-class/demo-client';
import { BookingCardFrame } from './BookingContext';

const buttonSx = { minHeight: 48, fontWeight: 800, textTransform: 'none', fontSize: '1rem' } as const;

/**
 * "Save this college to my list", from the Aintra chat (2026-10-20). Signed
 * in, it saves to the account (/api/colleges/saved), like the college page's
 * own button, and always to this device's list too, because /colleges/saved
 * shows only the device's list.
 */
export default function SaveCollegeCard({ suggestion }: { suggestion: BookSuggestion }) {
  const { user } = useFirebaseAuth();
  const f = suggestion.draft?.fields ?? {};
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const token = user ? await currentIdToken() : null;
      if (token && f.collegeId) {
        const res = await fetch('/api/colleges/saved', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ college_id: f.collegeId, action: 'save' }),
        });
        if (!res.ok) throw new Error('Could not save. Please try again.');
      }
      // Also on this device: /colleges/saved lists the device's saves only.
      if (f.slug && !getSavedColleges().includes(f.slug)) toggleSavedCollege(f.slug);
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  if (saved) {
    return (
      <BookingCardFrame icon={<BookmarkAddedRoundedIcon />} title="Saved to your list" labelledBy="aintra-save-college-done">
        <Typography role="status" sx={{ fontSize: '1rem', lineHeight: 1.5 }}>
          {f.collegeName} is on your list.
        </Typography>
        <Button component={Link} href="/colleges/saved" variant="outlined" sx={{ alignSelf: 'flex-start', minHeight: 48, textTransform: 'none', fontWeight: 700 }}>
          See my list
        </Button>
      </BookingCardFrame>
    );
  }

  return (
    <BookingCardFrame icon={<BookmarkAddOutlinedIcon />} title={`Save ${f.collegeName ?? 'this college'}`} labelledBy="aintra-save-college-title">
      <Typography sx={{ fontSize: '1rem', lineHeight: 1.5 }}>
        Keep it on your shortlist to compare with others later.{user ? '' : ' Sign in to keep your list on every device.'}
      </Typography>
      {error && (
        <Alert severity="error" role="alert">
          {error}
        </Alert>
      )}
      <Button
        variant="contained"
        disableElevation
        fullWidth
        onClick={save}
        disabled={busy}
        startIcon={busy ? <CircularProgress size={18} color="inherit" /> : <BookmarkAddOutlinedIcon />}
        sx={buttonSx}
      >
        {busy ? 'Saving' : 'Save to my list'}
      </Button>
    </BookingCardFrame>
  );
}
