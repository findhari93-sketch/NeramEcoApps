'use client';

/**
 * Shadow comparison: how close AI drafts land to your own scores.
 *
 * Entered from Drawing evaluation references; Back returns there.
 *
 * Counts, per criterion, from every criterion scored by a teacher beside a
 * draft: how many compared, how many exactly the same, how many within one
 * band. This is the evidence approving drafts unread waits for, so the gate's
 * state and its reason sit at the top. With evaluation switched off nothing
 * has been compared, and the page says exactly that rather than showing zeros
 * that look like a result.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import NextLink from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Alert, Box, Button, Paper, Skeleton, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography,
} from '@neram/ui';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CompareArrowsOutlinedIcon from '@mui/icons-material/CompareArrowsOutlined';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { criterionTitle } from '@/lib/drawing-grading-profile';
import type { ReleaseGate, ShadowAgreement } from '@/lib/drawing-ai-draft';

interface Payload {
  agreement: ShadowAgreement;
  drafts: number;
  gate: ReleaseGate;
  floor: { sheets: number; within_one: number };
}

export default function ShadowAgreementPage() {
  const router = useRouter();
  const { isAdmin, loading: authLoading, getToken } = useNexusAuthContext();
  const tokenRef = useRef(getToken);
  tokenRef.current = getToken;
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const token = await tokenRef.current();
      const res = await fetch('/api/drawing/evaluations/agreement', { headers: { Authorization: `Bearer ${token}` } });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Could not load the comparison');
      setData(body);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the comparison');
    }
  }, []);

  useEffect(() => {
    if (!authLoading && !isAdmin) router.replace('/teacher');
  }, [authLoading, isAdmin, router]);

  useEffect(() => {
    if (!authLoading && isAdmin) void load();
  }, [authLoading, isAdmin, load]);

  return (
    <Box sx={{ px: { xs: 2, md: 3 }, py: 2, maxWidth: 900, mx: 'auto' }}>
      <Button component={NextLink} href="/teacher/admin/drawing-anchors" startIcon={<ArrowBackIcon />} sx={{ minHeight: 44, textTransform: 'none', ml: -1, mb: 1 }}>
        Drawing evaluation references
      </Button>
      <Typography variant="h5" component="h1" fontWeight={700}>
        Drafts beside your grading
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 2, maxWidth: 680 }}>
        Every criterion you score on a sheet that has a draft is compared with it. Approving drafts unread stays shut until {data?.floor.sheets ?? 50} sheets are compared and the drafts land within one band of you on every criterion.
      </Typography>

      {error && <Alert severity="error" action={<Button onClick={() => void load()}>Try again</Button>}>{error}</Alert>}
      {!data && !error && (
        <Stack spacing={2}>
          <Skeleton variant="rounded" height={88} />
          <Skeleton variant="rounded" height={220} />
        </Stack>
      )}

      {data && (
        <>
          <Alert severity={data.gate.ready ? 'success' : 'info'} sx={{ mb: 2 }} data-testid="agreement-gate">
            {data.gate.reason}
          </Alert>

          {data.agreement.pairs === 0 ? (
            <Paper variant="outlined" sx={{ p: 3, textAlign: 'center', borderRadius: 2 }} data-testid="agreement-empty">
              <CompareArrowsOutlinedIcon aria-hidden sx={{ fontSize: 36, color: 'text.disabled', mb: 1 }} />
              <Typography variant="body1" fontWeight={600} gutterBottom>
                Nothing compared yet
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 480, mx: 'auto' }}>
                {data.drafts === 0
                  ? 'No draft has been made. Drafts are made only when evaluation is switched on for a brief and someone presses Draft this on a review.'
                  : `${data.drafts} ${data.drafts === 1 ? 'draft exists' : 'drafts exist'}, but none has been scored by a teacher yet. Finish reviewing a drafted sheet and it is counted here.`}
              </Typography>
            </Paper>
          ) : (
            <>
              <Typography variant="body1" sx={{ mb: 1 }}>
                <Box component="span" fontWeight={700}>{data.agreement.sheets}</Box> of {data.floor.sheets} sheets compared, {data.agreement.pairs} criterion scores.
              </Typography>
              <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2, overflowX: 'auto' }}>
                <Table size="small" aria-label="Agreement by criterion">
                  <TableHead>
                    <TableRow>
                      <TableCell>Criterion</TableCell>
                      <TableCell align="right">Compared</TableCell>
                      <TableCell align="right">Same band</TableCell>
                      <TableCell align="right">Within one band</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {data.agreement.criteria.map((c) => (
                      <TableRow key={c.criterion_key}>
                        <TableCell component="th" scope="row">{criterionTitle(c.criterion_key)}</TableCell>
                        <TableCell align="right">{c.compared}</TableCell>
                        <TableCell align="right">{c.exact}</TableCell>
                        <TableCell align="right">{c.withinOne}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </>
          )}
        </>
      )}
    </Box>
  );
}
