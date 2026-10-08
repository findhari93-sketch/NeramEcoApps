import { Box, Typography } from '@neram/ui';

interface BrandWordmarkProps {
  /** 20 px in the app bar, 18 px in tighter spots like the mobile drawer. */
  size?: 'md' | 'sm';
}

const MS_SQUARES = [
  { top: 0, left: 0, bgcolor: '#F25022' },
  { top: 0, right: 0, bgcolor: '#7FBA00' },
  { bottom: 0, left: 0, bgcolor: '#00A4EF' },
  { bottom: 0, right: 0, bgcolor: '#FFB900' },
];

/**
 * The one "neramClasses / Supported by Microsoft" lockup. The site header,
 * its drawer and the focused apply shell all render this, so the brand reads
 * the same on every page. Purely visual: wrap it in a Link where it navigates.
 */
export default function BrandWordmark({ size = 'md' }: BrandWordmarkProps) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', color: 'text.primary' }}>
      <Typography
        component="span"
        sx={{ fontFamily: '"Museo", sans-serif', fontSize: size === 'md' ? '20px' : '18px', lineHeight: 1.2, color: 'inherit' }}
      >
        <Box component="span" sx={{ fontWeight: 700 }}>neram</Box>
        <Box component="span" sx={{ fontWeight: 300 }}>Classes</Box>
      </Typography>
      <Box component="span" sx={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
        <Typography
          component="span"
          sx={{ fontSize: '9px', fontStyle: 'italic', fontWeight: 400, color: 'rgb(81 81 81)', letterSpacing: '0.19px', lineHeight: 1 }}
        >
          Supported by
        </Typography>
        <Box component="span" aria-hidden sx={{ width: 9, height: 9, position: 'relative', flexShrink: 0 }}>
          {MS_SQUARES.map((sq) => (
            <Box key={sq.bgcolor} component="span" sx={{ position: 'absolute', width: '4px', height: '4px', borderRadius: '0.5px', ...sq }} />
          ))}
        </Box>
        <Typography
          component="span"
          sx={{ fontSize: '9.6px', fontWeight: 700, color: 'inherit', letterSpacing: '0.19px', lineHeight: 1 }}
        >
          Microsoft
        </Typography>
      </Box>
    </Box>
  );
}
