'use client';

import { useState, useEffect, type ElementType } from 'react';
import Link from 'next/link';
import { Box, Typography, Grid, Paper, Stack, Skeleton, Badge, CardActionArea } from '@mui/material';
import DomainIcon from '@mui/icons-material/Domain';
import StarHalfIcon from '@mui/icons-material/StarHalf';
import LeaderboardIcon from '@mui/icons-material/Leaderboard';
import WorkspacePremiumIcon from '@mui/icons-material/WorkspacePremium';
import ManageAccountsIcon from '@mui/icons-material/ManageAccounts';
import RateReviewIcon from '@mui/icons-material/RateReview';
import PlaceIcon from '@mui/icons-material/Place';
import PeopleIcon from '@mui/icons-material/People';
import MarkEmailReadIcon from '@mui/icons-material/MarkEmailRead';
import WindowIcon from '@mui/icons-material/Window';
import CommentIcon from '@mui/icons-material/Comment';
import TourIcon from '@mui/icons-material/Tour';
import HandshakeIcon from '@mui/icons-material/Handshake';
import AddLinkIcon from '@mui/icons-material/AddLink';

interface Stats {
  total: number;
  pending_reviews: number;
  verified: number;
  content_pending: number;
  account_requests: number;
}

interface Section {
  href: string;
  title: string;
  description: string;
  icon: ElementType;
  badge?: keyof Stats;
}

const PARTNER_SECTIONS: Section[] = [
  { href: '/college-hub/plans', title: 'Plans', description: 'Give, extend or revoke a college paid plan.', icon: WorkspacePremiumIcon },
  {
    href: '/college-hub/accounts',
    title: 'Accounts',
    description: 'Invite college staff to their dashboard.',
    icon: ManageAccountsIcon,
    badge: 'account_requests',
  },
  {
    href: '/college-hub/content-reviews',
    title: 'Content reviews',
    description: 'Approve fees, photos and details colleges send.',
    icon: RateReviewIcon,
    badge: 'content_pending',
  },
  {
    href: '/college-hub/update-links',
    title: 'Update links',
    description: 'Send a college a no-login link on WhatsApp to update its details.',
    icon: AddLinkIcon,
  },
  { href: '/college-hub/map-pins', title: 'Map pins', description: 'Check and accept suggested campus locations.', icon: PlaceIcon },
];

const OTHER_SECTIONS: Section[] = [
  { href: '/college-hub/colleges', title: 'Colleges', description: 'Every college, photos and tiers.', icon: LeaderboardIcon },
  { href: '/college-hub/reviews', title: 'Review queue', description: 'Student reviews waiting for moderation.', icon: StarHalfIcon, badge: 'pending_reviews' },
  { href: '/college-leads', title: 'Leads review', description: 'Release student interest to colleges.', icon: PeopleIcon },
  { href: '/college-hub/lead-windows', title: 'Lead windows', description: 'When colleges receive leads.', icon: WindowIcon },
  { href: '/college-hub/comments', title: 'Comments', description: 'Public comments on college pages.', icon: CommentIcon },
  { href: '/college-hub/virtual-tour', title: 'Virtual tour', description: 'Platinum virtual tours.', icon: TourIcon },
  { href: '/college-hub/partnership', title: 'Partnership pages', description: 'Partnership page requests.', icon: HandshakeIcon },
  { href: '/college-outreach', title: 'Outreach', description: 'Emails to colleges.', icon: MarkEmailReadIcon },
];

async function json(url: string): Promise<Record<string, unknown>> {
  const r = await fetch(url, { cache: 'no-store' });
  return r.ok ? r.json() : {};
}

function SectionGrid({ title, sections, stats }: { title: string; sections: Section[]; stats: Stats | null }) {
  return (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h6" component="h2" sx={{ mb: 1.5 }}>
        {title}
      </Typography>
      <Grid container spacing={2}>
        {sections.map(({ href, title: t, description, icon: Icon, badge }) => {
          const count = badge && stats ? stats[badge] : 0;
          return (
            <Grid item xs={12} sm={6} md={4} lg={3} key={href}>
              <Paper variant="outlined" sx={{ height: '100%', borderRadius: 2 }}>
                <CardActionArea
                  component={Link}
                  href={href}
                  sx={{ p: 2, height: '100%', minHeight: 96, alignItems: 'flex-start', display: 'flex', borderRadius: 2 }}
                  aria-label={count ? `${t}, ${count} waiting` : t}
                >
                  <Stack direction="row" gap={1.5} alignItems="flex-start" sx={{ width: '100%' }}>
                    <Badge badgeContent={count} color="error" max={99} overlap="circular">
                      <Box
                        sx={{
                          width: 40,
                          height: 40,
                          borderRadius: 1,
                          bgcolor: 'action.hover',
                          color: 'primary.main',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Icon />
                      </Box>
                    </Badge>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography fontWeight={700}>{t}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        {description}
                      </Typography>
                      {count > 0 && (
                        <Typography variant="caption" color="error.main" fontWeight={600}>
                          {count} waiting
                        </Typography>
                      )}
                    </Box>
                  </Stack>
                </CardActionArea>
              </Paper>
            </Grid>
          );
        })}
      </Grid>
    </Box>
  );
}

export default function CollegeHubOverviewPage() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    // Counts only: limit=1 returns one row plus the total, instead of every college.
    Promise.all([
      json('/api/college-hub/colleges?limit=1&fields=options'),
      json('/api/college-hub/colleges?limit=1&fields=options&verified=true'),
      json('/api/college-hub/reviews?status=pending'),
      json('/api/college-hub/content-reviews?count_only=1'),
      json('/api/college-hub/account-requests?count_only=1'),
    ])
      .then(([colleges, verified, reviews, content, requests]) => {
        setStats({
          total: Number(colleges.total ?? 0),
          pending_reviews: ((reviews.data as unknown[]) ?? []).length,
          verified: Number(verified.total ?? 0),
          content_pending: Number(content.pending_count ?? 0),
          account_requests: Number(requests.pending_count ?? 0),
        });
      })
      .catch(() =>
        setStats({ total: 0, pending_reviews: 0, verified: 0, content_pending: 0, account_requests: 0 }),
      );
  }, []);

  const STAT_CARDS = [
    { label: 'Total colleges', value: stats?.total, icon: <DomainIcon color="primary" /> },
    { label: 'Reviews pending', value: stats?.pending_reviews, icon: <StarHalfIcon color="warning" /> },
    { label: 'Verified profiles', value: stats?.verified, icon: <LeaderboardIcon color="success" /> },
    { label: 'Content waiting', value: stats?.content_pending, icon: <RateReviewIcon color="secondary" /> },
  ];

  return (
    <Box>
      <Stack direction="row" alignItems="center" gap={1.5} sx={{ mb: 3 }}>
        <Box
          sx={{
            width: 42,
            height: 42,
            bgcolor: 'primary.main',
            borderRadius: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <DomainIcon sx={{ color: 'primary.contrastText' }} />
        </Box>
        <Typography variant="h5" component="h1" fontWeight={700}>
          College Hub
        </Typography>
      </Stack>

      <Grid container spacing={2}>
        {STAT_CARDS.map(({ label, value, icon }) => (
          <Grid item xs={12} sm={6} md={3} key={label}>
            <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2 }}>
              <Stack direction="row" alignItems="center" gap={1.5}>
                {icon}
                <Box>
                  {stats ? (
                    <Typography variant="h4" fontWeight={800}>
                      {value}
                    </Typography>
                  ) : (
                    <Skeleton variant="text" width={48} height={42} />
                  )}
                  <Typography variant="body2" color="text.secondary">
                    {label}
                  </Typography>
                </Box>
              </Stack>
            </Paper>
          </Grid>
        ))}
      </Grid>

      <SectionGrid title="Partner programme" sections={PARTNER_SECTIONS} stats={stats} />
      <SectionGrid title="Content and leads" sections={OTHER_SECTIONS} stats={stats} />
    </Box>
  );
}
