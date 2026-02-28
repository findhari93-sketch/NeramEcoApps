'use client';

import { Box, Typography, Avatar, Chip, Card, CardContent } from '@neram/ui';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';

interface AchievementCardProps {
  title: string;
  description: string;
  imageUrl: string | null;
  metadata: {
    student_name: string;
    exam: string;
    score?: number | null;
    rank?: number | null;
    percentile?: number | null;
    college?: string | null;
    academic_year?: string;
    student_quote?: string | null;
  };
}

export default function AchievementCard({ title, description, imageUrl, metadata }: AchievementCardProps) {
  const initials = metadata.student_name
    ? metadata.student_name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
    : '?';

  const scoreLabel = metadata.rank
    ? `Rank ${metadata.rank}`
    : metadata.score
      ? `Score: ${metadata.score}`
      : metadata.percentile
        ? `${metadata.percentile}%`
        : null;

  return (
    <Card
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        overflow: 'visible',
        transition: 'transform 0.2s',
        '&:hover': { transform: 'translateY(-4px)', boxShadow: 4 },
      }}
    >
      {/* Gold accent top border */}
      <Box
        sx={{
          height: 4,
          background: 'linear-gradient(90deg, #F9A825, #FFD54F)',
          borderRadius: '4px 4px 0 0',
        }}
      />
      <CardContent sx={{ flexGrow: 1, p: { xs: 2.5, sm: 3 } }}>
        {/* Header: Avatar + Name + Score */}
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
          <Avatar
            src={imageUrl || undefined}
            alt={metadata.student_name}
            sx={{
              width: 56,
              height: 56,
              mr: 2,
              bgcolor: 'warning.light',
              color: 'warning.contrastText',
              fontSize: 18,
              fontWeight: 700,
            }}
          >
            {!imageUrl && initials}
          </Avatar>
          <Box sx={{ flexGrow: 1, minWidth: 0 }}>
            <Typography variant="h6" component="div" fontWeight={700} noWrap>
              {metadata.student_name}
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
              <Chip
                label={metadata.exam}
                size="small"
                color="primary"
                variant="outlined"
              />
              {scoreLabel && (
                <Chip
                  icon={<EmojiEventsIcon sx={{ fontSize: 16 }} />}
                  label={scoreLabel}
                  size="small"
                  sx={{
                    bgcolor: 'warning.50',
                    color: 'warning.dark',
                    fontWeight: 600,
                    '& .MuiChip-icon': { color: 'warning.main' },
                  }}
                />
              )}
            </Box>
          </Box>
        </Box>

        {/* College */}
        {metadata.college && (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Admitted to: <strong>{metadata.college}</strong>
          </Typography>
        )}

        {/* Title / Description */}
        {title && (
          <Typography variant="body1" fontWeight={600} sx={{ mb: 1 }}>
            {title}
          </Typography>
        )}

        {/* Student quote */}
        {metadata.student_quote && (
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{
              fontStyle: 'italic',
              mt: 1,
              pl: 2,
              borderLeft: '3px solid',
              borderColor: 'warning.main',
            }}
          >
            &ldquo;{metadata.student_quote}&rdquo;
          </Typography>
        )}

        {/* Academic year tag */}
        {metadata.academic_year && (
          <Chip
            label={metadata.academic_year}
            size="small"
            variant="outlined"
            sx={{ mt: 2 }}
          />
        )}
      </CardContent>
    </Card>
  );
}
