// @ts-nocheck
'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Container,
  Typography,
  Button,
  Paper,
  Chip,
  CircularProgress,
  Fab,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  MenuItem,
} from '@neram/ui';
import AddIcon from '@mui/icons-material/Add';
import SupportAgentIcon from '@mui/icons-material/SupportAgent';
import { useFirebaseAuth, getCurrentUser } from '@neram/auth';
import { useRouter } from 'next/navigation';

const STATUS_COLORS: Record<string, 'warning' | 'info' | 'success' | 'default'> = {
  open: 'warning',
  in_progress: 'info',
  resolved: 'success',
  closed: 'default',
};

const CATEGORY_LABELS: Record<string, string> = {
  enrollment_issue: 'Enrollment',
  payment_issue: 'Payment',
  technical_issue: 'Technical',
  account_issue: 'Account',
  course_question: 'Course',
  other: 'Other',
};

function timeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

export default function SupportPage() {
  const { user } = useFirebaseAuth();
  const router = useRouter();
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewTicket, setShowNewTicket] = useState(false);

  // New ticket form
  const [category, setCategory] = useState('other');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<string | null>(null);

  const fetchTickets = useCallback(async () => {
    if (!user) return;
    try {
      setLoading(true);
      const firebaseUser = getCurrentUser();
      const idToken = await firebaseUser?.getIdToken();
      const res = await fetch('/api/support-tickets?limit=50', {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const data = await res.json();
      setTickets(data.tickets || []);
    } catch (err) {
      console.error('Error fetching tickets:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  const handleSubmitTicket = async () => {
    if (!subject || !description) return;

    setSubmitting(true);
    try {
      const firebaseUser = getCurrentUser();
      const idToken = await firebaseUser?.getIdToken();

      const res = await fetch('/api/support-tickets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          category,
          subject,
          description,
          sourceApp: 'app',
        }),
      });

      const data = await res.json();

      if (!res.ok) throw new Error(data.error);

      setSubmitResult(data.ticketNumber);
      setSubject('');
      setDescription('');
      setCategory('other');
      fetchTickets();
    } catch (err: any) {
      setSubmitResult(null);
      alert(err.message || 'Failed to create ticket');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Container maxWidth="sm" sx={{ py: { xs: 2, md: 4 }, pb: 10 }}>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h5" fontWeight={700}>
          Support
        </Typography>
        <Typography variant="body2" color="text.secondary">
          View your support tickets or raise a new one.
        </Typography>
      </Box>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      ) : tickets.length === 0 ? (
        <Paper
          elevation={0}
          sx={{
            p: 4,
            textAlign: 'center',
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 2,
          }}
        >
          <SupportAgentIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 2 }} />
          <Typography variant="h6" gutterBottom>
            No tickets yet
          </Typography>
          <Typography variant="body2" color="text.secondary" mb={3}>
            Need help? Raise a support ticket and our team will assist you.
          </Typography>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setShowNewTicket(true)}
            sx={{ borderRadius: 1, textTransform: 'none', fontWeight: 600 }}
          >
            Raise a Ticket
          </Button>
        </Paper>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {tickets.map((ticket: any) => (
            <Paper
              key={ticket.id}
              elevation={0}
              onClick={() => router.push(`/support/${ticket.id}`)}
              sx={{
                p: 2,
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 1.5,
                cursor: 'pointer',
                '&:hover': { borderColor: 'primary.main', bgcolor: 'action.hover' },
              }}
            >
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                <Typography variant="caption" color="text.secondary" fontFamily="monospace">
                  {ticket.ticket_number}
                </Typography>
                <Chip
                  label={ticket.status.replace('_', ' ')}
                  size="small"
                  color={STATUS_COLORS[ticket.status] || 'default'}
                  sx={{ textTransform: 'capitalize', fontWeight: 500 }}
                />
              </Box>
              <Typography variant="body2" fontWeight={600} sx={{ mb: 0.5 }}>
                {ticket.subject}
              </Typography>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Chip
                  label={CATEGORY_LABELS[ticket.category] || ticket.category}
                  size="small"
                  variant="outlined"
                  sx={{ height: 20, fontSize: '0.7rem' }}
                />
                <Typography variant="caption" color="text.disabled">
                  {timeAgo(ticket.created_at)}
                </Typography>
              </Box>
            </Paper>
          ))}
        </Box>
      )}

      {/* FAB */}
      {tickets.length > 0 && (
        <Fab
          color="primary"
          onClick={() => setShowNewTicket(true)}
          sx={{
            position: 'fixed',
            bottom: 80,
            right: 20,
          }}
        >
          <AddIcon />
        </Fab>
      )}

      {/* New Ticket Dialog */}
      <Dialog
        open={showNewTicket}
        onClose={() => {
          setShowNewTicket(false);
          setSubmitResult(null);
        }}
        maxWidth="xs"
        fullWidth
      >
        {submitResult ? (
          <>
            <DialogTitle>Ticket Created</DialogTitle>
            <DialogContent>
              <Box sx={{ textAlign: 'center', py: 2 }}>
                <SupportAgentIcon sx={{ fontSize: 48, color: 'success.main', mb: 2 }} />
                <Typography variant="body1" mb={1}>
                  Your ticket has been created.
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Ticket ID: <strong>{submitResult}</strong>
                </Typography>
                <Typography variant="body2" color="text.secondary" mt={1}>
                  We&apos;ll get back to you as soon as possible.
                </Typography>
              </Box>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => { setShowNewTicket(false); setSubmitResult(null); }}>
                Close
              </Button>
            </DialogActions>
          </>
        ) : (
          <>
            <DialogTitle>Raise a Support Ticket</DialogTitle>
            <DialogContent>
              <TextField
                select
                label="Category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                fullWidth
                size="small"
                sx={{ mb: 2, mt: 1 }}
              >
                <MenuItem value="enrollment_issue">Enrollment Issue</MenuItem>
                <MenuItem value="payment_issue">Payment Issue</MenuItem>
                <MenuItem value="technical_issue">Technical Issue</MenuItem>
                <MenuItem value="account_issue">Account Issue</MenuItem>
                <MenuItem value="course_question">Course Question</MenuItem>
                <MenuItem value="other">Other</MenuItem>
              </TextField>
              <TextField
                label="Subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                fullWidth
                required
                size="small"
                sx={{ mb: 2 }}
              />
              <TextField
                label="Describe the issue"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                fullWidth
                required
                multiline
                rows={4}
                size="small"
                placeholder="What happened? What were you trying to do?"
              />
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setShowNewTicket(false)} disabled={submitting}>
                Cancel
              </Button>
              <Button
                onClick={handleSubmitTicket}
                variant="contained"
                disabled={!subject || !description || submitting}
                sx={{ borderRadius: 1, textTransform: 'none', fontWeight: 600 }}
              >
                {submitting ? <CircularProgress size={20} /> : 'Submit'}
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </Container>
  );
}
