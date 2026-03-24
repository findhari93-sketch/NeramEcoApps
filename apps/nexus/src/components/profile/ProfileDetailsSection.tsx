'use client';

import { Box, Typography, Paper, Skeleton } from '@neram/ui';
import SchoolIcon from '@mui/icons-material/School';
import WorkIcon from '@mui/icons-material/Work';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import BadgeIcon from '@mui/icons-material/Badge';
import PhoneIcon from '@mui/icons-material/Phone';
import BusinessIcon from '@mui/icons-material/Business';
import PublicIcon from '@mui/icons-material/Public';
import MapIcon from '@mui/icons-material/Map';
import type { GraphProfile } from '@/hooks/useGraphProfile';

interface ProfileDetailsSectionProps {
  profile: GraphProfile | null;
  loading: boolean;
}

const FIELD_CONFIG = [
  { key: 'department', label: 'Batch / Group', icon: SchoolIcon },
  { key: 'jobTitle', label: 'Role', icon: WorkIcon },
  { key: 'officeLocation', label: 'Center', icon: BusinessIcon },
  { key: 'city', label: 'City', icon: LocationOnIcon },
  { key: 'state', label: 'State', icon: MapIcon },
  { key: 'country', label: 'Country', icon: PublicIcon },
  { key: 'employeeId', label: 'Student ID', icon: BadgeIcon },
  { key: 'mobilePhone', label: 'Mobile', icon: PhoneIcon },
] as const;

export default function ProfileDetailsSection({ profile, loading }: ProfileDetailsSectionProps) {
  if (loading) {
    return (
      <Paper
        elevation={0}
        sx={{ p: { xs: 2.5, sm: 3 }, mb: 2, borderRadius: 3, border: '1px solid', borderColor: 'divider' }}
      >
        <Skeleton width={120} height={20} sx={{ mb: 2 }} />
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} variant="rectangular" height={44} sx={{ borderRadius: 1 }} />
          ))}
        </Box>
      </Paper>
    );
  }

  if (!profile) return null;

  const fields = FIELD_CONFIG.filter(
    (f) => profile[f.key as keyof GraphProfile] != null
  );

  if (fields.length === 0) return null;

  return (
    <Paper
      elevation={0}
      sx={{ p: { xs: 2.5, sm: 3 }, mb: 2, borderRadius: 3, border: '1px solid', borderColor: 'divider' }}
    >
      <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 2, fontWeight: 600, letterSpacing: 0.5 }}>
        Profile Details
      </Typography>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
          gap: 2,
        }}
      >
        {fields.map(({ key, label, icon: Icon }) => (
          <Box
            key={key}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
              p: 1.5,
              borderRadius: 2,
              bgcolor: 'action.hover',
            }}
          >
            <Icon sx={{ color: 'text.secondary', fontSize: 20 }} />
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.2 }}>
                {label}
              </Typography>
              <Typography
                variant="body2"
                sx={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              >
                {profile[key as keyof GraphProfile]}
              </Typography>
            </Box>
          </Box>
        ))}
      </Box>
    </Paper>
  );
}
