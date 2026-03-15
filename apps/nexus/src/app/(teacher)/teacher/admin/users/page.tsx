'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Paper,
  TextField,
  Select,
  MenuItem,
  Chip,
  Avatar,
  IconButton,
  Pagination,
  Skeleton,
  alpha,
  useTheme,
  InputAdornment,
  Snackbar,
  Alert,
} from '@neram/ui';
import SearchIcon from '@mui/icons-material/Search';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { useRouter } from 'next/navigation';

interface UserRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  user_type: string;
  status: string;
  created_at: string;
  ms_oid: string | null;
  firebase_uid: string | null;
}

const ROLE_COLORS: Record<string, 'primary' | 'success' | 'warning' | 'default'> = {
  admin: 'primary',
  teacher: 'success',
  student: 'default',
  parent: 'warning',
};

export default function AdminUsersPage() {
  const { isAdmin, loading: authLoading, getToken } = useNexusAuthContext();
  const router = useRouter();
  const theme = useTheme();

  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  // Edit state
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editingRole, setEditingRole] = useState('');
  const [saving, setSaving] = useState(false);

  // Feedback
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success',
  });

  useEffect(() => {
    if (!authLoading && !isAdmin) {
      router.replace('/teacher/dashboard');
    }
  }, [isAdmin, authLoading, router]);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (search.trim().length >= 2) params.set('q', search.trim());

      const res = await fetch(`/api/admin/users?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) throw new Error('Failed to fetch users');

      const data = await res.json();
      setUsers(data.users);
      setTotalPages(data.totalPages);
      setTotal(data.total);
    } catch (err) {
      console.error('Fetch users error:', err);
      setSnackbar({ open: true, message: 'Failed to load users', severity: 'error' });
    } finally {
      setLoading(false);
    }
  }, [getToken, page, search]);

  useEffect(() => {
    if (isAdmin) fetchUsers();
  }, [isAdmin, fetchUsers]);

  // Debounce search
  useEffect(() => {
    setPage(1);
  }, [search]);

  const handleSaveRole = async (userId: string) => {
    setSaving(true);
    try {
      const token = await getToken();
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId, user_type: editingRole }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to update role');
      }

      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, user_type: editingRole } : u))
      );
      setEditingUserId(null);
      setSnackbar({ open: true, message: 'Role updated successfully', severity: 'success' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update role';
      setSnackbar({ open: true, message, severity: 'error' });
    } finally {
      setSaving(false);
    }
  };

  if (authLoading || !isAdmin) return null;

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1, flexWrap: 'wrap', gap: 1 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            Users
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {total} total users
          </Typography>
        </Box>
      </Box>

      {/* Search */}
      <TextField
        placeholder="Search by name or email..."
        size="small"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon sx={{ fontSize: '1.1rem', color: 'text.secondary' }} />
            </InputAdornment>
          ),
        }}
        sx={{
          mb: 2,
          width: { xs: '100%', sm: 320 },
          '& .MuiOutlinedInput-root': { borderRadius: 2.5 },
        }}
      />

      {/* User List */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {loading
          ? Array.from({ length: 5 }).map((_, i) => (
              <Paper
                key={i}
                elevation={0}
                sx={{
                  p: 2,
                  borderRadius: 2.5,
                  border: `1px solid ${theme.palette.divider}`,
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Skeleton variant="circular" width={40} height={40} />
                  <Box sx={{ flex: 1 }}>
                    <Skeleton width={150} height={20} />
                    <Skeleton width={200} height={16} />
                  </Box>
                  <Skeleton width={70} height={24} sx={{ borderRadius: 2 }} />
                </Box>
              </Paper>
            ))
          : users.map((user) => (
              <Paper
                key={user.id}
                elevation={0}
                sx={{
                  p: 2,
                  borderRadius: 2.5,
                  border: `1px solid ${theme.palette.divider}`,
                  transition: 'border-color 200ms ease',
                  '&:hover': {
                    borderColor: alpha(theme.palette.primary.main, 0.3),
                  },
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: { xs: 'wrap', sm: 'nowrap' } }}>
                  <Avatar
                    src={user.avatar_url || undefined}
                    sx={{
                      width: 40,
                      height: 40,
                      bgcolor: alpha(theme.palette.primary.main, 0.12),
                      color: 'primary.main',
                      fontSize: '0.9rem',
                      fontWeight: 600,
                    }}
                  >
                    {user.name?.charAt(0)?.toUpperCase() || '?'}
                  </Avatar>

                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                      {user.name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" noWrap>
                      {user.email || user.phone || 'No contact info'}
                    </Typography>
                  </Box>

                  {/* Auth provider indicators */}
                  <Box sx={{ display: { xs: 'none', sm: 'flex' }, gap: 0.5 }}>
                    {user.ms_oid && (
                      <Chip label="MS" size="small" variant="outlined" sx={{ height: 22, fontSize: '0.65rem' }} />
                    )}
                    {user.firebase_uid && (
                      <Chip label="Firebase" size="small" variant="outlined" sx={{ height: 22, fontSize: '0.65rem' }} />
                    )}
                  </Box>

                  {/* Role */}
                  {editingUserId === user.id ? (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <Select
                        size="small"
                        value={editingRole}
                        onChange={(e) => setEditingRole(e.target.value)}
                        sx={{
                          minWidth: 100,
                          height: 32,
                          fontSize: '0.8rem',
                          borderRadius: 2,
                        }}
                      >
                        <MenuItem value="student">Student</MenuItem>
                        <MenuItem value="teacher">Teacher</MenuItem>
                        <MenuItem value="admin">Admin</MenuItem>
                        <MenuItem value="parent">Parent</MenuItem>
                      </Select>
                      <IconButton
                        size="small"
                        color="primary"
                        onClick={() => handleSaveRole(user.id)}
                        disabled={saving || editingRole === user.user_type}
                      >
                        <CheckIcon sx={{ fontSize: '1rem' }} />
                      </IconButton>
                      <IconButton
                        size="small"
                        onClick={() => setEditingUserId(null)}
                        disabled={saving}
                      >
                        <CloseIcon sx={{ fontSize: '1rem' }} />
                      </IconButton>
                    </Box>
                  ) : (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <Chip
                        label={user.user_type}
                        size="small"
                        color={ROLE_COLORS[user.user_type] || 'default'}
                        variant="outlined"
                        sx={{
                          textTransform: 'capitalize',
                          fontWeight: 500,
                          height: 26,
                          fontSize: '0.75rem',
                        }}
                      />
                      <IconButton
                        size="small"
                        onClick={() => {
                          setEditingUserId(user.id);
                          setEditingRole(user.user_type);
                        }}
                        sx={{ color: 'text.secondary' }}
                      >
                        <EditOutlinedIcon sx={{ fontSize: '1rem' }} />
                      </IconButton>
                    </Box>
                  )}
                </Box>
              </Paper>
            ))}
      </Box>

      {/* Pagination */}
      {totalPages > 1 && (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3 }}>
          <Pagination
            count={totalPages}
            page={page}
            onChange={(_, p) => setPage(p)}
            color="primary"
            size="small"
          />
        </Box>
      )}

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          severity={snackbar.severity}
          onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
          sx={{ borderRadius: 2 }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
