'use client';

import { useState, useCallback, useRef } from 'react';
import {
  Box,
  Avatar,
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
} from '@neram/ui';
import Cropper from 'react-easy-crop';
import type { Area, Point } from 'react-easy-crop';

interface ProfilePictureUploadProps {
  currentAvatarUrl?: string | null;
  userName?: string;
  onUpload: (file: File, cropData: CropData) => Promise<void>;
  onRemove?: () => Promise<void>;
  size?: number;
  editable?: boolean;
}

export interface CropData {
  x: number;
  y: number;
  width: number;
  height: number;
  zoom: number;
}

export default function ProfilePictureUpload({
  currentAvatarUrl,
  userName = 'User',
  onUpload,
  onRemove,
  size = 120,
  editable = true,
}: ProfilePictureUploadProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const [dialogOpen, setDialogOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedTypes.includes(file.type)) {
      alert('Please select a valid image file (JPEG, PNG, WebP, or GIF)');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      alert('File size must be less than 5MB');
      return;
    }

    // Read file and show cropper
    const reader = new FileReader();
    reader.onload = () => {
      setImageSrc(reader.result as string);
      setDialogOpen(true);
      setCrop({ x: 0, y: 0 });
      setZoom(1);
    };
    reader.readAsDataURL(file);

    // Reset input
    e.target.value = '';
  }, []);

  const onCropComplete = useCallback((croppedArea: Area, croppedAreaPixels: Area) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  const handleSave = async () => {
    if (!imageSrc || !croppedAreaPixels) return;

    setUploading(true);
    try {
      // Create cropped image
      const croppedBlob = await getCroppedImg(imageSrc, croppedAreaPixels);
      if (!croppedBlob) throw new Error('Failed to crop image');

      // Convert to File
      const file = new File([croppedBlob], 'avatar.jpg', { type: 'image/jpeg' });

      // Call upload handler
      await onUpload(file, {
        x: croppedAreaPixels.x,
        y: croppedAreaPixels.y,
        width: croppedAreaPixels.width,
        height: croppedAreaPixels.height,
        zoom,
      });

      setDialogOpen(false);
      setImageSrc(null);
    } catch (error) {
      console.error('Error uploading avatar:', error);
      alert('Failed to upload avatar. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = async () => {
    if (!onRemove) return;
    if (!confirm('Are you sure you want to remove your profile picture?')) return;

    setUploading(true);
    try {
      await onRemove();
    } catch (error) {
      console.error('Error removing avatar:', error);
      alert('Failed to remove avatar. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const handleClose = () => {
    setDialogOpen(false);
    setImageSrc(null);
  };

  return (
    <Box sx={{ textAlign: 'center' }}>
      {/* Avatar display */}
      <Box sx={{ position: 'relative', display: 'inline-block' }}>
        <Avatar
          src={currentAvatarUrl || undefined}
          alt={userName}
          sx={{
            width: size,
            height: size,
            fontSize: size / 3,
            cursor: editable ? 'pointer' : 'default',
            '&:hover': editable
              ? {
                  opacity: 0.8,
                  '&::after': {
                    content: '"Change"',
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: 'rgba(0,0,0,0.5)',
                    color: 'white',
                    borderRadius: '50%',
                  },
                }
              : {},
          }}
          onClick={editable ? () => fileInputRef.current?.click() : undefined}
        >
          {userName.charAt(0).toUpperCase()}
        </Avatar>
        {uploading && (
          <CircularProgress
            size={size}
            sx={{
              position: 'absolute',
              top: 0,
              left: 0,
              color: 'primary.main',
            }}
          />
        )}
      </Box>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        onChange={handleFileSelect}
        style={{ display: 'none' }}
      />

      {/* Action buttons */}
      {editable && (
        <Box sx={{ mt: 2, display: 'flex', gap: 1, justifyContent: 'center' }}>
          <Button
            variant="outlined"
            size="small"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            Change
          </Button>
          {currentAvatarUrl && onRemove && (
            <Button
              variant="text"
              size="small"
              color="error"
              onClick={handleRemove}
              disabled={uploading}
            >
              Remove
            </Button>
          )}
        </Box>
      )}

      {/* Crop dialog */}
      <Dialog
        open={dialogOpen}
        onClose={handleClose}
        maxWidth="sm"
        fullWidth
        fullScreen={isMobile}
      >
        <DialogTitle>Crop Profile Picture</DialogTitle>
        <DialogContent>
          <Box
            sx={{
              position: 'relative',
              width: '100%',
              height: isMobile ? '50vh' : 400,
              backgroundColor: 'grey.900',
            }}
          >
            {imageSrc && (
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
            )}
          </Box>

          <Box sx={{ mt: 3, px: 2 }}>
            <Typography variant="body2" gutterBottom>
              Zoom
            </Typography>
            <Slider
              value={zoom}
              min={1}
              max={3}
              step={0.1}
              onChange={(_, value) => setZoom(value as number)}
              sx={{ width: '100%' }}
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3 }}>
          <Button onClick={handleClose} disabled={uploading}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={uploading}
          >
            {uploading ? <CircularProgress size={24} /> : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

/**
 * Create a cropped image from source
 */
async function getCroppedImg(imageSrc: string, pixelCrop: Area): Promise<Blob | null> {
  const image = await createImage(imageSrc);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  if (!ctx) return null;

  // Set canvas size to desired output size
  const outputSize = 400; // Output 400x400 image
  canvas.width = outputSize;
  canvas.height = outputSize;

  // Draw cropped image
  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    outputSize,
    outputSize
  );

  // Return as blob
  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => resolve(blob),
      'image/jpeg',
      0.9
    );
  });
}

function createImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener('load', () => resolve(image));
    image.addEventListener('error', reject);
    image.crossOrigin = 'anonymous';
    image.src = url;
  });
}
