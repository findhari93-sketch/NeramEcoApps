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
  id: string;
  name: string;
  email: string;
  avatar_url: string | null;
}

interface AddStudentDialogProps {
  open: boolean;
  onClose: () => void;
  classroomId: string;
  batches: { id: string; name: string }[];
  onStudentsAdded: () => void;
}

export default function AddStudentDialog({
  open,
  onClose,
  classroomId,
  batches,
  onStudentsAdded,
}: AddStudentDialogProps) {
  const { getToken } = useNexusAuthContext();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchUser[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [searching, setSearching] = useState(false);
  const [adding, setAdding] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState<string | null>(null);
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
          `/api/users/search?q=${encodeURIComponent(q)}&exclude_classroom=${classroomId}`,
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

  const toggleSelect = (userId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const handleAdd = async () => {
    if (selected.size === 0) return;
    setAdding(true);

    try {
      const token = await getToken();
      if (!token) return;

      // Enroll each selected student
      const promises = Array.from(selected).map((userId) =>
        fetch(`/api/classrooms/${classroomId}/enrollments`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            user_id: userId,
            role: 'student',
            batch_id: selectedBatch,
          }),
        })
      );

      await Promise.all(promises);
      onStudentsAdded();
      handleClose();
    } catch (err) {
      console.error('Failed to add students:', err);
    } finally {
      setAdding(false);
    }
  };

  const handleClose = () => {
    setQuery('');
    setResults([]);
    setSelected(new Set());
    setSelectedBatch(null);
    setHasSearched(false);
    onClose();
  };

  const getInitials = (name: string) =>
    name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>Add Students to Classroom</DialogTitle>
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

        {/* Optional batch selection */}
        {batches.length > 0 && (
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
            No students found. Make sure they have signed in to Nexus at least once.
          </Typography>
        )}

        {!searching && results.length > 0 && (
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
              {selected.size > 0
                ? `${selected.size} selected`
                : `${results.length} student${results.length !== 1 ? 's' : ''} found`}
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, maxHeight: 300, overflow: 'auto' }}>
              {results.map((user) => (
                <Box
                  key={user.id}
                  onClick={() => toggleSelect(user.id)}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.5,
                    p: 1.5,
                    borderRadius: 2,
                    cursor: 'pointer',
                    bgcolor: selected.has(user.id) ? 'action.selected' : 'transparent',
                    '&:hover': { bgcolor: 'action.hover' },
                    minHeight: 48,
                  }}
                >
                  <Checkbox
                    checked={selected.has(user.id)}
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
                    <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                      {user.name}
                    </Typography>
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
            : `Add ${selected.size > 0 ? `${selected.size} Student${selected.size !== 1 ? 's' : ''}` : ''}`}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
