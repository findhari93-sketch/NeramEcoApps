'use client';

import { useEffect, useRef } from 'react';
import { Box } from '@neram/ui';

interface SharePointPlayerProps {
  videoUrl: string;
}

/**
 * Decodes a SharePoint sharing ID (base64url) to extract the file's UniqueId GUID.
 * Sharing IDs encode: [type byte][padding byte][16-byte GUID (mixed-endian)]...
 */
function extractGuidFromSharingId(encodedId: string): string | null {
  try {
    // base64url → standard base64
    const base64 = encodedId.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const binary = atob(padded);

    // Need at least 18 bytes: 1 type + 1 padding + 16 GUID
    if (binary.length < 18) return null;

    // Skip first 2 bytes (type=0x21 for file, padding=0x00)
    // Bytes 2-17 are the file's UniqueId in mixed-endian GUID format
    const b = (i: number) => binary.charCodeAt(i);

    // GUID mixed-endian: Data1(4 LE) - Data2(2 LE) - Data3(2 LE) - Data4(8 BE)
    const hex = (v: number) => v.toString(16).padStart(2, '0');
    const data1 = [b(5), b(4), b(3), b(2)].map(hex).join('');
    const data2 = [b(7), b(6)].map(hex).join('');
    const data3 = [b(9), b(8)].map(hex).join('');
    const data4 = [b(10), b(11)].map(hex).join('');
    const data5 = [b(12), b(13), b(14), b(15), b(16), b(17)].map(hex).join('');

    return `${data1}-${data2}-${data3}-${data4}-${data5}`;
  } catch {
    return null;
  }
}

/**
 * Converts a SharePoint/Stream video URL to an embeddable format.
 * Supports:
 *  - https://...sharepoint.com/sites/.../stream.aspx?id=...  (browser address bar)
 *  - https://...sharepoint.com/:v:/s/site/ID?...              (sharing link)
 *  - https://web.microsoftstream.com/video/...                (Stream classic)
 *  - Direct embed URLs (returned as-is)
 */
export function toEmbedUrl(url: string): string {
  try {
    const u = new URL(url);

    // Already an embed URL
    if (u.pathname.includes('embed.aspx')) {
      return url;
    }

    // SharePoint stream.aspx?id=... → embed.aspx (keep id param)
    if (u.pathname.includes('stream.aspx')) {
      const embedPathname = u.pathname.replace('stream.aspx', 'embed.aspx');
      return `${u.origin}${embedPathname}?${u.searchParams.toString()}`;
    }

    // SharePoint sharing link (/:v:/s/siteName/ENCODED_ID?...)
    // → extract UniqueId from base64 ID → build embed.aspx URL
    if (u.pathname.match(/\/:v:\//)) {
      const pathParts = u.pathname.split('/');
      // Path: /:v:/s/siteName/encodedId  or  /:v:/r/siteName/encodedId
      const vIdx = pathParts.indexOf(':v:');
      if (vIdx >= 0 && vIdx + 3 < pathParts.length) {
        const siteName = pathParts[vIdx + 2];
        const encodedId = pathParts[vIdx + 3];
        const guid = extractGuidFromSharingId(encodedId);
        if (guid) {
          return `${u.origin}/sites/${siteName}/_layouts/15/embed.aspx?UniqueId=${guid}&embed=%7B%22ust%22%3Atrue%2C%22hv%22%3A%22CopyEmbedCode%22%7D&referrer=StreamWebApp&referrerScenario=EmbedDialog.Create`;
        }
      }
    }

    // Microsoft Stream classic (web.microsoftstream.com)
    if (u.hostname.includes('microsoftstream.com')) {
      const videoId = u.pathname.split('/video/')[1]?.split('/')[0];
      if (videoId) {
        return `https://web.microsoftstream.com/embed/video/${videoId}`;
      }
    }

    // If nothing matched, try using it directly as an embed src
    return url;
  } catch {
    return url;
  }
}

export default function SharePointPlayer({ videoUrl }: SharePointPlayerProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Register a minimal player interface on window (no-op since we can't control the iframe)
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

  const embedUrl = toEmbedUrl(videoUrl);

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
