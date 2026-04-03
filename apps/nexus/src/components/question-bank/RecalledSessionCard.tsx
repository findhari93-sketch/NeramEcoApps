'use client';

import { Box, Paper, Typography, alpha, useTheme } from '@neram/ui';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import type { QBRecalledSessionCard } from '@neram/database';
import ContributorAvatars from './ContributorAvatars';

interface RecalledSessionCardProps {
  session: QBRecalledSessionCard;
  onClick: () => void;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'Unknown date';
  return new Date(dateStr).toLocaleDateString('en-IN', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function TierDot({ color, count }: { color: string; count: number }) {
  if (count === 0) return null;
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
      <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: color, flexShrink: 0 }} />
      <Typography variant="caption" fontWeight={600} color="text.secondary">
        {count}
      </Typography>
    </Box>
  );
}

function TopicBar({ name, count, maxCount }: { name: string; count: number; maxCount: number }) {
  const pct = maxCount > 0 ? (count / maxCount) * 100 : 0;
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ width: 100, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
      >
        {name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
      </Typography>
      <Box sx={{ flex: 1, height: 6, bgcolor: 'action.hover', borderRadius: 1, overflow: 'hidden' }}>
        <Box sx={{ width: `${pct}%`, height: '100%', bgcolor: 'primary.main', borderRadius: 1 }} />
      </Box>
      <Typography variant="caption" fontWeight={600} color="text.secondary" sx={{ width: 20, textAlign: 'right' }}>
        {count}
      </Typography>
    </Box>
  );
}

export default function RecalledSessionCard({ session, onClick }: RecalledSessionCardProps) {
  const theme = useTheme();
  const { paper, contributors, tier_counts, topic_distribution } = session;

  // Sort topics by count, take top 3
  const topTopics = Object.entries(topic_distribution)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3);
  const maxTopicCount = topTopics.length > 0 ? topTopics[0][1] : 0;

  const totalQuestions = tier_counts.tier_1 + tier_counts.tier_2 + tier_counts.tier_3;

  return (
    <Paper
      variant="outlined"
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); }
      }}
      sx={{
        p: { xs: 1.5, md: 2 },
        borderRadius: 2,
        cursor: 'pointer',
        transition: 'all 0.15s ease-in-out',
        '&:hover': {
          borderColor: alpha(theme.palette.primary.main, 0.4),
          boxShadow: theme.shadows[2],
        },
        '&:active': { transform: 'scale(0.99)' },
      }}
    >
      {/* Row 1: Date + Question count */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
          <CalendarTodayIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
          <Typography variant="subtitle2" fontWeight={700}>
            {formatDate(paper.exam_date)}
          </Typography>
        </Box>
        <Typography variant="caption" color="text.secondary" fontWeight={600}>
          {totalQuestions} Qs
        </Typography>
      </Box>

      {/* Row 2: Contributors */}
      <Box sx={{ mb: 1 }}>
        <ContributorAvatars contributors={contributors} max={4} size={24} />
      </Box>

      {/* Row 3: Tier counts */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: topTopics.length > 0 ? 1 : 0 }}>
        <TierDot color="#22C55E" count={tier_counts.tier_1} />
        <TierDot color="#F59E0B" count={tier_counts.tier_2} />
        <TierDot color="#9E9E9E" count={tier_counts.tier_3} />
      </Box>

      {/* Row 4: Topic radar (top 3) */}
      {topTopics.length > 0 && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
          {topTopics.map(([slug, count]) => (
            <TopicBar key={slug} name={slug} count={count} maxCount={maxTopicCount} />
          ))}
        </Box>
      )}
    </Paper>
  );
}
