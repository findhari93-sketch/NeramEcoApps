'use client';

import { useState, useCallback } from 'react';
import {
  Box,
  Typography,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  Tabs,
  Tab,
  CircularProgress,
  Slider,
} from '@neram/ui';
import CloseIcon from '@mui/icons-material/Close';
import CropIcon from '@mui/icons-material/Crop';
import Cropper from 'react-easy-crop';
import type { Area } from 'react-easy-crop';

interface CropConfig {
  label: string;
  aspect: number;
  description: string;
}

const CROP_CONFIGS: CropConfig[] = [
  { label: 'Square (1:1)', aspect: 1, description: 'Used for thumbnails' },
  { label: 'Banner (2.2:1)', aspect: 2.2, description: 'Desktop expanded view' },
  { label: 'Mobile (16:9)', aspect: 16 / 9, description: 'Mobile expanded view' },
];

const CROP_KEYS = ['square', 'banner', 'mobile'] as const;

export interface ImageCropsResult {
  square?: string;
  banner?: string;
  mobile?: string;
}

interface ImageCropDialogProps {
  open: boolean;
  imageUrl: string;
  existingCrops?: ImageCropsResult | null;
  onSave: (crops: ImageCropsResult) => void;
  onClose: () => void;
}

/** Generate a cropped image blob from the original image using canvas */
async function getCroppedImageBlob(
  imageSrc: string,
  cropArea: Area,
): Promise<Blob> {
  const image = new Image();
  image.crossOrigin = 'anonymous';

  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = reject;
    image.src = imageSrc;
  });

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas context not available');

  // Set canvas size to the crop dimensions
  canvas.width = cropArea.width;
  canvas.height = cropArea.height;

  ctx.drawImage(
    image,
    cropArea.x,
    cropArea.y,
    cropArea.width,
    cropArea.height,
    0,
    0,
    cropArea.width,
    cropArea.height,
  );

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Failed to create blob'));
      },
      'image/jpeg',
      0.92,
    );
  });
}

/** Upload a blob to the marketing-content upload API */
async function uploadCroppedImage(blob: Blob, suffix: string): Promise<string> {
  const formData = new FormData();
  formData.append('file', new File([blob], `crop-${suffix}-${Date.now()}.jpg`, { type: 'image/jpeg' }));

  const res = await fetch('/api/marketing-content/upload', {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Upload failed (HTTP ${res.status})`);
  }

  const { url } = await res.json();
  return url;
}

export default function ImageCropDialog({
  open,
  imageUrl,
  existingCrops,
  onSave,
  onClose,
}: ImageCropDialogProps) {
  const [activeTab, setActiveTab] = useState(0);
  const [saving, setSaving] = useState(false);

  // Per-tab crop state
  const [crops, setCrops] = useState<Record<number, { x: number; y: number }>>({
    0: { x: 0, y: 0 },
    1: { x: 0, y: 0 },
    2: { x: 0, y: 0 },
  });
  const [zooms, setZooms] = useState<Record<number, number>>({
    0: 1,
    1: 1,
    2: 1,
  });
  const [croppedAreas, setCroppedAreas] = useState<Record<number, Area>>({});

  const onCropChange = useCallback(
    (crop: { x: number; y: number }) => {
      setCrops((prev) => ({ ...prev, [activeTab]: crop }));
    },
    [activeTab],
  );

  const onZoomChange = useCallback(
    (zoom: number) => {
      setZooms((prev) => ({ ...prev, [activeTab]: zoom }));
    },
    [activeTab],
  );

  const onCropComplete = useCallback(
    (_croppedArea: Area, croppedAreaPixels: Area) => {
      setCroppedAreas((prev) => ({ ...prev, [activeTab]: croppedAreaPixels }));
    },
    [activeTab],
  );

  const handleSave = async () => {
    try {
      setSaving(true);
      const result: ImageCropsResult = { ...existingCrops };

      // Process each crop that has been set
      for (let i = 0; i < CROP_KEYS.length; i++) {
        const area = croppedAreas[i];
        if (area && area.width > 0 && area.height > 0) {
          const blob = await getCroppedImageBlob(imageUrl, area);
          const url = await uploadCroppedImage(blob, CROP_KEYS[i]);
          result[CROP_KEYS[i]] = url;
        }
      }

      onSave(result);
    } catch (error) {
      console.error('Failed to save crops:', error);
      alert(error instanceof Error ? error.message : 'Failed to save crops');
    } finally {
      setSaving(false);
    }
  };

  const config = CROP_CONFIGS[activeTab];
  const hasCrops = Object.keys(croppedAreas).length > 0;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{ sx: { height: '80vh', maxHeight: 700 } }}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <CropIcon color="primary" />
          <Typography variant="h6">Crop Image for Display</Typography>
        </Box>
        <IconButton onClick={onClose} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ display: 'flex', flexDirection: 'column', p: 0, overflow: 'hidden' }}>
        {/* Aspect Ratio Tabs */}
        <Tabs
          value={activeTab}
          onChange={(_, v) => setActiveTab(v)}
          variant="fullWidth"
          sx={{ borderBottom: 1, borderColor: 'divider', px: 2 }}
        >
          {CROP_CONFIGS.map((c, i) => (
            <Tab
              key={i}
              label={
                <Box sx={{ textAlign: 'center' }}>
                  <Typography variant="body2" fontWeight={600}>{c.label}</Typography>
                  <Typography variant="caption" color="text.secondary">{c.description}</Typography>
                </Box>
              }
              sx={{ textTransform: 'none', minHeight: 56 }}
            />
          ))}
        </Tabs>

        {/* Cropper Area */}
        <Box sx={{ position: 'relative', flexGrow: 1, bgcolor: '#1a1a1a', minHeight: 300 }}>
          <Cropper
            image={imageUrl}
            crop={crops[activeTab]}
            zoom={zooms[activeTab]}
            aspect={config.aspect}
            onCropChange={onCropChange}
            onZoomChange={onZoomChange}
            onCropComplete={onCropComplete}
            showGrid
            style={{
              containerStyle: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
            }}
          />
        </Box>

        {/* Zoom Slider */}
        <Box sx={{ px: 3, py: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
          <Typography variant="body2" color="text.secondary" sx={{ minWidth: 40 }}>
            Zoom
          </Typography>
          <Slider
            value={zooms[activeTab]}
            min={1}
            max={3}
            step={0.05}
            onChange={(_event: Event, val: number | number[]) => onZoomChange(val as number)}
            sx={{ flex: 1 }}
          />
          <Typography variant="body2" sx={{ minWidth: 40, textAlign: 'right' }}>
            {zooms[activeTab].toFixed(1)}x
          </Typography>
        </Box>

        {/* Preview thumbnails */}
        <Box sx={{ px: 3, pb: 2 }}>
          <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
            Preview — adjust each tab before saving
          </Typography>
          <Box sx={{ display: 'flex', gap: 2 }}>
            {CROP_CONFIGS.map((c, i) => (
              <Box
                key={i}
                onClick={() => setActiveTab(i)}
                sx={{
                  cursor: 'pointer',
                  border: '2px solid',
                  borderColor: activeTab === i ? 'primary.main' : 'divider',
                  borderRadius: 1,
                  overflow: 'hidden',
                  opacity: activeTab === i ? 1 : 0.7,
                  transition: 'all 0.2s',
                  '&:hover': { opacity: 1 },
                }}
              >
                <Box
                  sx={{
                    width: c.aspect > 1.5 ? 120 : 64,
                    height: c.aspect > 1.5 ? 120 / c.aspect : 64,
                    bgcolor: '#eee',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {croppedAreas[i] ? (
                    <Box
                      component="img"
                      src={imageUrl}
                      alt={c.label}
                      sx={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                      }}
                    />
                  ) : (
                    <Typography variant="caption" color="text.disabled">
                      {c.label.split(' ')[0]}
                    </Typography>
                  )}
                </Box>
              </Box>
            ))}
          </Box>
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} sx={{ textTransform: 'none' }}>
          Skip
        </Button>
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={saving || !hasCrops}
          startIcon={saving ? <CircularProgress size={18} /> : <CropIcon />}
          sx={{ textTransform: 'none' }}
        >
          {saving ? 'Saving Crops...' : 'Save Crops'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
