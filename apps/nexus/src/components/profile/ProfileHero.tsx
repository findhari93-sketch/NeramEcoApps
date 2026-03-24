'use client';

import { useState, useRef } from 'react';
import {
  Box,
  Typography,
  Chip,
  Paper,
  Avatar,
  IconButton,
  Tooltip,
} from '@neram/ui';
import CameraAltIcon from '@mui/icons-material/CameraAlt';
import CloudDoneIcon from '@mui/icons-material/CloudDone';
import GraphAvatar from '@/components/GraphAvatar';
import ProfilePhotoUpload from './ProfilePhotoUpload';

interface ProfileHeroProps {
  userName: string;
  userEmail: string | null;
  userType: string;
  getToken: () => Promise<string | null>;
}

export default function ProfileHero({ userName, userEmail, userType, getToken }: ProfileHeroProps) {
  const [uploadOpen, setUploadOpen] = useState(false);
  const [customPhotoUrl, setCustomPhotoUrl] = useState<string | null>(null);
  const [teamsSynced, setTeamsSynced] = useState(false);

  const handleUploadComplete = (newUrl: string, synced: boolean) => {
    setCustomPhotoUrl(newUrl);
    setTeamsSynced(synced);
  };

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
            {customPhotoUrl ? (
              <Avatar
                src={customPhotoUrl}
                alt={userName}
                sx={{ width: 120, height: 120, fontSize: 48 }}
              >
                {userName?.charAt(0)?.toUpperCase()}
              </Avatar>
            ) : (
              <GraphAvatar self name={userName} size={120} />
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
              {teamsSynced && (
                <Tooltip title="Photo synced to Microsoft Teams">
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
