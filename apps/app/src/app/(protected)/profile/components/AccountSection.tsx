'use client';

import { Box, Typography, Chip } from '@neram/ui';
import type { User } from '@neram/database';

interface AccountSectionProps {
  profile: User;
}

function formatDate(dateStr: string | null): string | null {
  if (!dateStr) return null;
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export default function AccountSection({ profile }: AccountSectionProps) {
  const items: { label: string; value: React.ReactNode }[] = [
    {
      label: 'Email Verified',
      value: (
        <Chip
          label={profile.email_verified ? 'Yes' : 'No'}
          size="small"
          color={profile.email_verified ? 'success' : 'default'}
        />
      ),
    },
    {
      label: 'Phone Verified',
      value: (
        <Chip
          label={profile.phone_verified ? 'Yes' : 'No'}
          size="small"
          color={profile.phone_verified ? 'success' : 'default'}
        />
      ),
    },
  ];

  if (profile.user_type) {
    items.push({
      label: 'Account Type',
      value: (
        <Typography variant="body2" sx={{ fontWeight: 500, textTransform: 'capitalize' }}>
          {profile.user_type}
        </Typography>
      ),
    });
  }

  if (profile.created_at) {
    items.push({
      label: 'Member Since',
      value: (
        <Typography variant="body2" sx={{ fontWeight: 500 }}>
          {formatDate(profile.created_at)}
        </Typography>
      ),
    });
  }

  if (profile.last_login_at) {
    items.push({
      label: 'Last Login',
      value: (
        <Typography variant="body2" sx={{ fontWeight: 500 }}>
          {formatDate(profile.last_login_at)}
        </Typography>
      ),
    });
  }

  return (
    <Box>
      {items.map(({ label, value }) => (
        <Box
          key={label}
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            py: 0.75,
            '&:not(:last-child)': { borderBottom: '1px solid', borderColor: 'divider' },
          }}
        >
          <Typography variant="body2" color="text.secondary">
            {label}
          </Typography>
          {value}
        </Box>
      ))}
    </Box>
  );
}
