'use client';

/**
 * Admin > Centres: each classroom and what its public page still needs
 * (photos, real hours, a reviewed description, the Google profile). Desktop
 * first. Entered from the sidebar (Marketing); each row opens the editor,
 * whose Back returns here.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Alert, Box, Button, LinearProgress, Paper, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@neram/ui';
import StorefrontOutlinedIcon from '@mui/icons-material/StorefrontOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import { OpsPageHeader, OpsSkeleton, EmptyState, StatusChip, TARGET_44 } from '@/components/ops/OpsUi';
import type { CentreRow, CheckItem } from '@/lib/centre-editor';

type Centre = CentreRow & { checklist: CheckItem[] };

export default function CentresPage() {
  const [centres, setCentres] = useState<Centre[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/centres')
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || 'Could not load the centres');
        if (!cancelled) setCentres(body.centres);
      })
      .catch((e) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Box>
      <OpsPageHeader
        icon={StorefrontOutlinedIcon}
        title="Centres"
        subtitle="What each classroom page shows on neramclasses.com and Google: photos, address, hours, the About text and the Google profile."
      />

      {error && <Alert severity="error">{error}</Alert>}
      {!centres && !error && <OpsSkeleton variant="rounded" height={360} />}
      {centres && centres.length === 0 && <EmptyState icon={StorefrontOutlinedIcon} title="No centres yet" body="Centres come from the offline_centers table." />}

      {centres && centres.length > 0 && (
        <Paper variant="outlined">
          <Table aria-label="Centres and what their pages still need">
            <TableHead>
              <TableRow>
                <TableCell>Centre</TableCell>
                <TableCell sx={{ width: 200 }}>Page ready</TableCell>
                <TableCell>Still needed</TableCell>
                <TableCell align="right" sx={{ width: 120 }} />
              </TableRow>
            </TableHead>
            <TableBody>
              {centres.map((c) => {
                const done = c.checklist.filter((i) => i.done).length;
                const missing = c.checklist.filter((i) => !i.done);
                return (
                  <TableRow key={c.id} hover>
                    <TableCell>
                      <Typography sx={{ fontWeight: 600 }}>{c.name}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        {c.city}
                        {c.is_active === false ? ' (inactive)' : ''}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ mb: 0.5 }}>
                        {done} of {c.checklist.length}
                      </Typography>
                      <LinearProgress
                        variant="determinate"
                        value={(done / c.checklist.length) * 100}
                        color={missing.length === 0 ? 'success' : 'primary'}
                        aria-label={`${done} of ${c.checklist.length} items done`}
                        sx={{ height: 6, borderRadius: 3 }}
                      />
                    </TableCell>
                    <TableCell>
                      {missing.length === 0 ? (
                        <StatusChip icon={CheckCircleOutlineIcon} label="Ready" tone="success" />
                      ) : (
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                          {missing.map((i) => (
                            <StatusChip key={i.key} icon={ErrorOutlineIcon} label={i.label} tone="warning" />
                          ))}
                        </Box>
                      )}
                    </TableCell>
                    <TableCell align="right">
                      <Button component={Link} href={`/centres/${c.id}`} variant="outlined" sx={TARGET_44}>
                        Edit
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Paper>
      )}
    </Box>
  );
}
