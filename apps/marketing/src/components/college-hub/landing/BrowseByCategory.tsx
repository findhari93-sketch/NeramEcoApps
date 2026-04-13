'use client';

import { useState } from 'react';
import { Box, Container, Typography, Chip, Paper, Stack } from '@mui/material';
import PublicIcon from '@mui/icons-material/Public';
import GavelIcon from '@mui/icons-material/Gavel';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import Link from 'next/link';

interface BrowseByCategoryProps {
  stateData: { state_slug: string; state: string; count: number }[];
  counselingData: { system: string; count: number }[];
  typeData: { type: string; count: number }[];
  locale: string;
}

const TABS = [
  { key: 'state', label: 'By State', icon: <PublicIcon sx={{ fontSize: 16 }} /> },
  { key: 'counseling', label: 'By Counseling', icon: <GavelIcon sx={{ fontSize: 16 }} /> },
  { key: 'fee', label: 'By Fee Range', icon: <AttachMoneyIcon sx={{ fontSize: 16 }} /> },
  { key: 'type', label: 'By College Type', icon: <AccountBalanceIcon sx={{ fontSize: 16 }} /> },
] as const;

const ALL_STATES = [
  'Tamil Nadu', 'Karnataka', 'Kerala', 'Maharashtra', 'Delhi',
  'Andhra Pradesh', 'Telangana', 'West Bengal', 'Rajasthan', 'Gujarat',
  'Uttar Pradesh', 'Madhya Pradesh', 'Punjab', 'Haryana', 'Bihar',
  'Odisha', 'Jharkhand', 'Uttarakhand', 'Goa', 'Assam',
];

const STATE_SLUG_MAP: Record<string, string> = {
  'Tamil Nadu': 'tamil-nadu', 'Karnataka': 'karnataka', 'Kerala': 'kerala',
  'Maharashtra': 'maharashtra', 'Delhi': 'delhi', 'Andhra Pradesh': 'andhra-pradesh',
  'Telangana': 'telangana', 'West Bengal': 'west-bengal', 'Rajasthan': 'rajasthan',
  'Gujarat': 'gujarat', 'Uttar Pradesh': 'uttar-pradesh', 'Madhya Pradesh': 'madhya-pradesh',
  'Punjab': 'punjab', 'Haryana': 'haryana', 'Bihar': 'bihar',
  'Odisha': 'odisha', 'Jharkhand': 'jharkhand', 'Uttarakhand': 'uttarakhand',
  'Goa': 'goa', 'Assam': 'assam',
};

const COUNSELING_LABELS: Record<string, string> = {
  TNEA: 'TNEA (Tamil Nadu)', JoSAA: 'JoSAA (Central)', KEAM: 'KEAM (Kerala)',
  KCET: 'KCET (Karnataka)', AP_EAPCET: 'AP EAPCET', TS_EAPCET: 'TS EAPCET',
};

const COUNSELING_HREFS: Record<string, string> = {
  TNEA: '/colleges/tnea', JoSAA: '/colleges/josaa',
};

const FEE_RANGES = [
  { label: 'Below ₹1 Lakh/year', href: '/colleges/fees/below-1-lakh' },
  { label: 'Below ₹2 Lakhs/year', href: '/colleges/fees/below-2-lakhs' },
  { label: 'Below ₹3 Lakhs/year', href: '/colleges/fees/below-3-lakhs' },
  { label: 'Below ₹5 Lakhs/year', href: '/colleges/fees/below-5-lakhs' },
  { label: '₹5L to ₹10L/year', href: '/colleges/fees/5-to-10-lakhs' },
  { label: 'Above ₹10 Lakhs/year', href: '/colleges/fees/above-10-lakhs' },
];

const TYPE_LABELS: Record<string, string> = {
  government: 'Government', aided: 'Govt Aided', private: 'Private',
  deemed: 'Deemed University', nit: 'NIT', iit: 'IIT',
};

export default function BrowseByCategory({ stateData, counselingData, typeData, locale }: BrowseByCategoryProps) {
  const [activeTab, setActiveTab] = useState<string>('state');

  const stateCountMap = new Map(stateData.map((s) => [s.state, s.count]));
  const counselingCountMap = new Map(counselingData.map((c) => [c.system, c.count]));
  const typeCountMap = new Map(typeData.map((t) => [t.type, t.count]));

  return (
    <Box sx={{ py: { xs: 5, sm: 6, md: 8 }, bgcolor: '#f8fafc' }}>
      <Container maxWidth="lg">
        {/* Header */}
        <Box sx={{ textAlign: 'center', mb: { xs: 3, sm: 4 } }}>
          <Typography
            variant="h2"
            sx={{
              fontSize: { xs: '1.35rem', sm: '1.75rem' },
              fontWeight: 800,
              color: '#0f172a',
              mb: 1,
            }}
          >
            Browse colleges your way
          </Typography>
          <Typography variant="body1" sx={{ color: '#64748b', fontSize: '0.95rem' }}>
            Find the right college by state, admission system, fee range, or type
          </Typography>
        </Box>

        {/* Tab pills */}
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'center',
            gap: 1,
            mb: 3.5,
            overflowX: 'auto',
            px: 1,
            '&::-webkit-scrollbar': { display: 'none' },
          }}
        >
          {TABS.map((tab) => (
            <Chip
              key={tab.key}
              icon={tab.icon}
              label={tab.label}
              clickable
              onClick={() => setActiveTab(tab.key)}
              variant={activeTab === tab.key ? 'filled' : 'outlined'}
              color={activeTab === tab.key ? 'primary' : 'default'}
              sx={{
                fontWeight: 600,
                fontSize: '0.8rem',
                height: 36,
                '& .MuiChip-icon': { fontSize: 16 },
                flexShrink: 0,
              }}
            />
          ))}
        </Box>

        {/* Tab content */}
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(3, 1fr)', md: 'repeat(4, 1fr)' },
            gap: 2,
          }}
        >
          {activeTab === 'state' && ALL_STATES.map((state) => {
            const count = stateCountMap.get(state) ?? 0;
            const slug = STATE_SLUG_MAP[state] ?? state.toLowerCase().replace(/\s+/g, '-');
            const hasData = count > 0;
            return (
              <CategoryCard
                key={state}
                href={hasData ? `/${locale}/colleges/${slug}` : undefined}
                title={state}
                subtitle={count > 0 ? `${count} colleges` : 'Coming soon'}
                muted={!hasData}
              />
            );
          })}

          {activeTab === 'counseling' && Object.keys(COUNSELING_LABELS).map((sys) => {
            const count = counselingCountMap.get(sys) ?? 0;
            const href = COUNSELING_HREFS[sys];
            return (
              <CategoryCard
                key={sys}
                href={href ? `/${locale}${href}` : undefined}
                title={COUNSELING_LABELS[sys] ?? sys}
                subtitle={count > 0 ? `${count} colleges` : 'Coming soon'}
                muted={count === 0}
              />
            );
          })}

          {activeTab === 'fee' && FEE_RANGES.map((range) => (
            <CategoryCard
              key={range.href}
              href={`/${locale}${range.href}`}
              title={range.label}
              subtitle="View colleges"
              muted={false}
            />
          ))}

          {activeTab === 'type' && Object.keys(TYPE_LABELS).map((type) => {
            const count = typeCountMap.get(type) ?? 0;
            return (
              <CategoryCard
                key={type}
                href={count > 0 ? `/${locale}/colleges?type=${type}` : undefined}
                title={TYPE_LABELS[type] ?? type}
                subtitle={count > 0 ? `${count} colleges` : 'Coming soon'}
                muted={count === 0}
              />
            );
          })}
        </Box>
      </Container>
    </Box>
  );
}

function CategoryCard({
  href,
  title,
  subtitle,
  muted,
}: {
  href?: string;
  title: string;
  subtitle: string;
  muted: boolean;
}) {
  const card = (
    <Paper
      variant="outlined"
      sx={{
        p: 2,
        borderRadius: 2,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        opacity: muted ? 0.55 : 1,
        cursor: href ? 'pointer' : 'default',
        transition: 'border-color 0.2s, box-shadow 0.2s',
        '&:hover': href ? { borderColor: 'primary.main', boxShadow: 1 } : {},
      }}
    >
      <Box>
        <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#0f172a', fontSize: '0.85rem' }}>
          {title}
        </Typography>
        <Typography variant="caption" sx={{ color: '#64748b' }}>
          {subtitle}
        </Typography>
      </Box>
      {href && <ArrowForwardIcon sx={{ fontSize: 16, color: '#94a3b8' }} />}
    </Paper>
  );

  if (href) {
    return (
      <Link href={href} style={{ textDecoration: 'none', color: 'inherit' }}>
        {card}
      </Link>
    );
  }
  return card;
}
