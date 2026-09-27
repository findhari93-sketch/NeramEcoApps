'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Grid, Box, Typography, Skeleton, Button } from '@neram/ui';
import PeopleIcon from '@mui/icons-material/People';
import PersonAddAlt1Icon from '@mui/icons-material/PersonAddAlt1';
import AssignmentIcon from '@mui/icons-material/Assignment';
import PaymentIcon from '@mui/icons-material/Payment';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import { formatRupees, type DashboardSummary } from '@/lib/dashboard-stats';

interface StatCardProps {
  title: string;
  value: string;
  caption: string;
  href: string;
  icon: React.ReactNode;
}

function StatCard({ title, value, caption, href, icon }: StatCardProps) {
  return (
    <Box
      component={Link}
      href={href}
      aria-label={`${title}: ${value}. ${caption}. Open`}
      sx={{
        display: 'block',
        p: 2,
        bgcolor: 'background.paper',
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 2,
        height: '100%',
        minHeight: 104,
        color: 'inherit',
        textDecoration: 'none',
        transition: 'border-color 150ms ease, box-shadow 150ms ease',
        '&:hover': { borderColor: 'primary.main' },
        '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
        '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
      }}
    >
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1 }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography
            sx={{
              fontSize: 12,
              fontWeight: 600,
              color: 'text.secondary',
              textTransform: 'uppercase',
              letterSpacing: '0.03em',
              mb: 0.75,
            }}
          >
            {title}
          </Typography>
          <Typography sx={{ fontSize: '1.5rem', fontWeight: 700, lineHeight: 1.2 }}>{value}</Typography>
          <Typography sx={{ fontSize: 13, color: 'text.secondary', mt: 0.75 }}>{caption}</Typography>
        </Box>
        <Box sx={{ color: 'text.secondary', display: 'flex' }} aria-hidden>
          {icon}
        </Box>
      </Box>
    </Box>
  );
}

function CardSkeleton() {
  return (
    <Box sx={{ p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 2, minHeight: 104 }}>
      <Skeleton width="55%" height={16} />
      <Skeleton width="35%" height={36} />
      <Skeleton width="70%" height={16} />
    </Box>
  );
}

export function buildStatCards(s: DashboardSummary): StatCardProps[] {
  return [
    {
      title: 'Active students',
      value: s.activeStudents.toLocaleString('en-IN'),
      caption: 'Enrolled in a live classroom',
      href: '/students',
      icon: <PeopleIcon sx={{ fontSize: 22 }} />,
    },
    {
      title: 'New leads',
      value: s.newLeads7d.toLocaleString('en-IN'),
      caption: 'Signed up in the last 7 days',
      href: '/leads',
      icon: <PersonAddAlt1Icon sx={{ fontSize: 22 }} />,
    },
    {
      title: 'Applications to review',
      value: s.applicationsToReview.toLocaleString('en-IN'),
      caption: 'Submitted and waiting on staff',
      href: '/crm',
      icon: <AssignmentIcon sx={{ fontSize: 22 }} />,
    },
    {
      title: 'Collected this month',
      value: formatRupees(s.collectedThisMonth),
      caption: `${s.paymentsPending.toLocaleString('en-IN')} payment${s.paymentsPending === 1 ? '' : 's'} pending`,
      href: '/payments',
      icon: <PaymentIcon sx={{ fontSize: 22 }} />,
    },
  ];
}

export default function DashboardStats() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setSummary(null);
    try {
      const res = await fetch('/api/stats');
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Could not load the dashboard numbers.');
      setSummary(body.summary);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the dashboard numbers.');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (error) {
    return (
      <Box
        role="alert"
        sx={{
          p: 2,
          border: '1px solid',
          borderColor: 'error.main',
          borderRadius: 2,
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          flexWrap: 'wrap',
        }}
      >
        <ErrorOutlineIcon color="error" aria-hidden />
        <Typography sx={{ flex: 1, minWidth: 200 }}>{error}</Typography>
        <Button variant="outlined" onClick={load} sx={{ minHeight: 44 }}>
          Try again
        </Button>
      </Box>
    );
  }

  return (
    <Grid container spacing={2} aria-busy={!summary}>
      {(summary ? buildStatCards(summary) : Array.from({ length: 4 })).map((card, i) => (
        <Grid item xs={12} sm={6} md={3} key={card ? (card as StatCardProps).title : i}>
          {card ? <StatCard {...(card as StatCardProps)} /> : <CardSkeleton />}
        </Grid>
      ))}
    </Grid>
  );
}
