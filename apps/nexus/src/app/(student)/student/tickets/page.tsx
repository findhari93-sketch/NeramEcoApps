'use client';

import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  Chip,
  Skeleton,
  Button,
  TextField,
  Avatar,
} from '@neram/ui';
import AddOutlinedIcon from '@mui/icons-material/AddOutlined';
import SupportAgentOutlinedIcon from '@mui/icons-material/SupportAgentOutlined';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';

interface Ticket {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  created_at: string;
  comments: { id: string; content: string; created_at: string; user: { name: string } }[];
}

export default function StudentTickets() {
  const { user, activeClassroom, getToken } = useNexusAuthContext();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!activeClassroom) return;
    fetchTickets();
  }, [activeClassroom]);

  async function fetchTickets() {
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) return;

      const res = await fetch(
        `/api/tickets?classroom=${activeClassroom!.id}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) {
        const data = await res.json();
        setTickets(data.tickets || []);
      }
    } catch (err) {
      console.error('Failed to load tickets:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    if (!title.trim()) return;
    setCreating(true);
    try {
      const token = await getToken();
      if (!token) return;

      const res = await fetch('/api/tickets', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          classroom_id: activeClassroom!.id,
          title: title.trim(),
          description: description.trim(),
        }),
      });

      if (res.ok) {
        setTitle('');
        setDescription('');
        setShowCreate(false);
        fetchTickets();
      }
    } catch (err) {
      console.error('Failed to create ticket:', err);
    } finally {
      setCreating(false);
    }
  }

  const statusColor = (status: string) => {
    if (status === 'open') return 'warning';
    if (status === 'in_progress') return 'info';
    if (status === 'resolved' || status === 'closed') return 'success';
    return 'default';
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
        <Typography variant="h6" component="h1" sx={{ fontWeight: 700 }}>
          Support Tickets
        </Typography>
        <Button
          variant="contained"
          size="small"
          startIcon={<AddOutlinedIcon />}
          onClick={() => setShowCreate(true)}
          sx={{ textTransform: 'none', minHeight: 36 }}
        >
          New
        </Button>
      </Box>

      {/* Create ticket form */}
      {showCreate && (
        <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
          <Typography variant="body2" fontWeight={600} sx={{ mb: 1.5 }}>
            New Support Ticket
          </Typography>
          <TextField
            label="Subject"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            size="small"
            fullWidth
            sx={{ mb: 1.5 }}
          />
          <TextField
            label="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            size="small"
            fullWidth
            multiline
            rows={3}
            sx={{ mb: 1.5 }}
          />
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button
              variant="outlined"
              size="small"
              onClick={() => setShowCreate(false)}
              sx={{ textTransform: 'none' }}
            >
              Cancel
            </Button>
            <Button
              variant="contained"
              size="small"
              onClick={handleCreate}
              disabled={creating || !title.trim()}
              sx={{ textTransform: 'none' }}
            >
              {creating ? 'Submitting...' : 'Submit'}
            </Button>
          </Box>
        </Paper>
      )}

      {loading ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} variant="rectangular" height={64} sx={{ borderRadius: 1 }} />
          ))}
        </Box>
      ) : tickets.length === 0 ? (
        <Paper sx={{ p: 3, textAlign: 'center' }}>
          <SupportAgentOutlinedIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
          <Typography variant="body2" color="text.secondary">
            No support tickets yet. Create one if you need help!
          </Typography>
        </Paper>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {tickets.map((ticket) => (
            <Paper
              key={ticket.id}
              variant="outlined"
              onClick={() => setSelectedTicket(ticket)}
              sx={{
                p: 2,
                cursor: 'pointer',
                '&:hover': { bgcolor: 'action.hover' },
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                <Typography variant="body2" fontWeight={600} sx={{ flex: 1 }} noWrap>
                  {ticket.title}
                </Typography>
                <Chip
                  label={ticket.status.replace('_', ' ')}
                  size="small"
                  color={statusColor(ticket.status) as any}
                  sx={{ textTransform: 'capitalize' }}
                />
              </Box>
              <Typography variant="caption" color="text.secondary">
                {formatDate(ticket.created_at)}
                {ticket.comments?.length > 0 && ` · ${ticket.comments.length} reply`}
              </Typography>
            </Paper>
          ))}
        </Box>
      )}
    </Box>
  );
}
