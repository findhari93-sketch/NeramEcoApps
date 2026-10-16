'use client';

import { Box, Typography, Chip, Card, CardContent } from '@neram/ui';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import Image from 'next/image';
import { tokens as t } from '@/design-system/tokens';

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
    image_crops?: {
      square?: string;
      banner?: string;
      mobile?: string;
    } | null;
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
      elevation={0}
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        bgcolor: t.surface,
        color: t.ink,
        border: `1px solid ${t.line}`,
        // Gold accent top, as on a highlighted ProgramCard.
        borderTop: `3px solid ${t.gold500}`,
        borderRadius: `${t.radius}px`,
        boxShadow: 'none',
        transition: 'border-color 150ms ease',
        '&:hover': { borderColor: t.gold500 },
      }}
    >
      <CardContent sx={{ flexGrow: 1, p: { xs: 2.5, sm: 3 } }}>
        {/* Header: Avatar + Name + Score */}
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
          <Box
            sx={{
              width: 56,
              height: 56,
              mr: 2,
              borderRadius: '50%',
              overflow: 'hidden',
              bgcolor: t.navy700,
              position: 'relative',
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {(metadata.image_crops?.square || imageUrl) ? (
              <Image
                src={metadata.image_crops?.square || imageUrl!}
                alt={metadata.student_name}
                fill
                sizes="56px"
                style={{ objectFit: 'cover' }}
              />
            ) : (
              <Typography sx={{ fontSize: 18, fontWeight: 700, color: t.paper }}>
                {initials}
              </Typography>
            )}
          </Box>
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
                    bgcolor: t.goldTintBg,
                    color: t.gold800,
                    fontWeight: 600,
                    '& .MuiChip-icon': { color: t.gold800 },
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
              borderLeft: `3px solid ${t.gold500}`,
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
