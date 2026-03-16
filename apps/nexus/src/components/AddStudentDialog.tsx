'use client';

import { useState, useCallback, useRef } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Typography,
  Avatar,
  Chip,
  CircularProgress,
  Checkbox,
} from '@neram/ui';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';

interface SearchUser {
  id?: string;
  ms_oid: string;
  name: string;
  email: string;
  avatar_url: string | null;
  user_type?: string;
  source: 'local' | 'directory';
}

interface AddStudentDialogProps {
  open: boolean;
  onClose: () => void;
  classroomId: string;
  batches: { id: string; name: string }[];
  onStudentsAdded: () => void;
  defaultRole?: 'student' | 'teacher';
}

export default function AddStudentDialog({
  open,
  onClose,
  classroomId,
  batches,
  onStudentsAdded,
  defaultRole = 'student',
}: AddStudentDialogProps) {
  const { getToken } = useNexusAuthContext();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchUser[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set()); // keyed by ms_oid
  const [searching, setSearching] = useState(false);
  const [adding, setAdding] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState<string | null>(null);
  const [selectedRole, setSelectedRole] = useState<'student' | 'teacher'>(defaultRole);
  const [hasSearched, setHasSearched] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const searchUsers = useCallback(
    async (q: string) => {
      if (q.trim().length < 2) {
        setResults([]);
        setHasSearched(false);
        return;
      }

      setSearching(true);
      try {
        const token = await getToken();
        if (!token) return;

        const res = await fetch(
          `/api/users/search?q=${encodeURIComponent(q)}&exclude_classroom=${classroomId}&include_directory=true`,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        if (res.ok) {
          const data = await res.json();
          setResults(data.users || []);
          setHasSearched(true);
        }
      } catch (err) {
        console.error('Search failed:', err);
      } finally {
        setSearching(false);
      }
    },
    [classroomId, getToken]
  );

  const handleQueryChange = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => searchUsers(value), 400);
  };

  const toggleSelect = (msOid: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(msOid)) next.delete(msOid);
      else next.add(msOid);
      return next;
    });
  };

  const hasDirectorySelected = results.some(
    (u) => u.source === 'directory' && selected.has(u.ms_oid)
  );

  const handleAdd = async () => {
    if (selected.size === 0) return;
    setAdding(true);

    try {
      const token = await getToken();
      if (!token) return;

      const selectedUsers = results.filter((u) => selected.has(u.ms_oid));

      const promises = selectedUsers.map((user) => {
        const body: Record<string, any> = {
          role: selectedRole,
          batch_id: selectedBatch,
        };

        if (user.source === 'local' && user.id) {
          body.user_id = user.id;
        } else {
          // Directory user — send ms_oid for auto-creation
          body.ms_oid = user.ms_oid;
          body.name = user.name;
          body.email = user.email;
          body.user_type = selectedRole;
        }

        return fetch(`/api/classrooms/${classroomId}/enrollments`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        });
      });

      await Promise.all(promises);
      onStudentsAdded();
      handleClose();
    } catch (err) {
      console.error('Failed to add users:', err);
    } finally {
      setAdding(false);
    }
  };

  const handleClose = () => {
    setQuery('');
    setResults([]);
    setSelected(new Set());
    setSelectedBatch(null);
    setSelectedRole(defaultRole);
    setHasSearched(false);
    onClose();
  };

  const getInitials = (name: string) =>
    name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>{defaultRole === 'teacher' ? 'Add Teacher to Classroom' : 'Add Student to Classroom'}</DialogTitle>
      <DialogContent>
        <TextField
          fullWidth
          placeholder="Search by name or email (min 2 chars)..."
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          size="small"
          autoFocus
          sx={{ mt: 1, mb: 2 }}
          inputProps={{ style: { minHeight: 24 } }}
        />

        {/* Role selector — hidden when defaultRole is set from context */}
        {!defaultRole && (
          <Box sx={{ mb: 1.5 }}>
            <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
              Enroll as
            </Typography>
            <Box sx={{ display: 'flex', gap: 0.5 }}>
              <Chip
                label="Student"
                size="small"
                variant={selectedRole === 'student' ? 'filled' : 'outlined'}
                color={selectedRole === 'student' ? 'primary' : 'default'}
                onClick={() => setSelectedRole('student')}
                sx={{ minHeight: 32 }}
              />
              <Chip
                label="Teacher"
                size="small"
                variant={selectedRole === 'teacher' ? 'filled' : 'outlined'}
                color={selectedRole === 'teacher' ? 'primary' : 'default'}
                onClick={() => setSelectedRole('teacher')}
                sx={{ minHeight: 32 }}
              />
            </Box>
          </Box>
        )}

        {/* Optional batch selection — only for students */}
        {selectedRole === 'student' && batches.length > 0 && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
              Assign to batch (optional)
            </Typography>
            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
              <Chip
                label="No batch"
                size="small"
                variant={selectedBatch === null ? 'filled' : 'outlined'}
                color={selectedBatch === null ? 'default' : 'default'}
                onClick={() => setSelectedBatch(null)}
                sx={{ minHeight: 32 }}
              />
              {batches.map((b) => (
                <Chip
                  key={b.id}
                  label={b.name}
                  size="small"
                  variant={selectedBatch === b.id ? 'filled' : 'outlined'}
                  color={selectedBatch === b.id ? 'primary' : 'default'}
                  onClick={() => setSelectedBatch(b.id)}
                  sx={{ minHeight: 32 }}
                />
              ))}
            </Box>
          </Box>
        )}

        {/* Search results */}
        {searching && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
            <CircularProgress size={24} />
          </Box>
        )}

        {!searching && hasSearched && results.length === 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 3 }}>
            No users found in the system or organization directory.
          </Typography>
        )}

        {!searching && results.length > 0 && (
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
              {selected.size > 0
                ? `${selected.size} selected`
                : `${results.length} user${results.length !== 1 ? 's' : ''} found`}
              {hasDirectorySelected && (
                <Typography component="span" variant="caption" color="info.main">
                  {' '}(new users will be created automatically)
                </Typography>
              )}
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, maxHeight: 300, overflow: 'auto' }}>
              {results.map((user) => (
                <Box
                  key={user.ms_oid}
                  onClick={() => toggleSelect(user.ms_oid)}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.5,
                    p: 1.5,
                    borderRadius: 2,
                    cursor: 'pointer',
                    bgcolor: selected.has(user.ms_oid) ? 'action.selected' : 'transparent',
                    '&:hover': { bgcolor: 'action.hover' },
                    minHeight: 48,
                  }}
                >
                  <Checkbox
                    checked={selected.has(user.ms_oid)}
                    size="small"
                    sx={{ p: 0 }}
                  />
                  <Avatar
                    src={user.avatar_url || undefined}
                    sx={{ width: 36, height: 36, fontSize: '0.85rem' }}
                  >
                    {getInitials(user.name)}
                  </Avatar>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                        {user.name}
                      </Typography>
                      <Chip
                        label={user.source === 'local' ? 'In System' : 'Directory'}
                        size="small"
                        color={user.source === 'local' ? 'success' : 'info'}
                        variant="outlined"
                        sx={{ height: 20, fontSize: '0.65rem' }}
                      />
                    </Box>
                    {user.email && (
                      <Typography variant="caption" color="text.secondary" noWrap>
                        {user.email}
                      </Typography>
                    )}
                  </Box>
                </Box>
              ))}
            </Box>
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={handleClose} disabled={adding}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleAdd}
          disabled={selected.size === 0 || adding}
        >
          {adding
            ? 'Adding...'
            : `Add ${selected.size > 0 ? `${selected.size} User${selected.size !== 1 ? 's' : ''}` : ''}`}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
