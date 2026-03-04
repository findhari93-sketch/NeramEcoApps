'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Box,
  Container,
  Typography,
  TextField,
  Button,
  Paper,
  Chip,
  CircularProgress,
  Alert,
  Divider,
  Stack,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';

interface TicketData {
  ticket_number: string;
  subject: string;
  category: string;
  status: string;
  priority: string;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  resolution_notes: string | null;
  comments: Array<{ content: string; created_at: string }>;
}

const STATUS_CONFIG: Record<string, { label: string; color: 'warning' | 'info' | 'success' | 'default'; icon: React.ReactNode }> = {
  open: { label: 'Open', color: 'warning', icon: <ErrorOutlineIcon fontSize="small" /> },
  in_progress: { label: 'In Progress', color: 'info', icon: <HourglassEmptyIcon fontSize="small" /> },
  resolved: { label: 'Resolved', color: 'success', icon: <CheckCircleIcon fontSize="small" /> },
  closed: { label: 'Closed', color: 'default', icon: <CheckCircleIcon fontSize="small" /> },
};

const CATEGORY_LABELS: Record<string, string> = {
  enrollment_issue: 'Enrollment Issue',
  payment_issue: 'Payment Issue',
  technical_issue: 'Technical Issue',
  account_issue: 'Account Issue',
  course_question: 'Course Question',
  other: 'Other',
};

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function TicketTrackContent() {
  const searchParams = useSearchParams();
  const [ticketNumber, setTicketNumber] = useState('');
  const [ticket, setTicket] = useState<TicketData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Auto-lookup if ticket number is in URL
  useEffect(() => {
    const t = searchParams.get('ticket');
    if (t) {
      setTicketNumber(t);
      lookupTicket(t);
    }
  }, [searchParams]);

  async function lookupTicket(number?: string) {
    const query = (number || ticketNumber).trim().toUpperCase();
    if (!query) {
      setError('Please enter a ticket number');
      return;
    }

    setLoading(true);
    setError('');
    setTicket(null);

    try {
      const res = await fetch(`/api/support-tickets/track?ticket=${encodeURIComponent(query)}`);
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Ticket not found');
        return;
      }

      setTicket(data);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  const statusConfig = ticket ? STATUS_CONFIG[ticket.status] || STATUS_CONFIG.open : null;

  return (
    <Container maxWidth="sm" sx={{ py: { xs: 4, md: 6 } }}>
      <Typography variant="h4" fontWeight={700} textAlign="center" gutterBottom>
        Track Your Ticket
      </Typography>
      <Typography variant="body1" color="text.secondary" textAlign="center" sx={{ mb: 4 }}>
        Enter your ticket number to check the status
      </Typography>

      {/* Search Form */}
      <Paper elevation={0} sx={{ p: 3, border: '1px solid', borderColor: 'divider', borderRadius: 2, mb: 3 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
          <TextField
            fullWidth
            placeholder="NERAM-TKT-00001"
            value={ticketNumber}
            onChange={(e) => setTicketNumber(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === 'Enter' && lookupTicket()}
            size="small"
            inputProps={{ style: { fontFamily: 'monospace', letterSpacing: 1 } }}
          />
          <Button
            variant="contained"
            onClick={() => lookupTicket()}
            disabled={loading}
            startIcon={loading ? <CircularProgress size={18} /> : <SearchIcon />}
            sx={{ minWidth: 120, whiteSpace: 'nowrap' }}
          >
            {loading ? 'Searching...' : 'Track'}
          </Button>
        </Stack>
      </Paper>

      {/* Error */}
      {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

      {/* Ticket Result */}
      {ticket && statusConfig && (
        <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, overflow: 'hidden' }}>
          {/* Header */}
          <Box sx={{ p: 3, bgcolor: 'grey.50' }}>
            <Stack direction="row" justifyContent="space-between" alignItems="flex-start" flexWrap="wrap" gap={1}>
              <Box>
                <Typography variant="caption" color="text.secondary" fontFamily="monospace">
                  {ticket.ticket_number}
                </Typography>
                <Typography variant="h6" fontWeight={600} sx={{ mt: 0.5 }}>
                  {ticket.subject}
                </Typography>
              </Box>
              <Chip
                icon={statusConfig.icon as React.ReactElement}
                label={statusConfig.label}
                color={statusConfig.color}
                size="small"
              />
            </Stack>
          </Box>

          <Divider />

          {/* Details */}
          <Box sx={{ p: 3 }}>
            <Stack spacing={2}>
              <Stack direction="row" justifyContent="space-between">
                <Typography variant="body2" color="text.secondary">Category</Typography>
                <Typography variant="body2" fontWeight={500}>
                  {CATEGORY_LABELS[ticket.category] || ticket.category}
                </Typography>
              </Stack>
              <Stack direction="row" justifyContent="space-between">
                <Typography variant="body2" color="text.secondary">Created</Typography>
                <Typography variant="body2">{formatDate(ticket.created_at)}</Typography>
              </Stack>
              <Stack direction="row" justifyContent="space-between">
                <Typography variant="body2" color="text.secondary">Last Updated</Typography>
                <Typography variant="body2">{formatDate(ticket.updated_at)}</Typography>
              </Stack>
              {ticket.resolved_at && (
                <Stack direction="row" justifyContent="space-between">
                  <Typography variant="body2" color="text.secondary">Resolved</Typography>
                  <Typography variant="body2">{formatDate(ticket.resolved_at)}</Typography>
                </Stack>
              )}
            </Stack>

            {/* Resolution Notes */}
            {ticket.resolution_notes && (
              <Alert severity="success" sx={{ mt: 3 }} icon={<CheckCircleIcon />}>
                <Typography variant="body2" fontWeight={600} gutterBottom>Resolution</Typography>
                <Typography variant="body2">{ticket.resolution_notes}</Typography>
              </Alert>
            )}

            {/* Admin Replies */}
            {ticket.comments.length > 0 && (
              <Box sx={{ mt: 3 }}>
                <Typography variant="subtitle2" gutterBottom>Updates from our team</Typography>
                <Stack spacing={1.5}>
                  {ticket.comments.map((comment, i) => (
                    <Paper key={i} variant="outlined" sx={{ p: 2, bgcolor: 'grey.50' }}>
                      <Typography variant="body2">{comment.content}</Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                        <AccessTimeIcon sx={{ fontSize: 12, mr: 0.5, verticalAlign: 'middle' }} />
                        {formatDate(comment.created_at)}
                      </Typography>
                    </Paper>
                  ))}
                </Stack>
              </Box>
            )}
          </Box>
        </Paper>
      )}
    </Container>
  );
}
