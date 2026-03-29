// @ts-nocheck
'use client';

import {
  Box,
  Typography,
  Button,
} from '@neram/ui';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import CheckIcon from '@mui/icons-material/Check';

type StepStatus = 'pending' | 'in_progress' | 'completed' | 'need_help';

interface ApprovalContact {
  phone: string;
  name?: string;
}

// WhatsApp official brand palette
const WA = {
  darkTeal: '#075E54',
  teal: '#128C7E',
  green: '#25D366',
  chatBubble: '#DCF8C6',
  lightBg: '#F0FFF4',
};

const DEFAULT_CONTACTS: ApprovalContact[] = [
  { phone: '919176137043', name: 'Admin 1' },
  { phone: '918807437399', name: 'Admin 2' },
];

const DEFAULT_MESSAGE =
  "Hi, I've requested to join the Neram Classes WhatsApp group. Please approve my request. Thank you!";

interface WhatsAppJoinStepProps {
  status: StepStatus;
  actionConfig: Record<string, any>;
  groupUrl: string;
  onJoinClicked: () => void;
  onApproved: () => void;
  disabled?: boolean;
}

export default function WhatsAppJoinStep({
  status,
  actionConfig,
  groupUrl,
  onJoinClicked,
  onApproved,
  disabled,
}: WhatsAppJoinStepProps) {
  const contacts: ApprovalContact[] =
    Array.isArray(actionConfig?.approval_contacts) && actionConfig.approval_contacts.length > 0
      ? actionConfig.approval_contacts
      : DEFAULT_CONTACTS;

  const message = actionConfig?.approval_message || DEFAULT_MESSAGE;
  const encodedMessage = encodeURIComponent(message);

  // ── Completed ──
  if (status === 'completed') {
    return (
      <Box
        sx={{
          mt: 1, py: 1, px: 1.5, borderRadius: 1.5,
          bgcolor: WA.lightBg, border: '1px solid', borderColor: WA.green,
          display: 'flex', alignItems: 'center', gap: 1,
        }}
      >
        <CheckIcon sx={{ fontSize: 16, color: WA.teal }} />
        <Typography variant="body2" fontWeight={600} sx={{ color: WA.darkTeal }}>
          You&apos;re in the WhatsApp group
        </Typography>
      </Box>
    );
  }

  // ── Pending ──
  if (status === 'pending' || status === 'need_help') {
    return (
      <Box sx={{ mt: 1 }}>
        <Button
          variant="contained"
          startIcon={<WhatsAppIcon sx={{ fontSize: 18 }} />}
          onClick={(e: React.MouseEvent) => {
            e.stopPropagation();
            onJoinClicked();
          }}
          disabled={disabled}
          sx={{
            borderRadius: 2, textTransform: 'none', fontWeight: 600,
            fontSize: '0.85rem', minHeight: 44, px: 2.5,
            bgcolor: WA.darkTeal,
            '&:hover': { bgcolor: WA.teal },
            boxShadow: 'none',
            '&:active': { boxShadow: 'none' },
          }}
        >
          Join WhatsApp Group
        </Button>
      </Box>
    );
  }

  // ── In Progress — waiting for admin approval ──
  return (
    <Box sx={{ mt: 1 }}>
      {/* Status banner */}
      <Box
        sx={{
          py: 1, px: 1.5, borderRadius: 1.5, mb: 1.5,
          bgcolor: WA.lightBg, border: '1px solid', borderColor: '#C6F6D5',
          display: 'flex', alignItems: 'center', gap: 0.75,
        }}
      >
        <CheckCircleOutlineIcon sx={{ fontSize: 16, color: WA.teal }} />
        <Typography variant="caption" fontWeight={600} sx={{ color: WA.darkTeal }}>
          Join request sent
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
          Waiting for approval
        </Typography>
      </Box>

      {/* Remind + Approved row */}
      <Box display="flex" gap={1} flexWrap="wrap" mb={1}>
        {contacts.map((contact, idx) => (
          <Button
            key={contact.phone}
            size="small"
            variant="contained"
            startIcon={<NotificationsActiveIcon sx={{ fontSize: 14 }} />}
            href={`https://wa.me/${contact.phone}?text=${encodedMessage}`}
            target="_blank"
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
            sx={{
              borderRadius: 2, textTransform: 'none', fontWeight: 600,
              fontSize: '0.8rem', minHeight: 40, px: 2,
              bgcolor: WA.darkTeal,
              '&:hover': { bgcolor: WA.teal },
              boxShadow: 'none',
              flex: { xs: '1 1 auto', sm: '0 0 auto' },
            }}
          >
            Remind {contact.name || `Admin ${idx + 1}`}
          </Button>
        ))}
      </Box>

      <Box display="flex" gap={1} alignItems="center">
        <Button
          size="small"
          variant="outlined"
          onClick={(e: React.MouseEvent) => {
            e.stopPropagation();
            onApproved();
          }}
          disabled={disabled}
          sx={{
            borderRadius: 2, textTransform: 'none', fontWeight: 600,
            fontSize: '0.8rem', minHeight: 40, px: 2,
            borderColor: WA.teal, color: WA.darkTeal,
            '&:hover': { borderColor: WA.darkTeal, bgcolor: WA.lightBg },
          }}
        >
          I&apos;ve Been Approved
        </Button>

        {groupUrl && (
          <Button
            size="small"
            variant="text"
            endIcon={<OpenInNewIcon sx={{ fontSize: 12 }} />}
            href={groupUrl}
            target="_blank"
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
            sx={{
              textTransform: 'none', fontSize: '0.75rem',
              color: 'text.secondary', minHeight: 40,
              '&:hover': { color: WA.teal },
            }}
          >
            Re-open invite
          </Button>
        )}
      </Box>
    </Box>
  );
}
