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
  TextField,
  Divider,
  IconButton,
} from '@neram/ui';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SendIcon from '@mui/icons-material/Send';
import { useFirebaseAuth, getCurrentUser } from '@neram/auth';
import { useRouter, useParams } from 'next/navigation';

const STATUS_COLORS: Record<string, 'warning' | 'info' | 'success' | 'default'> = {
  open: 'warning',
  in_progress: 'info',
  resolved: 'success',
  closed: 'default',
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
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function TicketDetailPage() {
  const { user } = useFirebaseAuth();
  const router = useRouter();
  const params = useParams();
  const ticketId = params.id as string;

  const [ticket, setTicket] = useState<any>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [newComment, setNewComment] = useState('');
  const [sendingComment, setSendingComment] = useState(false);

  const fetchTicket = useCallback(async () => {
    if (!user || !ticketId) return;
    try {
      setLoading(true);
      const firebaseUser = getCurrentUser();
      const idToken = await firebaseUser?.getIdToken();
      const res = await fetch(`/api/support-tickets/${ticketId}`, {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const data = await res.json();
      if (data.ticket) {
        setTicket(data.ticket);
        setComments(data.comments || []);
      }
    } catch (err) {
      console.error('Error fetching ticket:', err);
    } finally {
      setLoading(false);
    }
  }, [user, ticketId]);

  useEffect(() => {
    fetchTicket();
  }, [fetchTicket]);

  const handleSendComment = async () => {
    if (!newComment.trim()) return;

    setSendingComment(true);
    try {
      const firebaseUser = getCurrentUser();
      const idToken = await firebaseUser?.getIdToken();

      const res = await fetch(`/api/support-tickets/${ticketId}/comments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ content: newComment }),
      });

      const data = await res.json();
      if (data.comment) {
        setComments((prev) => [...prev, data.comment]);
        setNewComment('');
      }
    } catch (err) {
      console.error('Error sending comment:', err);
    } finally {
      setSendingComment(false);
    }
  };

  if (loading) {
    return (
      <Container maxWidth="sm" sx={{ py: 6, textAlign: 'center' }}>
        <CircularProgress />
      </Container>
    );
  }

  if (!ticket) {
    return (
      <Container maxWidth="sm" sx={{ py: 6, textAlign: 'center' }}>
        <Typography variant="h6">Ticket not found</Typography>
        <Button onClick={() => router.push('/support')} sx={{ mt: 2 }}>
          Back to Support
        </Button>
      </Container>
    );
  }

  return (
    <Container maxWidth="sm" sx={{ py: { xs: 2, md: 4 }, pb: 10 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
        <IconButton onClick={() => router.push('/support')} size="small">
          <ArrowBackIcon />
        </IconButton>
        <Box sx={{ flex: 1 }}>
          <Typography variant="caption" color="text.secondary" fontFamily="monospace">
            {ticket.ticket_number}
          </Typography>
          <Typography variant="h6" fontWeight={700} lineHeight={1.2}>
            {ticket.subject}
          </Typography>
        </Box>
        <Chip
          label={ticket.status.replace('_', ' ')}
          size="small"
          color={STATUS_COLORS[ticket.status] || 'default'}
          sx={{ textTransform: 'capitalize' }}
        />
      </Box>

      {/* Ticket Info */}
      <Paper
        elevation={0}
        sx={{
          p: 2,
          mb: 2,
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 1.5,
        }}
      >
        <Box sx={{ display: 'flex', gap: 1, mb: 1.5, flexWrap: 'wrap' }}>
          <Chip
            label={CATEGORY_LABELS[ticket.category] || ticket.category}
            size="small"
            variant="outlined"
          />
          <Chip
            label={`Priority: ${ticket.priority}`}
            size="small"
            variant="outlined"
            sx={{ textTransform: 'capitalize' }}
          />
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'pre-wrap' }}>
          {ticket.description}
        </Typography>
        <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 1.5 }}>
          Created on {formatDate(ticket.created_at)}
        </Typography>
      </Paper>

      {/* Screenshots */}
      {ticket.screenshot_urls?.length > 0 && (
        <Paper
          elevation={0}
          sx={{
            p: 2,
            mb: 2,
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 1.5,
          }}
        >
          <Typography variant="subtitle2" fontWeight={600} mb={1}>
            Attachments
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            {ticket.screenshot_urls.map((url: string, i: number) => (
              <Box
                key={i}
                component="a"
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                sx={{
                  width: 80,
                  height: 80,
                  borderRadius: 1,
                  overflow: 'hidden',
                  border: '1px solid',
                  borderColor: 'divider',
                }}
              >
                <Box
                  component="img"
                  src={url}
                  alt={`Attachment ${i + 1}`}
                  sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              </Box>
            ))}
          </Box>
        </Paper>
      )}

      {/* Resolution notes */}
      {ticket.status === 'resolved' && ticket.resolution_notes && (
        <Paper
          elevation={0}
          sx={{
            p: 2,
            mb: 2,
            bgcolor: '#E8F5E9',
            border: '1px solid #A5D6A7',
            borderRadius: 1.5,
          }}
        >
          <Typography variant="subtitle2" fontWeight={600} color="#2E7D32" mb={0.5}>
            Resolution
          </Typography>
          <Typography variant="body2">{ticket.resolution_notes}</Typography>
        </Paper>
      )}

      {/* Comments */}
      <Divider sx={{ my: 2 }} />
      <Typography variant="subtitle2" fontWeight={600} mb={2}>
        Conversation
      </Typography>

      {comments.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 3 }}>
          No messages yet. Add a comment below.
        </Typography>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mb: 2 }}>
          {comments.map((comment: any) => (
            <Box
              key={comment.id}
              sx={{
                display: 'flex',
                justifyContent: comment.is_admin ? 'flex-start' : 'flex-end',
              }}
            >
              <Paper
                elevation={0}
                sx={{
                  p: 1.5,
                  maxWidth: '85%',
                  borderRadius: 2,
                  bgcolor: comment.is_admin ? '#F3F4F6' : 'primary.50',
                  border: '1px solid',
                  borderColor: comment.is_admin ? 'divider' : 'primary.100',
                }}
              >
                <Typography variant="caption" fontWeight={600} color="text.secondary" display="block">
                  {comment.is_admin ? `${comment.user_name} (Support)` : 'You'}
                </Typography>
                <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                  {comment.content}
                </Typography>
                <Typography variant="caption" color="text.disabled" display="block" mt={0.5}>
                  {formatDate(comment.created_at)}
                </Typography>
              </Paper>
            </Box>
          ))}
        </Box>
      )}

      {/* Comment Input */}
      {ticket.status !== 'closed' && (
        <Box sx={{ display: 'flex', gap: 1, mt: 2 }}>
          <TextField
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="Type a message..."
            fullWidth
            size="small"
            multiline
            maxRows={4}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendComment();
              }
            }}
          />
          <IconButton
            color="primary"
            onClick={handleSendComment}
            disabled={!newComment.trim() || sendingComment}
          >
            {sendingComment ? <CircularProgress size={20} /> : <SendIcon />}
          </IconButton>
        </Box>
      )}
    </Container>
  );
}
