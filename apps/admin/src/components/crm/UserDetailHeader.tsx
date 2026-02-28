'use client';

import { Avatar, Box, Button, Chip, Divider, Paper, Typography } from '@neram/ui';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import EditIcon from '@mui/icons-material/Edit';
import NoteAddIcon from '@mui/icons-material/NoteAdd';
import EmailIcon from '@mui/icons-material/Email';
import PhoneIcon from '@mui/icons-material/Phone';
import TagIcon from '@mui/icons-material/Tag';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import VerifiedIcon from '@mui/icons-material/Verified';
import { useRouter } from 'next/navigation';
import type { UserJourneyDetail, PipelineStage } from '@neram/database';
import { PIPELINE_STAGE_CONFIG } from '@neram/database';

interface UserDetailHeaderProps {
  detail: UserJourneyDetail;
  onEditClick: () => void;
  onAddNoteClick: () => void;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export default function UserDetailHeader({
  detail,
  onEditClick,
  onAddNoteClick,
}: UserDetailHeaderProps) {
  const router = useRouter();
  const { user, pipelineStage } = detail;
  const stageConfig = PIPELINE_STAGE_CONFIG[pipelineStage];

  return (
    <Box sx={{ mb: 3 }}>
      {/* Back navigation */}
      <Button
        startIcon={<ArrowBackIcon />}
        onClick={() => router.push('/crm')}
        sx={{
          mb: 2,
          color: 'text.secondary',
          fontWeight: 500,
          '&:hover': { bgcolor: 'grey.100' },
        }}
        size="small"
      >
        Back to Users
      </Button>

      {/* Header card */}
      <Paper
        elevation={0}
        sx={{
          border: '1px solid',
          borderColor: 'grey.200',
          borderRadius: 1,
          overflow: 'hidden',
        }}
      >
        {/* Top color accent */}
        <Box
          sx={{
            height: 4,
            background: `linear-gradient(90deg, ${stageConfig.color}, ${stageConfig.color}66)`,
          }}
        />

        <Box sx={{ p: 3 }}>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 2,
            }}
          >
            {/* Left: Avatar + Info */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2.5 }}>
              <Avatar
                src={user.avatar_url || undefined}
                sx={{
                  width: 64,
                  height: 64,
                  fontSize: 26,
                  fontWeight: 700,
                  bgcolor: user.avatar_url ? 'transparent' : 'primary.main',
                  color: 'primary.contrastText',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
                }}
              >
                {user.name?.charAt(0)?.toUpperCase() || '?'}
              </Avatar>
              <Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 0.5 }}>
                  <Typography variant="h5" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
                    {user.name || 'Unnamed User'}
                  </Typography>
                  <Chip
                    label={stageConfig.label}
                    size="small"
                    sx={{
                      bgcolor: `${stageConfig.color}14`,
                      color: stageConfig.color,
                      fontWeight: 600,
                      fontSize: 11,
                      border: '1px solid',
                      borderColor: `${stageConfig.color}30`,
                      borderRadius: 1.5,
                      height: 26,
                    }}
                  />
                </Box>

                {/* Contact info row */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                  {user.email && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <EmailIcon sx={{ fontSize: 14, color: 'text.disabled' }} />
                      <Typography variant="body2" color="text.secondary">
                        {user.email}
                      </Typography>
                      {user.email_verified && (
                        <VerifiedIcon sx={{ fontSize: 13, color: 'success.main' }} />
                      )}
                    </Box>
                  )}
                  {user.phone && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <PhoneIcon sx={{ fontSize: 14, color: 'text.disabled' }} />
                      <Typography variant="body2" color="text.secondary" sx={{ fontFamily: 'monospace', fontSize: 13 }}>
                        {user.phone}
                      </Typography>
                      {user.phone_verified && (
                        <VerifiedIcon sx={{ fontSize: 13, color: 'success.main' }} />
                      )}
                    </Box>
                  )}
                  {detail.leadProfile?.application_number && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <TagIcon sx={{ fontSize: 14, color: 'text.disabled' }} />
                      <Typography variant="body2" color="text.secondary" sx={{ fontFamily: 'monospace', fontSize: 13 }}>
                        {detail.leadProfile.application_number}
                      </Typography>
                    </Box>
                  )}
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <CalendarTodayIcon sx={{ fontSize: 13, color: 'text.disabled' }} />
                    <Typography variant="caption" color="text.disabled">
                      Joined {formatDate(user.created_at)}
                    </Typography>
                  </Box>
                </Box>
              </Box>
            </Box>

            {/* Right: Actions */}
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button
                variant="outlined"
                startIcon={<NoteAddIcon />}
                onClick={onAddNoteClick}
                size="small"
                sx={{ borderRadius: 1, textTransform: 'none', fontWeight: 500 }}
              >
                Add Note
              </Button>
              <Button
                variant="contained"
                startIcon={<EditIcon />}
                onClick={onEditClick}
                size="small"
                sx={{
                  borderRadius: 1,
                  textTransform: 'none',
                  fontWeight: 500,
                  boxShadow: 'none',
                  '&:hover': { boxShadow: '0 2px 8px rgba(0,0,0,0.15)' },
                }}
              >
                Edit Profile
              </Button>
            </Box>
          </Box>
        </Box>
      </Paper>
    </Box>
  );
}
