'use client';

/**
 * Full-screen blocker for a student with no approved profile photo.
 *
 * Deliberately self-serve: the only things on this screen are the photo widget
 * and Sign Out, so a blocked student clears it themselves in under a minute
 * without needing a teacher, an admin, or a support message. That is the whole
 * reason the gate can be strict at all.
 *
 * Reuses the existing ProfilePhotoUpload (camera on touch devices, paste, drop,
 * round crop, 400x400 JPEG, push to Teams) in `mandatory` mode, so there is one
 * photo pipeline in the app rather than two.
 *
 * Rendered by AccessGate, after the alumni branch, so a graduated student is
 * never asked for a photo.
 */

import { useState } from 'react';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Card,
  CardContent,
  Stack,
  Typography,
  alpha,
} from '@neram/ui';
import AddAPhotoOutlinedIcon from '@mui/icons-material/AddAPhotoOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import LogoutOutlinedIcon from '@mui/icons-material/LogoutOutlined';
import CloudSyncOutlinedIcon from '@mui/icons-material/CloudSyncOutlined';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import ProfilePhotoUpload from '@/components/profile/ProfilePhotoUpload';

const ACCENT = '#7C3AED'; // Nexus purple

/** Written in the second person, because the student reads them verbatim. */
const RULES = [
  'Show your own face, not a friend or a group',
  'Look at the camera in good light',
  'No sunglasses, cap or mask covering your face',
  'No cartoons, logos or screenshots',
];

export default function PhotoRequiredGate() {
  const { user, signOut, getToken, photoGate, refreshAuth } = useNexusAuthContext();
  const [open, setOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [msNotice, setMsNotice] = useState<string | null>(null);

  const firstName = user?.name ? user.name.split(' ')[0] : null;
  const rejected = photoGate.status === 'rejected';

  const handleUploaded = async () => {
    // The server has already moved the student to 'pending', which does not
    // block, so one refresh lifts the gate without a page reload.
    setSubmitted(true);
    setOpen(false);
    await refreshAuth();
  };

  const useMicrosoftPhoto = async () => {
    setPulling(true);
    setMsNotice(null);
    try {
      const token = await getToken();
      const res = await fetch('/api/profile/avatar/from-microsoft', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = await res.json().catch(() => ({}));
      if (body?.success) {
        setSubmitted(true);
        await refreshAuth();
        return;
      }
      setMsNotice(
        body?.message ||
          body?.error ||
          'We could not use your Microsoft photo. Take or choose one here instead.',
      );
    } catch {
      setMsNotice('We could not reach Microsoft. Take or choose a photo here instead.');
    } finally {
      setPulling(false);
    }
  };

  return (
    <Box
      sx={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        bgcolor: 'background.default',
      }}
    >
      {/* Slim top bar with sign out */}
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', p: { xs: 1.5, sm: 2 } }}>
        <Button
          variant="text"
          size="small"
          startIcon={<LogoutOutlinedIcon />}
          onClick={signOut}
          sx={{ color: 'text.secondary', minHeight: 44 }}
        >
          Sign Out
        </Button>
      </Box>

      <Box
        sx={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          px: { xs: 2.5, sm: 4 },
          pb: { xs: 6, md: 8 },
          maxWidth: 560,
          mx: 'auto',
          width: '100%',
          textAlign: 'center',
        }}
      >
        <Avatar
          sx={{
            width: 88,
            height: 88,
            mb: 3,
            bgcolor: alpha(ACCENT, 0.12),
            color: ACCENT,
          }}
        >
          {submitted ? (
            <CheckCircleOutlineIcon sx={{ fontSize: 48 }} />
          ) : (
            <AddAPhotoOutlinedIcon sx={{ fontSize: 44 }} />
          )}
        </Avatar>

        <Typography
          variant="h4"
          sx={{ fontWeight: 800, mb: 1.5, fontSize: { xs: '1.5rem', sm: '1.9rem' } }}
        >
          {rejected
            ? 'Your photo needs a change'
            : firstName
              ? `Add your photo, ${firstName}`
              : 'Add your photo'}
        </Typography>

        <Typography
          variant="body1"
          color="text.secondary"
          sx={{ lineHeight: 1.7, fontSize: { xs: '0.98rem', sm: '1.05rem' }, mb: 2.5 }}
        >
          {rejected
            ? 'Your teacher looked at your photo and asked for a new one. Add a clear photo of your face to get back in.'
            : 'Nexus needs a clear photo of your face so your teachers know who they are teaching. It takes about a minute.'}
        </Typography>

        {rejected && (
          <Alert severity="warning" sx={{ width: '100%', mb: 2.5, textAlign: 'left' }}>
            {photoGate.reason || 'Your teacher asked for a clearer photo of your face.'}
          </Alert>
        )}

        <Card
          variant="outlined"
          sx={{
            width: '100%',
            borderRadius: 3,
            border: `1px solid ${alpha(ACCENT, 0.18)}`,
            bgcolor: alpha(ACCENT, 0.04),
            mb: 3,
          }}
        >
          <CardContent sx={{ p: { xs: 2.5, sm: 3 }, textAlign: 'left' }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
              What works
            </Typography>
            <Stack spacing={0.75}>
              {RULES.map((rule) => (
                <Typography
                  key={rule}
                  variant="body2"
                  color="text.secondary"
                  sx={{ lineHeight: 1.6 }}
                >
                  {rule}
                </Typography>
              ))}
            </Stack>
          </CardContent>
        </Card>

        <Button
          variant="contained"
          size="large"
          fullWidth
          startIcon={<AddAPhotoOutlinedIcon />}
          onClick={() => setOpen(true)}
          sx={{
            py: 1.5,
            borderRadius: 3,
            fontSize: '1rem',
            fontWeight: 700,
            textTransform: 'none',
            bgcolor: ACCENT,
            '&:hover': { bgcolor: '#6D28D9' },
            minHeight: 52,
          }}
        >
          {rejected ? 'Add a new photo' : 'Take or upload a photo'}
        </Button>

        <Typography variant="caption" color="text.secondary" sx={{ mt: 1.5, mb: 2 }}>
          No camera? Choose a photo already saved on your device.
        </Typography>

        {/* Many students already set a picture on their Microsoft account. It is
            meant to be the same photo, so make that one tap rather than making
            them find the file and upload it a second time. */}
        <Button
          variant="outlined"
          size="large"
          fullWidth
          startIcon={<CloudSyncOutlinedIcon />}
          onClick={useMicrosoftPhoto}
          disabled={pulling}
          sx={{
            borderRadius: 3,
            textTransform: 'none',
            fontWeight: 600,
            minHeight: 52,
            mb: msNotice ? 1.5 : 3,
          }}
        >
          {pulling ? 'Checking Microsoft...' : 'Use my Microsoft photo'}
        </Button>

        {msNotice && (
          <Alert severity="info" sx={{ width: '100%', mb: 3, textAlign: 'left' }}>
            {msNotice}
          </Alert>
        )}

        <Button
          variant="outlined"
          size="large"
          fullWidth
          startIcon={<LogoutOutlinedIcon />}
          onClick={signOut}
          sx={{ borderRadius: 3, textTransform: 'none', fontWeight: 600, minHeight: 52 }}
        >
          Sign Out
        </Button>
      </Box>

      <ProfilePhotoUpload
        open={open}
        mandatory
        onClose={() => setOpen(false)}
        onUploadComplete={handleUploaded}
        getToken={getToken}
      />
    </Box>
  );
}
