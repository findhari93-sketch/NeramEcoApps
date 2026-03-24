'use client';

import { useState, useCallback, useRef } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Slider,
  Typography,
  IconButton,
  CircularProgress,
  useTheme,
  useMediaQuery,
  Alert,
} from '@neram/ui';
import CloseIcon from '@mui/icons-material/Close';
import CloudSyncIcon from '@mui/icons-material/CloudSync';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import Cropper from 'react-easy-crop';
import type { Area, Point } from 'react-easy-crop';

interface ProfilePhotoUploadProps {
  open: boolean;
  onClose: () => void;
  onUploadComplete: (newUrl: string, teamsSynced: boolean) => void;
  getToken: () => Promise<string | null>;
}

export default function ProfilePhotoUpload({
  open,
  onClose,
  onUploadComplete,
  getToken,
}: ProfilePhotoUploadProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [uploading, setUploading] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'synced' | 'failed'>('idle');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedTypes.includes(file.type)) {
      alert('Please select a valid image file (JPEG, PNG, WebP, or GIF)');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      alert('File size must be less than 5MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setImageSrc(reader.result as string);
      setCrop({ x: 0, y: 0 });
      setZoom(1);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }, []);

  const onCropComplete = useCallback((_: Area, croppedPixels: Area) => {
    setCroppedAreaPixels(croppedPixels);
  }, []);

  const handleSave = async () => {
    if (!imageSrc || !croppedAreaPixels) return;

    setUploading(true);
    setSyncStatus('syncing');
    try {
      const croppedBlob = await getCroppedImg(imageSrc, croppedAreaPixels);
      if (!croppedBlob) throw new Error('Failed to crop image');

      const file = new File([croppedBlob], 'avatar.jpg', { type: 'image/jpeg' });
      const token = await getToken();
      if (!token) throw new Error('Not authenticated');

      const formData = new FormData();
      formData.append('file', file);
      formData.append('cropData', JSON.stringify({
        x: croppedAreaPixels.x,
        y: croppedAreaPixels.y,
        width: croppedAreaPixels.width,
        height: croppedAreaPixels.height,
        zoom,
      }));

      const res = await fetch('/api/profile/avatar', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Upload failed');
      }

      const data = await res.json();
      setSyncStatus(data.avatar.teamsSynced ? 'synced' : 'failed');

      // Brief delay to show sync status
      setTimeout(() => {
        onUploadComplete(data.avatar.url, data.avatar.teamsSynced);
        handleClose();
      }, 1200);
    } catch (error) {
      console.error('Avatar upload error:', error);
      setSyncStatus('idle');
      alert('Failed to upload. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const handleClose = () => {
    setImageSrc(null);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setSyncStatus('idle');
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={uploading ? undefined : handleClose}
      maxWidth="sm"
      fullWidth
      fullScreen={isMobile}
      PaperProps={{
        sx: { borderRadius: isMobile ? 0 : 3 },
      }}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="h6" sx={{ fontWeight: 600 }}>
          {imageSrc ? 'Crop Photo' : 'Upload Photo'}
        </Typography>
        <IconButton onClick={handleClose} disabled={uploading} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ p: 0, overflow: 'hidden' }}>
        {!imageSrc ? (
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: isMobile ? '50vh' : 300,
              gap: 2,
              p: 4,
            }}
          >
            <Box
              sx={{
                width: 120,
                height: 120,
                borderRadius: '50%',
                border: '3px dashed',
                borderColor: 'divider',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                mb: 1,
              }}
            >
              <Typography variant="h4" color="text.secondary">+</Typography>
            </Box>
            <Typography variant="body1" sx={{ fontWeight: 500 }}>
              Choose a photo
            </Typography>
            <Typography variant="body2" color="text.secondary" textAlign="center">
              JPEG, PNG, WebP or GIF. Max 5MB.
              {isMobile ? ' Use pinch to zoom after selecting.' : ' Use the slider to zoom after selecting.'}
            </Typography>
            <Button
              variant="contained"
              onClick={() => fileInputRef.current?.click()}
              sx={{ mt: 1, minWidth: 160, minHeight: 48 }}
            >
              Select Photo
            </Button>
          </Box>
        ) : (
          <>
            <Box
              sx={{
                position: 'relative',
                width: '100%',
                height: isMobile ? '55vh' : 400,
                bgcolor: 'grey.900',
              }}
            >
              <Cropper
                image={imageSrc}
                crop={crop}
                zoom={zoom}
                aspect={1}
                cropShape="round"
                showGrid={false}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={onCropComplete}
              />
            </Box>

            <Box sx={{ px: 3, pt: 2, pb: 1 }}>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Zoom
              </Typography>
              <Slider
                value={zoom}
                min={1}
                max={3}
                step={0.05}
                onChange={(_, value) => setZoom(value as number)}
                sx={{ width: '100%' }}
              />
            </Box>

            {syncStatus === 'syncing' && (
              <Alert icon={<CloudSyncIcon />} severity="info" sx={{ mx: 3, mb: 1 }}>
                Uploading & syncing to Microsoft Teams...
              </Alert>
            )}
            {syncStatus === 'synced' && (
              <Alert icon={<CheckCircleIcon />} severity="success" sx={{ mx: 3, mb: 1 }}>
                Photo synced to Microsoft Teams
              </Alert>
            )}
            {syncStatus === 'failed' && (
              <Alert severity="warning" sx={{ mx: 3, mb: 1 }}>
                Uploaded, but Teams sync failed (may need admin consent)
              </Alert>
            )}
          </>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          onChange={handleFileSelect}
          style={{ display: 'none' }}
        />
      </DialogContent>

      {imageSrc && (
        <DialogActions sx={{ px: 3, pb: 3, gap: 1 }}>
          <Button onClick={() => setImageSrc(null)} disabled={uploading}>
            Change
          </Button>
          <Box sx={{ flex: 1 }} />
          <Button onClick={handleClose} disabled={uploading}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={uploading}
            sx={{ minWidth: 100, minHeight: 44 }}
          >
            {uploading ? <CircularProgress size={22} color="inherit" /> : 'Save'}
          </Button>
        </DialogActions>
      )}
    </Dialog>
  );
}

// --- Canvas crop utility ---

async function getCroppedImg(imageSrc: string, pixelCrop: Area): Promise<Blob | null> {
  const image = await createImage(imageSrc);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const outputSize = 400;
  canvas.width = outputSize;
  canvas.height = outputSize;

  ctx.drawImage(
    image,
    pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height,
    0, 0, outputSize, outputSize
  );

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.9);
  });
}

function createImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.addEventListener('load', () => resolve(img));
    img.addEventListener('error', reject);
    img.crossOrigin = 'anonymous';
    img.src = url;
  });
}
