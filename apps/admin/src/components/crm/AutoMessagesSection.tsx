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

import type { AutoMessage } from '@neram/database';

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

  return (
    <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'grey.200', mb: 2 }}>
      <Box display="flex" alignItems="center" justifyContent="space-between" px={1.5} py={1} borderBottom="1px solid" borderColor="grey.100">
        <Box display="flex" alignItems="center" gap={1}>
          <SmartToyIcon color="primary" fontSize="small" />
          <Typography variant="subtitle2" fontWeight={600}>Auto Messages</Typography>
          {messages.length > 0 && (
            <Chip label={messages.length} size="small" color="primary" variant="outlined" />
          )}
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
          <Box mt={1}>
            {messages.filter(m => m.error_message).map(m => (
              <Typography key={m.id} variant="caption" color="error" display="block">
                Error: {m.error_message}
              </Typography>
            ))}
          </Box>
        )}
      </Box>
    </Paper>
  );
}
