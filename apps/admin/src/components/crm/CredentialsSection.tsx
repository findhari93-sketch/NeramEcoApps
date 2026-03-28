// @ts-nocheck
'use client';

import { useState, useEffect } from 'react';
import {
  Box, Paper, Typography, TextField, Button, Alert, Chip,
  Dialog, DialogTitle, DialogContent, DialogActions, IconButton,
  CircularProgress, Divider,
} from '@neram/ui';
import {
  Key, Visibility, VisibilityOff, ContentCopy, Send,
  DeleteForever, CheckCircle, Schedule,
} from '@mui/icons-material';

interface CredentialsSectionProps {
  userId: string;
  studentName: string;
  adminId: string;
  isStudent: boolean;
}

export default function CredentialsSection({ userId, studentName, adminId, isStudent }: CredentialsSectionProps) {
  const [credentials, setCredentials] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState('');
  const [publishSuccess, setPublishSuccess] = useState(false);

  const fetchCredentials = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/students/${userId}/credentials`);
      if (res.ok) {
        const data = await res.json();
        setCredentials(data.data || []);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isStudent) fetchCredentials();
  }, [userId, isStudent]);

  const handlePublish = async () => {
    if (!email || !password) return;
    setPublishing(true);
    setPublishError('');
    try {
      const res = await fetch(`/api/students/${userId}/credentials`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, credentialType: 'ms_teams', adminId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to publish');
      setPublishSuccess(true);
      setPublishOpen(false);
      setEmail('');
      setPassword('');
      fetchCredentials();
      setTimeout(() => setPublishSuccess(false), 5000);
    } catch (err: any) {
      setPublishError(err.message);
    } finally {
      setPublishing(false);
    }
  };

  if (!isStudent) return null;

  const activeCredential = credentials.find((c: any) => c.is_active);

  return (
    <Paper elevation={0} sx={{ p: 2, mb: 2, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
      <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
        <Box display="flex" alignItems="center" gap={1}>
          <Key fontSize="small" color="primary" />
          <Typography variant="subtitle1" fontWeight={600}>Teams Credentials</Typography>
        </Box>
        <Button
          variant="contained"
          size="small"
          startIcon={<Send />}
          onClick={() => setPublishOpen(true)}
          disabled={!!activeCredential}
          sx={{ borderRadius: 1, textTransform: 'none', fontWeight: 600 }}
        >
          {activeCredential ? 'Already Shared' : 'Share Credentials'}
        </Button>
      </Box>

      {publishSuccess && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setPublishSuccess(false)}>
          Credentials shared with {studentName}. They can view it in their Student App onboarding page.
        </Alert>
      )}

      {loading ? (
        <Box display="flex" justifyContent="center" py={2}><CircularProgress size={24} /></Box>
      ) : activeCredential ? (
        <Box sx={{ bgcolor: 'grey.50', p: 2, borderRadius: 1, border: '1px solid', borderColor: 'divider' }}>
          <Box display="flex" alignItems="center" gap={1} mb={1}>
            <CheckCircle sx={{ fontSize: 18, color: 'success.main' }} />
            <Typography variant="body2" fontWeight={600} color="success.dark">
              Credentials shared
            </Typography>
            <Chip
              label={activeCredential.viewed_at ? 'Viewed by student' : 'Not yet viewed'}
              size="small"
              color={activeCredential.viewed_at ? 'info' : 'default'}
              variant="outlined"
            />
          </Box>
          <Typography variant="body2" color="text.secondary" mb={0.5}>
            Email: <strong>{activeCredential.email}</strong>
          </Typography>
          <Typography variant="body2" color="text.secondary" mb={0.5}>
            Password: <strong>{'●'.repeat(8)}</strong> (hidden for security)
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Published {new Date(activeCredential.published_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
            {activeCredential.auto_destroy_at && (
              <> · Auto-destroys {new Date(activeCredential.auto_destroy_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</>
            )}
          </Typography>
        </Box>
      ) : credentials.length > 0 ? (
        <Box sx={{ bgcolor: 'warning.50', p: 2, borderRadius: 1, border: '1px solid', borderColor: 'warning.200' }}>
          <Box display="flex" alignItems="center" gap={1}>
            <Schedule sx={{ fontSize: 18, color: 'warning.main' }} />
            <Typography variant="body2" color="warning.dark">
              Previous credentials expired/destroyed. Share new credentials if needed.
            </Typography>
          </Box>
        </Box>
      ) : (
        <Typography variant="body2" color="text.secondary">
          No credentials shared yet. Create a Microsoft Teams account for this student, then share the login details here.
        </Typography>
      )}

      {/* Publish Dialog */}
      <Dialog open={publishOpen} onClose={() => setPublishOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>
          Share Teams Credentials with {studentName}
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" mb={2}>
            Enter the Microsoft Teams email and temporary password you created in Entra Admin Center.
            The student will see these in their onboarding page and can copy them to sign into Teams.
            Credentials auto-destruct 24 hours after first view.
          </Typography>

          {publishError && (
            <Alert severity="error" sx={{ mb: 2 }}>{publishError}</Alert>
          )}

          <TextField
            label="Teams Email"
            fullWidth
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="student@neramclasses.onmicrosoft.com"
            sx={{ mb: 2 }}
          />
          <TextField
            label="Temporary Password"
            fullWidth
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type={showPassword ? 'text' : 'password'}
            placeholder="Enter the temporary password"
            InputProps={{
              endAdornment: (
                <IconButton onClick={() => setShowPassword(!showPassword)} size="small">
                  {showPassword ? <VisibilityOff /> : <Visibility />}
                </IconButton>
              ),
            }}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setPublishOpen(false)} sx={{ textTransform: 'none' }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handlePublish}
            disabled={!email || !password || publishing}
            startIcon={publishing ? <CircularProgress size={16} color="inherit" /> : <Send />}
            sx={{ textTransform: 'none', fontWeight: 600 }}
          >
            {publishing ? 'Sharing...' : 'Share with Student'}
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
}
