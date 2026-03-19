'use client';

import { useEffect, useRef, useState } from 'react';
import { Box, Typography, CircularProgress } from '@neram/ui';

interface SharePointPlayerProps {
  videoUrl: string;
  chapterId: string;
  token?: string | null;
}

/**
 * Converts a SharePoint/Stream video URL to an embeddable format (client-side fallback).
 */
export function toEmbedUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.pathname.includes('embed.aspx')) return url;
    if (u.pathname.includes('stream.aspx')) {
      return url.replace('stream.aspx', 'embed.aspx');
    }
    // For sharing links, use stream.aspx with share= param
    if (u.pathname.match(/\/:v:\//)) {
      const pathParts = u.pathname.split('/');
      const vIdx = pathParts.indexOf(':v:');
      if (vIdx >= 0 && vIdx + 2 < pathParts.length) {
        const siteName = pathParts[vIdx + 2];
        return `${u.origin}/sites/${siteName}/_layouts/15/stream.aspx?share=${encodeURIComponent(url)}`;
      }
    }
    return url;
  } catch {
    return url;
  }
}

export default function SharePointPlayer({ videoUrl, chapterId, token }: SharePointPlayerProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [embedUrl, setEmbedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Register a minimal player interface on window
  useEffect(() => {
    (window as any).__foundationPlayer = {
      type: 'sharepoint',
      seekTo: () => {},
      play: () => {},
      pause: () => {},
      getCurrentTime: () => 0,
    };
    return () => {
      delete (window as any).__foundationPlayer;
    };
  }, []);

  // Resolve embed URL via server API
  useEffect(() => {
    let cancelled = false;

    async function resolveEmbed() {
      setLoading(true);
      setError(null);
      try {
        const headers: Record<string, string> = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const url = `/api/foundation/chapters/${chapterId}/video-embed${!token ? '' : `?token=${encodeURIComponent(token)}`}`;
        const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });

        if (!cancelled) {
          if (res.ok) {
            const data = await res.json();
            setEmbedUrl(data.embedUrl);
          } else {
            // Fallback to client-side conversion
            console.warn('Video embed API failed, using client-side fallback');
            setEmbedUrl(toEmbedUrl(videoUrl));
          }
        }
      } catch {
        if (!cancelled) {
          setEmbedUrl(toEmbedUrl(videoUrl));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    resolveEmbed();
    return () => { cancelled = true; };
  }, [chapterId, videoUrl, token]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', bgcolor: '#000' }}>
        <CircularProgress size={32} sx={{ color: 'white' }} />
      </Box>
    );
  }

  if (error || !embedUrl) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', bgcolor: '#000', color: 'white', gap: 1 }}>
        <Typography variant="body2">{error || 'Could not load video'}</Typography>
        <Typography
          variant="caption"
          component="a"
          href={videoUrl}
          target="_blank"
          rel="noopener noreferrer"
          sx={{ color: 'primary.light', textDecoration: 'underline' }}
        >
          Open in SharePoint
        </Typography>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        position: 'relative',
        width: '100%',
        height: '100%',
        bgcolor: '#000',
      }}
    >
      <iframe
        ref={iframeRef}
        src={embedUrl}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          border: 'none',
        }}
        allow="autoplay; encrypted-media; fullscreen"
        allowFullScreen
        title="SharePoint Video"
      />
    </Box>
  );
}
