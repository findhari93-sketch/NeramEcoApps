'use client';

import {
  Box,
  Typography,
  Grid,
  Card,
  CardContent,
} from '@neram/ui';
import {
  EmojiEventsOutlined,
  SupportAgentOutlined,
  ComputerOutlined,
  GroupsOutlined,
  AccountBalanceOutlined,
  SchoolOutlined,
} from '@mui/icons-material';

interface WhyInvestSectionProps {
  t: (key: string) => string;
}

const investReasons = [
  {
    icon: <EmojiEventsOutlined sx={{ fontSize: 36, color: '#FFD700' }} />,
    titleKey: 'trackRecord',
    descriptionKey: 'trackRecordDesc',
  },
  {
    icon: <SupportAgentOutlined sx={{ fontSize: 36, color: '#4CAF50' }} />,
    titleKey: 'fiveYearSupport',
    descriptionKey: 'fiveYearSupportDesc',
  },
  {
    icon: <ComputerOutlined sx={{ fontSize: 36, color: '#2196F3' }} />,
    titleKey: 'teamsAndTools',
    descriptionKey: 'teamsAndToolsDesc',
  },
  {
    icon: <GroupsOutlined sx={{ fontSize: 36, color: '#9C27B0' }} />,
    titleKey: 'expertFaculty',
    descriptionKey: 'expertFacultyDesc',
  },
  {
    icon: <AccountBalanceOutlined sx={{ fontSize: 36, color: '#FF5722' }} />,
    titleKey: 'nodonation',
    descriptionKey: 'nodonationDesc',
  },
  {
    icon: <SchoolOutlined sx={{ fontSize: 36, color: '#009688' }} />,
    titleKey: 'meritBased',
    descriptionKey: 'meritBasedDesc',
  },
];

export default function WhyInvestSection({ t }: WhyInvestSectionProps) {
  return (
    <Box sx={{ mb: 8 }}>
      <Typography
        variant="h4"
        fontWeight={700}
        textAlign="center"
        gutterBottom
        sx={{ fontSize: { xs: '1.5rem', sm: '2rem' } }}
      >
        {t('whyInvestTitle')}
      </Typography>
      <Typography
        variant="body1"
        color="text.secondary"
        textAlign="center"
        sx={{ maxWidth: 700, mx: 'auto', mb: 4 }}
      >
        {t('whyInvestSubtitle')}
      </Typography>

      <Grid container spacing={3}>
        {investReasons.map((reason) => (
          <Grid item xs={12} sm={6} md={4} key={reason.titleKey}>
            <Card
              variant="outlined"
              sx={{
                height: '100%',
                borderRadius: 3,
                transition: 'transform 0.2s, box-shadow 0.2s',
                '&:hover': {
                  transform: 'translateY(-2px)',
                  boxShadow: 4,
                },
              }}
            >
              <CardContent sx={{ p: 3, textAlign: 'center' }}>
                <Box sx={{ mb: 2 }}>{reason.icon}</Box>
                <Typography variant="subtitle1" fontWeight={700} gutterBottom>
                  {t(reason.titleKey)}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>
                  {t(reason.descriptionKey)}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
}
