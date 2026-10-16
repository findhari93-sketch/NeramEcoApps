'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Box } from '@neram/ui';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import { tokens } from '@/design-system';

const ASSISTANT_IMG = '/images/nata-ai-assistant2.jpg';

export default function BotAvatar({ size = 40 }: { size?: number }) {
  const [imgError, setImgError] = useState(false);

  if (imgError) {
    return (
      <Box
        sx={{
          width: size,
          height: size,
          borderRadius: '50%',
          bgcolor: tokens.navy700,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <SmartToyIcon sx={{ fontSize: size * 0.55, color: tokens.paper }} />
      </Box>
    );
  }

  return (
    <Box
      sx={{
        width: size,
        height: size,
        borderRadius: '50%',
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      <Image
        src={ASSISTANT_IMG}
        alt="Aintra"
        width={size}
        height={size}
        onError={() => setImgError(true)}
        style={{ objectFit: 'cover', width: size, height: size }}
      />
    </Box>
  );
}
