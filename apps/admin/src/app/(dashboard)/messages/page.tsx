// @ts-nocheck
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Box,
  Typography,
  Paper,
  Chip,
  IconButton,
  Tooltip,
  Alert,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  Tabs,
  Tab,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Divider,
  Skeleton,
} from '@neram/ui';
import MailOutlinedIcon from '@mui/icons-material/MailOutlined';
import RefreshIcon from '@mui/icons-material/Refresh';
import MarkEmailReadIcon from '@mui/icons-material/MarkEmailRead';
import ReplyIcon from '@mui/icons-material/Reply';
import InboxIcon from '@mui/icons-material/Inbox';
import DraftsIcon from '@mui/icons-material/Drafts';
import DoneAllIcon from '@mui/icons-material/DoneAll';
import CloseIcon from '@mui/icons-material/Close';
import { useAdminProfile } from '@/contexts/AdminProfileContext';

interface ContactMessage {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  subject: string;
  message: string;
  center_id: string | null;
  source: string;
  status: 'unread' | 'read' | 'replied';
  replied_by: string | null;
  replied_at: string | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

type StatusFilter = 'all' | 'unread' | 'read' | 'replied';

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatDateTime(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getStatusColor(status: string): 'error' | 'warning' | 'success' | 'default' {
  switch (status) {
    case 'unread':
      return 'error';
    case 'read':
      return 'warning';
    case 'replied':
      return 'success';
    default:
      return 'default';
  }
}

function getSourceLabel(source: string): string {
  switch (source) {
    case 'contact_page':
      return 'Contact Page';
    case 'marketing_site':
      return 'Marketing Site';
    case 'footer_form':
      return 'Footer Form';
    default:
      return source.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }
}

// Stats card component
function StatCard({
  title,
  value,
  icon,
  color,
  loading,
}: {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  color: string;
  loading: boolean;
}) {
  return (
    <Paper
      elevation={0}
      sx={{
        p: 2.5,
        borderRadius: 1,
        border: '1px solid',
        borderColor: 'grey.200',
        flex: 1,
        minWidth: 180,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <Box>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
            {title}
          </Typography>
          {loading ? (
            <Skeleton width={60} height={36} />
          ) : (
            <Typography variant="h5" fontWeight={700} sx={{ color }}>
              {value}
            </Typography>
          )}
        </Box>
        <Box
          sx={{
            width: 40,
            height: 40,
            borderRadius: 1,
            bgcolor: `${color}14`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {icon}
        </Box>
      </Box>
    </Paper>
  );
}

export default function MessagesPage() {
  const { supabaseUserId } = useAdminProfile();

  const [messages, setMessages] = useState<ContactMessage[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filter
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  // Pagination
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);

  // Detail dialog
  const [selectedMessage, setSelectedMessage] = useState<ContactMessage | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchMessages = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const params = new URLSearchParams();
      params.set('page', String(page + 1)); // API uses 1-based pages
      params.set('limit', String(rowsPerPage));

      if (statusFilter !== 'all') {
        params.set('status', statusFilter);
      }

      const res = await fetch(`/api/messages?${params.toString()}`);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Failed to fetch messages (HTTP ${res.status})`);
      }

      const data = await res.json();
      setMessages(data.data || []);
      setTotalCount(data.total || 0);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch messages');
    } finally {
      setLoading(false);
    }
  }, [page, rowsPerPage, statusFilter]);

  const fetchUnreadCount = useCallback(async () => {
    try {
      const res = await fetch('/api/messages/unread-count');
      if (res.ok) {
        const data = await res.json();
        setUnreadCount(data.count || 0);
      }
    } catch {
      // Silently fail for badge count
    }
  }, []);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  useEffect(() => {
    fetchUnreadCount();
  }, [fetchUnreadCount]);

  const handleStatusFilterChange = (_event: React.SyntheticEvent, newValue: StatusFilter) => {
    setStatusFilter(newValue);
    setPage(0);
  };

  const handleChangePage = (_event: unknown, newPage: number) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  const handleRowClick = (message: ContactMessage) => {
    setSelectedMessage(message);
    setDialogOpen(true);

    // Auto-mark as read if currently unread
    if (message.status === 'unread' && supabaseUserId) {
      handleUpdateStatus(message.id, 'read', false);
    }
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setSelectedMessage(null);
  };

  const handleUpdateStatus = async (
    messageId: string,
    status: 'read' | 'replied',
    refreshAfter = true
  ) => {
    if (!supabaseUserId) return;

    setActionLoading(true);
    try {
      const res = await fetch(`/api/messages/${messageId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, adminId: supabaseUserId }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to update message');
      }

      // Update local state
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === messageId ? { ...msg, status } : msg
        )
      );

      if (selectedMessage?.id === messageId) {
        setSelectedMessage((prev) => (prev ? { ...prev, status } : null));
      }

      if (refreshAfter) {
        fetchUnreadCount();
      }
    } catch (err: any) {
      console.error('Error updating message status:', err);
    } finally {
      setActionLoading(false);
    }
  };

  // Calculate stats from current data
  const readCount = messages.filter((m) => m.status === 'read').length;
  const repliedCount = messages.filter((m) => m.status === 'replied').length;

  return (
    <Box>
      {/* Page Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box
            sx={{
              width: 42,
              height: 42,
              borderRadius: 1,
              bgcolor: '#7B1FA2',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <MailOutlinedIcon sx={{ color: 'white', fontSize: 22 }} />
          </Box>
          <Box>
            <Typography variant="h5" fontWeight={700} sx={{ lineHeight: 1.2 }}>
              Contact Messages
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {totalCount > 0
                ? `${totalCount} message${totalCount !== 1 ? 's' : ''} total`
                : loading
                ? 'Loading...'
                : 'No messages found'}
            </Typography>
          </Box>
        </Box>
        <Tooltip title="Refresh data">
          <span>
            <IconButton size="small" onClick={() => { fetchMessages(); fetchUnreadCount(); }} disabled={loading}>
              <RefreshIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
      </Box>

      {/* Error */}
      {error && (
        <Alert severity="error" sx={{ mb: 2, borderRadius: 1 }}>
          {error}
        </Alert>
      )}

      {/* Stats Cards */}
      <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
        <StatCard
          title="Total Messages"
          value={totalCount}
          icon={<MailOutlinedIcon sx={{ color: '#7B1FA2', fontSize: 22 }} />}
          color="#7B1FA2"
          loading={loading && messages.length === 0}
        />
        <StatCard
          title="Unread"
          value={unreadCount}
          icon={<InboxIcon sx={{ color: '#C62828', fontSize: 22 }} />}
          color="#C62828"
          loading={loading && messages.length === 0}
        />
        <StatCard
          title="Read"
          value={statusFilter === 'all' ? readCount : statusFilter === 'read' ? totalCount : readCount}
          icon={<DraftsIcon sx={{ color: '#E65100', fontSize: 22 }} />}
          color="#E65100"
          loading={loading && messages.length === 0}
        />
        <StatCard
          title="Replied"
          value={statusFilter === 'all' ? repliedCount : statusFilter === 'replied' ? totalCount : repliedCount}
          icon={<DoneAllIcon sx={{ color: '#2E7D32', fontSize: 22 }} />}
          color="#2E7D32"
          loading={loading && messages.length === 0}
        />
      </Box>

      {/* Status Filter Tabs */}
      <Paper
        elevation={0}
        sx={{
          mb: 2,
          borderRadius: 1,
          border: '1px solid',
          borderColor: 'grey.200',
        }}
      >
        <Tabs
          value={statusFilter}
          onChange={handleStatusFilterChange}
          sx={{ px: 2 }}
        >
          <Tab label="All" value="all" />
          <Tab
            label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                Unread
                {unreadCount > 0 && (
                  <Chip label={unreadCount} size="small" color="error" sx={{ height: 20, fontSize: '0.75rem' }} />
                )}
              </Box>
            }
            value="unread"
          />
          <Tab label="Read" value="read" />
          <Tab label="Replied" value="replied" />
        </Tabs>
      </Paper>

      {/* Data Table */}
      <Paper
        elevation={0}
        sx={{
          borderRadius: 1,
          border: '1px solid',
          borderColor: 'grey.200',
          overflow: 'hidden',
        }}
      >
        {loading && messages.length === 0 ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 400 }}>
            <CircularProgress />
          </Box>
        ) : messages.length === 0 ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: 200, gap: 1 }}>
            <InboxIcon sx={{ fontSize: 48, color: 'text.disabled' }} />
            <Typography color="text.secondary">
              {statusFilter === 'all' ? 'No messages yet' : `No ${statusFilter} messages`}
            </Typography>
          </Box>
        ) : (
          <>
            <TableContainer sx={{ maxHeight: 600 }}>
              <Table stickyHeader size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>Date</TableCell>
                    <TableCell sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>Name</TableCell>
                    <TableCell sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>Email</TableCell>
                    <TableCell sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>Phone</TableCell>
                    <TableCell sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>Subject</TableCell>
                    <TableCell sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>Status</TableCell>
                    <TableCell sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>Source</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {messages.map((message) => (
                    <TableRow
                      key={message.id}
                      hover
                      onClick={() => handleRowClick(message)}
                      sx={{
                        cursor: 'pointer',
                        '&:last-child td': { borderBottom: 0 },
                        bgcolor: message.status === 'unread' ? 'action.hover' : 'transparent',
                      }}
                    >
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>
                        <Typography variant="body2">{formatDate(message.created_at)}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {new Date(message.created_at).toLocaleTimeString('en-IN', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography
                          variant="body2"
                          fontWeight={message.status === 'unread' ? 700 : 400}
                          noWrap
                          sx={{ maxWidth: 180 }}
                        >
                          {message.name}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" noWrap sx={{ maxWidth: 200 }}>
                          {message.email}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" color="text.secondary">
                          {message.phone || '-'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography
                          variant="body2"
                          fontWeight={message.status === 'unread' ? 600 : 400}
                          noWrap
                          sx={{ maxWidth: 250 }}
                        >
                          {message.subject}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={message.status.charAt(0).toUpperCase() + message.status.slice(1)}
                          size="small"
                          color={getStatusColor(message.status)}
                          sx={{ fontWeight: 500 }}
                        />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" color="text.secondary" noWrap>
                          {getSourceLabel(message.source)}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
            <TablePagination
              rowsPerPageOptions={[10, 25, 50, 100]}
              component="div"
              count={totalCount}
              rowsPerPage={rowsPerPage}
              page={page}
              onPageChange={handleChangePage}
              onRowsPerPageChange={handleChangeRowsPerPage}
            />
          </>
        )}
      </Paper>

      {/* Message Detail Dialog */}
      <Dialog
        open={dialogOpen}
        onClose={handleCloseDialog}
        maxWidth="md"
        fullWidth
        PaperProps={{
          sx: { borderRadius: 1 },
        }}
      >
        {selectedMessage && (
          <>
            <DialogTitle sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', pb: 1 }}>
              <Box>
                <Typography variant="h6" fontWeight={700}>
                  {selectedMessage.subject}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  From {selectedMessage.name} &middot; {formatDateTime(selectedMessage.created_at)}
                </Typography>
              </Box>
              <IconButton onClick={handleCloseDialog} size="small" sx={{ mt: -0.5 }}>
                <CloseIcon />
              </IconButton>
            </DialogTitle>

            <Divider />

            <DialogContent sx={{ pt: 2 }}>
              {/* Contact Details */}
              <Paper
                elevation={0}
                sx={{
                  p: 2,
                  mb: 3,
                  borderRadius: 1,
                  bgcolor: 'grey.50',
                  border: '1px solid',
                  borderColor: 'grey.200',
                }}
              >
                <Box sx={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      Name
                    </Typography>
                    <Typography variant="body2" fontWeight={500}>
                      {selectedMessage.name}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      Email
                    </Typography>
                    <Typography variant="body2" fontWeight={500}>
                      <a
                        href={`mailto:${selectedMessage.email}`}
                        style={{ color: '#1565C0', textDecoration: 'none' }}
                      >
                        {selectedMessage.email}
                      </a>
                    </Typography>
                  </Box>
                  {selectedMessage.phone && (
                    <Box>
                      <Typography variant="caption" color="text.secondary">
                        Phone
                      </Typography>
                      <Typography variant="body2" fontWeight={500}>
                        <a
                          href={`tel:${selectedMessage.phone}`}
                          style={{ color: '#1565C0', textDecoration: 'none' }}
                        >
                          {selectedMessage.phone}
                        </a>
                      </Typography>
                    </Box>
                  )}
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      Source
                    </Typography>
                    <Typography variant="body2" fontWeight={500}>
                      {getSourceLabel(selectedMessage.source)}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      Status
                    </Typography>
                    <Box sx={{ mt: 0.25 }}>
                      <Chip
                        label={selectedMessage.status.charAt(0).toUpperCase() + selectedMessage.status.slice(1)}
                        size="small"
                        color={getStatusColor(selectedMessage.status)}
                        sx={{ fontWeight: 500 }}
                      />
                    </Box>
                  </Box>
                </Box>
              </Paper>

              {/* Message Body */}
              <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
                Message
              </Typography>
              <Paper
                elevation={0}
                sx={{
                  p: 2.5,
                  borderRadius: 1,
                  border: '1px solid',
                  borderColor: 'grey.200',
                  minHeight: 100,
                }}
              >
                <Typography
                  variant="body1"
                  sx={{
                    whiteSpace: 'pre-wrap',
                    lineHeight: 1.7,
                  }}
                >
                  {selectedMessage.message}
                </Typography>
              </Paper>

              {/* Replied info */}
              {selectedMessage.status === 'replied' && selectedMessage.replied_at && (
                <Typography variant="caption" color="text.secondary" sx={{ mt: 2, display: 'block' }}>
                  Replied on {formatDateTime(selectedMessage.replied_at)}
                </Typography>
              )}
            </DialogContent>

            <Divider />

            <DialogActions sx={{ px: 3, py: 2, gap: 1 }}>
              {selectedMessage.status === 'unread' && (
                <Button
                  variant="outlined"
                  startIcon={<MarkEmailReadIcon />}
                  onClick={() => handleUpdateStatus(selectedMessage.id, 'read')}
                  disabled={actionLoading}
                >
                  Mark as Read
                </Button>
              )}
              {selectedMessage.status !== 'replied' && (
                <Button
                  variant="contained"
                  color="success"
                  startIcon={<ReplyIcon />}
                  onClick={() => handleUpdateStatus(selectedMessage.id, 'replied')}
                  disabled={actionLoading}
                >
                  Mark as Replied
                </Button>
              )}
              {selectedMessage.status === 'replied' && (
                <Typography variant="body2" color="success.main" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <DoneAllIcon fontSize="small" />
                  Already replied
                </Typography>
              )}
              <Box sx={{ flexGrow: 1 }} />
              <Button
                variant="outlined"
                color="primary"
                href={`mailto:${selectedMessage.email}?subject=Re: ${encodeURIComponent(selectedMessage.subject)}`}
                component="a"
                startIcon={<ReplyIcon />}
              >
                Reply via Email
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </Box>
  );
}
