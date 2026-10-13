'use client';

/**
 * Where this centre's past students are sent to post a review: Google, Justdial
 * and Sulekha. Each link saves on its own, so fixing one never touches the others.
 */
import { useEffect, useState } from 'react';
import { Alert, Box, Button, Card, CircularProgress, Stack, TextField, Typography } from '@neram/ui';
import { PLATFORM_HINTS, PLATFORM_LABELS, REVIEW_LINK_PLATFORMS, type ReviewLinkPlatform } from '@/lib/review-links';

export default function CentreReviewLinks({ centreId, onSaved }: { centreId: string; onSaved?: (message: string) => void }) {
  const [links, setLinks] = useState<Partial<Record<ReviewLinkPlatform, string>>>({});
  const [draft, setDraft] = useState<Partial<Record<ReviewLinkPlatform, string>>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<ReviewLinkPlatform | null>(null);
  const [errors, setErrors] = useState<Partial<Record<ReviewLinkPlatform, string>>>({});
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/centres/${centreId}/review-links`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((b) => {
        if (cancelled) return;
        setLinks(b.links || {});
        setDraft(b.links || {});
      })
      .catch(() => !cancelled && setLoadError('Could not load the review links.'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [centreId]);

  const save = async (platform: ReviewLinkPlatform) => {
    setSaving(platform);
    setErrors((e) => ({ ...e, [platform]: undefined }));
    try {
      const res = await fetch(`/api/centres/${centreId}/review-links`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform, url: draft[platform] || '' }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Could not save.');
      setLinks((l) => ({ ...l, [platform]: body.url || undefined }));
      setDraft((d) => ({ ...d, [platform]: body.url || '' }));
      onSaved?.(body.url ? `${PLATFORM_LABELS[platform]} saved.` : `${PLATFORM_LABELS[platform]} removed.`);
    } catch (e: any) {
      setErrors((x) => ({ ...x, [platform]: e.message || 'Could not save.' }));
    } finally {
      setSaving(null);
    }
  };

  return (
    <Card variant="outlined" component="section" aria-labelledby="review-links-title" sx={{ p: 3 }}>
      <Typography id="review-links-title" component="h2" sx={{ fontWeight: 700 }}>
        Review links
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        After a past student leaves a review on the website, they are sent to post it on this centre&apos;s Google page, then to
        one of Justdial or Sulekha. Students who studied online are sent to headquarters.
      </Typography>
      {loadError && <Alert severity="error" sx={{ mb: 2 }}>{loadError}</Alert>}
      {loading ? (
        <CircularProgress size={24} aria-label="Loading review links" />
      ) : (
        <Stack spacing={2}>
          {REVIEW_LINK_PLATFORMS.map((p) => {
            const changed = (draft[p] || '') !== (links[p] || '');
            return (
              <Box key={p} sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', flexWrap: { xs: 'wrap', md: 'nowrap' } }}>
                <TextField
                  label={PLATFORM_LABELS[p]}
                  value={draft[p] || ''}
                  onChange={(e) => setDraft((d) => ({ ...d, [p]: e.target.value }))}
                  error={Boolean(errors[p])}
                  helperText={errors[p] || PLATFORM_HINTS[p]}
                  placeholder="https://"
                  fullWidth
                  inputProps={{ inputMode: 'url' }}
                />
                <Button
                  variant={changed ? 'contained' : 'outlined'}
                  onClick={() => save(p)}
                  disabled={!changed || saving === p}
                  sx={{ minHeight: 56, minWidth: 96, textTransform: 'none', fontWeight: 600, boxShadow: 'none' }}
                >
                  {saving === p ? 'Saving...' : (draft[p] || '') ? 'Save' : 'Remove'}
                </Button>
              </Box>
            );
          })}
        </Stack>
      )}
    </Card>
  );
}
