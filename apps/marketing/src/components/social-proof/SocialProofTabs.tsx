'use client';

import { Box, Tabs, Tab, Chip } from '@neram/ui';
import PlayCircleFilledIcon from '@mui/icons-material/PlayCircleFilled';
import HeadphonesIcon from '@mui/icons-material/Headphones';
import PhotoLibraryIcon from '@mui/icons-material/PhotoLibrary';

type TabType = 'video' | 'audio' | 'screenshot';

interface SocialProofTabsProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  counts: {
    video: number;
    audio: number;
    screenshot: number;
  };
}

const tabs: { value: TabType; label: string; icon: React.ReactElement }[] = [
  { value: 'video', label: 'Video Stories', icon: <PlayCircleFilledIcon /> },
  { value: 'audio', label: 'Audio Stories', icon: <HeadphonesIcon /> },
  { value: 'screenshot', label: 'Screenshots', icon: <PhotoLibraryIcon /> },
];

export default function SocialProofTabs({
  activeTab,
  onTabChange,
  counts,
}: SocialProofTabsProps) {
  const handleChange = (_event: React.SyntheticEvent, newValue: TabType) => {
    onTabChange(newValue);
  };

  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: 'center',
        mb: { xs: 4, md: 5 },
      }}
    >
      <Tabs
        value={activeTab}
        onChange={handleChange}
        variant="scrollable"
        scrollButtons="auto"
        allowScrollButtonsMobile
        sx={{
          minHeight: 48,
          '& .MuiTabs-indicator': {
            backgroundColor: 'var(--neram-gold)',
            height: 3,
            borderRadius: '3px 3px 0 0',
          },
          '& .MuiTabs-scrollButtons': {
            color: 'var(--neram-text-muted)',
          },
          '& .MuiTabs-flexContainer': {
            gap: { xs: 0, sm: 1 },
          },
        }}
      >
        {tabs.map((tab) => {
          const count = counts[tab.value];
          const isActive = activeTab === tab.value;

          return (
            <Tab
              key={tab.value}
              value={tab.value}
              icon={tab.icon}
              iconPosition="start"
              label={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <span>{tab.label}</span>
                  {count > 0 && (
                    <Chip
                      label={count}
                      size="small"
                      sx={{
                        height: 20,
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        minWidth: 24,
                        bgcolor: isActive
                          ? 'rgba(232,160,32,0.2)'
                          : 'rgba(255,255,255,0.08)',
                        color: isActive
                          ? 'var(--neram-gold)'
                          : 'var(--neram-text-muted)',
                        '& .MuiChip-label': {
                          px: 0.75,
                        },
                      }}
                    />
                  )}
                </Box>
              }
              sx={{
                minHeight: 48,
                textTransform: 'none',
                fontSize: { xs: '0.8rem', sm: '0.9rem' },
                fontWeight: 600,
                color: isActive
                  ? 'var(--neram-gold)'
                  : 'var(--neram-text-muted)',
                transition: 'color 0.25s ease',
                px: { xs: 1.5, sm: 2.5 },
                '&.Mui-selected': {
                  color: 'var(--neram-gold)',
                },
                '&:hover': {
                  color: 'var(--neram-gold-light)',
                },
                '& .MuiTab-iconWrapper': {
                  mr: 0.75,
                  fontSize: '1.2rem',
                },
              }}
            />
          );
        })}
      </Tabs>
    </Box>
  );
}
