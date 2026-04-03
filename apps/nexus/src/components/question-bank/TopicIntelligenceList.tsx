'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Paper, Chip, Skeleton, Alert, Collapse, IconButton, alpha, useTheme,
} from '@neram/ui';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import type { QBTopicIntelligenceItem, QBTopicPriority } from '@neram/database';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';

const PRIORITY_CONFIG: Record<QBTopicPriority, { label: string; color: string; bg: string }> = {
  critical: { label: 'Critical', color: '#DC2626', bg: '#FEE2E2' },
  high: { label: 'High', color: '#D97706', bg: '#FEF3C7' },
  medium: { label: 'Medium', color: '#2563EB', bg: '#DBEAFE' },
  low: { label: 'Low', color: '#6B7280', bg: '#F3F4F6' },
};

interface TopicIntelligenceListProps {
  onTopicClick?: (topicId: string) => void;
}

function TopicCard({ topic, onTopicClick }: { topic: QBTopicIntelligenceItem; onTopicClick?: (id: string) => void }) {
  const theme = useTheme();
  const [expanded, setExpanded] = useState(false);
  const priority = topic.priority || 'low';
  const config = PRIORITY_CONFIG[priority];

  return (
    <Paper
      variant="outlined"
      sx={{
        borderRadius: 2,
        overflow: 'hidden',
        transition: 'all 0.15s ease-in-out',
        '&:hover': { borderColor: alpha(theme.palette.primary.main, 0.3) },
      }}
    >
      {/* Header */}
      <Box
        onClick={() => setExpanded(!expanded)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded(!expanded); }
        }}
        sx={{ p: { xs: 1.25, md: 1.5 }, cursor: 'pointer' }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1, minWidth: 0 }}>
            <Typography variant="subtitle2" fontWeight={700} noWrap>
              {topic.name}
            </Typography>
            <Chip
              label={config.label}
              size="small"
              sx={{ height: 20, fontSize: '0.65rem', fontWeight: 600, bgcolor: config.bg, color: config.color }}
            />
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <TrendingUpIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
              <Typography variant="caption" fontWeight={600} color="text.secondary">
                {topic.session_appearance_count}/{topic.session_names.length > 0 ? topic.session_names.length : topic.session_appearance_count} sessions
              </Typography>
            </Box>
            <IconButton size="small" sx={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
              <ExpandMoreIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Box>
        </Box>

        <Typography variant="caption" color="text.secondary">
          {topic.question_count} question{topic.question_count !== 1 ? 's' : ''} across recalled papers
        </Typography>
      </Box>

      {/* Expanded: Sub-items + Study material */}
      <Collapse in={expanded}>
        <Box sx={{ px: { xs: 1.25, md: 1.5 }, pb: 1.5, pt: 0.5 }}>
          {/* Sub-items */}
          {topic.sub_items && topic.sub_items.length > 0 && (
            <Box sx={{ mb: 1 }}>
              <Typography variant="caption" fontWeight={600} color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
                Specific items asked
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                {topic.sub_items.map((item, i) => (
                  <Chip
                    key={i}
                    label={item.name}
                    size="small"
                    variant="outlined"
                    sx={{ height: 24, fontSize: '0.7rem' }}
                  />
                ))}
              </Box>
            </Box>
          )}

          {/* Study material */}
          {topic.study_content_md ? (
            <Box
              sx={{
                p: 1,
                bgcolor: alpha(theme.palette.primary.main, 0.04),
                borderRadius: 1,
                border: `1px solid ${alpha(theme.palette.primary.main, 0.1)}`,
              }}
            >
              <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', fontSize: '0.8rem', lineHeight: 1.6 }}>
                {topic.study_content_md}
              </Typography>
            </Box>
          ) : (
            <Typography variant="caption" color="text.secondary" fontStyle="italic">
              Study material coming soon
            </Typography>
          )}

          {/* Video links */}
          {topic.study_video_urls && topic.study_video_urls.length > 0 && (
            <Box sx={{ mt: 1, display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
              {topic.study_video_urls.map((url, i) => (
                <Chip
                  key={i}
                  icon={<PlayCircleOutlineIcon sx={{ fontSize: 14 }} />}
                  label={`Video ${i + 1}`}
                  size="small"
                  clickable
                  component="a"
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  sx={{ height: 24, fontSize: '0.7rem' }}
                />
              ))}
            </Box>
          )}

          {/* Sessions list */}
          {topic.session_names.length > 0 && (
            <Box sx={{ mt: 1 }}>
              <Typography variant="caption" color="text.secondary">
                Sessions: {topic.session_names.join(', ')}
              </Typography>
            </Box>
          )}
        </Box>
      </Collapse>
    </Paper>
  );
}

export default function TopicIntelligenceList({ onTopicClick }: TopicIntelligenceListProps) {
  const { getToken } = useNexusAuthContext();
  const [topics, setTopics] = useState<QBTopicIntelligenceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTopics = useCallback(async () => {
    try {
      setLoading(true);
      const token = await getToken();
      const res = await fetch('/api/question-bank/topic-intelligence', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to fetch topic intelligence');
      const json = await res.json();
      setTopics(json.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    fetchTopics();
  }, [fetchTopics]);

  // Group by priority
  const groupedTopics = topics.reduce<Record<string, QBTopicIntelligenceItem[]>>((acc, t) => {
    const p = t.priority || 'low';
    if (!acc[p]) acc[p] = [];
    acc[p].push(t);
    return acc;
  }, {});

  const priorityOrder: QBTopicPriority[] = ['critical', 'high', 'medium', 'low'];

  if (error) {
    return <Alert severity="error" sx={{ m: 2 }}>{error}</Alert>;
  }

  return (
    <Box sx={{ pb: 2 }}>
      {loading ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, px: { xs: 1.5, md: 2 } }}>
          {[1, 2, 3, 4].map(i => (
            <Skeleton key={i} variant="rounded" height={70} sx={{ borderRadius: 2 }} />
          ))}
        </Box>
      ) : topics.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 6 }}>
          <Typography variant="body1" color="text.secondary">
            No topic intelligence data yet
          </Typography>
        </Box>
      ) : (
        priorityOrder.map(priority => {
          const group = groupedTopics[priority];
          if (!group || group.length === 0) return null;
          const config = PRIORITY_CONFIG[priority];
          return (
            <Box key={priority}>
              <Typography
                variant="overline"
                fontWeight={700}
                sx={{
                  px: { xs: 1.5, md: 2 },
                  py: 0.75,
                  display: 'block',
                  color: config.color,
                }}
              >
                {config.label} Priority ({group.length} topics)
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, px: { xs: 1.5, md: 2 }, mb: 1 }}>
                {group.map(topic => (
                  <TopicCard key={topic.id} topic={topic} onTopicClick={onTopicClick} />
                ))}
              </Box>
            </Box>
          );
        })
      )}
    </Box>
  );
}
