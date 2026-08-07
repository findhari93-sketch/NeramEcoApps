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
  IconButton,
  Pagination,
  Skeleton,
  alpha,
  useTheme,
  InputAdornment,
  Snackbar,
  Alert,
  Switch,
  FormControlLabel,
} from '@neram/ui';
import SearchIcon from '@mui/icons-material/Search';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { useRouter } from 'next/navigation';
import { STAFF_ROLE_DESCRIPTIONS, STAFF_ROLE_LABELS } from '@/lib/staff-capabilities';
import StudentAvatar from '@/components/students/StudentAvatar';

const STAFF_ROLE_DESCRIPTIONS_NONE =
  'Cannot open the staff side of Nexus. Use this for students, and to revoke staff access.';

interface UserRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  user_type: string;
  /** Nexus authority tier. Null for students and unclassified staff. */
  staff_role: string | null;
  /** Whether they may be assigned as the tutor of a class. */
  can_teach: boolean | null;
  status: string;
  created_at: string;
  ms_oid: string | null;
  firebase_uid: string | null;
}

const ROLE_COLORS: Record<string, 'primary' | 'success' | 'warning' | 'default' | 'info'> = {
  admin: 'primary',
  manager: 'info',
  teacher: 'success',
  student: 'default',
  parent: 'warning',
};

/**
 * The Nexus tier options. Kept next to the labels in @/lib/staff-capabilities so
 * the wording an admin reads here matches the wording in the capability registry.
 *
 * 'none' maps to null: a student, or a staff member who should have no Nexus
 * authority at all.
 */
const STAFF_ROLE_OPTIONS: { value: string; label: string; hint: string }[] = [
  { value: 'none', label: 'No Nexus access', hint: STAFF_ROLE_DESCRIPTIONS_NONE },
  { value: 'teacher', label: STAFF_ROLE_LABELS.teacher, hint: STAFF_ROLE_DESCRIPTIONS.teacher },
  { value: 'manager', label: STAFF_ROLE_LABELS.manager, hint: STAFF_ROLE_DESCRIPTIONS.manager },
  { value: 'admin', label: STAFF_ROLE_LABELS.admin, hint: STAFF_ROLE_DESCRIPTIONS.admin },
];

type RoleTab = 'all' | 'student' | 'teacher' | 'admin';

const ROLE_TABS: { value: RoleTab; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'student', label: 'Students' },
  { value: 'teacher', label: 'Teachers' },
  { value: 'admin', label: 'Admins' },
];

const EMPTY_LABEL: Record<RoleTab, string> = {
  all: 'No Nexus members yet',
  student: 'No students with access yet',
  teacher: 'No teachers yet',
  admin: 'No admins yet',
};

export default function AdminUsersPage() {
  const { isAdmin, loading: authLoading, getToken } = useNexusAuthContext();
  const router = useRouter();
  const theme = useTheme();

  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleTab, setRoleTab] = useState<RoleTab>('all');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  // Edit state. Three independent fields:
  //   editingRole      users.user_type  (Admin app access)
  //   editingStaffRole users.staff_role (Nexus authority; 'none' means null)
  //   editingCanTeach  users.can_teach  (may take a class)
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editingRole, setEditingRole] = useState('');
  const [editingStaffRole, setEditingStaffRole] = useState('none');
  const [editingCanTeach, setEditingCanTeach] = useState(true);
  const [saving, setSaving] = useState(false);

  const beginEdit = (user: UserRow) => {
    setEditingUserId(user.id);
    setEditingRole(user.user_type);
    setEditingStaffRole(user.staff_role ?? 'none');
    setEditingCanTeach(user.can_teach !== false);
  };

  const editingUser = users.find((u) => u.id === editingUserId) || null;
  const isDirty =
    !!editingUser &&
    (editingRole !== editingUser.user_type ||
      editingStaffRole !== (editingUser.staff_role ?? 'none') ||
      editingCanTeach !== (editingUser.can_teach !== false));

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
      if (roleTab !== 'all') params.set('role', roleTab);

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
  }, [getToken, page, search, roleTab]);

  useEffect(() => {
    if (isAdmin) fetchUsers();
  }, [isAdmin, fetchUsers]);

  // Reset to first page when the filters change
  useEffect(() => {
    setPage(1);
  }, [search, roleTab]);

  const handleSaveRole = async (userId: string) => {
    setSaving(true);
    try {
      const token = await getToken();
      const staffRole = editingStaffRole === 'none' ? null : editingStaffRole;
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId,
          user_type: editingRole,
          staff_role: staffRole,
          can_teach: editingCanTeach,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to update role');
      }

      setUsers((prev) =>
        prev.map((u) =>
          u.id === userId
            ? { ...u, user_type: editingRole, staff_role: staffRole, can_teach: editingCanTeach }
            : u,
        ),
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
            {total} Nexus {total === 1 ? 'member' : 'members'}
          </Typography>
        </Box>
      </Box>

      {/* Role filter tabs */}
      <Box
        role="tablist"
        aria-label="Filter members by role"
        sx={{
          display: 'inline-flex',
          gap: 0.5,
          p: 0.5,
          mb: 2,
          borderRadius: 2.5,
          bgcolor: alpha(theme.palette.primary.main, 0.06),
          border: `1px solid ${theme.palette.divider}`,
          maxWidth: '100%',
          overflowX: 'auto',
        }}
      >
        {ROLE_TABS.map(({ value, label }) => {
          const active = roleTab === value;
          return (
            <Box
              key={value}
              role="tab"
              aria-selected={active}
              tabIndex={0}
              onClick={() => !active && setRoleTab(value)}
              onKeyDown={(e) => {
                if (!active && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault();
                  setRoleTab(value);
                }
              }}
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                px: { xs: 1.75, sm: 2.5 },
                py: 1,
                minHeight: 40,
                borderRadius: 2,
                fontWeight: 700,
                fontSize: '0.875rem',
                whiteSpace: 'nowrap',
                cursor: active ? 'default' : 'pointer',
                color: active ? 'primary.main' : 'text.secondary',
                bgcolor: active ? 'background.paper' : 'transparent',
                boxShadow: active ? '0 1px 4px rgba(0,0,0,0.12)' : 'none',
                transition: 'color .2s, background-color .2s, box-shadow .2s',
                '&:hover': active
                  ? {}
                  : { color: 'text.primary', bgcolor: alpha(theme.palette.primary.main, 0.05) },
                '&:focus-visible': {
                  outline: `2px solid ${theme.palette.primary.main}`,
                  outlineOffset: 2,
                },
              }}
            >
              {label}
            </Box>
          );
        })}
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
                  {/* Staff and students share this list. Anyone who is not a
                      tracked student falls back to the plain face they had. */}
                  <StudentAvatar
                    userId={user.id}
                    src={user.avatar_url}
                    name={user.name}
                    size={40}
                  />

                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                      {user.name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" noWrap>
                      {user.email || user.phone || 'No contact info'}
                    </Typography>
                    {/* Flag active students who have no Microsoft/Entra identity (e.g. Google-only
                        sign-ups). They keep their Nexus access but have no MS license yet. */}
                    {user.user_type === 'student' && !user.ms_oid && (
                      <Box sx={{ mt: 0.5 }}>
                        <Chip
                          label="No MS license"
                          size="small"
                          color="warning"
                          variant="outlined"
                          sx={{ height: 20, fontSize: '0.65rem' }}
                        />
                      </Box>
                    )}
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

                  {/* Role: Admin app access + Nexus tier + tutor eligibility */}
                  {editingUserId === user.id ? (
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: { xs: 'stretch', sm: 'center' },
                        flexDirection: { xs: 'column', sm: 'row' },
                        gap: 1,
                        width: { xs: '100%', sm: 'auto' },
                      }}
                    >
                      <Select
                        size="small"
                        value={editingRole}
                        onChange={(e) => setEditingRole(e.target.value)}
                        // 48px min height keeps this usable on a phone.
                        sx={{ minWidth: 132, minHeight: 44, fontSize: '0.8rem', borderRadius: 2 }}
                      >
                        <MenuItem value="student">Student</MenuItem>
                        <MenuItem value="teacher">Teacher (staff)</MenuItem>
                        <MenuItem value="admin">Admin app access</MenuItem>
                      </Select>

                      <Select
                        size="small"
                        value={editingStaffRole}
                        onChange={(e) => setEditingStaffRole(e.target.value)}
                        sx={{ minWidth: 168, minHeight: 44, fontSize: '0.8rem', borderRadius: 2 }}
                      >
                        {STAFF_ROLE_OPTIONS.map((opt) => (
                          <MenuItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </MenuItem>
                        ))}
                      </Select>

                      {/* Only meaningful for staff: a student is never a tutor. */}
                      {editingStaffRole !== 'none' && (
                        <FormControlLabel
                          sx={{ ml: 0, mr: 0 }}
                          control={
                            <Switch
                              size="small"
                              checked={editingCanTeach}
                              onChange={(e) => setEditingCanTeach(e.target.checked)}
                            />
                          }
                          label={
                            <Typography variant="caption" sx={{ fontWeight: 600 }}>
                              Takes classes
                            </Typography>
                          }
                        />
                      )}

                      <Box sx={{ display: 'flex', gap: 0.5 }}>
                        <IconButton
                          size="small"
                          color="primary"
                          onClick={() => handleSaveRole(user.id)}
                          disabled={saving || !isDirty}
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
                    </Box>
                  ) : (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
                      {/* The Nexus tier is what governs Nexus, so show it first and
                          fall back to user_type when it has not been set. */}
                      <Chip
                        label={user.staff_role || user.user_type}
                        size="small"
                        color={ROLE_COLORS[user.staff_role || user.user_type] || 'default'}
                        variant="outlined"
                        sx={{
                          textTransform: 'capitalize',
                          fontWeight: 500,
                          height: 26,
                          fontSize: '0.75rem',
                        }}
                      />
                      {/* Only worth surfacing when it differs from the tier, e.g.
                          a manager who keeps full Admin app rights. */}
                      {user.staff_role && user.staff_role !== user.user_type && (
                        <Chip
                          label={user.user_type === 'admin' ? 'Admin app' : user.user_type}
                          size="small"
                          variant="outlined"
                          sx={{ height: 22, fontSize: '0.65rem', textTransform: 'capitalize' }}
                        />
                      )}
                      {user.staff_role && user.can_teach === false && (
                        <Chip
                          label="No classes"
                          size="small"
                          variant="outlined"
                          color="warning"
                          sx={{ height: 22, fontSize: '0.65rem' }}
                        />
                      )}
                      <IconButton
                        size="small"
                        onClick={() => beginEdit(user)}
                        sx={{ color: 'text.secondary' }}
                      >
                        <EditOutlinedIcon sx={{ fontSize: '1rem' }} />
                      </IconButton>
                    </Box>
                  )}
                </Box>
              </Paper>
            ))}

        {!loading && users.length === 0 && (
          <Paper
            elevation={0}
            sx={{
              p: 4,
              borderRadius: 2.5,
              border: `1px dashed ${theme.palette.divider}`,
              textAlign: 'center',
            }}
          >
            <Typography variant="body2" color="text.secondary">
              {search.trim().length >= 2 ? 'No members match your search.' : EMPTY_LABEL[roleTab]}
            </Typography>
          </Paper>
        )}
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
