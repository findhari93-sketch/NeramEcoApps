'use client';

import { Chip, Tooltip } from '@neram/ui';
import DomainDisabledOutlinedIcon from '@mui/icons-material/DomainDisabledOutlined';
import NoAccountsOutlinedIcon from '@mui/icons-material/NoAccountsOutlined';
import ErrorOutlineOutlinedIcon from '@mui/icons-material/ErrorOutlineOutlined';
import type { EmailDomainStatus } from '@/lib/classroom-email';
import { AWAITING_MICROSOFT_LABEL, AWAITING_MICROSOFT_TOOLTIP } from '@/lib/microsoft-account';

/**
 * Small indicator shown next to a student's email when it is NOT the class
 * @neramclasses.com identity. Colour is never the only signal: each state has an
 * icon + label + tooltip (accessibility: do not convey by colour alone).
 *
 *   awaitingMicrosoft -> red "No Microsoft account" (no ms_oid: CANNOT sign in at all)
 *   onmicrosoft -> amber "Default domain"  (HAS an org ID, wrong domain: rename in Entra, then Refresh)
 *   personal    -> red   "No org ID"       (only a personal email: no @neramclasses.com account exists yet)
 *   none         -> red  "No email"        (nothing on file)
 *   org         -> nothing (the email is already correct)
 *
 * `awaitingMicrosoft` wins over every domain state, because "they cannot log in"
 * is the fact that actually changes what staff should do next, and showing two
 * red chips side by side would just dilute it.
 */
const CONFIG: Record<
  Exclude<EmailDomainStatus, 'org'>,
  { label: string; tooltip: string; color: 'warning' | 'error'; Icon: typeof DomainDisabledOutlinedIcon }
> = {
  onmicrosoft: {
    label: 'Default domain',
    tooltip:
      'On the Microsoft default domain. Rename this account to @neramclasses.com in Entra, then use Refresh from Entra in Admin.',
    color: 'warning',
    Icon: DomainDisabledOutlinedIcon,
  },
  personal: {
    label: 'No org ID',
    tooltip:
      'No organisation ID yet. This student only has a personal email. Create their @neramclasses.com Microsoft account, then use Refresh from Entra in Admin.',
    color: 'error',
    Icon: NoAccountsOutlinedIcon,
  },
  none: {
    label: 'No email',
    tooltip: 'No email on file yet.',
    color: 'error',
    Icon: ErrorOutlineOutlinedIcon,
  },
};

export default function EmailDomainFlag({
  status,
  awaitingMicrosoft = false,
  size = 'small',
}: {
  status: EmailDomainStatus;
  /** No Entra identity yet, so this student cannot sign in to Nexus at all. */
  awaitingMicrosoft?: boolean;
  size?: 'small' | 'medium';
}) {
  const cfg = awaitingMicrosoft
    ? {
        label: AWAITING_MICROSOFT_LABEL,
        tooltip: AWAITING_MICROSOFT_TOOLTIP,
        color: 'error' as const,
        Icon: NoAccountsOutlinedIcon,
      }
    : status === 'org'
      ? null
      : CONFIG[status];
  if (!cfg) return null;
  const { label, tooltip, color, Icon } = cfg;

  return (
    <Tooltip title={tooltip} arrow enterTouchDelay={0} leaveTouchDelay={4000}>
      <Chip
        size={size}
        color={color}
        variant="outlined"
        icon={<Icon sx={{ fontSize: '0.95rem' }} />}
        label={label}
        aria-label={`${label}: ${tooltip}`}
        sx={{
          height: 22,
          fontSize: '0.68rem',
          fontWeight: 600,
          cursor: 'help',
          '& .MuiChip-label': { px: 0.75 },
          '& .MuiChip-icon': { ml: 0.5, mr: -0.25 },
        }}
      />
    </Tooltip>
  );
}
