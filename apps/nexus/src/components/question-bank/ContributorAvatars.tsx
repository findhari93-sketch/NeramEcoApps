'use client';

import { Avatar, AvatarGroup, Tooltip, Typography, Box } from '@neram/ui';

interface Contributor {
  display_name: string;
  role: 'student' | 'teacher' | 'admin';
}

interface ContributorAvatarsProps {
  contributors: Contributor[];
  max?: number;
  size?: number;
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function getAvatarColor(name: string, role: string): string {
  if (role === 'teacher' || role === 'admin') return '#2563EB';
  const colors = ['#6366F1', '#8B5CF6', '#EC4899', '#F97316', '#14B8A6', '#06B6D4'];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

export default function ContributorAvatars({ contributors, max = 4, size = 28 }: ContributorAvatarsProps) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
      <AvatarGroup
        max={max}
        sx={{
          '& .MuiAvatar-root': {
            width: size,
            height: size,
            fontSize: size * 0.4,
            fontWeight: 600,
            border: '2px solid #fff',
          },
        }}
      >
        {contributors.map((c, i) => (
          <Tooltip key={i} title={`${c.display_name} (${c.role})`} arrow>
            <Avatar sx={{ bgcolor: getAvatarColor(c.display_name, c.role) }}>
              {getInitials(c.display_name)}
            </Avatar>
          </Tooltip>
        ))}
      </AvatarGroup>
      {contributors.length <= max && (
        <Typography variant="caption" color="text.secondary" sx={{ ml: 0.5, whiteSpace: 'nowrap' }}>
          {contributors.map(c => c.display_name.split(' ')[0]).join(', ')}
        </Typography>
      )}
    </Box>
  );
}
