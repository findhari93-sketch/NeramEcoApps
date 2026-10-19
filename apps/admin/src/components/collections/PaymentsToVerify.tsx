'use client';

/**
 * Collections' "Payments to verify": balance payments students sent from the
 * pay balance page, oldest first, above everything else on the page while any
 * are waiting. A row opens the verify drawer; the bell's payment_to_verify
 * notification opens the same drawer through /collections?verify=<claimId>.
 */
import { Box, Button, Chip, Drawer, IconButton, Paper, Skeleton, Typography } from '@neram/ui';
import useMediaQuery from '@mui/material/useMediaQuery';
import { alpha } from '@mui/material/styles';
import CloseIcon from '@mui/icons-material/Close';
import PendingActionsOutlinedIcon from '@mui/icons-material/PendingActionsOutlined';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { formatDueDate, formatRupees } from '@neram/database/fee-plan';
import { methodLabel } from '@/components/payments/PaymentClaimParts';
import { claimInstallmentLabel, submittedAgo, type FeeClaimSummary } from '@/lib/fee-claims-view';
import FeeClaimVerifyCard, { type FeeClaimDecision } from './FeeClaimVerifyCard';

export function PaymentsToVerifyPanel({
  claims,
  loading,
  onOpen,
}: {
  claims: FeeClaimSummary[];
  loading: boolean;
  onOpen: (claimId: string) => void;
}) {
  if (loading && claims.length === 0) {
    return <Skeleton variant="rounded" height={88} sx={{ mb: 3 }} aria-label="Loading payments to verify" />;
  }
  if (claims.length === 0) return null;

  return (
    <Paper
      variant="outlined"
      component="section"
      aria-labelledby="payments-to-verify-title"
      data-testid="payments-to-verify"
      sx={(t) => ({
        mb: 3,
        borderRadius: 1,
        borderWidth: 2,
        borderColor: t.palette.warning.main,
        bgcolor: alpha(t.palette.warning.main, 0.05),
        overflow: 'hidden',
      })}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2, py: 1.5 }}>
        <PendingActionsOutlinedIcon sx={{ color: 'warning.dark' }} aria-hidden />
        <Typography id="payments-to-verify-title" component="h2" variant="subtitle1" fontWeight={700}>
          Payments to verify
        </Typography>
        <Chip
          size="small"
          color="warning"
          label={claims.length}
          aria-label={`${claims.length} waiting`}
          sx={{ fontWeight: 700, minWidth: 28 }}
        />
        <Typography variant="body2" color="text.secondary" sx={{ ml: 1, display: { xs: 'none', md: 'block' } }}>
          Students paid their balance to the trust and sent the UTR. Match each one with the bank before you verify.
        </Typography>
      </Box>

      <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, bgcolor: 'background.paper' }}>
        {claims.map((c) => {
          const name = c.studentName || 'Student';
          return (
            <Box component="li" key={c.id} sx={{ borderTop: 1, borderColor: 'divider' }}>
              <Box
                component="button"
                type="button"
                onClick={() => onOpen(c.id)}
                aria-label={`Verify ${formatRupees(c.amount)} from ${name}`}
                data-testid={`fee-claim-row-${c.id}`}
                sx={{
                  all: 'unset',
                  boxSizing: 'border-box',
                  width: '100%',
                  minHeight: 56,
                  px: 2,
                  py: 1,
                  display: 'grid',
                  gridTemplateColumns: { xs: 'minmax(0,1fr) auto', md: 'minmax(180px,1.4fr) 110px minmax(150px,1fr) minmax(140px,1fr) 110px 100px auto' },
                  alignItems: 'center',
                  columnGap: 2,
                  rowGap: 0.25,
                  cursor: 'pointer',
                  transition: 'background-color 150ms',
                  '&:hover': { bgcolor: 'action.hover' },
                  '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: -2 },
                  '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
                }}
              >
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="body2" fontWeight={600} noWrap>
                    {name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" noWrap component="div">
                    {claimInstallmentLabel(c.installmentNumber)}
                    {c.studentPhone ? `, ${c.studentPhone}` : ''}
                  </Typography>
                </Box>
                <Typography variant="body2" fontWeight={700} sx={{ fontVariantNumeric: 'tabular-nums', display: { xs: 'none', md: 'block' } }}>
                  {formatRupees(c.amount)}
                </Typography>
                <Typography variant="body2" color="text.secondary" noWrap sx={{ display: { xs: 'none', md: 'block' } }}>
                  {methodLabel(c.method)}
                </Typography>
                <Typography variant="body2" noWrap sx={{ fontFamily: 'monospace', display: { xs: 'none', md: 'block' } }} title={c.utr || undefined}>
                  {c.utr || 'No UTR'}
                </Typography>
                <Typography variant="body2" color="text.secondary" noWrap sx={{ display: { xs: 'none', md: 'block' } }}>
                  {c.paidOn ? formatDueDate(c.paidOn) : 'No date'}
                </Typography>
                <Typography variant="caption" color="text.secondary" noWrap sx={{ display: { xs: 'none', md: 'block' } }}>
                  {submittedAgo(c.submittedAt)}
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, justifySelf: 'end' }}>
                  <Typography variant="body2" fontWeight={700} sx={{ display: { xs: 'block', md: 'none' }, fontVariantNumeric: 'tabular-nums' }}>
                    {formatRupees(c.amount)}
                  </Typography>
                  <Typography variant="body2" color="primary.main" fontWeight={700} sx={{ display: { xs: 'none', md: 'block' } }}>
                    Verify
                  </Typography>
                  <ChevronRightIcon color="primary" aria-hidden />
                </Box>
              </Box>
            </Box>
          );
        })}
      </Box>
    </Paper>
  );
}

export function FeeClaimDrawer({
  claimId,
  studentName,
  adminId,
  onClose,
  onChanged,
}: {
  claimId: string | null;
  studentName?: string | null;
  adminId?: string | null;
  onClose: () => void;
  onChanged: (decision: FeeClaimDecision, message: string) => void;
}) {
  const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  return (
    <Drawer
      anchor="right"
      open={Boolean(claimId)}
      onClose={onClose}
      transitionDuration={reduceMotion ? 0 : undefined}
      PaperProps={{
        sx: { width: { xs: '100%', sm: 560 }, maxWidth: '100%', display: 'flex', flexDirection: 'column' },
        role: 'dialog',
        'aria-label': 'Verify a balance payment',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: { xs: 2, sm: 3 }, py: 1.5, borderBottom: 1, borderColor: 'divider', flexShrink: 0 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="h6" component="h2" fontWeight={700} noWrap>
            Verify payment
          </Typography>
          {studentName && (
            <Typography variant="body2" color="text.secondary" noWrap>
              {studentName}
            </Typography>
          )}
        </Box>
        <IconButton onClick={onClose} aria-label="Close" sx={{ width: 44, height: 44 }}>
          <CloseIcon />
        </IconButton>
      </Box>
      <Box sx={{ flex: 1, overflowY: 'auto', p: { xs: 2, sm: 3 } }}>
        {claimId && (
          <FeeClaimVerifyCard key={claimId} claimId={claimId} adminId={adminId} onChanged={onChanged} onDone={onClose} />
        )}
      </Box>
      <Box sx={{ px: { xs: 2, sm: 3 }, py: 1.5, borderTop: 1, borderColor: 'divider', flexShrink: 0 }}>
        <Button onClick={onClose} sx={{ minHeight: 44, textTransform: 'none' }}>
          Back to Collections
        </Button>
      </Box>
    </Drawer>
  );
}
