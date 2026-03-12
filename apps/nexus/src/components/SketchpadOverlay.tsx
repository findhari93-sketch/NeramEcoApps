'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import {
  Box,
  Button,
  IconButton,
  Slider,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  Paper,
} from '@neram/ui';
import UndoOutlinedIcon from '@mui/icons-material/UndoOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import SaveOutlinedIcon from '@mui/icons-material/SaveOutlined';
import CloseIcon from '@mui/icons-material/Close';
import CreateOutlinedIcon from '@mui/icons-material/CreateOutlined';
import CircleOutlinedIcon from '@mui/icons-material/CircleOutlined';

interface SketchpadOverlayProps {
  imageUrl: string;
  onSave: (correctionDataUrl: string) => void;
  onClose: () => void;
}

type DrawTool = 'pen' | 'eraser';

interface DrawPath {
  points: { x: number; y: number }[];
  color: string;
  width: number;
  tool: DrawTool;
}

const COLORS = ['#FF0000', '#0066FF', '#00AA00', '#FF6600', '#9933FF', '#000000'];

export default function SketchpadOverlay({ imageUrl, onSave, onClose }: SketchpadOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [tool, setTool] = useState<DrawTool>('pen');
  const [color, setColor] = useState('#FF0000');
  const [lineWidth, setLineWidth] = useState(3);
  const [paths, setPaths] = useState<DrawPath[]>([]);
  const [currentPath, setCurrentPath] = useState<DrawPath | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [bgImage, setBgImage] = useState<HTMLImageElement | null>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });

  // Load background image
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      setBgImage(img);
      // Fit image to container
      if (containerRef.current) {
        const containerWidth = containerRef.current.clientWidth;
        const scale = containerWidth / img.width;
        setCanvasSize({
          width: containerWidth,
          height: img.height * scale,
        });
      }
    };
    img.src = imageUrl;
  }, [imageUrl]);

  // Redraw canvas
  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !bgImage) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw background image
    ctx.drawImage(bgImage, 0, 0, canvas.width, canvas.height);

    // Draw all paths
    const allPaths = currentPath ? [...paths, currentPath] : paths;
    for (const path of allPaths) {
      if (path.points.length < 2) continue;
      ctx.beginPath();
      ctx.strokeStyle = path.tool === 'eraser' ? '#FFFFFF' : path.color;
      ctx.lineWidth = path.tool === 'eraser' ? path.width * 3 : path.width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.globalCompositeOperation = path.tool === 'eraser' ? 'destination-out' : 'source-over';

      ctx.moveTo(path.points[0].x, path.points[0].y);
      for (let i = 1; i < path.points.length; i++) {
        ctx.lineTo(path.points[i].x, path.points[i].y);
      }
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
  }, [bgImage, paths, currentPath]);

  useEffect(() => {
    redraw();
  }, [redraw]);

  const getCanvasPoint = (e: React.TouchEvent | React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    if ('touches' in e) {
      const touch = e.touches[0] || e.changedTouches[0];
      return {
        x: (touch.clientX - rect.left) * scaleX,
        y: (touch.clientY - rect.top) * scaleY,
      };
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const handleStart = (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    const point = getCanvasPoint(e);
    setIsDrawing(true);
    setCurrentPath({
      points: [point],
      color,
      width: lineWidth,
      tool,
    });
  };

  const handleMove = (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    if (!isDrawing || !currentPath) return;
    const point = getCanvasPoint(e);
    setCurrentPath({
      ...currentPath,
      points: [...currentPath.points, point],
    });
  };

  const handleEnd = (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    if (!isDrawing || !currentPath) return;
    setIsDrawing(false);
    setPaths((prev) => [...prev, currentPath]);
    setCurrentPath(null);
  };

  const handleUndo = () => {
    setPaths((prev) => prev.slice(0, -1));
  };

  const handleClear = () => {
    setPaths([]);
  };

  const handleSave = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL('image/png');
    onSave(dataUrl);
  };

  return (
    <Box
      sx={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 1400,
        bgcolor: 'background.default',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Top toolbar */}
      <Paper
        elevation={2}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          px: 1.5,
          py: 0.5,
          borderRadius: 0,
        }}
      >
        <IconButton onClick={onClose} size="small">
          <CloseIcon />
        </IconButton>
        <Typography variant="body2" fontWeight={600} sx={{ flex: 1 }}>
          Draw Corrections
        </Typography>
        <IconButton onClick={handleUndo} disabled={paths.length === 0} size="small">
          <UndoOutlinedIcon />
        </IconButton>
        <IconButton onClick={handleClear} disabled={paths.length === 0} size="small">
          <DeleteOutlineIcon />
        </IconButton>
        <Button
          variant="contained"
          size="small"
          startIcon={<SaveOutlinedIcon />}
          onClick={handleSave}
          sx={{ textTransform: 'none', minHeight: 36 }}
        >
          Save
        </Button>
      </Paper>

      {/* Canvas area */}
      <Box
        ref={containerRef}
        sx={{
          flex: 1,
          overflow: 'auto',
          display: 'flex',
          justifyContent: 'center',
          bgcolor: 'grey.100',
          touchAction: 'none',
        }}
      >
        {canvasSize.width > 0 && (
          <canvas
            ref={canvasRef}
            width={canvasSize.width * 2}
            height={canvasSize.height * 2}
            style={{
              width: canvasSize.width,
              height: canvasSize.height,
              cursor: 'crosshair',
            }}
            onMouseDown={handleStart}
            onMouseMove={handleMove}
            onMouseUp={handleEnd}
            onMouseLeave={handleEnd}
            onTouchStart={handleStart}
            onTouchMove={handleMove}
            onTouchEnd={handleEnd}
          />
        )}
      </Box>

      {/* Bottom toolbar */}
      <Paper
        elevation={4}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          px: 2,
          py: 1,
          borderRadius: 0,
          flexWrap: 'wrap',
        }}
      >
        {/* Tool selector */}
        <ToggleButtonGroup
          value={tool}
          exclusive
          onChange={(_, v) => v && setTool(v)}
          size="small"
        >
          <ToggleButton value="pen" sx={{ px: 1.5 }}>
            <CreateOutlinedIcon sx={{ fontSize: 18 }} />
          </ToggleButton>
          <ToggleButton value="eraser" sx={{ px: 1.5 }}>
            <CircleOutlinedIcon sx={{ fontSize: 18 }} />
          </ToggleButton>
        </ToggleButtonGroup>

        {/* Color picker */}
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          {COLORS.map((c) => (
            <Box
              key={c}
              onClick={() => { setColor(c); setTool('pen'); }}
              sx={{
                width: 24,
                height: 24,
                borderRadius: '50%',
                bgcolor: c,
                cursor: 'pointer',
                border: color === c && tool === 'pen' ? '3px solid' : '2px solid',
                borderColor: color === c && tool === 'pen' ? 'primary.main' : 'divider',
                transition: 'border 0.1s',
              }}
            />
          ))}
        </Box>

        {/* Line width */}
        <Slider
          value={lineWidth}
          onChange={(_, v) => setLineWidth(v as number)}
          min={1}
          max={8}
          step={1}
          size="small"
          sx={{ width: 80 }}
        />
      </Paper>
    </Box>
  );
}
