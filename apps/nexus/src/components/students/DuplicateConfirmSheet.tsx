'use client';

import { Box, Button, Drawer, Typography } from '@neram/ui';
import StudentAvatar from './StudentAvatar';

export interface DuplicateCandidate {
  user_id: string;
  name: string | null;
  email: string | null;
  enrolled_at: string | null;
  reason: 'phone' | 'email' | 'name';
}

const REASON_LABEL: Record<DuplicateCandidate['reason'], string> = {
  phone: 'Same phone number',
  email: 'Same email address',
  name: 'Same first name',
};

function joinedOn(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * Asked before a Microsoft account is added when a student with no Microsoft
 * account is already enrolled and may be the same person. Linking keeps one
 * record, so fees, attendance and catch-up stay together.
 *
 * A bottom sheet like ClassifyDrawer. Its z-index sits above MUI dialogs
 * because Add Student opens it from inside one.
 */
export default function DuplicateConfirmSheet({
  open,
  personName,
  personEmail,
  candidates,
  onLink,
  onCreateNew,
  onSkip,
}: {
  open: boolean;
  personName: string;
  personEmail: string;
  candidates: DuplicateCandidate[];
  onLink: (userId: string) => void;
  onCreateNew: () => void;
  onSkip: () => void;
}) {
  return (
    <Drawer
      anchor="bottom"
      open={open}
      onClose={onSkip}
      sx={{ zIndex: (theme) => theme.zIndex.modal + 1 }}
      PaperProps={{ sx: { borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '88dvh' } }}
    >
      <Box
        role="dialog"
        aria-labelledby="duplicate-sheet-title"
        sx={{
          p: 2,
          pb: 'calc(16px + env(safe-area-inset-bottom))',
          width: '100%',
          maxWidth: 560,
          mx: 'auto',
          overflowY: 'auto',
        }}
      >
        <Typography id="duplicate-sheet-title" variant="h6" sx={{ fontWeight: 800 }}>
          Is this the same student?
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 2 }}>
          {personName} ({personEmail}) may already be in this class on a record with no Microsoft account.
          Linking keeps one record, so fees, attendance and catch-up stay together.
        </Typography>

        {candidates.map((candidate) => (
          <Box
            key={candidate.user_id}
            sx={{ p: 1.5, mb: 1.5, border: 1, borderColor: 'divider', borderRadius: 2 }}
          >
            {/* The face is what lets a teacher recognise the student at a glance,
                which is the whole decision this sheet asks for. */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <StudentAvatar userId={candidate.user_id} name={candidate.name} size={40} tapToView={false} />
              <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ fontWeight: 700 }}>{candidate.name || 'Unnamed student'}</Typography>
                {candidate.email && (
                  <Typography variant="body2" color="text.secondary" sx={{ wordBreak: 'break-all' }}>
                    {candidate.email}
                  </Typography>
                )}
                <Typography variant="caption" color="text.secondary">
                  {REASON_LABEL[candidate.reason]}
                  {candidate.enrolled_at ? `, joined ${joinedOn(candidate.enrolled_at)}` : ''}
                </Typography>
              </Box>
            </Box>
            <Button
              fullWidth
              variant="contained"
              onClick={() => onLink(candidate.user_id)}
              sx={{ mt: 1, minHeight: 48, fontWeight: 700 }}
            >
              Yes, same student
            </Button>
          </Box>
        ))}

        <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 1, mt: 1 }}>
          <Button fullWidth variant="outlined" onClick={onCreateNew} sx={{ minHeight: 48 }}>
            No, a different student
          </Button>
          <Button fullWidth onClick={onSkip} sx={{ minHeight: 48 }}>
            Skip this one
          </Button>
        </Box>
      </Box>
    </Drawer>
  );
}
