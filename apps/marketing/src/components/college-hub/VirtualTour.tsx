'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Script from 'next/script';
import { Box, Typography, Stack, Chip } from '@mui/material';
import TourIcon from '@mui/icons-material/Tour';
import type { VirtualTourScene } from '@/lib/college-hub/types';

// Extend window for Pannellum
declare global {
  interface Window {
    pannellum?: {
      viewer: (
        container: HTMLElement,
        config: Record<string, unknown>
      ) => { destroy: () => void };
    };
  }
}

interface VirtualTourProps {
  scenes: VirtualTourScene[];
  collegeName: string;
}

export default function VirtualTour({ scenes, collegeName }: VirtualTourProps) {
  const viewerRef = useRef<HTMLDivElement>(null);
  const pannellumInstanceRef = useRef<{ destroy: () => void } | null>(null);
  const [activeScene, setActiveScene] = useState(scenes[0]?.id ?? '');
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const [viewerReady, setViewerReady] = useState(false);

  const initViewer = useCallback(() => {
    if (!viewerRef.current || !window.pannellum) return;

    const scene = scenes.find((s) => s.id === activeScene);
    if (!scene) return;

    if (pannellumInstanceRef.current) {
      try {
        pannellumInstanceRef.current.destroy();
      } catch {
        // ignore
      }
      pannellumInstanceRef.current = null;
      setViewerReady(false);
    }

    const instance = window.pannellum.viewer(viewerRef.current, {
      type: 'equirectangular',
      panorama: scene.imageUrl,
      autoLoad: true,
      showControls: true,
      showFullscreenCtrl: true,
      showZoomCtrl: true,
      compass: false,
      hotSpots: (scene.hotspots || []).map((h) => ({
        pitch: h.pitch,
        yaw: h.yaw,
        type: h.targetScene ? 'scene' : 'info',
        text: h.text,
        sceneId: h.targetScene,
      })),
      onLoad: () => setViewerReady(true),
    });

    pannellumInstanceRef.current = instance;
  }, [activeScene, scenes]);

  useEffect(() => {
    if (scriptLoaded) {
      initViewer();
    }
    return () => {
      if (pannellumInstanceRef.current) {
        try {
          pannellumInstanceRef.current.destroy();
        } catch {
          // ignore
        }
        pannellumInstanceRef.current = null;
      }
    };
  }, [activeScene, scriptLoaded, initViewer]);

  if (!scenes || scenes.length === 0) return null;

  return (
    <Box>
      {/* Pannellum CSS */}
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link
        rel="stylesheet"
        href="https://cdn.jsdelivr.net/npm/pannellum@2.5.6/build/pannellum.css"
      />

      {/* Pannellum JS */}
      <Script
        src="https://cdn.jsdelivr.net/npm/pannellum@2.5.6/build/pannellum.js"
        strategy="lazyOnload"
        onLoad={() => setScriptLoaded(true)}
      />

      {/* Scene selector chips */}
      {scenes.length > 1 && (
        <Stack
          direction="row"
          gap={1}
          flexWrap="wrap"
          sx={{ mb: 2 }}
          role="tablist"
          aria-label="Campus tour scenes"
        >
          {scenes.map((scene) => (
            <Chip
              key={scene.id}
              label={scene.label}
              onClick={() => setActiveScene(scene.id)}
              variant={activeScene === scene.id ? 'filled' : 'outlined'}
              color={activeScene === scene.id ? 'primary' : 'default'}
              size="small"
              icon={<TourIcon sx={{ fontSize: 14 }} />}
              sx={{ minHeight: 32, fontSize: '0.8125rem' }}
              role="tab"
              aria-selected={activeScene === scene.id}
            />
          ))}
        </Stack>
      )}

      {/* 360-degree viewer container */}
      <Box sx={{ position: 'relative' }}>
        <Box
          ref={viewerRef}
          sx={{
            width: '100%',
            height: { xs: 280, sm: 400, md: 500 },
            borderRadius: 2,
            overflow: 'hidden',
            bgcolor: '#0f172a',
          }}
        />

        {/* Loading overlay */}
        {!viewerReady && (
          <Box
            sx={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              bgcolor: '#0f172a',
              borderRadius: 2,
              gap: 1,
            }}
          >
            <TourIcon sx={{ fontSize: 40, color: '#475569' }} />
            <Typography variant="caption" sx={{ color: '#64748b' }}>
              Loading 360° tour of {collegeName}...
            </Typography>
          </Box>
        )}
      </Box>

      {/* Usage hint */}
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ display: 'block', mt: 1, textAlign: 'center' }}
      >
        Click and drag to explore. Scroll to zoom. Tap hotspots for details.
      </Typography>
    </Box>
  );
}
