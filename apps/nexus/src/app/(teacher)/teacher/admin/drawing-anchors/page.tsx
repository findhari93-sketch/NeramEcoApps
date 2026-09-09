'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Chip,
  CircularProgress,
  Divider,
  Paper,
  Skeleton,
  Stack,
  Typography,
} from '@neram/ui';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import { useRouter } from 'next/navigation';

import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import AnchorPicker, { type AnchorRow } from '@/components/drawings/AnchorPicker';

/**
 * Set up the reference sheets AI drawing evaluation is scored against.
 *
 * This is the whole of the feature's setup, and it is deliberately one screen
 * showing what is still missing rather than a form. A brief type needs two
 * separate things before it can evaluate anything, and they come from different
 * places: five graded anchor sheets, picked here, and band wording, which has
 * to be written by hand. Splitting them across screens would hide the fact that
 * one is blocked on the other.
 *
 * Nothing on this page spends money. Turning evaluation on is a separate switch
 * on the AI usage page.
 */

interface BriefType {
  id: string;
  key: string;
  category: string;
  sub_type: string;
  title: string;
  description: string | null;
  is_active: boolean;
}

interface BriefDetail {
  brief_type: BriefType;
  anchors: AnchorRow[];
  missing_bands: string[];
  criteria_ready: boolean;
  anchors_ready: boolean;
}

function ReadinessRow({ done, children }: { done: boolean; children: React.ReactNode }) {
  return (
    <Stack direction="row" spacing={1} alignItems="flex-start">
      {done ? (
        <CheckCircleOutlineIcon fontSize="small" color="success" sx={{ mt: 0.25 }} />
      ) : (
        <RadioButtonUncheckedIcon fontSize="small" color="disabled" sx={{ mt: 0.25 }} />
      )}
      <Typography
        variant="body2"
        color={done ? 'text.primary' : 'text.secondary'}
        sx={{ flex: 1 }}
      >
        {children}
      </Typography>
    </Stack>
  );
}

export default function DrawingAnchorsPage() {
  const router = useRouter();
  const { isAdmin, loading: authLoading, getToken } = useNexusAuthContext();

  const [briefTypes, setBriefTypes] = useState<BriefType[]>([]);
  const [details, setDetails] = useState<Record<string, BriefDetail>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const token = await getToken();
      if (!token) throw new Error('Your session expired. Please refresh and try again.');
      const headers = { Authorization: `Bearer ${token}` };

      const listRes = await fetch('/api/drawing/anchors', { headers });
      const listJson = await listRes.json();
      if (!listRes.ok) throw new Error(listJson?.error || 'Could not load brief types');

      const types = (listJson.brief_types || []) as BriefType[];
      setBriefTypes(types);

      const loaded = await Promise.all(
        types.map(async (t) => {
          const res = await fetch(`/api/drawing/anchors?brief_type=${encodeURIComponent(t.key)}`, { headers });
          return res.ok ? ((await res.json()) as BriefDetail) : null;
        }),
      );

      const map: Record<string, BriefDetail> = {};
      for (const d of loaded) if (d) map[d.brief_type.key] = d;
      setDetails(map);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load brief types');
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    if (!authLoading && !isAdmin) router.replace('/teacher');
  }, [authLoading, isAdmin, router]);

  useEffect(() => {
    if (!authLoading && isAdmin) void load();
  }, [authLoading, isAdmin, load]);

  if (authLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1200, mx: 'auto' }}>
      <Typography variant="h5" fontWeight={700} gutterBottom>
        Drawing evaluation references
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3, maxWidth: 720 }}>
        Five graded sheets per brief type, one per band. An evaluation is never an absolute score:
        the model is asked where a new sheet sits between these five, so these are the judgement
        and everything else is plumbing. Changing one changes every evaluation of that brief
        type from then on.
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {loading && (
        <Stack spacing={3}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} variant="rectangular" height={280} sx={{ borderRadius: 2 }} />
          ))}
        </Stack>
      )}

      {!loading && briefTypes.length === 0 && !error && (
        <Paper variant="outlined" sx={{ p: 4, textAlign: 'center' }}>
          <Typography variant="body1" fontWeight={600} gutterBottom>
            No brief types have been set up yet.
          </Typography>
          <Typography variant="body2" color="text.secondary">
            The seed migration creates one per recurring drawing task. Until then there is nothing
            to anchor.
          </Typography>
        </Paper>
      )}

      <Stack spacing={3}>
        {briefTypes.map((briefType) => {
          const detail = details[briefType.key];
          const anchors = detail?.anchors || [];
          const missingBands = detail?.missing_bands || [];
          const criteriaReady = detail?.criteria_ready ?? false;
          const anchorsReady = anchors.length === 5;

          return (
            <Paper key={briefType.key} variant="outlined" sx={{ p: { xs: 2, md: 2.5 }, borderRadius: 2 }}>
              <Stack
                direction={{ xs: 'column', sm: 'row' }}
                spacing={1}
                alignItems={{ xs: 'flex-start', sm: 'center' }}
                sx={{ mb: 2 }}
              >
                <Box sx={{ flex: 1 }}>
                  <Typography variant="h6" fontWeight={700}>
                    {briefType.title}
                  </Typography>
                  {briefType.description && (
                    <Typography variant="body2" color="text.secondary">
                      {briefType.description}
                    </Typography>
                  )}
                </Box>
                <Chip
                  size="small"
                  label={briefType.is_active ? 'Evaluating' : 'Not ready'}
                  color={briefType.is_active ? 'success' : 'default'}
                  variant={briefType.is_active ? 'filled' : 'outlined'}
                />
              </Stack>

              <Box
                sx={{
                  p: 1.5,
                  mb: 2,
                  bgcolor: 'action.hover',
                  borderRadius: 1.5,
                }}
              >
                <Typography variant="caption" fontWeight={700} color="text.secondary" display="block" sx={{ mb: 1 }}>
                  BEFORE THIS BRIEF TYPE CAN BE EVALUATED
                </Typography>
                <Stack spacing={0.75}>
                  <ReadinessRow done={anchorsReady}>
                    {anchorsReady
                      ? 'All five reference sheets are set.'
                      : `Reference sheets set for ${anchors.length} of 5 bands.`}
                  </ReadinessRow>
                  <ReadinessRow done={criteriaReady}>
                    {criteriaReady
                      ? 'Band wording is written for every criterion.'
                      : missingBands.length > 0
                      ? `Band wording still needed. ${missingBands.join('. ')}.`
                      : 'Band wording still needs to be written.'}
                  </ReadinessRow>
                </Stack>
                {!criteriaReady && (
                  <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                    Band wording has to be written by hand. The existing review text cannot be used
                    for it: almost all of it is model output pasted back from the manual workflow,
                    and it reads as praise at every band.
                  </Typography>
                )}
              </Box>

              <Divider sx={{ mb: 2 }} />

              {detail ? (
                <AnchorPicker
                  briefTypeKey={briefType.key}
                  briefTypeTitle={briefType.title}
                  anchors={anchors}
                  getToken={getToken}
                  onChanged={load}
                />
              ) : (
                <Skeleton variant="rectangular" height={200} sx={{ borderRadius: 1 }} />
              )}
            </Paper>
          );
        })}
      </Stack>
    </Box>
  );
}
