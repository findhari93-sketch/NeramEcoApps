'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import {
  Box, Button, IconButton, Slider, ToggleButton, ToggleButtonGroup,
  Typography, Paper, Tooltip,
} from '@neram/ui';
import UndoOutlinedIcon from '@mui/icons-material/UndoOutlined';
import RedoOutlinedIcon from '@mui/icons-material/RedoOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import SaveOutlinedIcon from '@mui/icons-material/SaveOutlined';
import CloseIcon from '@mui/icons-material/Close';
import CreateOutlinedIcon from '@mui/icons-material/CreateOutlined';
import FitScreenOutlinedIcon from '@mui/icons-material/FitScreenOutlined';
import ZoomInOutlinedIcon from '@mui/icons-material/ZoomInOutlined';
import ZoomOutOutlinedIcon from '@mui/icons-material/ZoomOutOutlined';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';

interface SketchOverCanvasProps {
  imageUrl: string;
  onSave: (blob: Blob) => Promise<void> | void;
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

export default function SketchOverCanvas({ imageUrl, onSave, onClose }: SketchOverCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [tool, setTool] = useState<DrawTool>('pen');
  const [color, setColor] = useState('#FF0000');
  const [lineWidth, setLineWidth] = useState(3);
  const [paths, setPaths] = useState<DrawPath[]>([]);
  const [redoStack, setRedoStack] = useState<DrawPath[]>([]);
  const [currentPath, setCurrentPath] = useState<DrawPath | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [bgImage, setBgImage] = useState<HTMLImageElement | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');

  // Zoom & pan state
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const lastPinchDist = useRef(0);
  const lastPanPoint = useRef({ x: 0, y: 0 });

  // Canvas internal resolution (always matches image)
  const [canvasRes, setCanvasRes] = useState({ width: 0, height: 0 });

  // Load background image and fit to container
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      setBgImage(img);
      // Canvas resolution = image resolution (for quality)
      setCanvasRes({ width: img.width, height: img.height });
      // Fit to container
      fitToScreen(img);
    };
    img.src = imageUrl;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageUrl]);

  const fitToScreen = useCallback((img?: HTMLImageElement) => {
    const image = img || bgImage;
    if (!image || !containerRef.current) return;
    const cw = containerRef.current.clientWidth;
    const ch = containerRef.current.clientHeight;
    const scaleX = cw / image.width;
    const scaleY = ch / image.height;
    const fitScale = Math.min(scaleX, scaleY, 1); // Don't upscale beyond 100%
    setScale(fitScale);
    // Center the image
    const displayW = image.width * fitScale;
    const displayH = image.height * fitScale;
    setOffset({
      x: (cw - displayW) / 2,
      y: (ch - displayH) / 2,
    });
  }, [bgImage]);

  // Redraw canvas
  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !bgImage) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bgImage, 0, 0, canvas.width, canvas.height);

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

  useEffect(() => { redraw(); }, [redraw]);

  // Convert screen coordinates to canvas coordinates (accounting for zoom + pan)
  const getCanvasPoint = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas || !containerRef.current) return { x: 0, y: 0 };
    const containerRect = containerRef.current.getBoundingClientRect();
    // Position relative to container
    const relX = clientX - containerRect.left;
    const relY = clientY - containerRect.top;
    // Remove offset and scale to get canvas coordinates
    const canvasX = (relX - offset.x) / scale;
    const canvasY = (relY - offset.y) / scale;
    return { x: canvasX, y: canvasY };
  }, [offset, scale]);

  // --- Mouse drawing ---
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const point = getCanvasPoint(e.clientX, e.clientY);
    setIsDrawing(true);
    setCurrentPath({ points: [point], color, width: lineWidth / scale, tool });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!isDrawing || !currentPath) return;
    const point = getCanvasPoint(e.clientX, e.clientY);
    setCurrentPath({ ...currentPath, points: [...currentPath.points, point] });
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!isDrawing || !currentPath) return;
    setIsDrawing(false);
    setPaths((prev) => [...prev, currentPath]);
    setRedoStack([]);
    setCurrentPath(null);
  };

  // --- Touch handling: 1 finger = draw, 2 fingers = pinch/pan ---
  const handleTouchStart = (e: React.TouchEvent) => {
    e.preventDefault();
    if (e.touches.length === 2) {
      // Pinch/pan start
      setIsPanning(true);
      setIsDrawing(false);
      setCurrentPath(null);
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      lastPinchDist.current = Math.hypot(dx, dy);
      lastPanPoint.current = {
        x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
        y: (e.touches[0].clientY + e.touches[1].clientY) / 2,
      };
    } else if (e.touches.length === 1 && !isPanning) {
      // Single finger = draw
      const touch = e.touches[0];
      const point = getCanvasPoint(touch.clientX, touch.clientY);
      setIsDrawing(true);
      setCurrentPath({ points: [point], color, width: lineWidth / scale, tool });
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    e.preventDefault();
    if (e.touches.length === 2) {
      // Pinch zoom
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;

      if (lastPinchDist.current > 0) {
        const zoomFactor = dist / lastPinchDist.current;
        const newScale = Math.min(Math.max(scale * zoomFactor, 0.2), 5);

        // Zoom towards pinch center
        const containerRect = containerRef.current?.getBoundingClientRect();
        if (containerRect) {
          const relX = midX - containerRect.left;
          const relY = midY - containerRect.top;
          const newOffsetX = relX - (relX - offset.x) * (newScale / scale);
          const newOffsetY = relY - (relY - offset.y) * (newScale / scale);
          setOffset({ x: newOffsetX, y: newOffsetY });
        }
        setScale(newScale);
      }

      // Pan
      const panDx = midX - lastPanPoint.current.x;
      const panDy = midY - lastPanPoint.current.y;
      setOffset((prev) => ({ x: prev.x + panDx, y: prev.y + panDy }));

      lastPinchDist.current = dist;
      lastPanPoint.current = { x: midX, y: midY };
    } else if (e.touches.length === 1 && isDrawing && currentPath) {
      const touch = e.touches[0];
      const point = getCanvasPoint(touch.clientX, touch.clientY);
      setCurrentPath({ ...currentPath, points: [...currentPath.points, point] });
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    e.preventDefault();
    if (e.touches.length < 2) {
      setIsPanning(false);
      lastPinchDist.current = 0;
    }
    if (e.touches.length === 0 && isDrawing && currentPath) {
      setIsDrawing(false);
      setPaths((prev) => [...prev, currentPath]);
      setRedoStack([]);
      setCurrentPath(null);
    }
  };

  // Mouse wheel zoom
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
    const newScale = Math.min(Math.max(scale * zoomFactor, 0.2), 5);
    const containerRect = containerRef.current?.getBoundingClientRect();
    if (containerRect) {
      const relX = e.clientX - containerRect.left;
      const relY = e.clientY - containerRect.top;
      const newOffsetX = relX - (relX - offset.x) * (newScale / scale);
      const newOffsetY = relY - (relY - offset.y) * (newScale / scale);
      setOffset({ x: newOffsetX, y: newOffsetY });
    }
    setScale(newScale);
  };

  const zoomIn = () => {
    const newScale = Math.min(scale * 1.3, 5);
    if (containerRef.current) {
      const cw = containerRef.current.clientWidth / 2;
      const ch = containerRef.current.clientHeight / 2;
      setOffset((prev) => ({
        x: cw - (cw - prev.x) * (newScale / scale),
        y: ch - (ch - prev.y) * (newScale / scale),
      }));
    }
    setScale(newScale);
  };

  const zoomOut = () => {
    const newScale = Math.max(scale * 0.7, 0.2);
    if (containerRef.current) {
      const cw = containerRef.current.clientWidth / 2;
      const ch = containerRef.current.clientHeight / 2;
      setOffset((prev) => ({
        x: cw - (cw - prev.x) * (newScale / scale),
        y: ch - (ch - prev.y) * (newScale / scale),
      }));
    }
    setScale(newScale);
  };

  const handleUndo = () => {
    setPaths((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      setRedoStack((r) => [...r, last]);
      return prev.slice(0, -1);
    });
  };

  const handleRedo = () => {
    setRedoStack((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      setPaths((p) => [...p, last]);
      return prev.slice(0, -1);
    });
  };

  const handleClear = () => {
    setPaths([]);
    setRedoStack([]);
  };

  const handleSave = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setSaving(true);
    setSaveStatus('idle');

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), 'image/png');
    });

    if (!blob) {
      setSaving(false);
      setSaveStatus('error');
      return;
    }

    try {
      await onSave(blob);
      setSaveStatus('success');
      // Auto-close after brief success flash
      setTimeout(() => onClose(), 800);
    } catch {
      setSaveStatus('error');
    } finally {
      setSaving(false);
    }
  };

  const displayW = canvasRes.width * scale;
  const displayH = canvasRes.height * scale;

  return (
    <Box sx={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      zIndex: 1400, bgcolor: '#1a1a1a', display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* Top toolbar */}
      <Paper elevation={2} sx={{
        display: 'flex', alignItems: 'center', gap: 0.5, px: 1, py: 0.5,
        borderRadius: 0, bgcolor: '#fff', zIndex: 1, flexShrink: 0,
      }}>
        <IconButton onClick={onClose} size="small"><CloseIcon /></IconButton>
        <Typography variant="body2" fontWeight={600} sx={{ flex: 1 }}>
          Draw Corrections
        </Typography>
        <IconButton onClick={handleUndo} disabled={paths.length === 0} size="small">
          <UndoOutlinedIcon />
        </IconButton>
        <IconButton onClick={handleRedo} disabled={redoStack.length === 0} size="small">
          <RedoOutlinedIcon />
        </IconButton>
        <IconButton onClick={handleClear} disabled={paths.length === 0} size="small">
          <DeleteOutlineIcon />
        </IconButton>
        {saveStatus === 'success' ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: 'success.main', ml: 0.5 }}>
            <CheckCircleIcon fontSize="small" />
            <Typography variant="body2" fontWeight={600}>Saved!</Typography>
          </Box>
        ) : saveStatus === 'error' ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, ml: 0.5 }}>
            <ErrorOutlineIcon fontSize="small" color="error" />
            <Button size="small" variant="contained" color="error" onClick={handleSave} sx={{ textTransform: 'none', minHeight: 36 }}>
              Retry
            </Button>
          </Box>
        ) : (
          <Button
            variant="contained" size="small" startIcon={<SaveOutlinedIcon />}
            onClick={handleSave} disabled={saving}
            sx={{ textTransform: 'none', minHeight: 36, ml: 0.5 }}
          >
            {saving ? 'Uploading...' : 'Save'}
          </Button>
        )}
      </Paper>

      {/* Canvas area — no scrollbars, zoom/pan controlled */}
      <Box
        ref={containerRef}
        sx={{
          flex: 1, overflow: 'hidden', position: 'relative',
          bgcolor: '#2a2a2a', cursor: tool === 'eraser' ? 'cell' : 'crosshair',
        }}
        onWheel={handleWheel}
      >
        {canvasRes.width > 0 && (
          <canvas
            ref={canvasRef}
            width={canvasRes.width}
            height={canvasRes.height}
            style={{
              position: 'absolute',
              left: offset.x,
              top: offset.y,
              width: displayW,
              height: displayH,
              touchAction: 'none',
            }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          />
        )}

        {/* Zoom controls overlay (bottom-right of canvas area) */}
        <Box sx={{
          position: 'absolute', bottom: 12, right: 12, display: 'flex',
          flexDirection: 'column', gap: 0.5, zIndex: 2,
        }}>
          <Tooltip title="Zoom in" placement="left">
            <IconButton onClick={zoomIn} size="small" sx={{ bgcolor: 'rgba(255,255,255,0.9)', '&:hover': { bgcolor: '#fff' } }}>
              <ZoomInOutlinedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Zoom out" placement="left">
            <IconButton onClick={zoomOut} size="small" sx={{ bgcolor: 'rgba(255,255,255,0.9)', '&:hover': { bgcolor: '#fff' } }}>
              <ZoomOutOutlinedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Fit to screen" placement="left">
            <IconButton onClick={() => fitToScreen()} size="small" sx={{ bgcolor: 'rgba(255,255,255,0.9)', '&:hover': { bgcolor: '#fff' } }}>
              <FitScreenOutlinedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>

        {/* Zoom percentage indicator */}
        <Typography sx={{
          position: 'absolute', bottom: 12, left: 12,
          color: 'rgba(255,255,255,0.7)', fontSize: '0.75rem',
          bgcolor: 'rgba(0,0,0,0.5)', px: 1, py: 0.25, borderRadius: 1,
        }}>
          {Math.round(scale * 100)}%
        </Typography>
      </Box>

      {/* Bottom toolbar */}
      <Paper elevation={4} sx={{
        display: 'flex', alignItems: 'center', gap: 1.5, px: 2, py: 1,
        borderRadius: 0, flexWrap: 'wrap', flexShrink: 0,
      }}>
        {/* Tool selector with labels */}
        <ToggleButtonGroup value={tool} exclusive onChange={(_, v) => v && setTool(v)} size="small">
          <ToggleButton value="pen" sx={{ px: 1.5, gap: 0.5, textTransform: 'none' }}>
            <CreateOutlinedIcon sx={{ fontSize: 18 }} />
            <Typography variant="caption" sx={{ display: { xs: 'none', sm: 'inline' } }}>Pen</Typography>
          </ToggleButton>
          <ToggleButton value="eraser" sx={{ px: 1.5, gap: 0.5, textTransform: 'none' }}>
            <Box sx={{
              width: 16, height: 16, borderRadius: '50%', border: '2px solid',
              borderColor: tool === 'eraser' ? 'primary.main' : 'text.secondary',
              bgcolor: tool === 'eraser' ? 'primary.light' : 'transparent',
            }} />
            <Typography variant="caption" sx={{ display: { xs: 'none', sm: 'inline' } }}>Eraser</Typography>
          </ToggleButton>
        </ToggleButtonGroup>

        {/* Color picker */}
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          {COLORS.map((c) => (
            <Box
              key={c}
              onClick={() => { setColor(c); setTool('pen'); }}
              sx={{
                width: 28, height: 28, borderRadius: '50%', bgcolor: c, cursor: 'pointer',
                border: color === c && tool === 'pen' ? '3px solid' : '2px solid',
                borderColor: color === c && tool === 'pen' ? 'primary.main' : 'divider',
                transition: 'transform 0.1s',
                '&:hover': { transform: 'scale(1.15)' },
              }}
            />
          ))}
        </Box>

        {/* Line width */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Box sx={{ width: 4, height: 4, borderRadius: '50%', bgcolor: 'text.secondary' }} />
          <Slider
            value={lineWidth}
            onChange={(_, v) => setLineWidth(v as number)}
            min={1} max={12} step={1} size="small"
            sx={{ width: 80 }}
          />
          <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: 'text.secondary' }} />
        </Box>
      </Paper>
    </Box>
  );
}
