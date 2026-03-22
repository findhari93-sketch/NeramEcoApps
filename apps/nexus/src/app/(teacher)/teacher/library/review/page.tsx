'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Tabs,
  Tab,
  Skeleton,
  Grid,
} from '@neram/ui';
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined';
import PendingOutlinedIcon from '@mui/icons-material/PendingOutlined';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import StatCard from '@/components/StatCard';
import VideoReviewCard from '@/components/library/admin/VideoReviewCard';
import BulkApproveBar from '@/components/library/admin/BulkApproveBar';

interface ReviewStats {
  approved: number;
  pending: number;
  rejected: number;
  errors: number;
  total: number;
}

interface ReviewVideo {
  id: string;
  youtube_video_id: string;
  original_title: string | null;
  youtube_thumbnail_url: string | null;
  duration_seconds: number | null;
  published_at: string | null;
  transcript_status: string;
  suggested_title: string | null;
  category: string | null;
  subcategories: string[];
  exam: string | null;
  language: string | null;
  difficulty: string | null;
  topics: string[];
  ai_confidence: number | null;
  review_status: string;
}

type FilterTab = 'all' | 'high_confidence' | 'low_confidence' | 'no_transcript' | 'errors';

export default function ReviewQueuePage() {
  const { getToken } = useNexusAuthContext();
  const [stats, setStats] = useState<ReviewStats | null>(null);
  const [videos, setVideos] = useState<ReviewVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) return;

      const headers = { Authorization: `Bearer ${token}` };

      // Build query params based on filter tab
      const params = new URLSearchParams();
      switch (activeTab) {
        case 'high_confidence':
          params.set('minConfidence', '0.85');
          break;
        case 'low_confidence':
          params.set('maxConfidence', '0.5');
          break;
        case 'no_transcript':
          params.set('transcriptStatus', 'pending');
          break;
        case 'errors':
          params.set('transcriptStatus', 'error');
          break;
      }
      params.set('limit', '50');

      const [statsRes, videosRes] = await Promise.all([
        fetch('/api/library/admin/review?limit=0', { headers }),
        fetch(`/api/library/admin/review?${params.toString()}`, { headers }),
      ]);

      if (statsRes.ok) {
        const statsData = await statsRes.json();
        // Calculate stats from response
        const allVideos = statsData.videos || [];
        const reviewStats: ReviewStats = {
          approved: allVideos.filter((v: ReviewVideo) => v.review_status === 'approved').length,
          pending: allVideos.filter((v: ReviewVideo) => v.review_status === 'pending').length,
          errors: allVideos.filter((v: ReviewVideo) => v.transcript_status === 'error').length,
          rejected: allVideos.filter((v: ReviewVideo) => v.review_status === 'rejected').length,
          total: statsData.total || 0,
        };
        setStats(reviewStats);
      }

      if (videosRes.ok) {
        const data = await videosRes.json();
        setVideos(data.videos || []);
      }
    } catch (err) {
      console.error('Failed to load review queue:', err);
    } finally {
      setLoading(false);
    }
  }, [getToken, activeTab]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSelectVideo = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const handleVideoAction = async (
    id: string,
    action: 'approve' | 'reject' | 'skip',
    updates?: Record<string, unknown>
  ) => {
    if (action === 'skip') {
      setVideos((prev) => prev.filter((v) => v.id !== id));
      return;
    }

    const token = await getToken();
    if (!token) return;

    await fetch(`/api/library/admin/review/${id}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(updates),
    });

    setVideos((prev) => prev.filter((v) => v.id !== id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const handleBulkApprove = async () => {
    const token = await getToken();
    if (!token) return;

    const ids = Array.from(selectedIds);
    const res = await fetch('/api/library/admin/review/bulk-approve', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ video_ids: ids }),
    });

    if (res.ok) {
      setVideos((prev) => prev.filter((v) => !selectedIds.has(v.id)));
      setSelectedIds(new Set());
      fetchData();
    }
  };

  return (
    <Box>
      <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 2 }}>
        Video Review Queue
      </Typography>

      {/* Stats Bar */}
      <Grid container spacing={1} sx={{ mb: 2 }}>
        {[
          {
            title: 'Approved',
            value: stats?.approved ?? '-',
            icon: <CheckCircleOutlinedIcon />,
            color: '#4caf50',
          },
          {
            title: 'Pending',
            value: stats?.pending ?? '-',
            icon: <PendingOutlinedIcon />,
            color: '#ff9800',
          },
          {
            title: 'Errors',
            value: stats?.errors ?? '-',
            icon: <ErrorOutlineIcon />,
            color: '#f44336',
          },
        ].map((stat, idx) =>
          loading ? (
            <Grid item xs={4} key={idx}>
              <Skeleton variant="rounded" height={64} sx={{ borderRadius: 2 }} />
            </Grid>
          ) : (
            <Grid item xs={4} key={idx}>
              <StatCard
                title={stat.title}
                value={stat.value}
                icon={stat.icon}
                color={stat.color}
                size="compact"
                variant="surface"
              />
            </Grid>
          )
        )}
      </Grid>

      {/* Filter Tabs */}
      <Tabs
        value={activeTab}
        onChange={(_, val) => setActiveTab(val)}
        variant="scrollable"
        scrollButtons="auto"
        sx={{
          mb: 2,
          minHeight: 36,
          '& .MuiTab-root': {
            textTransform: 'none',
            fontWeight: 600,
            fontSize: '0.75rem',
            minHeight: 36,
            py: 0,
          },
        }}
      >
        <Tab label="All" value="all" />
        <Tab label="High Confidence" value="high_confidence" />
        <Tab label="Low Confidence" value="low_confidence" />
        <Tab label="No Transcript" value="no_transcript" />
        <Tab label="Errors" value="errors" />
      </Tabs>

      {/* Video List */}
      {loading ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} variant="rounded" height={120} sx={{ borderRadius: 2 }} />
          ))}
        </Box>
      ) : videos.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 6 }}>
          <CheckCircleOutlinedIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
          <Typography variant="body2" color="text.secondary">
            No videos in this filter
          </Typography>
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, pb: selectedIds.size > 0 ? 8 : 0 }}>
          {videos.map((video) => (
            <VideoReviewCard
              key={video.id}
              video={video}
              selected={selectedIds.has(video.id)}
              onSelect={handleSelectVideo}
              onAction={handleVideoAction}
            />
          ))}
        </Box>
      )}

      {/* Bulk Approve Bar */}
      <BulkApproveBar
        selectedCount={selectedIds.size}
        onApprove={handleBulkApprove}
        onClear={() => setSelectedIds(new Set())}
      />
    </Box>
  );
}
