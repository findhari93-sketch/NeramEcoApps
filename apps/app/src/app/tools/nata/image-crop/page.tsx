'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  Button,
  Grid,
  Tabs,
  Tab,
  Slider,
  Alert,
  Chip,
  Divider,
  DownloadIcon,
  UploadIcon,
} from '@neram/ui';

type Mode = 'photograph' | 'signature';

interface ModeConfig {
  label: string;
  aspectRatio: number; // width / height
  aspectLabel: string;
  dimensions: string;
  minSize: number; // KB
  maxSize: number; // KB
  filename: string;
  guidelines: string[];
}

const MODE_CONFIGS: Record<Mode, ModeConfig> = {
  photograph: {
    label: 'Photograph',
    aspectRatio: 7 / 9, // 3.5cm x 4.5cm
    aspectLabel: '3.5cm x 4.5cm (7:9)',
    dimensions: '350 x 450 px (recommended)',
    minSize: 4,
    maxSize: 100,
    filename: 'nata-photo.jpg',
    guidelines: [
      'Recent passport-size photograph',
      'White or light-colored background',
      'Face should cover 70-80% of the frame',
      'No headwear (except religious purposes)',
      'Both ears should be visible',
      'Natural expression, mouth closed',
    ],
  },
  signature: {
    label: 'Signature',
    aspectRatio: 7 / 3, // 3.5cm x 1.5cm
    aspectLabel: '3.5cm x 1.5cm (7:3)',
    dimensions: '350 x 150 px (recommended)',
    minSize: 1,
    maxSize: 30,
    filename: 'nata-signature.jpg',
    guidelines: [
      'Sign on white paper with black or dark blue ink',
      'Signature should be within the crop area',
      'Avoid very thick or very thin pen',
      'Consistent with your official signature',
      'No decorative elements outside signature',
    ],
  },
};

export default function ImageCropPage() {
  const [mode, setMode] = useState<Mode>('photograph');
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  // Crop controls (slider-based approach)
  const [zoom, setZoom] = useState(1);
  const [offsetX, setOffsetX] = useState(50); // percentage 0-100
  const [offsetY, setOffsetY] = useState(50); // percentage 0-100

  // Output state
  const [croppedBlob, setCroppedBlob] = useState<Blob | null>(null);
  const [croppedUrl, setCroppedUrl] = useState<string | null>(null);
  const [outputSize, setOutputSize] = useState(0);
  const [outputWidth, setOutputWidth] = useState(0);
  const [outputHeight, setOutputHeight] = useState(0);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const config = MODE_CONFIGS[mode];

  // Clean up object URLs on unmount
  useEffect(() => {
    return () => {
      if (imageUrl) URL.revokeObjectURL(imageUrl);
      if (croppedUrl) URL.revokeObjectURL(croppedUrl);
    };
  }, []);

  const handleFileSelect = useCallback(
    (file: File) => {
      if (!file.type.startsWith('image/')) {
        return;
      }

      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        if (imageUrl) URL.revokeObjectURL(imageUrl);
        setImage(img);
        setImageUrl(url);
        setZoom(1);
        setOffsetX(50);
        setOffsetY(50);
        setCroppedBlob(null);
        if (croppedUrl) URL.revokeObjectURL(croppedUrl);
        setCroppedUrl(null);
      };
      img.src = url;
    },
    [imageUrl, croppedUrl]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFileSelect(file);
    },
    [handleFileSelect]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOver(false);
  }, []);

  // Draw preview whenever image, zoom, or offsets change
  useEffect(() => {
    if (!image || !previewCanvasRef.current) return;

    const canvas = previewCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set preview canvas size based on mode
    const previewWidth = mode === 'photograph' ? 280 : 280;
    const previewHeight = Math.round(previewWidth / config.aspectRatio);
    canvas.width = previewWidth;
    canvas.height = previewHeight;

    // Calculate source crop area
    const { sx, sy, sw, sh } = calculateCropArea(
      image.width,
      image.height,
      config.aspectRatio,
      zoom,
      offsetX,
      offsetY
    );

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  }, [image, zoom, offsetX, offsetY, mode, config.aspectRatio]);

  const calculateCropArea = (
    imgW: number,
    imgH: number,
    aspectRatio: number,
    zoomLevel: number,
    offX: number,
    offY: number
  ) => {
    // Determine the largest crop area that fits the aspect ratio
    let baseW: number, baseH: number;
    if (imgW / imgH > aspectRatio) {
      // Image is wider than needed
      baseH = imgH;
      baseW = baseH * aspectRatio;
    } else {
      // Image is taller than needed
      baseW = imgW;
      baseH = baseW / aspectRatio;
    }

    // Apply zoom (zoom in = smaller source area)
    const sw = baseW / zoomLevel;
    const sh = baseH / zoomLevel;

    // Apply offset (0-100 range mapped to available movement)
    const maxOffX = imgW - sw;
    const maxOffY = imgH - sh;
    const sx = (offX / 100) * maxOffX;
    const sy = (offY / 100) * maxOffY;

    return { sx, sy, sw, sh };
  };

  const cropAndCompress = useCallback(async () => {
    if (!image || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Target output dimensions
    const targetWidth = mode === 'photograph' ? 350 : 350;
    const targetHeight = mode === 'photograph' ? 450 : 150;
    canvas.width = targetWidth;
    canvas.height = targetHeight;

    const { sx, sy, sw, sh } = calculateCropArea(
      image.width,
      image.height,
      config.aspectRatio,
      zoom,
      offsetX,
      offsetY
    );

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);

    // Compress with quality adjustment to meet file size requirements
    let quality = 0.92;
    let blob: Blob | null = null;
    const minBytes = config.minSize * 1024;
    const maxBytes = config.maxSize * 1024;

    // Try different quality levels to hit the target size
    for (let i = 0; i < 20; i++) {
      blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((b) => resolve(b), 'image/jpeg', quality);
      });

      if (!blob) break;

      if (blob.size > maxBytes && quality > 0.1) {
        quality -= 0.05;
      } else if (blob.size < minBytes && quality < 0.99) {
        quality += 0.02;
      } else {
        break;
      }
    }

    if (blob) {
      if (croppedUrl) URL.revokeObjectURL(croppedUrl);
      const url = URL.createObjectURL(blob);
      setCroppedBlob(blob);
      setCroppedUrl(url);
      setOutputSize(blob.size);
      setOutputWidth(targetWidth);
      setOutputHeight(targetHeight);
    }
  }, [image, mode, config, zoom, offsetX, offsetY, croppedUrl]);

  const downloadImage = useCallback(() => {
    if (!croppedBlob) return;
    const url = URL.createObjectURL(croppedBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = config.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [croppedBlob, config.filename]);

  const sizeInKB = (outputSize / 1024).toFixed(1);
  const isSizeValid =
    outputSize >= config.minSize * 1024 && outputSize <= config.maxSize * 1024;

  const resetAll = () => {
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    if (croppedUrl) URL.revokeObjectURL(croppedUrl);
    setImage(null);
    setImageUrl(null);
    setCroppedBlob(null);
    setCroppedUrl(null);
    setZoom(1);
    setOffsetX(50);
    setOffsetY(50);
    setOutputSize(0);
  };

  return (
    <Box>
      <Typography variant="h4" gutterBottom sx={{ fontWeight: 600, mb: 1 }}>
        NATA Image Crop & Resize
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
        Crop and resize your photograph and signature to meet NATA application requirements.
      </Typography>

      {/* Mode Tabs */}
      <Paper sx={{ mb: 3 }}>
        <Tabs
          value={mode}
          onChange={(_e, newMode) => {
            setMode(newMode as Mode);
            setCroppedBlob(null);
            if (croppedUrl) URL.revokeObjectURL(croppedUrl);
            setCroppedUrl(null);
            setOutputSize(0);
            setZoom(1);
            setOffsetX(50);
            setOffsetY(50);
          }}
          variant="fullWidth"
        >
          <Tab label="Photograph (3.5x4.5cm)" value="photograph" />
          <Tab label="Signature (3.5x1.5cm)" value="signature" />
        </Tabs>
      </Paper>

      <Grid container spacing={3}>
        {/* Upload & Crop Controls */}
        <Grid item xs={12} md={5}>
          {/* Upload Area */}
          {!image ? (
            <Paper
              sx={{
                p: { xs: 3, md: 4 },
                textAlign: 'center',
                border: 2,
                borderStyle: 'dashed',
                borderColor: dragOver ? 'primary.main' : 'divider',
                bgcolor: dragOver ? 'action.hover' : 'background.paper',
                cursor: 'pointer',
                transition: 'all 200ms',
                minHeight: 200,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => fileInputRef.current?.click()}
            >
              <UploadIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
              <Typography variant="h6" gutterBottom>
                Upload {config.label}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Drag & drop or click to select
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Supports JPG, PNG, WEBP
              </Typography>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileSelect(file);
                  // Reset the input so the same file can be re-selected
                  e.target.value = '';
                }}
              />
            </Paper>
          ) : (
            <Paper sx={{ p: { xs: 2, md: 3 } }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="h6">Adjust Crop</Typography>
                <Button size="small" variant="outlined" onClick={resetAll}>
                  Change Image
                </Button>
              </Box>

              {/* Preview Canvas */}
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'center',
                  mb: 2,
                  bgcolor: 'grey.100',
                  borderRadius: 1,
                  p: 2,
                }}
              >
                <canvas
                  ref={previewCanvasRef}
                  style={{
                    maxWidth: '100%',
                    height: 'auto',
                    border: '2px solid #ccc',
                    borderRadius: 4,
                  }}
                />
              </Box>

              {/* Zoom Slider */}
              <Box sx={{ mb: 2 }}>
                <Typography variant="body2" gutterBottom>
                  Zoom: {zoom.toFixed(1)}x
                </Typography>
                <Slider
                  value={zoom}
                  min={1}
                  max={4}
                  step={0.1}
                  onChange={(_e, val) => {
                    setZoom(val as number);
                    setCroppedBlob(null);
                    setCroppedUrl(null);
                  }}
                  size="small"
                />
              </Box>

              {/* X Position Slider */}
              <Box sx={{ mb: 2 }}>
                <Typography variant="body2" gutterBottom>
                  Horizontal Position
                </Typography>
                <Slider
                  value={offsetX}
                  min={0}
                  max={100}
                  step={1}
                  onChange={(_e, val) => {
                    setOffsetX(val as number);
                    setCroppedBlob(null);
                    setCroppedUrl(null);
                  }}
                  size="small"
                />
              </Box>

              {/* Y Position Slider */}
              <Box sx={{ mb: 3 }}>
                <Typography variant="body2" gutterBottom>
                  Vertical Position
                </Typography>
                <Slider
                  value={offsetY}
                  min={0}
                  max={100}
                  step={1}
                  onChange={(_e, val) => {
                    setOffsetY(val as number);
                    setCroppedBlob(null);
                    setCroppedUrl(null);
                  }}
                  size="small"
                />
              </Box>

              <Button
                variant="contained"
                fullWidth
                size="large"
                onClick={cropAndCompress}
              >
                Crop & Process
              </Button>
            </Paper>
          )}

          {/* Spec Reference */}
          <Paper sx={{ p: 2, mt: 2 }}>
            <Typography variant="subtitle2" gutterBottom fontWeight={600}>
              {config.label} Specifications
            </Typography>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
              <Typography variant="body2" color="text.secondary">
                Aspect Ratio
              </Typography>
              <Typography variant="body2" fontWeight={600}>
                {config.aspectLabel}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
              <Typography variant="body2" color="text.secondary">
                Dimensions
              </Typography>
              <Typography variant="body2" fontWeight={600}>
                {config.dimensions}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
              <Typography variant="body2" color="text.secondary">
                File Format
              </Typography>
              <Typography variant="body2" fontWeight={600}>
                JPG
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography variant="body2" color="text.secondary">
                File Size
              </Typography>
              <Typography variant="body2" fontWeight={600}>
                {config.minSize}KB - {config.maxSize}KB
              </Typography>
            </Box>
          </Paper>
        </Grid>

        {/* Output Section */}
        <Grid item xs={12} md={7}>
          {croppedUrl && croppedBlob ? (
            <Box>
              {/* Size Warning */}
              {!isSizeValid && (
                <Alert severity="warning" sx={{ mb: 2 }}>
                  <Typography variant="subtitle2" gutterBottom>
                    File size out of range
                  </Typography>
                  <Typography variant="body2">
                    Output is {sizeInKB}KB but NATA requires {config.minSize}KB-{config.maxSize}KB.
                    {parseFloat(sizeInKB) > config.maxSize
                      ? ' Try zooming in more or using a simpler image.'
                      : ' Try using a higher quality source image.'}
                  </Typography>
                </Alert>
              )}

              {isSizeValid && (
                <Alert severity="success" sx={{ mb: 2 }}>
                  File meets NATA specifications. Ready to download!
                </Alert>
              )}

              {/* Preview */}
              <Paper sx={{ p: { xs: 2, md: 3 }, mb: 2 }}>
                <Typography variant="h6" gutterBottom>
                  Cropped Result
                </Typography>
                <Box
                  sx={{
                    display: 'flex',
                    justifyContent: 'center',
                    bgcolor: 'grey.100',
                    borderRadius: 1,
                    p: 3,
                    mb: 2,
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={croppedUrl}
                    alt={`Cropped ${config.label}`}
                    style={{
                      maxWidth: '100%',
                      height: 'auto',
                      maxHeight: mode === 'photograph' ? 350 : 150,
                      border: '2px solid #ccc',
                      borderRadius: 4,
                    }}
                  />
                </Box>

                {/* Output Details */}
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2 }}>
                  <Chip
                    label={`${outputWidth} x ${outputHeight} px`}
                    size="small"
                    variant="outlined"
                  />
                  <Chip
                    label={`${sizeInKB} KB`}
                    size="small"
                    color={isSizeValid ? 'success' : 'error'}
                  />
                  <Chip label="JPG" size="small" variant="outlined" />
                </Box>

                <Divider sx={{ mb: 2 }} />

                <Button
                  variant="contained"
                  size="large"
                  fullWidth
                  startIcon={<DownloadIcon />}
                  onClick={downloadImage}
                  sx={{ mb: 1 }}
                >
                  Download {config.filename}
                </Button>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'center' }}>
                  {isSizeValid
                    ? 'File is ready for NATA application upload'
                    : 'Warning: File size may not meet NATA requirements'}
                </Typography>
              </Paper>
            </Box>
          ) : (
            <Paper
              sx={{
                p: { xs: 2, md: 3 },
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: 400,
              }}
            >
              <Box sx={{ textAlign: 'center' }}>
                <Typography variant="h6" color="text.secondary" gutterBottom>
                  {image ? 'Adjust and click "Crop & Process"' : `Upload your ${config.label.toLowerCase()}`}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {image
                    ? 'Use the sliders to position and zoom, then crop the image'
                    : `Upload a ${config.label.toLowerCase()} image and crop it to meet NATA specifications`}
                </Typography>
              </Box>
            </Paper>
          )}

          {/* Guidelines */}
          <Paper sx={{ p: { xs: 2, md: 3 }, mt: 2 }}>
            <Typography variant="h6" gutterBottom>
              {config.label} Guidelines
            </Typography>
            <Divider sx={{ mb: 2 }} />
            {config.guidelines.map((guideline, index) => (
              <Box key={index} sx={{ display: 'flex', gap: 1, mb: 1 }}>
                <Typography variant="body2" color="text.secondary">
                  {index + 1}.
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {guideline}
                </Typography>
              </Box>
            ))}
          </Paper>
        </Grid>

        {/* Info Section */}
        <Grid item xs={12}>
          <Paper sx={{ p: { xs: 2, md: 3 } }}>
            <Typography variant="h6" gutterBottom>
              About NATA Image Requirements
            </Typography>
            <Typography variant="body2" color="text.secondary" paragraph>
              NATA requires specific photograph and signature dimensions for the application form.
              This tool helps you crop and resize your images to meet these requirements without
              installing any software.
            </Typography>
            <Typography variant="body2" color="text.secondary" paragraph>
              Your images are processed entirely in your browser and are never uploaded to any
              server. This ensures complete privacy of your personal photographs.
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Always verify the final image meets the specifications shown above before uploading to
              the NATA application portal.
            </Typography>
          </Paper>
        </Grid>
      </Grid>

      {/* Hidden canvas for final crop output */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />
    </Box>
  );
}
