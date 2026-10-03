'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import CropOutlinedIcon from '@mui/icons-material/CropOutlined';
import {
  Box,
  Typography,
  Paper,
  Button,
  Tabs,
  Tab,
  Slider,
  Alert,
  Chip,
  Divider,
  CircularProgress,
  DownloadIcon,
} from '@neram/ui';
import { ImageUploadField } from '@neram/ui';
import ToolPageHeader from '@/components/tools-hub/ToolPageHeader';

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
    aspectLabel: '3.5 x 4.5 cm (7:9)',
    dimensions: '350 x 450 px (recommended)',
    minSize: 4,
    maxSize: 100,
    filename: 'nata-photo.jpg',
    guidelines: [
      'Recent passport-size photograph',
      'White or light-colored background',
      'Face should cover 70 to 80% of the frame',
      'No headwear (except religious purposes)',
      'Both ears should be visible',
      'Natural expression, mouth closed',
    ],
  },
  signature: {
    label: 'Signature',
    aspectRatio: 7 / 3, // 3.5cm x 1.5cm
    aspectLabel: '3.5 x 1.5 cm (7:3)',
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

const UNREADABLE_IMAGE_MESSAGE =
  'Could not read this image. HEIC photos from some phones do not open here, so save it as a JPG or PNG and try again.';

/**
 * Bring a freshly rendered result into view when it is off screen (phones stack
 * it under the controls), then move focus to it so screen readers land there too.
 */
function revealIfNeeded(el: HTMLElement | null) {
  if (!el || typeof window === 'undefined') return;
  const rect = el.getBoundingClientRect();
  const hidden = rect.top < 64 || rect.top > window.innerHeight - 120;
  if (hidden) {
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  }
  el.focus({ preventScroll: true });
}

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

export default function ImageCropPage() {
  const [mode, setMode] = useState<Mode>('photograph');
  const [image, setImage] = useState<HTMLImageElement | null>(null);

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
  const [isProcessing, setIsProcessing] = useState(false);
  const [processError, setProcessError] = useState<string | null>(null);
  // Bumped after each crop so the result scrolls into view once rendered
  const [revealRequest, setRevealRequest] = useState(0);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const outputRef = useRef<HTMLDivElement>(null);
  // Object URLs live in refs so replacing and unmounting always revoke the current one
  const imageUrlRef = useRef<string | null>(null);
  const croppedUrlRef = useRef<string | null>(null);
  const processingRef = useRef(false);

  const config = MODE_CONFIGS[mode];

  const replaceCroppedUrl = useCallback((url: string | null) => {
    if (croppedUrlRef.current) URL.revokeObjectURL(croppedUrlRef.current);
    croppedUrlRef.current = url;
    setCroppedUrl(url);
  }, []);

  const clearOutput = useCallback(() => {
    setCroppedBlob(null);
    replaceCroppedUrl(null);
  }, [replaceCroppedUrl]);

  // Clean up object URLs on unmount
  useEffect(() => {
    return () => {
      if (imageUrlRef.current) URL.revokeObjectURL(imageUrlRef.current);
      if (croppedUrlRef.current) URL.revokeObjectURL(croppedUrlRef.current);
    };
  }, []);

  useEffect(() => {
    if (revealRequest > 0) revealIfNeeded(outputRef.current);
  }, [revealRequest]);

  /** Loads the file into an <img>. Rejects with a readable message when the browser cannot decode it. */
  const handleFileSelect = useCallback(
    (file: File) =>
      new Promise<void>((resolve, reject) => {
        if (!file.type.startsWith('image/')) {
          reject(new Error('This file is not an image. Choose a JPG or PNG.'));
          return;
        }

        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
          if (imageUrlRef.current) URL.revokeObjectURL(imageUrlRef.current);
          imageUrlRef.current = url;
          setImage(img);
          setZoom(1);
          setOffsetX(50);
          setOffsetY(50);
          setProcessError(null);
          clearOutput();
          resolve();
        };
        img.onerror = () => {
          URL.revokeObjectURL(url);
          reject(new Error(UNREADABLE_IMAGE_MESSAGE));
        };
        img.src = url;
      }),
    [clearOutput]
  );

  // Feed the shared picker's File into the existing canvas cropper. The field
  // handles click + drag/drop + CLIPBOARD PASTE; no upload happens (this tool is
  // 100% client-side), so we just load the image and keep the field empty. A
  // rejection here is shown by the field as its error message.
  const handlePickImage = useCallback(
    async (file: File): Promise<{ url: string }> => {
      await handleFileSelect(file);
      return { url: '' };
    },
    [handleFileSelect]
  );

  // Draw preview whenever image, zoom, or offsets change
  useEffect(() => {
    if (!image || !previewCanvasRef.current) return;

    const canvas = previewCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set preview canvas size based on mode
    const previewWidth = 280;
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

  const cropAndCompress = useCallback(async () => {
    if (!image || !canvasRef.current || processingRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    processingRef.current = true;
    setIsProcessing(true);
    setProcessError(null);

    try {
      // Target output dimensions
      const targetWidth = 350;
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
        replaceCroppedUrl(URL.createObjectURL(blob));
        setCroppedBlob(blob);
        setOutputSize(blob.size);
        setOutputWidth(targetWidth);
        setOutputHeight(targetHeight);
        setRevealRequest((n) => n + 1);
      } else {
        setProcessError('Could not process this image. Try again, or use a different photo.');
      }
    } catch {
      setProcessError('Could not process this image. Try again, or use a different photo.');
    } finally {
      processingRef.current = false;
      setIsProcessing(false);
    }
  }, [image, mode, config, zoom, offsetX, offsetY, replaceCroppedUrl]);

  const downloadImage = useCallback(() => {
    if (!croppedBlob) return;
    const url = URL.createObjectURL(croppedBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = config.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // Give the browser a moment to start the download before freeing the URL
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, [croppedBlob, config.filename]);

  const sizeInKB = (outputSize / 1024).toFixed(1);
  const isSizeValid =
    outputSize >= config.minSize * 1024 && outputSize <= config.maxSize * 1024;

  const resetAll = () => {
    if (imageUrlRef.current) URL.revokeObjectURL(imageUrlRef.current);
    imageUrlRef.current = null;
    clearOutput();
    setImage(null);
    setZoom(1);
    setOffsetX(50);
    setOffsetY(50);
    setOutputSize(0);
    setProcessError(null);
  };

  const sliderBlockSx = { mb: 2 } as const;

  // ─── Sections (placed in two columns on laptops, one stacked column on phones) ───

  const controlsSection = !image ? (
    <ImageUploadField
      value={null}
      onChange={() => {}}
      upload={handlePickImage}
      accept="image/*"
      height={200}
      helperText={`Upload ${config.label}: drop, paste, or choose`}
      enableGlobalPaste
    />
  ) : (
    <Paper sx={{ p: { xs: 2, md: 3 } }}>
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 1,
          mb: 2,
        }}
      >
        <Typography variant="h6" component="h2">
          Adjust Crop
        </Typography>
        <Button variant="outlined" onClick={resetAll}>
          Change Image
        </Button>
      </Box>

      {/* Preview Canvas */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          mb: 2,
          bgcolor: 'action.hover',
          borderRadius: 1,
          p: 2,
          '& canvas': {
            maxWidth: '100%',
            height: 'auto',
            border: '2px solid',
            borderColor: 'divider',
            borderRadius: 1,
          },
        }}
      >
        <canvas ref={previewCanvasRef} aria-label={`Crop preview of your ${config.label.toLowerCase()}`} />
      </Box>

      {/* Zoom Slider */}
      <Box sx={sliderBlockSx}>
        <Typography id="crop-zoom-label" variant="body2" gutterBottom>
          Zoom: {zoom.toFixed(1)}x
        </Typography>
        <Slider
          aria-labelledby="crop-zoom-label"
          value={zoom}
          min={1}
          max={4}
          step={0.1}
          onChange={(_e, val) => {
            setZoom(val as number);
            clearOutput();
          }}
        />
      </Box>

      {/* X Position Slider */}
      <Box sx={sliderBlockSx}>
        <Typography id="crop-x-label" variant="body2" gutterBottom>
          Horizontal Position
        </Typography>
        <Slider
          aria-labelledby="crop-x-label"
          value={offsetX}
          min={0}
          max={100}
          step={1}
          onChange={(_e, val) => {
            setOffsetX(val as number);
            clearOutput();
          }}
        />
      </Box>

      {/* Y Position Slider */}
      <Box sx={{ mb: 3 }}>
        <Typography id="crop-y-label" variant="body2" gutterBottom>
          Vertical Position
        </Typography>
        <Slider
          aria-labelledby="crop-y-label"
          value={offsetY}
          min={0}
          max={100}
          step={1}
          onChange={(_e, val) => {
            setOffsetY(val as number);
            clearOutput();
          }}
        />
      </Box>

      {processError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {processError}
        </Alert>
      )}

      <Button
        variant="contained"
        fullWidth
        size="large"
        onClick={cropAndCompress}
        disabled={isProcessing}
        aria-busy={isProcessing}
        startIcon={
          isProcessing ? <CircularProgress size={18} color="inherit" aria-hidden="true" /> : <CropOutlinedIcon />
        }
      >
        {isProcessing ? 'Processing…' : 'Crop and Process'}
      </Button>
    </Paper>
  );

  const outputSection =
    croppedUrl && croppedBlob ? (
      <Box>
        {/* Size Warning */}
        {!isSizeValid && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            <Typography variant="subtitle2" component="h3" gutterBottom>
              File size out of range
            </Typography>
            <Typography variant="body2">
              Output is {sizeInKB} KB but NATA requires {config.minSize} KB to {config.maxSize} KB.
              {parseFloat(sizeInKB) > config.maxSize
                ? ' Try zooming in more or using a simpler image.'
                : ' Try using a higher quality source image.'}
            </Typography>
          </Alert>
        )}

        {isSizeValid && (
          <Alert severity="success" sx={{ mb: 2 }}>
            File meets NATA specifications. Ready to download.
          </Alert>
        )}

        {/* Preview */}
        <Paper sx={{ p: { xs: 2, md: 3 } }}>
          <Typography variant="h6" component="h2" gutterBottom>
            Cropped Result
          </Typography>
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'center',
              bgcolor: 'action.hover',
              borderRadius: 1,
              p: { xs: 2, md: 3 },
              mb: 2,
            }}
          >
            <Box
              component="img"
              src={croppedUrl}
              alt={`Cropped ${config.label}`}
              sx={{
                maxWidth: '100%',
                height: 'auto',
                maxHeight: mode === 'photograph' ? 350 : 150,
                border: '2px solid',
                borderColor: 'divider',
                borderRadius: 1,
              }}
            />
          </Box>

          {/* Output Details */}
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2 }}>
            <Chip label={`${outputWidth} x ${outputHeight} px`} size="small" variant="outlined" />
            <Chip label={`${sizeInKB} KB`} size="small" color={isSizeValid ? 'success' : 'error'} />
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
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ display: 'block', textAlign: 'center' }}
          >
            {isSizeValid
              ? 'File is ready for NATA application upload'
              : 'Warning: File size may not meet NATA requirements'}
          </Typography>
        </Paper>
      </Box>
    ) : (
      // Compact hint on laptops only; on phones the controls above already say what to do
      <Box
        sx={{
          display: { xs: 'none', md: 'flex' },
          p: 2.5,
          borderRadius: 3,
          border: '1px dashed',
          borderColor: 'divider',
          gap: 1.5,
          alignItems: 'flex-start',
        }}
      >
        <CropOutlinedIcon aria-hidden="true" sx={{ color: 'text.secondary', mt: 0.25, flexShrink: 0 }} />
        <Box>
          <Typography variant="subtitle2" component="h2" fontWeight={600}>
            {image ? 'Adjust, then tap Crop and Process' : `Upload your ${config.label.toLowerCase()}`}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {image
              ? 'Use the sliders to position and zoom. Your cropped file shows up here.'
              : `Upload a ${config.label.toLowerCase()} image and crop it to meet NATA specifications.`}
          </Typography>
        </Box>
      </Box>
    );

  const specSection = (
    <Paper sx={{ p: 2 }}>
      <Typography variant="subtitle2" component="h2" gutterBottom fontWeight={600}>
        {config.label} Specifications
      </Typography>
      {[
        ['Aspect Ratio', config.aspectLabel],
        ['Dimensions', config.dimensions],
        ['File Format', 'JPG'],
        ['File Size', `${config.minSize} KB to ${config.maxSize} KB`],
      ].map(([key, value], i, arr) => (
        <Box
          key={key}
          sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, mb: i < arr.length - 1 ? 0.5 : 0 }}
        >
          <Typography variant="body2" color="text.secondary">
            {key}
          </Typography>
          <Typography variant="body2" fontWeight={600} sx={{ textAlign: 'right' }}>
            {value}
          </Typography>
        </Box>
      ))}
    </Paper>
  );

  const guidelinesSection = (
    <Paper sx={{ p: { xs: 2, md: 3 } }}>
      <Typography variant="h6" component="h2" gutterBottom>
        {config.label} Guidelines
      </Typography>
      <Divider sx={{ mb: 2 }} />
      <Box component="ol" sx={{ m: 0, pl: 2.5 }}>
        {config.guidelines.map((guideline) => (
          <Typography key={guideline} component="li" variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            {guideline}
          </Typography>
        ))}
      </Box>
    </Paper>
  );

  // On phones the column wrappers dissolve (display: contents) so `order` can put
  // the result straight after the controls, ahead of the reference cards.
  const columnSx = {
    display: { xs: 'contents', md: 'flex' },
    flexDirection: 'column',
    gap: 2,
    minWidth: 0,
  } as const;

  return (
    <Box>
      <ToolPageHeader toolId="nata-image-crop" />

      {/* Mode Tabs */}
      <Paper sx={{ mb: 3 }}>
        <Tabs
          value={mode}
          onChange={(_e, newMode) => {
            setMode(newMode as Mode);
            clearOutput();
            setOutputSize(0);
            setZoom(1);
            setOffsetX(50);
            setOffsetY(50);
            setProcessError(null);
          }}
          variant="fullWidth"
          aria-label="What to crop"
        >
          <Tab label="Photograph (3.5 x 4.5 cm)" value="photograph" />
          <Tab label="Signature (3.5 x 1.5 cm)" value="signature" />
        </Tabs>
      </Paper>

      <Box
        sx={{
          display: 'flex',
          flexDirection: { xs: 'column', md: 'row' },
          alignItems: { md: 'flex-start' },
          gap: { xs: 2, md: 3 },
        }}
      >
        {/* Left column: controls, then specs */}
        <Box sx={{ ...columnSx, flex: { md: '5 1 0' } }}>
          <Box sx={{ order: { xs: 1, md: 0 }, minWidth: 0 }}>{controlsSection}</Box>
          <Box sx={{ order: { xs: 3, md: 0 }, minWidth: 0 }}>{specSection}</Box>
        </Box>

        {/* Right column: output, then guidelines */}
        <Box sx={{ ...columnSx, flex: { md: '7 1 0' } }}>
          <Box
            ref={outputRef}
            tabIndex={-1}
            role="region"
            aria-label="Cropped result"
            sx={{
              order: { xs: 2, md: 0 },
              minWidth: 0,
              scrollMarginTop: { xs: '72px', md: '16px' },
              '&:focus': { outline: 'none' },
              // Nothing to show on phones until there is a result
              display: { xs: croppedUrl && croppedBlob ? 'block' : 'none', md: 'block' },
            }}
          >
            {outputSection}
          </Box>
          <Box sx={{ order: { xs: 4, md: 0 }, minWidth: 0 }}>{guidelinesSection}</Box>
        </Box>
      </Box>

      {/* Info Section */}
      <Paper sx={{ p: { xs: 2, md: 3 }, mt: { xs: 2, md: 3 } }}>
        <Typography variant="h6" component="h2" gutterBottom>
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

      {/* Hidden canvas for final crop output */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />
    </Box>
  );
}
