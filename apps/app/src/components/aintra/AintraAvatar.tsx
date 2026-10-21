'use client';

import { useState } from 'react';
import { Box } from '@neram/ui';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';

/** Aintra's face, the same one as on neramclasses.com; an icon if the image fails. */
export default function AintraAvatar({ size = 36 }: { size?: number }) {
  const [failed, setFailed] = useState(false);
  return (
    <Box
      aria-hidden
      sx={{
        width: size,
        height: size,
        borderRadius: '50%',
        overflow: 'hidden',
        flexShrink: 0,
        display: 'grid',
        placeItems: 'center',
        bgcolor: failed ? 'primary.main' : 'transparent',
        color: 'primary.contrastText',
      }}
    >
      {failed ? (
        <SmartToyOutlinedIcon sx={{ fontSize: size * 0.55 }} />
      ) : (
        // A 4 KB local image: next/image adds nothing here.
        // eslint-disable-next-line @next/next/no-img-element
        <img src="/images/aintra.jpg" alt="" width={size} height={size} style={{ width: size, height: size, objectFit: 'cover' }} onError={() => setFailed(true)} />
      )}
    </Box>
  );
}
