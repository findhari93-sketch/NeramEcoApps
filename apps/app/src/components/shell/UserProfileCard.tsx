'use client';

import { Box, Typography, Avatar, Chip } from '@neram/ui';
import { neramTokens } from '@neram/ui';

interface UserProfileCardProps {
  name: string;
  avatarUrl?: string | null;
  email?: string | null;
}

export default function UserProfileCard({ name, avatarUrl, email }: UserProfileCardProps) {
  const firstName = name?.split(' ')[0] || 'Student';

  return (
    <Box
      sx={{
        px: 2,
        py: 3,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 1,
        background: `linear-gradient(180deg, ${neramTokens.gold[500]}08 0%, transparent 100%)`,
        borderBottom: '1px solid',
        borderColor: 'divider',
      }}
    >
      <Avatar
        alt={name || 'Student'}
        src={avatarUrl || undefined}
        sx={{
          width: 64,
          height: 64,
          border: `2.5px solid ${neramTokens.gold[500]}`,
          boxShadow: `0 0 0 3px ${neramTokens.gold[500]}15`,
          fontSize: '1.5rem',
          bgcolor: neramTokens.gold[500],
          color: neramTokens.navy[900],
          fontWeight: 700,
        }}
      >
        {firstName[0]?.toUpperCase()}
      </Avatar>
      <Typography
        sx={{
          fontWeight: 700,
          fontSize: '1rem',
          color: 'text.primary',
          textAlign: 'center',
          lineHeight: 1.3,
        }}
      >
        {firstName}
      </Typography>
      {email && (
        <Typography
          sx={{
            fontSize: '0.7rem',
            color: 'text.secondary',
            textAlign: 'center',
            maxWidth: '100%',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {email}
        </Typography>
      )}
      <Chip
        label="NATA 2026"
        size="small"
        sx={{
          mt: 0.5,
          bgcolor: `${neramTokens.gold[500]}15`,
          color: neramTokens.gold[600],
          fontWeight: 700,
          fontSize: '0.65rem',
          letterSpacing: '0.05em',
          height: 24,
          borderRadius: '6px',
        }}
      />
    </Box>
  );
}
