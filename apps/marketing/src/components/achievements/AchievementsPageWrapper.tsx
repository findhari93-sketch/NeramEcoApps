'use client';

import { useState } from 'react';
import { Box, Container, Typography, Tabs, Tab } from '@neram/ui';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import LeaderboardIcon from '@mui/icons-material/Leaderboard';
import WorkspacePremiumIcon from '@mui/icons-material/WorkspacePremium';
import ResultsWall from './ResultsWall';
import AchievementsPageContent from '../AchievementsPageContent';

interface AchievementsPageWrapperProps {
  locale: string;
}

export default function AchievementsPageWrapper({ locale }: AchievementsPageWrapperProps) {
  const [activeTab, setActiveTab] = useState(0);

  return (
    <Box sx={{ py: { xs: 4, md: 8 } }}>
      <Container maxWidth="lg">
        {/* Header */}
        <Box sx={{ textAlign: 'center', mb: { xs: 3, md: 5 } }}>
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 1.5, mb: 1 }}>
            <EmojiEventsIcon sx={{ color: '#e8a020', fontSize: 40 }} />
            <Typography variant="h3" component="h1" fontWeight={800}>
              Our Achievers
            </Typography>
          </Box>
          <Typography variant="h6" color="text.secondary" sx={{ maxWidth: 600, mx: 'auto' }}>
            Congratulations to our students who excelled in NATA, JEE Paper 2, and TNEA exams
          </Typography>
        </Box>

        {/* Tab Navigation */}
        <Box sx={{ display: 'flex', justifyContent: 'center', mb: 4 }}>
          <Tabs
            value={activeTab}
            onChange={(_, v) => setActiveTab(v)}
            sx={{
              '& .MuiTab-root': {
                fontWeight: 600,
                minWidth: 140,
                fontSize: { xs: '13px', sm: '14px' },
              },
              '& .MuiTabs-indicator': {
                backgroundColor: '#e8a020',
              },
            }}
          >
            <Tab
              icon={<LeaderboardIcon sx={{ fontSize: 20 }} />}
              iconPosition="start"
              label="Student Results"
              sx={{ gap: 0.5 }}
            />
            <Tab
              icon={<WorkspacePremiumIcon sx={{ fontSize: 20 }} />}
              iconPosition="start"
              label="Achievements"
              sx={{ gap: 0.5 }}
            />
          </Tabs>
        </Box>
      </Container>

      {/* Tab Content */}
      {activeTab === 0 && <ResultsWall />}
      {activeTab === 1 && <AchievementsPageContent locale={locale} />}
    </Box>
  );
}
