'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  Typography,
  Paper,
  Button,
  Chip,
  Skeleton,
  useTheme,
  alpha,
  LinearProgress,
} from '@neram/ui';
import AddIcon from '@mui/icons-material/Add';
import CampaignOutlinedIcon from '@mui/icons-material/CampaignOutlined';
import PeopleOutlinedIcon from '@mui/icons-material/PeopleOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import SendOutlinedIcon from '@mui/icons-material/SendOutlined';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';

interface CampaignRow {
  id: string;
  name: string;
  description: string | null;
  target_city: string | null;
  platforms: string[];
  status: string;
  total_students: number;
  sent_count: number;
  completed_count: number;
  creator_name: string | null;
  created_at: string;
}

const STATUS_COLORS: Record<string, 'default' | 'info' | 'warning' | 'success'> = {
  draft: 'default',
  active: 'info',
  paused: 'warning',
  completed: 'success',
};

const PLATFORM_COLORS: Record<string, string> = {
  google: '#4285F4',
  sulekha: '#E91E63',
  justdial: '#FF9800',
};

export default function ReviewCampaignsPage() {
  const theme = useTheme();
  const router = useRouter();
  const { getToken } = useNexusAuthContext();
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchCampaigns() {
      try {
        const token = await getToken();
        if (!token) return;
        const res = await fetch('/api/review-campaigns', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setCampaigns(data.campaigns || []);
        }
      } catch (err) {
        console.error('Failed to load campaigns:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchCampaigns();
  }, [getToken]);

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
        <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }}>
          Review Campaigns
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => router.push('/teacher/reviews/new')}
          size="small"
        >
          New Campaign
        </Button>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>
        Manage student review requests for Google, Sulekha, and JustDial
      </Typography>

      {loading ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} variant="rectangular" height={140} sx={{ borderRadius: 2 }} />
          ))}
        </Box>
      ) : campaigns.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <CampaignOutlinedIcon sx={{ fontSize: 56, color: 'text.disabled', mb: 1 }} />
          <Typography variant="h6" color="text.secondary" sx={{ mb: 0.5 }}>
            No campaigns yet
          </Typography>
          <Typography variant="body2" color="text.disabled" sx={{ mb: 2 }}>
            Create a review campaign to request students leave reviews on Google, Sulekha, or JustDial.
          </Typography>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => router.push('/teacher/reviews/new')}
          >
            Create First Campaign
          </Button>
        </Paper>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {campaigns.map((campaign) => {
            const completionPct =
              campaign.total_students > 0
                ? Math.round((campaign.completed_count / campaign.total_students) * 100)
                : 0;

            return (
              <Paper
                key={campaign.id}
                variant="outlined"
                onClick={() => router.push(`/teacher/reviews/${campaign.id}`)}
                sx={{
                  p: 2.5,
                  cursor: 'pointer',
                  borderRadius: 2,
                  minHeight: 48,
                  transition: 'all 0.15s',
                  '&:hover': {
                    borderColor: theme.palette.primary.main,
                    backgroundColor: alpha(theme.palette.primary.main, 0.02),
                  },
                }}
              >
                {/* Header: Name + Status */}
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                    {campaign.name}
                  </Typography>
                  <Chip
                    label={campaign.status}
                    size="small"
                    color={STATUS_COLORS[campaign.status] || 'default'}
                    sx={{ textTransform: 'capitalize', fontWeight: 600, height: 24 }}
                  />
                </Box>

                {/* Description */}
                {campaign.description && (
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }} noWrap>
                    {campaign.description}
                  </Typography>
                )}

                {/* Chips: City + Platforms */}
                <Box sx={{ display: 'flex', gap: 0.75, mb: 1.5, flexWrap: 'wrap' }}>
                  {campaign.target_city && (
                    <Chip
                      label={campaign.target_city}
                      size="small"
                      variant="outlined"
                      sx={{ height: 22, fontSize: '0.7rem' }}
                    />
                  )}
                  {campaign.platforms.map((p) => (
                    <Chip
                      key={p}
                      label={p}
                      size="small"
                      sx={{
                        height: 22,
                        fontSize: '0.7rem',
                        fontWeight: 600,
                        bgcolor: alpha(PLATFORM_COLORS[p] || '#666', 0.1),
                        color: PLATFORM_COLORS[p] || '#666',
                        textTransform: 'capitalize',
                      }}
                    />
                  ))}
                </Box>

                {/* Stats row */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <PeopleOutlinedIcon sx={{ fontSize: 16, color: 'text.disabled' }} />
                    <Typography variant="caption" color="text.secondary">
                      {campaign.total_students} students
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <SendOutlinedIcon sx={{ fontSize: 16, color: 'text.disabled' }} />
                    <Typography variant="caption" color="text.secondary">
                      {campaign.sent_count} sent
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <CheckCircleOutlineIcon sx={{ fontSize: 16, color: 'success.main' }} />
                    <Typography variant="caption" color="success.main" sx={{ fontWeight: 600 }}>
                      {campaign.completed_count} completed
                    </Typography>
                  </Box>
                </Box>

                {/* Progress bar */}
                {campaign.total_students > 0 && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <LinearProgress
                      variant="determinate"
                      value={completionPct}
                      sx={{
                        flex: 1,
                        height: 6,
                        borderRadius: 3,
                        bgcolor: alpha(theme.palette.success.main, 0.1),
                        '& .MuiLinearProgress-bar': {
                          bgcolor: 'success.main',
                          borderRadius: 3,
                        },
                      }}
                    />
                    <Typography variant="caption" sx={{ fontWeight: 600, minWidth: 35 }}>
                      {completionPct}%
                    </Typography>
                  </Box>
                )}

                {/* Footer */}
                <Typography variant="caption" color="text.disabled" sx={{ mt: 1, display: 'block' }}>
                  Created {new Date(campaign.created_at).toLocaleDateString('en-IN', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                  {campaign.creator_name ? ` by ${campaign.creator_name}` : ''}
                </Typography>
              </Paper>
            );
          })}
        </Box>
      )}
    </Box>
  );
}
