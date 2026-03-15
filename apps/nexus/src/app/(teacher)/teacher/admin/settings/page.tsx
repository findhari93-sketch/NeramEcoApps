'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Paper,
  Button,
  TextField,
  IconButton,
  Chip,
  CircularProgress,
  Alert,
  alpha,
  useTheme,
  Stack,
} from '@neram/ui';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import SaveOutlinedIcon from '@mui/icons-material/SaveOutlined';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { useRouter } from 'next/navigation';

export default function AdminSettingsPage() {
  const { isAdmin, loading, getToken } = useNexusAuthContext();
  const router = useRouter();
  const theme = useTheme();

  const [adminEmails, setAdminEmails] = useState<string[]>([]);
  const [newEmail, setNewEmail] = useState('');
  const [fetching, setFetching] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (!loading && !isAdmin) {
      router.replace('/teacher/dashboard');
    }
  }, [isAdmin, loading, router]);

  // Fetch current settings
  useEffect(() => {
    async function fetchSettings() {
      try {
        const res = await fetch('/api/settings?key=admin_teams_contacts');
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.value)) {
            setAdminEmails(data.value);
          }
        }
      } catch {
        // Fallback to empty
      } finally {
        setFetching(false);
      }
    }
    fetchSettings();
  }, []);

  const handleAddEmail = useCallback(() => {
    const email = newEmail.trim();
    if (!email) return;
    if (adminEmails.includes(email)) {
      setSaveMessage({ type: 'error', text: 'This email is already in the list.' });
      return;
    }
    setAdminEmails((prev) => [...prev, email]);
    setNewEmail('');
    setSaveMessage(null);
  }, [newEmail, adminEmails]);

  const handleRemoveEmail = useCallback((email: string) => {
    setAdminEmails((prev) => prev.filter((e) => e !== email));
    setSaveMessage(null);
  }, []);

  const handleSave = useCallback(async () => {
    if (adminEmails.length === 0) {
      setSaveMessage({ type: 'error', text: 'Add at least one admin email.' });
      return;
    }

    setSaving(true);
    setSaveMessage(null);

    try {
      const token = await getToken();
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ key: 'admin_teams_contacts', value: adminEmails }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to save');
      }

      setSaveMessage({ type: 'success', text: 'Settings saved successfully.' });
    } catch (err) {
      setSaveMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to save settings.',
      });
    } finally {
      setSaving(false);
    }
  }, [adminEmails, getToken]);

  if (loading || !isAdmin) return null;

  return (
    <Box>
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 1 }}>
        Settings
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        System configuration and preferences
      </Typography>

      {/* Admin Teams Contacts */}
      <Paper
        sx={{
          p: { xs: 2.5, sm: 3 },
          borderRadius: 3,
          border: `1px solid ${theme.palette.divider}`,
        }}
        elevation={0}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
          <GroupsOutlinedIcon sx={{ color: '#6264A7' }} />
          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
              Admin Teams Contacts
            </Typography>
            <Typography variant="caption" color="text.secondary">
              These emails appear on the &quot;Talk to Admin on Teams&quot; button for users without classroom access.
            </Typography>
          </Box>
        </Box>

        {fetching ? (
          <Box sx={{ textAlign: 'center', py: 3 }}>
            <CircularProgress size={24} />
          </Box>
        ) : (
          <>
            {/* Current emails */}
            <Stack direction="row" flexWrap="wrap" gap={1} sx={{ mb: 2, minHeight: 32 }}>
              {adminEmails.map((email) => (
                <Chip
                  key={email}
                  label={email}
                  onDelete={() => handleRemoveEmail(email)}
                  deleteIcon={<DeleteOutlineIcon sx={{ fontSize: 18 }} />}
                  sx={{
                    bgcolor: alpha('#6264A7', 0.08),
                    '& .MuiChip-deleteIcon': { color: alpha(theme.palette.error.main, 0.6) },
                  }}
                />
              ))}
              {adminEmails.length === 0 && (
                <Typography variant="body2" color="text.secondary">
                  No admin contacts configured.
                </Typography>
              )}
            </Stack>

            {/* Add new email */}
            <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
              <TextField
                size="small"
                placeholder="admin@neramclasses.com"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAddEmail(); }}
                sx={{ flex: 1 }}
              />
              <IconButton
                onClick={handleAddEmail}
                sx={{
                  bgcolor: alpha('#6264A7', 0.1),
                  '&:hover': { bgcolor: alpha('#6264A7', 0.2) },
                }}
              >
                <AddIcon />
              </IconButton>
            </Box>

            {saveMessage && (
              <Alert severity={saveMessage.type} sx={{ mb: 2, borderRadius: 2 }}>
                {saveMessage.text}
              </Alert>
            )}

            <Button
              variant="contained"
              startIcon={saving ? <CircularProgress size={18} color="inherit" /> : <SaveOutlinedIcon />}
              disabled={saving}
              onClick={handleSave}
              sx={{
                textTransform: 'none',
                fontWeight: 600,
                borderRadius: 2,
                bgcolor: '#6264A7',
                '&:hover': { bgcolor: '#525497' },
              }}
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </>
        )}
      </Paper>
    </Box>
  );
}
