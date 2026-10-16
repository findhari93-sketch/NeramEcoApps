'use client';

import { Box, Typography } from '@neram/ui';
import {
  CastForEducationOutlined,
  PhoneIphoneOutlined,
  VideoLibraryOutlined,
  HowToRegOutlined,
} from '@mui/icons-material';
import type { SvgIconComponent } from '@mui/icons-material';
import { CheckList, SectionHeader, iconTileSx, tokens as t } from '@/design-system';

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

export default function IncludedSection({ t: tr }: { t: (key: string) => string }) {
  return (
    <Box
      component="section"
      id={INCLUDED_SECTION_ID}
      aria-labelledby="included-title"
      sx={{ display: 'flex', flexDirection: 'column', gap: 4, scrollMarginTop: { xs: 140, md: 160 } }}
    >
      <SectionHeader id="included-title" title={tr('included.title')} lede={tr('included.subtitle')} size="article" />

      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: 2 }}>
        {GROUPS.map(({ key, Icon }) => (
          <Box
            key={key}
            data-testid="included-group"
            sx={{
              p: 3,
              border: `1px solid ${t.line}`,
              borderRadius: `${t.radius}px`,
              bgcolor: t.ground,
              display: 'flex',
              flexDirection: 'column',
              gap: 1.5,
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Box aria-hidden sx={{ ...iconTileSx, width: 40, height: 40, '& svg': { fontSize: 22 } }}>
                <Icon />
              </Box>
              <Typography component="h3" sx={{ m: 0, fontWeight: 700, fontSize: '1.0625rem', lineHeight: 1.3 }}>
                {tr(`included.groups.${key}.title`)}
              </Typography>
            </Box>
            <CheckList variant="compact" items={ITEMS.map((item) => tr(`included.groups.${key}.${item}`))} />
          </Box>
        ))}
      </Box>

      <Typography sx={{ textAlign: 'center', fontSize: '0.9375rem', color: t.inkMuted }}>{tr('included.noHidden')}</Typography>
    </Box>
  );
}
