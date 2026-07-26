'use client';

import { useState, useRef } from 'react';
import {
  Box,
  Typography,
  Chip,
  Paper,
  IconButton,
  Tooltip,
} from '@neram/ui';
import CameraAltIcon from '@mui/icons-material/CameraAlt';
import CloudDoneIcon from '@mui/icons-material/CloudDone';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import GraphAvatar from '@/components/GraphAvatar';
import ProfilePhotoUpload from './ProfilePhotoUpload';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import type { PhotoStatus } from '@/lib/photo-gate';

interface ProfileHeroProps {
  userName: string;
  userEmail: string | null;
  userType: string;
  /** users.avatar_url from /api/auth/me, the one Nexus-stored photo, shown
   *  regardless of whether it has reached Microsoft yet. */
  avatarUrl: string | null;
  getToken: () => Promise<string | null>;
}

/** Chip shown next to the role, so a student always knows where their photo stands. */
const PHOTO_CHIP: Record<
  PhotoStatus,
  { label: string; color: 'success' | 'info' | 'warning'; icon: React.ReactElement } | null
> = {
  approved: {
    label: 'Photo approved',
    color: 'success',
    icon: <CheckCircleOutlineIcon sx={{ fontSize: 16 }} />,
  },
  pending: {
    label: 'Waiting for teacher approval',
    color: 'info',
    icon: <HourglassEmptyIcon sx={{ fontSize: 16 }} />,
  },
  rejected: {
    label: 'Photo needs a change',
    color: 'warning',
    icon: <ErrorOutlineIcon sx={{ fontSize: 16 }} />,
  },
  // Nothing to report when there is no photo at all: the empty avatar and the
  // camera badge already say it, and a scolding chip on top adds nothing.
  missing: null,
};

export default function ProfileHero({
  userName,
  userEmail,
  userType,
  avatarUrl,
  getToken,
}: ProfileHeroProps) {
  const { photoGate, refreshAuth } = useNexusAuthContext();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [customPhotoUrl, setCustomPhotoUrl] = useState<string | null>(null);

  // Server truth, not a guess from the upload response. A photo only reaches
  // Teams after a teacher approves it, so this is false for the whole time the
  // student is waiting, which is exactly what they should see.
  const teamsSynced = photoGate.microsoftSynced;

  const handleUploadComplete = (newUrl: string) => {
    setCustomPhotoUrl(newUrl);
    // Pull the new 'pending' status so the chip below updates without a reload.
    void refreshAuth();
  };

  const photoChip = PHOTO_CHIP[photoGate.status];

  return (
    <>
      <Paper
        elevation={0}
        sx={{
          p: { xs: 3, sm: 4 },
          mb: 2,
          borderRadius: 3,
          border: '1px solid',
          borderColor: 'divider',
          background: (theme) =>
            `linear-gradient(135deg, ${theme.palette.primary.main}08 0%, ${theme.palette.primary.main}03 100%)`,
        }}
      >
        <Box
          sx={{
            display: 'flex',
            flexDirection: { xs: 'column', sm: 'row' },
            alignItems: 'center',
            gap: { xs: 2, sm: 3 },
          }}
        >
          {/* Avatar with edit overlay */}
          <Box
            sx={{
              position: 'relative',
              cursor: 'pointer',
              '&:hover .edit-overlay': { opacity: 1 },
            }}
            onClick={() => setUploadOpen(true)}
          >
            {/* Just uploaded this session, so show that response immediately
                rather than waiting on refreshAuth() to round-trip. Otherwise
                fall back to the server-known avatar_url, which GraphAvatar
                shows the instant it loads, before (or if) the live Microsoft
                photo becomes available. Either way, an uploaded photo is
                never invisible while it waits for review. */}
            <GraphAvatar
              self
              name={userName}
              size={120}
              fallbackSrc={customPhotoUrl || avatarUrl}
            />

            {/* Review-status badge, directly on the photo: an uploaded photo
                should never read as "not uploaded" just because it hasn't
                been looked at yet. */}
            {(photoGate.status === 'pending' || photoGate.status === 'rejected') && (
              <Tooltip
                title={
                  photoGate.status === 'rejected'
                    ? photoGate.reason || 'Your teacher asked for a clearer photo of your face.'
                    : 'A teacher will look at this soon. You can keep using Nexus in the meantime.'
                }
              >
                <Box
                  sx={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    width: 34,
                    height: 34,
                    borderRadius: '50%',
                    bgcolor: photoGate.status === 'rejected' ? 'warning.main' : 'info.main',
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: '3px solid',
                    borderColor: 'background.paper',
                  }}
                >
                  {photoGate.status === 'rejected' ? (
                    <ErrorOutlineIcon sx={{ fontSize: 16 }} />
                  ) : (
                    <HourglassEmptyIcon sx={{ fontSize: 16 }} />
                  )}
                </Box>
              </Tooltip>
            )}

            {/* Edit badge */}
            <Box
              className="edit-overlay"
              sx={{
                position: 'absolute',
                bottom: 0,
                right: 0,
                width: 36,
                height: 36,
                borderRadius: '50%',
                bgcolor: 'primary.main',
                color: 'primary.contrastText',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '3px solid',
                borderColor: 'background.paper',
                transition: 'opacity 0.2s, transform 0.2s',
                opacity: { xs: 1, sm: 0.85 },
                '&:hover': { transform: 'scale(1.1)' },
              }}
            >
              <CameraAltIcon sx={{ fontSize: 16 }} />
            </Box>
          </Box>

          {/* Info */}
          <Box
            sx={{
              textAlign: { xs: 'center', sm: 'left' },
              flex: 1,
              minWidth: 0,
            }}
          >
            <Typography
              variant="h5"
              sx={{
                fontWeight: 700,
                mb: 0.5,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {userName || 'Student'}
            </Typography>

            <Typography
              variant="body2"
              color="text.secondary"
              sx={{
                mb: 1.5,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {userEmail || 'No email'}
            </Typography>

            <Box sx={{ display: 'flex', gap: 1, justifyContent: { xs: 'center', sm: 'flex-start' }, flexWrap: 'wrap' }}>
              <Chip
                label={userType}
                size="small"
                color="primary"
                sx={{ textTransform: 'capitalize', fontWeight: 500 }}
              />
              {photoChip && (
                <Tooltip
                  title={
                    photoGate.status === 'rejected'
                      ? photoGate.reason || 'Your teacher asked for a clearer photo of your face.'
                      : photoGate.status === 'pending'
                        ? 'A teacher will look at this soon. You can keep using Nexus in the meantime.'
                        : 'Your teacher has approved this photo.'
                  }
                >
                  <Chip
                    icon={photoChip.icon}
                    label={photoChip.label}
                    size="small"
                    variant="outlined"
                    color={photoChip.color}
                    sx={{ fontWeight: 500 }}
                  />
                </Tooltip>
              )}
              {teamsSynced && (
                <Tooltip title="This is also your photo in Microsoft Teams and Outlook">
                  <Chip
                    icon={<CloudDoneIcon sx={{ fontSize: 16 }} />}
                    label="Teams synced"
                    size="small"
                    variant="outlined"
                    color="success"
                    sx={{ fontWeight: 500 }}
                  />
                </Tooltip>
              )}
            </Box>
          </Box>
        </Box>
      </Paper>

      <ProfilePhotoUpload
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onUploadComplete={handleUploadComplete}
        getToken={getToken}
      />
    </>
  );
}
