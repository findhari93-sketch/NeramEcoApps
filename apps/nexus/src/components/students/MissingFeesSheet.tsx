'use client';

import { Box, Button, Dialog, Drawer, Paper, Typography, useMediaQuery, useTheme } from '@neram/ui';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import OpenInNewOutlinedIcon from '@mui/icons-material/OpenInNewOutlined';
import StudentAvatar from './StudentAvatar';
import { adminCrmUrl } from '@/lib/admin-links';

/**
 * "N students have an application but no fee details", opened from Needs
 * attention. Finance staff only: the roster route sends `fee_missing` to nobody
 * else, so for a teacher this list is always empty and the row never shows.
 *
 * Built from the roster rows already on screen, so it costs no request. Each
 * row links to the student's Application and fees form in Admin, where the fee
 * is entered and the student is sent it to check.
 *
 * Bottom sheet on a phone, dialog from 600px, like ApplicationFormSheet.
 */

export interface MissingFeesStudent {
  id: string;
  name: string;
  email: string | null;
}

export interface MissingFeesSheetProps {
  open: boolean;
  students: MissingFeesStudent[];
  onClose: () => void;
}

export default function MissingFeesSheet({ open, students, onClose }: MissingFeesSheetProps) {
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('sm'));

  const adminHref = (id: string) =>
    adminCrmUrl(id, {
      nexusOrigin: typeof window === 'undefined' ? null : window.location.origin,
      configured: process.env.NEXT_PUBLIC_ADMIN_URL ?? null,
      section: 'application',
      open: 'fees',
    });

  const sorted = [...students].sort((a, b) => a.name.localeCompare(b.name));

  const body = (
    <>
      <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1.5, overflowY: 'auto', flex: 1 }}>
        <Box>
          <Typography id="missing-fees-title" component="h2" sx={{ fontWeight: 800, fontSize: '1.05rem' }}>
            No fee details
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
            These students have an application but no fee details. Add their fees in Admin, then send it to them
            to check.
          </Typography>
        </Box>

        {sorted.length === 0 ? (
          <Box sx={{ py: 3, textAlign: 'center' }} role="status">
            <CheckCircleOutlineIcon aria-hidden sx={{ fontSize: 40, color: 'success.main' }} />
            <Typography sx={{ fontWeight: 700, mt: 0.5 }}>Every student with a form has fee details.</Typography>
          </Box>
        ) : (
          <Box component="ul" sx={{ listStyle: 'none', p: 0, m: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
            {sorted.map((student) => (
              <Paper
                key={student.id}
                component="li"
                variant="outlined"
                sx={{
                  borderRadius: 2,
                  p: 1.5,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1.25,
                  flexWrap: { xs: 'wrap', sm: 'nowrap' },
                }}
              >
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', minWidth: 0, flex: '1 1 180px' }}>
                  <StudentAvatar userId={student.id} name={student.name} size={32} />
                  <Box sx={{ minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 700 }} noWrap>
                      {student.name}
                    </Typography>
                    {student.email && (
                      <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
                        {student.email}
                      </Typography>
                    )}
                  </Box>
                </Box>
                <Button
                  variant="outlined"
                  component="a"
                  href={adminHref(student.id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  endIcon={<OpenInNewOutlinedIcon aria-hidden />}
                  aria-label={`Fill in fees for ${student.name} in Admin (opens in a new tab)`}
                  sx={{ minHeight: 48, flexShrink: 0, width: { xs: '100%', sm: 'auto' } }}
                >
                  Fill in Admin
                </Button>
              </Paper>
            ))}
          </Box>
        )}
      </Box>

      <Box
        sx={{ p: 2, pt: 1, borderTop: 1, borderColor: 'divider', pb: 'calc(16px + env(safe-area-inset-bottom))' }}
      >
        <Button fullWidth variant="outlined" onClick={onClose} sx={{ minHeight: 48, fontWeight: 700 }}>
          Done
        </Button>
      </Box>
    </>
  );

  const paperSx = {
    display: 'flex',
    flexDirection: 'column' as const,
    maxHeight: '88dvh',
    width: '100%',
    maxWidth: 720,
    mx: 'auto',
  };

  if (isDesktop) {
    return (
      <Dialog
        open={open}
        onClose={onClose}
        fullWidth
        maxWidth="sm"
        aria-labelledby="missing-fees-title"
        PaperProps={{ sx: { ...paperSx, borderRadius: 3 } }}
      >
        {body}
      </Dialog>
    );
  }

  return (
    <Drawer
      anchor="bottom"
      open={open}
      onClose={onClose}
      PaperProps={{
        role: 'dialog',
        'aria-labelledby': 'missing-fees-title',
        sx: { ...paperSx, borderTopLeftRadius: 16, borderTopRightRadius: 16 },
      }}
    >
      {body}
    </Drawer>
  );
}
