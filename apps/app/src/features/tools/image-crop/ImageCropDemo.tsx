'use client';

import { useEffect, useRef, useState } from 'react';
import { Box, Button, ToggleButton, ToggleButtonGroup, Typography } from '@neram/ui';
import UploadFileRoundedIcon from '@mui/icons-material/UploadFileRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import ErrorOutlineRoundedIcon from '@mui/icons-material/ErrorOutlineRounded';
import DemoGate from '@/components/tools/DemoGate';

const SPECS = {
  photo: { label: 'Photo', w: 350, h: 450, minKb: 4, maxKb: 100, size: '3.5 x 4.5 cm' },
  signature: { label: 'Signature', w: 350, h: 150, minKb: 1, maxKb: 30, size: '3.5 x 1.5 cm' },
} as const;
type Mode = keyof typeof SPECS;

/**
 * Public demo: a centred crop to the NATA shape and size, done in the browser
 * (nothing is uploaded), with the file size checked against NATA's limits.
 * Signed in: drag and zoom, then download.
 */
export default function ImageCropDemo() {
  const [mode, setMode] = useState<Mode>('photo');
  const [src, setSrc] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [kb, setKb] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const spec = SPECS[mode];

  useEffect(() => {
    if (!src) return;
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = spec.w;
      canvas.height = spec.h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const target = spec.w / spec.h;
      let sw = img.width;
      let sh = img.height;
      if (sw / sh > target) sw = sh * target;
      else sh = sw / target;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, spec.w, spec.h);
      ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, 0, 0, spec.w, spec.h);
      const url = canvas.toDataURL('image/jpeg', 0.85);
      setPreview(url);
      setKb(Math.round(((url.length - 'data:image/jpeg;base64,'.length) * 3) / 4 / 1024));
    };
    img.src = src;
  }, [src, spec.w, spec.h]);

  useEffect(() => () => {
    if (src) URL.revokeObjectURL(src);
  }, [src]);

  const ok = kb != null && kb >= spec.minKb && kb <= spec.maxKb;

  return (
    <Box>
      <ToggleButtonGroup
        exclusive
        value={mode}
        onChange={(_, v) => v && setMode(v)}
        aria-label="What to resize"
        sx={{ '& .MuiToggleButton-root': { minHeight: 44, px: 2.5, textTransform: 'none', fontWeight: 600 } }}
      >
        <ToggleButton value="photo">Photo</ToggleButton>
        <ToggleButton value="signature">Signature</ToggleButton>
      </ToggleButtonGroup>
      <Typography variant="body2" sx={{ mt: 1, color: 'text.secondary' }}>
        NATA needs {spec.size}, JPG, {spec.minKb} to {spec.maxKb} KB. Your image stays on this device.
      </Typography>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) setSrc(URL.createObjectURL(f));
        }}
      />
      <Button
        variant="outlined"
        startIcon={<UploadFileRoundedIcon />}
        onClick={() => inputRef.current?.click()}
        sx={{ mt: 2, minHeight: 48, textTransform: 'none', fontWeight: 600 }}
      >
        Choose a {spec.label.toLowerCase()}
      </Button>

      <Box aria-live="polite" sx={{ mt: 2, minHeight: 96 }}>
        {preview ? (
          <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <Box
              component="img"
              src={preview}
              alt={`Your ${spec.label.toLowerCase()} cropped to ${spec.size}`}
              sx={{ width: mode === 'photo' ? 140 : 210, height: 'auto', border: '1px solid', borderColor: 'divider', borderRadius: 1 }}
            />
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              {ok ? <CheckCircleRoundedIcon aria-hidden="true" sx={{ color: 'success.main' }} /> : <ErrorOutlineRoundedIcon aria-hidden="true" sx={{ color: 'warning.main' }} />}
              <Typography>
                {spec.w} x {spec.h} px, {kb} KB {ok ? 'fits the NATA limit' : `is outside ${spec.minKb} to ${spec.maxKb} KB; the full tool adjusts it`}
              </Typography>
            </Box>
          </Box>
        ) : (
          <Typography variant="body2" sx={{ color: 'text.secondary', p: 2, borderRadius: 2.5, border: '1px dashed', borderColor: 'divider' }}>
            Choose an image to see it cropped to the NATA size.
          </Typography>
        )}
      </Box>

      {preview && (
        <DemoGate
          toolId="nata-image-crop"
          headline={`Download your ${spec.label.toLowerCase()} for the NATA form`}
          benefits={['Drag and zoom to frame it exactly', 'Automatic size within the KB limit', 'Download as JPG']}
          cta="Sign in free to download"
          input={{ mode }}
        />
      )}
    </Box>
  );
}
