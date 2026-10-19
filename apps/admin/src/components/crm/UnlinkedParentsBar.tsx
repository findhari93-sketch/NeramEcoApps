'use client';

/**
 * "N parent accounts are not linked to a student yet" on the People page.
 * A parent account (the demo desk's "parent's account") leaves the People list,
 * so staff need one place to link it to the child's own account.
 */

import { useCallback, useEffect, useState } from 'react';
import { Box, Button, Dialog, DialogContent, DialogTitle, IconButton, Typography } from '@neram/ui';
import FamilyRestroomOutlinedIcon from '@mui/icons-material/FamilyRestroomOutlined';
import CloseIcon from '@mui/icons-material/Close';
import type { UnlinkedGuardianAccount } from '@neram/database';
import LinkParentDialog from './LinkParentDialog';

export default function UnlinkedParentsBar({ onLinked }: { onLinked: () => void }) {
  const [accounts, setAccounts] = useState<UnlinkedGuardianAccount[]>([]);
  const [listOpen, setListOpen] = useState(false);
  const [linking, setLinking] = useState<UnlinkedGuardianAccount | null>(null);

  const load = useCallback(() => {
    fetch('/api/crm/guardians?unlinked=1')
      .then((r) => (r.ok ? r.json() : { accounts: [] }))
      .then((d) => setAccounts(d.accounts || []))
      .catch(() => setAccounts([]));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (accounts.length === 0) return null;
  const n = accounts.length;

  return (
    <>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 1,
          px: 1.5,
          minHeight: 52,
          borderRadius: 1,
          border: '1px solid',
          borderColor: 'grey.300',
          bgcolor: 'grey.50',
        }}
      >
        <FamilyRestroomOutlinedIcon aria-hidden sx={{ fontSize: 20, color: 'text.secondary' }} />
        <Typography variant="body2" sx={{ flex: '1 1 260px' }}>
          <b>
            {n} parent account{n === 1 ? ' is' : 's are'} not linked to a student yet.
          </b>{' '}
          Link {n === 1 ? 'it' : 'them'} so the parent shows on the child’s row.
        </Typography>
        <Button onClick={() => setListOpen(true)} sx={{ minHeight: 44, textTransform: 'none' }}>
          Link now
        </Button>
      </Box>

      <Dialog open={listOpen} onClose={() => setListOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ pr: 7 }}>
          Parent accounts to link
          <IconButton aria-label="Close" onClick={() => setListOpen(false)} sx={{ position: 'absolute', right: 8, top: 8 }}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers sx={{ p: 0 }}>
          {accounts.map((a) => (
            <Box
              key={a.user_id}
              sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 2, py: 1.25, borderBottom: '1px solid', borderColor: 'grey.100' }}
            >
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                  {a.name || 'Unnamed'}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }} noWrap>
                  {[a.phone, a.email].filter(Boolean).join(' · ')}
                </Typography>
                {a.demo_student_name && (
                  <Typography variant="caption" sx={{ display: 'block' }}>
                    Booked a demo for <b>{a.demo_student_name}</b>
                  </Typography>
                )}
              </Box>
              <Button variant="outlined" onClick={() => setLinking(a)} sx={{ minHeight: 44, textTransform: 'none', flexShrink: 0 }}>
                Link to student
              </Button>
            </Box>
          ))}
        </DialogContent>
      </Dialog>

      {linking && (
        <LinkParentDialog
          open
          onClose={() => setLinking(null)}
          known={{ id: linking.user_id, name: linking.name, role: 'guardian' }}
          initialQuery={linking.demo_student_name || ''}
          onLinked={() => {
            load();
            onLinked();
          }}
        />
      )}
    </>
  );
}
