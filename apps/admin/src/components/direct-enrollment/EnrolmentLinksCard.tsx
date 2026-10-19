'use client';

import { useCallback, useEffect, useState } from 'react';
import { Alert, Box, Button, Chip, Skeleton, Typography } from '@neram/ui';
import LinkIcon from '@mui/icons-material/Link';
import { SectionCard, EmptyNote } from '@/components/user360/shared';
import { linkMoneyLine } from '@/components/demo-requests/EnrolmentLinkStatus';
import EnrolmentLinkDrawer, { type EnrolmentLinkChange } from './EnrolmentLinkDrawer';
import type { EnrolmentLinkPrefill } from './useEnrolmentLinkForm';

const STATUS: Record<string, { label: string; color: 'success' | 'info' | 'warning' | 'default' }> = {
  active: { label: 'Active', color: 'success' },
  payment_submitted: { label: 'Payment to verify', color: 'warning' },
  used: { label: 'Completed', color: 'info' },
  expired: { label: 'Expired', color: 'warning' },
  cancelled: { label: 'Cancelled', color: 'default' },
};

function shortDate(value: string): string {
  return new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
}

/** Every enrolment link made for this person, newest active first, on their profile. */
export default function EnrolmentLinksCard({
  userId,
  adminId,
  prefill,
  onChanged,
}: {
  userId: string;
  adminId: string;
  prefill?: EnrolmentLinkPrefill;
  onChanged?: (change: EnrolmentLinkChange) => void;
}) {
  const [links, setLinks] = useState<any[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<{ linkId: string | null } | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`/api/direct-enrollment?userId=${encodeURIComponent(userId)}&limit=20`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Could not load enrolment links.');
      setLinks(json.data || []);
    } catch (err: any) {
      setError(err?.message || 'Could not load enrolment links.');
      setLinks([]);
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  // A submitted payment blocks a new link too: verify or reject it first.
  const hasActive = (links || []).some((l) => l.status === 'active' || l.status === 'payment_submitted');

  return (
    <SectionCard
      title={`Enrolment links${links ? ` (${links.length})` : ''}`}
      icon={<LinkIcon />}
      action={
        !hasActive && links !== null ? (
          <Button size="small" variant="outlined" onClick={() => setOpen({ linkId: null })} sx={{ minHeight: 40 }}>
            New link
          </Button>
        ) : undefined
      }
    >
      {error && <Alert severity="error" sx={{ mb: 1 }}>{error}</Alert>}
      {links === null ? (
        <Box sx={{ display: 'grid', gap: 1 }}>
          <Skeleton variant="rounded" height={64} />
          <Skeleton variant="rounded" height={64} />
        </Box>
      ) : links.length === 0 ? (
        <EmptyNote>No enrolment link has been made for this person.</EmptyNote>
      ) : (
        <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 1.25 }}>
          {links.map((l) => {
            const s = STATUS[l.status] || STATUS.active;
            return (
              <Box
                component="li"
                key={l.id}
                sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 1.25, display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}
              >
                <Box sx={{ flex: 1, minWidth: 200 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                    <Chip size="small" label={s.label} color={s.color} sx={{ fontWeight: 600 }} />
                    <Typography variant="body2" fontWeight={600}>{linkMoneyLine(l)}</Typography>
                  </Box>
                  <Typography variant="caption" color="text.secondary">
                    Made {shortDate(l.created_at)}
                    {l.share_count ? `, shared ${l.share_count} times` : l.status === 'active' ? ', not shared yet' : ''}
                    {l.used_at ? `, used ${shortDate(l.used_at)}` : ''}
                  </Typography>
                </Box>
                <Button size="small" onClick={() => setOpen({ linkId: l.id })} sx={{ minHeight: 40 }}>
                  View
                </Button>
              </Box>
            );
          })}
        </Box>
      )}

      <EnrolmentLinkDrawer
        open={open !== null}
        onClose={() => setOpen(null)}
        adminId={adminId}
        prefill={prefill}
        linkId={open?.linkId ?? null}
        onChanged={(_, change) => {
          load();
          onChanged?.(change);
        }}
      />
    </SectionCard>
  );
}
