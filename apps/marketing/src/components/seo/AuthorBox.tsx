import { Box, Typography, Avatar } from '@neram/ui';

interface AuthorBoxProps {
  name: string;
  title: string;
  bio?: string;
  avatar?: string;
}

/** Author credentials box for E-E-A-T signals on content-heavy pages */
export default function AuthorBox({ name, title, bio, avatar }: AuthorBoxProps) {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 2,
        p: { xs: 2, md: 3 },
        borderRadius: 2,
        bgcolor: 'grey.50',
        border: '1px solid',
        borderColor: 'divider',
      }}
    >
      <Avatar
        src={avatar}
        alt={name}
        sx={{ width: 48, height: 48, bgcolor: 'primary.main', fontSize: '1.2rem' }}
      >
        {name.charAt(0)}
      </Avatar>
      <Box>
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
          {name}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
          {title}
        </Typography>
        {bio && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, lineHeight: 1.6 }}>
            {bio}
          </Typography>
        )}
      </Box>
    </Box>
  );
}
