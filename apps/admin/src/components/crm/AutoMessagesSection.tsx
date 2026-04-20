// @ts-nocheck
'use client';

import { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Tooltip,
  CircularProgress,
} from '@neram/ui';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import EmailIcon from '@mui/icons-material/Email';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import ScheduleIcon from '@mui/icons-material/Schedule';
import ReplayIcon from '@mui/icons-material/Replay';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';

import type { AutoMessage } from '@neram/database';

interface FriendlyError {
  short: string;
  detail: string;
  actionLabel?: string;
  actionUrl?: string;
}

function describeError(raw: string | null | undefined): FriendlyError | null {
  if (!raw) return null;
  if (raw.startsWith('WA_DEV_MODE')) {
    return {
      short: 'WhatsApp app is in development mode',
      detail:
        'Meta rejected the send because the WhatsApp Business App is not yet in Live mode. Verify the business in Meta Business Suite and switch the app to Live, or add this number to the test recipient allow-list. The cron will skip auto-retry until you click Retry manually.',
      actionLabel: 'Open Meta Business',
      actionUrl: 'https://business.facebook.com/settings/security',
    };
  }
  if (raw.startsWith('WA_UNDELIVERABLE')) {
    return {
      short: 'Recipient not on WhatsApp',
      detail:
        'The phone number is not registered with WhatsApp or is unreachable. Confirm the number with the lead before retrying.',
    };
  }
  if (raw.startsWith('WA_TEMPLATE_PARAM_MISMATCH')) {
    return {
      short: 'Template parameter mismatch',
      detail:
        'The template variables sent to Meta do not match the approved template. Check the wa_templates row matches the Meta template definition.',
    };
  }
  if (raw.startsWith('WA_RATE_LIMIT')) {
    return {
      short: 'Pair rate limit hit',
      detail:
        'Too many WhatsApp messages sent to this number recently. The cron will retry automatically.',
    };
  }
  if (raw.startsWith('WA_24H_WINDOW')) {
    return {
      short: '24-hour reply window expired',
      detail:
        'The recipient last messaged us more than 24 hours ago. A pre-approved template message is required to re-engage.',
    };
  }
  if (raw.startsWith('WA_ERROR')) {
    return {
      short: 'WhatsApp send failed',
      detail: raw,
    };
  }
  return { short: 'Send failed', detail: raw };
}

function getPhoneDripStatus(messages: AutoMessage[]): string {
  const dripMessages = messages.filter(m => m.message_type.startsWith('phone_drip_'));
  if (dripMessages.length === 0) return 'not_enrolled';

  const unsubscribed = dripMessages.some(m => m.error_message === 'unsubscribed');
  if (unsubscribed) return 'unsubscribed';

  const verified = dripMessages.some(m =>
    m.error_message?.includes('phone_verified')
  );
  if (verified) return 'completed_verified';

  const sentCount = dripMessages.filter(m => m.delivery_status === 'sent').length;
  const pendingCount = dripMessages.filter(m => m.delivery_status === 'pending').length;
  if (pendingCount === 0 && sentCount > 0) return 'completed';
  return `active_${sentCount}_of_5`;
}

interface AutoMessagesSectionProps {
  userId: string;
}

const STATUS_COLORS: Record<string, 'default' | 'success' | 'error' | 'warning' | 'info'> = {
  pending: 'warning',
  sent: 'success',
  delivered: 'success',
  read: 'info',
  failed: 'error',
};

const STATUS_ICONS: Record<string, React.ReactNode> = {
  pending: <ScheduleIcon fontSize="small" />,
  sent: <CheckCircleIcon fontSize="small" />,
  delivered: <CheckCircleIcon fontSize="small" />,
  read: <CheckCircleIcon fontSize="small" />,
  failed: <ErrorIcon fontSize="small" />,
};

const TEMPLATE_LABELS: Record<string, string> = {
  first_touch_quick_question: 'Quick Question (text)',
  first_touch_results_video: 'Tamil Video (TN leads)',
  first_touch_english_intro: 'English Video (other states)',
};

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

export default function AutoMessagesSection({ userId }: AutoMessagesSectionProps) {
  const [messages, setMessages] = useState<AutoMessage[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchMessages = async () => {
    try {
      const res = await fetch(`/api/crm/users/${userId}/auto-messages`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages || []);
      }
    } catch (err) {
      console.error('Failed to fetch auto messages:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMessages();
  }, [userId]);

  const handleRetrigger = async (messageId: string) => {
    try {
      const res = await fetch(`/api/crm/users/${userId}/auto-messages/${messageId}/retry`, {
        method: 'POST',
      });
      if (res.ok) {
        fetchMessages();
      }
    } catch (err) {
      console.error('Failed to retry message:', err);
    }
  };

  if (loading) {
    return (
      <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'grey.200', mb: 2, p: 2 }}>
        <Box display="flex" alignItems="center" gap={1} mb={1}>
          <SmartToyIcon color="primary" fontSize="small" />
          <Typography variant="subtitle2" fontWeight={600}>Auto Messages</Typography>
        </Box>
        <Box display="flex" justifyContent="center" py={2}>
          <CircularProgress size={24} />
        </Box>
      </Paper>
    );
  }

  const dripStatus = getPhoneDripStatus(messages);

  const dripLabel: Record<string, string> = {
    not_enrolled: 'No drip',
    unsubscribed: 'Unsubscribed',
    completed_verified: 'Verified (drip stopped)',
    completed: 'Drip complete',
  };

  const dripChipLabel = dripStatus.startsWith('active_')
    ? `Phone drip: ${dripStatus.replace('active_', '').replace('_of_5', '')} / 5 sent`
    : `Phone drip: ${dripLabel[dripStatus] ?? dripStatus}`;

  const dripChipColor: 'default' | 'success' | 'primary' =
    dripStatus === 'unsubscribed' ? 'default' :
    dripStatus === 'completed_verified' ? 'success' :
    'primary';

  return (
    <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'grey.200', mb: 2 }}>
      <Box display="flex" alignItems="center" justifyContent="space-between" px={1.5} py={1} borderBottom="1px solid" borderColor="grey.100">
        <Box display="flex" alignItems="center" gap={1}>
          <SmartToyIcon color="primary" fontSize="small" />
          <Typography variant="subtitle2" fontWeight={600}>Auto Messages</Typography>
          {messages.length > 0 && (
            <Chip label={messages.length} size="small" color="primary" variant="outlined" />
          )}
          <Chip label={dripChipLabel} size="small" color={dripChipColor} sx={{ ml: 1 }} />
        </Box>
      </Box>

      <Box sx={{ p: 1.5 }}>
        {messages.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
            No auto messages scheduled or sent yet.
          </Typography>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem' }}>Type</TableCell>
                  <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem' }}>Channel</TableCell>
                  <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem' }}>Template</TableCell>
                  <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem' }}>Status</TableCell>
                  <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem' }}>Time</TableCell>
                  <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem' }} align="right">Action</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {messages.map((msg) => (
                  <TableRow key={msg.id} hover>
                    <TableCell sx={{ fontSize: '0.8rem' }}>
                      <Chip
                        label={msg.message_type.replace(/_/g, ' ')}
                        size="small"
                        variant="outlined"
                        sx={{ textTransform: 'capitalize', fontSize: '0.7rem' }}
                      />
                    </TableCell>
                    <TableCell>
                      {msg.channel === 'whatsapp' ? (
                        <Tooltip title="WhatsApp">
                          <WhatsAppIcon fontSize="small" sx={{ color: '#25D366' }} />
                        </Tooltip>
                      ) : (
                        <Tooltip title="Email">
                          <EmailIcon fontSize="small" color="primary" />
                        </Tooltip>
                      )}
                    </TableCell>
                    <TableCell sx={{ fontSize: '0.8rem' }}>
                      {TEMPLATE_LABELS[msg.template_name] || msg.template_name}
                    </TableCell>
                    <TableCell>
                      <Chip
                        icon={STATUS_ICONS[msg.delivery_status] as any}
                        label={msg.delivery_status}
                        size="small"
                        color={STATUS_COLORS[msg.delivery_status] || 'default'}
                        variant="outlined"
                        sx={{ textTransform: 'capitalize', fontSize: '0.7rem' }}
                      />
                    </TableCell>
                    <TableCell sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
                      {msg.sent_at
                        ? formatRelativeTime(msg.sent_at)
                        : msg.send_after
                          ? `Scheduled: ${formatRelativeTime(msg.send_after)}`
                          : '-'}
                    </TableCell>
                    <TableCell align="right">
                      {msg.delivery_status === 'failed' && (
                        <Tooltip title="Retry sending">
                          <IconButton size="small" onClick={() => handleRetrigger(msg.id)}>
                            <ReplayIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}

        {messages.some(m => m.error_message) && (
          <Box mt={1} display="flex" flexDirection="column" gap={0.5}>
            {messages.filter(m => m.error_message).map(m => {
              const friendly = describeError(m.error_message);
              if (!friendly) return null;
              return (
                <Tooltip
                  key={m.id}
                  title={friendly.detail}
                  placement="bottom-start"
                  arrow
                >
                  <Box display="inline-flex" alignItems="center" gap={0.5} sx={{ cursor: 'help' }}>
                    <Typography variant="caption" color="error">
                      Error: {friendly.short}
                    </Typography>
                    {friendly.actionUrl && (
                      <Typography
                        variant="caption"
                        component="a"
                        href={friendly.actionUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        sx={{
                          color: 'primary.main',
                          textDecoration: 'underline',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 0.25,
                          ml: 0.5,
                        }}
                        onClick={(e: any) => e.stopPropagation()}
                      >
                        {friendly.actionLabel ?? 'Open'}
                        <OpenInNewIcon sx={{ fontSize: 12 }} />
                      </Typography>
                    )}
                  </Box>
                </Tooltip>
              );
            })}
          </Box>
        )}
      </Box>
    </Paper>
  );
}
