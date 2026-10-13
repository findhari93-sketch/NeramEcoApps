'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Alert, Box, Button, Paper, ToggleButton, ToggleButtonGroup, Typography } from '@neram/ui';
import PhoneMissedOutlinedIcon from '@mui/icons-material/PhoneMissedOutlined';
import TaskAltIcon from '@mui/icons-material/TaskAlt';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import RefreshIcon from '@mui/icons-material/Refresh';
import type { UnverifiedPhoneAttempt } from '@neram/database';
import { OpsPageHeader, EmptyState, OpsSkeleton, FOCUS_RING, TARGET_44 } from '@/components/ops/OpsUi';
import PhoneNumberList from '@/components/user360/PhoneNumberList';
import { groupAttemptsByPerson } from '@/lib/phone-attempts-view';

const DAY_CHOICES = [7, 30, 90] as const;

/**
 * People who typed a number into a phone sign-in and never verified it: the
 * OTP failed, never arrived, or they gave up. Every number is saved the moment
 * Send OTP is tapped, so staff can still call. A number drops off this list as
 * soon as any account verifies it.
 */
export default function PhoneSignInPage() {
  const [days, setDays] = useState<(typeof DAY_CHOICES)[number]>(30);
  const [attempts, setAttempts] = useState<UnverifiedPhoneAttempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/phone-attempts?days=${days}`, { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not load the numbers.');
      setAttempts(data.attempts || []);
    } catch (e: any) {
      setError(e?.message || 'Could not load the numbers.');
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    load();
  }, [load]);

  const people = useMemo(() => groupAttemptsByPerson(attempts), [attempts]);

  return (
    <Box sx={{ maxWidth: 960 }}>
      <OpsPageHeader
        icon={PhoneMissedOutlinedIcon}
        title="Stuck at phone sign-in"
        subtitle="Numbers typed into a phone sign-in that were never verified. Call or WhatsApp them to help them finish."
        actions={
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
            <ToggleButtonGroup
              exclusive
              size="small"
              value={days}
              onChange={(_, v) => v && setDays(v)}
              aria-label="How far back"
            >
              {DAY_CHOICES.map((d) => (
                <ToggleButton key={d} value={d} sx={{ ...TARGET_44, px: 1.5, textTransform: 'none', ...FOCUS_RING }}>
                  Last {d} days
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
            <Button
              variant="outlined"
              startIcon={<RefreshIcon />}
              onClick={load}
              disabled={loading}
              sx={{ ...TARGET_44, textTransform: 'none', ...FOCUS_RING }}
            >
              Refresh
            </Button>
          </Box>
        }
      />

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} action={<Button onClick={load}>Try again</Button>}>
          {error}
        </Alert>
      )}

      {loading ? (
        <Box aria-busy="true" aria-label="Loading" sx={{ display: 'grid', gap: 1.5 }}>
          {[0, 1, 2].map((i) => (
            <OpsSkeleton key={i} variant="rounded" height={112} />
          ))}
        </Box>
      ) : !error && people.length === 0 ? (
        <EmptyState
          icon={TaskAltIcon}
          title="Nobody is stuck"
          body={`Every number typed in the last ${days} days was verified.`}
        />
      ) : (
        <Box sx={{ display: 'grid', gap: 1.5 }}>
          <Typography variant="body2" color="text.secondary">
            {people.length} {people.length === 1 ? 'person' : 'people'}, {attempts.length}{' '}
            {attempts.length === 1 ? 'number' : 'numbers'}
          </Typography>
          {people.map((person) => {
            const user = person.attempts[0]?.user ?? null;
            return (
              <Paper key={person.key} variant="outlined" sx={{ p: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5, minWidth: 0 }}>
                  <PersonOutlineIcon sx={{ fontSize: 20, color: 'text.secondary' }} aria-hidden />
                  {user ? (
                    <Typography
                      component={Link}
                      href={`/crm/${user.id}?from=phone-sign-in`}
                      variant="subtitle2"
                      sx={{ color: 'primary.main', fontWeight: 600, ...FOCUS_RING, overflowWrap: 'anywhere' }}
                    >
                      {user.name || user.email || 'Unnamed account'}
                    </Typography>
                  ) : (
                    <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                      Visitor, no account yet
                    </Typography>
                  )}
                </Box>
                <PhoneNumberList numbers={person.attempts} />
              </Paper>
            );
          })}
        </Box>
      )}
    </Box>
  );
}
