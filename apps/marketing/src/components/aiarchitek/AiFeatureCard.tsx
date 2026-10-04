import { Box, Typography } from '@neram/ui';
import CheckIcon from '@mui/icons-material/Check';
import type { AiFeature } from '@/lib/aiarchitek/content';
import { StatusChip } from './StatusChip';

export function AiFeatureCard({ feature }: { feature: AiFeature }) {
  const muted = feature.status === 'coming-soon';
  return (
    <Box
      component="article"
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: 1.25,
        p: { xs: 2, sm: 2.5 },
        border: '1px solid',
        borderColor: 'divider',
        borderStyle: muted ? 'dashed' : 'solid',
        borderRadius: 2,
        bgcolor: 'background.paper',
      }}
    >
      <Box>
        <StatusChip status={feature.status} />
      </Box>
      <Box component="h3" sx={{ m: 0, fontSize: '1.125rem', fontWeight: 700, lineHeight: 1.35 }}>
        {feature.name}
      </Box>
      <Typography sx={{ fontSize: '1rem', lineHeight: 1.55, color: 'text.primary' }}>{feature.summary}</Typography>
      <Box component="ul" sx={{ listStyle: 'none', p: 0, m: 0, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
        {feature.points.map((p) => (
          <Box
            component="li"
            key={p}
            sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', fontSize: '0.9375rem', lineHeight: 1.5, color: 'text.secondary' }}
          >
            <CheckIcon aria-hidden sx={{ fontSize: 18, mt: '2px', color: muted ? 'text.secondary' : 'success.main', flexShrink: 0 }} />
            {p}
          </Box>
        ))}
      </Box>
    </Box>
  );
}
