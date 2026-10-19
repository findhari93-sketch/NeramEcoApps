'use client';

/**
 * Family on User 360: this person's parents, or, for a parent account, their
 * children. Links come from user_guardian_links (Admin) and nexus_parent_links
 * (Nexus parent logins, read-only here).
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Box, Button, Skeleton, Typography } from '@neram/ui';
import FamilyRestroomOutlinedIcon from '@mui/icons-material/FamilyRestroomOutlined';
import type { GuardianSummary } from '@neram/database';
import LinkParentDialog from '@/components/crm/LinkParentDialog';
import FamilyContacts from './FamilyContacts';
import { EmptyNote, SectionCard } from './shared';

const RELATION: Record<GuardianSummary['relationship'], string> = {
  parent: 'Parent',
  guardian: 'Guardian',
  other: 'Family',
};

export default function FamilyCard({
  personId,
  personName,
  isParentAccount,
}: {
  personId: string;
  personName: string | null;
  isParentAccount: boolean;
}) {
  const [data, setData] = useState<{ guardians: GuardianSummary[]; children: GuardianSummary[] } | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    fetch(`/api/crm/guardians?person=${personId}`)
      .then((r) => r.json())
      .then((d) => setData({ guardians: d.guardians || [], children: d.children || [] }))
      .catch(() => setData({ guardians: [], children: [] }));
  }, [personId]);

  useEffect(() => {
    load();
  }, [load]);

  const unlink = async (linkId: string) => {
    setBusy(linkId);
    setError('');
    try {
      const res = await fetch(`/api/crm/guardians?id=${linkId}`, { method: 'DELETE' });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Could not remove the link.');
      load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  };

  // A parent account links to children; anyone else gets parents.
  const asGuardian = isParentAccount || (data?.children.length ?? 0) > 0;
  const rows = data ? (asGuardian ? data.children : data.guardians) : [];

  return (
    <SectionCard title="Family" icon={<FamilyRestroomOutlinedIcon />}>
      {!data ? (
        <Skeleton variant="rounded" height={48} />
      ) : (
        <>
          {rows.length === 0 ? (
            <EmptyNote>
              {asGuardian
                ? 'This is a parent account with no child linked yet. Link the child’s own account so the parent shows on their row.'
                : 'No parent linked. If a parent booked the demo or paid from their own account, link it here.'}
            </EmptyNote>
          ) : (
            <Box sx={{ display: 'grid', gap: 0.5 }}>
              {rows.map((r) => {
                const otherId = asGuardian ? r.student_user_id : r.guardian_user_id;
                return (
                  <Box
                    key={`${r.guardian_user_id}:${r.student_user_id}`}
                    sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.5, borderBottom: '1px solid', borderColor: 'grey.100' }}
                  >
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography
                        component={Link}
                        href={`/crm/${otherId}`}
                        variant="body2"
                        noWrap
                        sx={{ display: 'block', fontWeight: 600, color: 'primary.main', textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}
                      >
                        {r.name || r.email || 'Unnamed'}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
                        {asGuardian ? 'Child' : RELATION[r.relationship]}
                        {r.source === 'nexus' ? ' · Nexus parent login' : ''}
                        {r.phone ? ` · ${r.phone}` : ''}
                      </Typography>
                    </Box>
                    {r.link_id && (
                      <Button
                        size="small"
                        color="inherit"
                        onClick={() => unlink(r.link_id as string)}
                        disabled={busy === r.link_id}
                        sx={{ minHeight: 44, textTransform: 'none' }}
                      >
                        {busy === r.link_id ? 'Removing' : 'Unlink'}
                      </Button>
                    )}
                  </Box>
                );
              })}
            </Box>
          )}
          {error && (
            <Typography color="error" variant="body2" role="alert" sx={{ mt: 1 }}>
              {error}
            </Typography>
          )}
          <FamilyContacts personId={personId} />
          <Button onClick={() => setDialogOpen(true)} sx={{ mt: 1, minHeight: 44, textTransform: 'none' }}>
            {asGuardian ? 'Link a child' : 'Link a parent'}
          </Button>
          <LinkParentDialog
            open={dialogOpen}
            onClose={() => setDialogOpen(false)}
            onLinked={load}
            known={{ id: personId, name: personName, role: asGuardian ? 'guardian' : 'student' }}
          />
        </>
      )}
    </SectionCard>
  );
}
