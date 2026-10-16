import { Box } from '@mui/material';
import Image from 'next/image';
import { initials } from '@/lib/college-hub/format';
import { siteTokens } from '@neram/ui/site-tokens';

interface CollegeLogoProps {
  name: string;
  logoUrl?: string | null;
  size: number;
  /** Position in the list, shown as a small badge on the corner. */
  rank?: number;
  radius?: number;
}

/** College logo, or an initials tile when there is none. Decorative (the name is next to it). */
export default function CollegeLogo({ name, logoUrl, size, rank, radius = 1 }: CollegeLogoProps) {
  return (
    <Box
      aria-hidden
      sx={{
        position: 'relative',
        flex: `0 0 ${size}px`,
        width: size,
        height: size,
        borderRadius: radius,
        bgcolor: logoUrl ? siteTokens.surface : siteTokens.surfaceHover,
        border: '1px solid',
        borderColor: siteTokens.line,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: siteTokens.navy900,
        fontWeight: 700,
        fontSize: Math.round(size * 0.32),
        letterSpacing: '-0.01em',
      }}
    >
      {logoUrl ? (
        <Box sx={{ position: 'relative', width: '78%', height: '78%', overflow: 'hidden', borderRadius: 1 }}>
          <Image src={logoUrl} alt="" fill sizes={`${size}px`} style={{ objectFit: 'contain' }} />
        </Box>
      ) : (
        initials(name)
      )}
      {rank != null && (
        <Box
          component="span"
          sx={{
            position: 'absolute',
            top: -8,
            left: -8,
            minWidth: 22,
            height: 22,
            px: 0.625,
            boxSizing: 'border-box',
            borderRadius: `${siteTokens.radiusPill}px`,
            bgcolor: siteTokens.navy900,
            color: siteTokens.paper,
            border: '2px solid',
            borderColor: siteTokens.surface,
            fontSize: 11,
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {rank}
        </Box>
      )}
    </Box>
  );
}
