'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Box, Button, Chip, Skeleton, Stack, Typography } from '@mui/material';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import ForumOutlinedIcon from '@mui/icons-material/ForumOutlined';
import StarOutlineIcon from '@mui/icons-material/StarOutline';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import HourglassTopIcon from '@mui/icons-material/HourglassTop';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { useCollegeDashboard } from './context';
import { Card, PageHeader, TIER_TONE, formatDay } from './ui';
import { SECTIONS } from '@/lib/college-dashboard/content-sections';
import { sectionFilled } from '@/lib/college-dashboard/completeness';

interface Stats {
  page_views_30d: number;
  leads_30d: number;
  lead_count: number;
  review_count: number;
}

interface SectionState {
  live: Record<string, unknown>;
  pending: { submitted_at: string } | null;
  last_decision: { status: string; review_note: string | null } | null;
}

const WHY: Record<string, string> = {
  profile: 'The first thing students read',
  fees: 'Students search for fees more than anything else',
  admissions: 'Seats, exams and this year\'s dates',
  facilities: 'Hostels and studios parents ask about',
  location: 'Puts your campus on the map',
  photos: 'Pages with photos get more enquiries',
};

const TIER_PERKS: Record<string, string> = {
  free: 'A basic listing. Enquiries reach you after Neram staff check them, with phone numbers partly hidden.',
  silver: 'Infrastructure and faculty sections on your page, and enquiries delivered straight to you.',
  gold: 'Placements, fee calculator and the AI helper on your page, and enquiries with full phone numbers.',
  platinum: 'Everything in Gold plus a 360 campus tour.',
};

function daysLeft(end: string): number {
  return Math.max(0, Math.ceil((new Date(`${end}T23:59:59+05:30`).getTime() - Date.now()) / 86400000));
}

export default function CollegeDashboardHome() {
  const { collegeAdmin, college, plan, api } = useCollegeDashboard();
  const [stats, setStats] = useState<Stats | null>(null);
  const [sections, setSections] = useState<Record<string, SectionState> | null>(null);

  useEffect(() => {
    void api<Stats>('/api/college-dashboard/analytics').then((r) => r.ok && setStats(r.data));
    void api<{ sections: Record<string, SectionState> }>('/api/college-dashboard/content').then((r) => r.ok && setSections(r.data.sections));
  }, [api]);

  const tier = plan?.tier ?? 'free';
  const tone = TIER_TONE[tier] ?? TIER_TONE.free;
  const publicUrl = college?.state_slug ? `/colleges/${college.state_slug}/${college.slug}` : null;

  return (
    <Stack gap={2.5}>
      <PageHeader
        title={`Welcome, ${collegeAdmin?.name?.split(' ')[0] ?? 'there'}`}
        intro="Keep your college page accurate and follow up with students who asked about admission."
        action={
          publicUrl && (
            <Button component="a" href={publicUrl} target="_blank" rel="noopener" variant="outlined" endIcon={<OpenInNewIcon />} sx={{ minHeight: 44, textTransform: 'none' }}>
              See your public page
            </Button>
          )
        }
      />

      <Card>
        <Stack direction={{ xs: 'column', sm: 'row' }} gap={1.5} justifyContent="space-between" alignItems={{ sm: 'center' }}>
          <Box>
            <Stack direction="row" gap={1} alignItems="center" flexWrap="wrap">
              <Chip label={tone.label} sx={{ bgcolor: tone.bg, color: tone.fg, fontWeight: 700 }} />
              {college?.verified && <Chip label="Verified college" color="success" variant="outlined" />}
            </Stack>
            <Typography sx={{ mt: 1, fontSize: 15, color: 'text.secondary', maxWidth: 640 }}>{TIER_PERKS[tier] ?? TIER_PERKS.free}</Typography>
          </Box>
          {plan?.active && (
            <Box sx={{ textAlign: { sm: 'right' }, flexShrink: 0 }}>
              <Typography sx={{ fontWeight: 700, fontSize: 18 }}>{daysLeft(plan.active.ends_on)} days left</Typography>
              <Typography sx={{ fontSize: 13.5, color: 'text.secondary' }}>Until {formatDay(plan.active.ends_on)}</Typography>
            </Box>
          )}
          {plan?.upcoming && !plan.active && (
            <Typography sx={{ fontSize: 14, color: 'text.secondary' }}>Your plan starts on {formatDay(plan.upcoming.starts_on)}</Typography>
          )}
        </Stack>
      </Card>

      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: { xs: 1, sm: 1.5 } }}>
        {[
          { label: 'Page views, last 30 days', value: stats?.page_views_30d, Icon: VisibilityOutlinedIcon, href: '/college-dashboard/analytics' },
          { label: 'Enquiries, last 30 days', value: stats?.leads_30d, Icon: ForumOutlinedIcon, href: '/college-dashboard/leads' },
          { label: 'Published reviews', value: stats?.review_count, Icon: StarOutlineIcon, href: '/college-dashboard/reviews' },
        ].map(({ label, value, Icon, href }) => (
          <Box
            key={label}
            component={Link}
            href={href}
            sx={{
              display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, alignItems: { xs: 'flex-start', sm: 'center' }, gap: { xs: 0.5, sm: 1.5 }, p: { xs: 1.5, sm: 2 }, minWidth: 0, borderRadius: 2, border: '1px solid', borderColor: 'divider',
              bgcolor: 'background.paper', color: 'inherit', textDecoration: 'none',
              '&:hover': { borderColor: 'primary.light' }, '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
            }}
          >
            <Icon aria-hidden sx={{ color: 'primary.main' }} />
            <Box>
              {value === undefined ? <Skeleton width={40} height={30} /> : <Typography sx={{ fontWeight: 700, fontSize: 24, lineHeight: 1.2 }}>{value.toLocaleString('en-IN')}</Typography>}
              <Typography sx={{ fontSize: { xs: 12.5, sm: 13.5 }, color: 'text.secondary', lineHeight: 1.35 }}>{label}</Typography>
            </Box>
          </Box>
        ))}
      </Box>

      <Card>
        <Typography component="h2" sx={{ fontWeight: 700, fontSize: 18, mb: 0.5 }}>
          Your college page
        </Typography>
        <Typography sx={{ fontSize: 14.5, color: 'text.secondary', mb: 1.5 }}>
          Changes you send are checked by the Neram team, usually within one working day, then go live.
        </Typography>
        {!sections ? (
          <Stack gap={1}>{[0, 1, 2].map((i) => <Skeleton key={i} variant="rounded" height={52} />)}</Stack>
        ) : (
          <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
            {SECTIONS.map((s) => {
              const st = sections[s.key];
              const filled = st ? sectionFilled(s.key, st.live) : false;
              const pending = !!st?.pending;
              const rejected = st?.last_decision?.status === 'rejected' && !pending;
              return (
                <Box component="li" key={s.key} sx={{ borderTop: '1px solid', borderColor: 'divider', '&:first-of-type': { borderTop: 0 } }}>
                  <Box
                    component={Link}
                    href={`/college-dashboard/profile#${s.key}`}
                    sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minHeight: 56, py: 1, color: 'inherit', textDecoration: 'none', '&:hover .t': { color: 'primary.main' }, '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main' } }}
                  >
                    {pending ? (
                      <HourglassTopIcon aria-hidden sx={{ color: 'warning.main' }} />
                    ) : filled ? (
                      <CheckCircleIcon aria-hidden sx={{ color: 'success.main' }} />
                    ) : (
                      <RadioButtonUncheckedIcon aria-hidden sx={{ color: 'text.disabled' }} />
                    )}
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography className="t" sx={{ fontWeight: 600, fontSize: 15 }}>{s.title}</Typography>
                      <Typography sx={{ fontSize: 13.5, color: rejected ? 'error.main' : 'text.secondary' }}>
                        {pending ? 'Sent for review' : rejected ? 'Not approved last time. Open to see why.' : filled ? 'Up to date' : WHY[s.key]}
                      </Typography>
                    </Box>
                    <ChevronRightIcon aria-hidden sx={{ color: 'text.disabled' }} />
                  </Box>
                </Box>
              );
            })}
          </Box>
        )}
      </Card>
    </Stack>
  );
}
