'use client';

import { Box, Typography, Grid } from '@neram/ui';
import { alpha } from '@mui/material/styles';
import {
  CheckRounded,
  CastForEducationOutlined,
  PhoneIphoneOutlined,
  VideoLibraryOutlined,
  HowToRegOutlined,
} from '@mui/icons-material';
import type { SvgIconComponent } from '@mui/icons-material';

// Same for every public plan, so it lives here rather than in each plan's
// `features` in Admin > Fee Structures. Order follows the student's year:
// classes, the app they practise in, revision, then exams and admission.
const GROUPS: { key: string; Icon: SvgIconComponent }[] = [
  { key: 'training', Icon: CastForEducationOutlined },
  { key: 'app', Icon: PhoneIphoneOutlined },
  { key: 'library', Icon: VideoLibraryOutlined },
  { key: 'support', Icon: HowToRegOutlined },
];
const ITEMS = ['i1', 'i2', 'i3'] as const;

export const INCLUDED_SECTION_ID = 'included';

export default function IncludedSection({ t }: { t: (key: string) => string }) {
  return (
    <Box
      component="section"
      id={INCLUDED_SECTION_ID}
      aria-labelledby="included-title"
      sx={{ mb: { xs: 5, md: 7 }, scrollMarginTop: { xs: 140, md: 160 } }}
    >
      <Box textAlign="center" mb={{ xs: 2.5, md: 3.5 }}>
        <Typography
          id="included-title"
          variant="h4"
          component="h2"
          sx={{ fontWeight: 800, fontSize: { xs: '1.4rem', sm: '1.75rem' }, lineHeight: 1.25, mb: 1 }}
        >
          {t('included.title')}
        </Typography>
        <Typography color="text.secondary" sx={{ maxWidth: 560, mx: 'auto', lineHeight: 1.5 }}>
          {t('included.subtitle')}
        </Typography>
      </Box>

      <Grid container spacing={2}>
        {GROUPS.map(({ key, Icon }) => (
          <Grid item xs={12} sm={6} key={key}>
            <Box
              data-testid="included-group"
              sx={{
                height: '100%',
                p: { xs: 2, sm: 2.5 },
                border: 1,
                borderColor: 'divider',
                borderRadius: 1,
                bgcolor: 'background.paper',
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5 }}>
                <Box
                  aria-hidden
                  sx={{
                    width: 40,
                    height: 40,
                    flexShrink: 0,
                    borderRadius: '50%',
                    display: 'grid',
                    placeItems: 'center',
                    color: 'primary.main',
                    bgcolor: (theme) => alpha(theme.palette.primary.main, 0.1),
                  }}
                >
                  <Icon sx={{ fontSize: 22 }} />
                </Box>
                <Typography component="h3" sx={{ fontWeight: 700, fontSize: '1.05rem', lineHeight: 1.3 }}>
                  {t(`included.groups.${key}.title`)}
                </Typography>
              </Box>

              <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 1 }}>
                {ITEMS.map((item) => (
                  <Box component="li" key={item} sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                    <CheckRounded aria-hidden sx={{ fontSize: 20, color: 'success.main', mt: '2px', flexShrink: 0 }} />
                    <Typography sx={{ fontSize: '0.95rem', lineHeight: 1.5 }}>
                      {t(`included.groups.${key}.${item}`)}
                    </Typography>
                  </Box>
                ))}
              </Box>
            </Box>
          </Grid>
        ))}
      </Grid>

      <Typography variant="body2" color="text.secondary" textAlign="center" sx={{ mt: 2.5 }}>
        {t('included.noHidden')}
      </Typography>
    </Box>
  );
}
