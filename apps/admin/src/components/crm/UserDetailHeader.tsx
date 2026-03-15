'use client';

import { useState } from 'react';
import { Avatar, Box, Button, Chip, Divider, Paper, Typography, TextField, CircularProgress, Alert } from '@neram/ui';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import EditIcon from '@mui/icons-material/Edit';
import NoteAddIcon from '@mui/icons-material/NoteAdd';
import EmailIcon from '@mui/icons-material/Email';
import PhoneIcon from '@mui/icons-material/Phone';
import TagIcon from '@mui/icons-material/Tag';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import VerifiedIcon from '@mui/icons-material/Verified';
import SchoolIcon from '@mui/icons-material/School';
import LinkIcon from '@mui/icons-material/Link';
import LinkOffIcon from '@mui/icons-material/LinkOff';
import { useRouter } from 'next/navigation';
import type { UserJourneyDetail, PipelineStage } from '@neram/database';
import { PIPELINE_STAGE_CONFIG } from '@neram/database';

interface UserDetailHeaderProps {
  detail: UserJourneyDetail;
  onEditClick: () => void;
  onAddNoteClick: () => void;
  adminId?: string;
  onStatusChange?: () => void;
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
  adminId,
  onStatusChange,
}: UserDetailHeaderProps) {
  const router = useRouter();
  const { user, pipelineStage } = detail;
  const stageConfig = PIPELINE_STAGE_CONFIG[pipelineStage];

  // Classroom linking state
  const [classroomEmail, setClassroomEmail] = useState('');
  const [linkingClassroom, setLinkingClassroom] = useState(false);
  const [unlinkingClassroom, setUnlinkingClassroom] = useState(false);
  const [classroomError, setClassroomError] = useState('');
  const [showLinkInput, setShowLinkInput] = useState(false);

  const linkedEmail = (user as any).linked_classroom_email as string | null;

  const handleLinkClassroom = async () => {
    if (!classroomEmail.trim() || !adminId) return;
    setLinkingClassroom(true);
    setClassroomError('');
    try {
      const res = await fetch(`/api/crm/users/${user.id}/classroom-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ classroomEmail: classroomEmail.trim(), adminId }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to link classroom');
      }
      setClassroomEmail('');
      setShowLinkInput(false);
      onStatusChange?.();
    } catch (err: any) {
      setClassroomError(err.message);
    } finally {
      setLinkingClassroom(false);
    }
  };

  const handleUnlinkClassroom = async () => {
    setUnlinkingClassroom(true);
    setClassroomError('');
    try {
      const res = await fetch(`/api/crm/users/${user.id}/classroom-link`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to unlink classroom');
      }
      onStatusChange?.();
    } catch (err: any) {
      setClassroomError(err.message);
    } finally {
      setUnlinkingClassroom(false);
    }
  };

  return (
    <Box sx={{ mb: 2 }}>
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

        <Box sx={{ p: 2 }}>
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
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              {linkedEmail || pipelineStage === 'enrolled' ? (
                <Box
                  sx={{
                    width: 72,
                    height: 72,
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, #FFD700, #FFA000, #FFD700)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <Box
                    sx={{
                      width: 68,
                      height: 68,
                      borderRadius: '50%',
                      bgcolor: 'background.paper',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Avatar
                      src={user.avatar_url || undefined}
                      sx={{
                        width: 64,
                        height: 64,
                        fontSize: 26,
                        fontWeight: 700,
                        bgcolor: user.avatar_url ? 'transparent' : 'primary.main',
                        color: 'primary.contrastText',
                      }}
                    >
                      {user.name?.charAt(0)?.toUpperCase() || '?'}
                    </Avatar>
                  </Box>
                </Box>
              ) : (
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
              )}
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
          </Box>

          {/* Classroom Linking Section */}
          <Box sx={{ mt: 2, pt: 2, borderTop: '1px solid', borderColor: 'grey.100' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <SchoolIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
              <Typography variant="body2" fontWeight={600} color="text.secondary">
                Nexus Classroom Link
              </Typography>
            </Box>
            {linkedEmail ? (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Chip
                  icon={<LinkIcon sx={{ fontSize: 14 }} />}
                  label={linkedEmail}
                  size="small"
                  sx={{
                    background: 'linear-gradient(135deg, #FFD70030, #FFA00020)',
                    fontWeight: 600,
                    fontSize: 12,
                    border: '1px solid #FFD70060',
                  }}
                />
                <Chip
                  label="Neram Student"
                  size="small"
                  sx={{
                    background: 'linear-gradient(135deg, #FFD700, #FFA000)',
                    color: '#000',
                    fontWeight: 700,
                    fontSize: 10,
                    height: 22,
                  }}
                />
                <Button
                  size="small"
                  color="error"
                  startIcon={unlinkingClassroom ? <CircularProgress size={12} /> : <LinkOffIcon sx={{ fontSize: 14 }} />}
                  onClick={handleUnlinkClassroom}
                  disabled={unlinkingClassroom}
                  sx={{ textTransform: 'none', fontSize: 12 }}
                >
                  Unlink
                </Button>
              </Box>
            ) : (
              <Box>
                {showLinkInput ? (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <TextField
                      size="small"
                      placeholder="student@classroom.neramclasses.com"
                      value={classroomEmail}
                      onChange={(e) => setClassroomEmail(e.target.value)}
                      sx={{ width: 320, '& .MuiOutlinedInput-root': { fontSize: 13, borderRadius: 0.75 } }}
                    />
                    <Button
                      variant="contained"
                      size="small"
                      onClick={handleLinkClassroom}
                      disabled={!classroomEmail.trim() || linkingClassroom}
                      sx={{ textTransform: 'none', boxShadow: 'none', borderRadius: 0.75, fontSize: 12 }}
                    >
                      {linkingClassroom ? <CircularProgress size={14} sx={{ mr: 0.5 }} /> : null}
                      Link
                    </Button>
                    <Button
                      size="small"
                      onClick={() => { setShowLinkInput(false); setClassroomEmail(''); setClassroomError(''); }}
                      sx={{ textTransform: 'none', fontSize: 12 }}
                    >
                      Cancel
                    </Button>
                  </Box>
                ) : (
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<LinkIcon sx={{ fontSize: 14 }} />}
                    onClick={() => setShowLinkInput(true)}
                    sx={{ textTransform: 'none', borderRadius: 0.75, fontSize: 12 }}
                  >
                    Link to Classroom
                  </Button>
                )}
                {classroomError && (
                  <Alert severity="error" sx={{ mt: 1, fontSize: 12, py: 0, borderRadius: 0.75 }}>
                    {classroomError}
                  </Alert>
                )}
              </Box>
            )}
          </Box>
        </Box>
      </Paper>
    </Box>
  );
}
