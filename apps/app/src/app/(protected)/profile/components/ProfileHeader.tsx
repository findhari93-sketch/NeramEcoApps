'use client';

import { Box, Typography, Button, Chip, useTheme, useMediaQuery } from '@neram/ui';
import { useFirebaseAuth } from '@neram/auth';
import ProfilePictureUpload from '@/components/ProfilePictureUpload';
import type { CropData } from '@/components/ProfilePictureUpload';
import type { User, AccountTier } from '@neram/database';
import { computeAccountTier } from '@neram/database';

interface ProfileHeaderProps {
  profile: User | null;
  isEditing: boolean;
  onToggleEdit: () => void;
  onAvatarUpload: (file: File, cropData: CropData) => Promise<void>;
  onAvatarRemove: () => Promise<void>;
}

export default function ProfileHeader({
  profile,
  isEditing,
  onToggleEdit,
  onAvatarUpload,
  onAvatarRemove,
}: ProfileHeaderProps) {
  const { signOut } = useFirebaseAuth();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  return (
    <Box>
      <ProfilePictureUpload
        currentAvatarUrl={profile?.avatar_url}
        userName={profile?.name || 'User'}
        onUpload={onAvatarUpload}
        onRemove={onAvatarRemove}
        size={isMobile ? 100 : 120}
        editable={true}
      />

      <Typography variant="h6" sx={{ mt: 2, textAlign: 'center' }}>
        {profile?.name || 'User'}
      </Typography>

      {profile?.username && (
        <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center' }}>
          @{profile.username}
        </Typography>
      )}

      <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', mt: 0.5 }}>
        {profile?.email}
      </Typography>

      {/* Verification badges */}
      <Box sx={{ display: 'flex', justifyContent: 'center', gap: 1, mt: 1.5, flexWrap: 'wrap' }}>
        {profile?.email_verified && (
          <Chip label="Email Verified" size="small" color="success" variant="outlined" />
        )}
        {profile?.phone_verified && (
          <Chip label="Phone Verified" size="small" color="success" variant="outlined" />
        )}
        {profile?.user_type && profile.user_type !== 'lead' && (
          <Chip
            label={profile.user_type === 'student' ? 'Student' : profile.user_type}
            size="small"
            color="primary"
            variant="outlined"
          />
        )}
        {profile && computeAccountTier(profile.user_type, profile.linked_classroom_email ?? null) === 'enrolled_student' && (
          <Chip
            label="Neram Student"
            size="small"
            sx={{
              background: 'linear-gradient(135deg, #FFD700, #FFA000)',
              color: '#000',
              fontWeight: 700,
              fontSize: 11,
            }}
          />
        )}
      </Box>

      {/* Actions */}
      <Box sx={{ mt: 3 }}>
        <Button
          variant={isEditing ? 'text' : 'outlined'}
          fullWidth
          onClick={onToggleEdit}
        >
          {isEditing ? 'Cancel Editing' : 'Edit Profile'}
        </Button>
        <Button
          variant="text"
          color="error"
          fullWidth
          sx={{ mt: 1 }}
          onClick={() => signOut()}
        >
          Sign Out
        </Button>
      </Box>
    </Box>
  );
}
