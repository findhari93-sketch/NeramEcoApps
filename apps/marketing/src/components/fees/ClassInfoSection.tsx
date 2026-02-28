'use client';

import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  Chip,
} from '@neram/ui';
import {
  LaptopOutlined,
  ScheduleOutlined,
  CheckCircleOutlined,
  VideocamOutlined,
  AutoStoriesOutlined,
  GroupsOutlined,
} from '@mui/icons-material';

interface ClassInfoSectionProps {
  t: (key: string) => string;
}

export default function ClassInfoSection({ t }: ClassInfoSectionProps) {
  return (
    <Box sx={{ mb: 8 }}>
      <Typography
        variant="h4"
        fontWeight={700}
        textAlign="center"
        gutterBottom
        sx={{ fontSize: { xs: '1.5rem', sm: '2rem' } }}
      >
        {t('classInfoTitle')}
      </Typography>
      <Typography
        variant="body1"
        color="text.secondary"
        textAlign="center"
        sx={{ maxWidth: 700, mx: 'auto', mb: 4 }}
      >
        {t('classInfoSubtitle')}
      </Typography>

      {/* Live Classes Banner */}
      <Card
        variant="outlined"
        sx={{
          mb: 4,
          borderColor: 'info.main',
          bgcolor: 'info.50',
          borderRadius: 1,
        }}
      >
        <CardContent sx={{ p: { xs: 2.5, sm: 3 } }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
            <VideocamOutlined sx={{ fontSize: 36, color: 'info.main' }} />
            <Box>
              <Typography variant="h6" fontWeight={700}>
                {t('onlineViaTeams')}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {t('onlineViaTeamsDesc')}
              </Typography>
            </Box>
          </Box>
        </CardContent>
      </Card>

      <Grid container spacing={3}>
        {/* Why Online is Better */}
        <Grid item xs={12} md={6}>
          <Card variant="outlined" sx={{ height: '100%', borderRadius: 3 }}>
            <CardContent sx={{ p: 3 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
                <LaptopOutlined sx={{ fontSize: 28, color: 'success.main' }} />
                <Typography variant="h6" fontWeight={700}>
                  {t('whyOnlineBetter')}
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                {[
                  t('onlineBenefit1'),
                  t('onlineBenefit2'),
                  t('onlineBenefit3'),
                  t('onlineBenefit4'),
                ].map((benefit, i) => (
                  <Box key={i} sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                    <CheckCircleOutlined
                      sx={{ fontSize: 18, color: 'success.main', mt: 0.3, flexShrink: 0 }}
                    />
                    <Typography variant="body2" sx={{ lineHeight: 1.6 }}>
                      {benefit}
                    </Typography>
                  </Box>
                ))}
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Class Timetable Overview */}
        <Grid item xs={12} md={6}>
          <Card variant="outlined" sx={{ height: '100%', borderRadius: 3 }}>
            <CardContent sx={{ p: 3 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
                <ScheduleOutlined sx={{ fontSize: 28, color: 'primary.main' }} />
                <Typography variant="h6" fontWeight={700}>
                  {t('timetableOverview')}
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Box sx={{ p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
                  <Typography variant="subtitle2" fontWeight={600} gutterBottom>
                    {t('weekdayClasses')}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {t('weekdayClassesDesc')}
                  </Typography>
                </Box>
                <Box sx={{ p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
                  <Typography variant="subtitle2" fontWeight={600} gutterBottom>
                    {t('weekendClasses')}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {t('weekendClassesDesc')}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                  <Chip
                    icon={<AutoStoriesOutlined />}
                    label={t('liveInteractive')}
                    variant="outlined"
                    size="small"
                  />
                  <Chip
                    icon={<GroupsOutlined />}
                    label={t('smallBatches')}
                    variant="outlined"
                    size="small"
                  />
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}
