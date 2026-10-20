'use client';

import { useEffect, useState } from 'react';
import { tokens as t } from '@/design-system';

/** The QR drawn on the client from a server-given upi:// link; nothing is fetched. */
export function useQrSvg(payload: string | null): string | null {
  const [svg, setSvg] = useState<string | null>(null);
  useEffect(() => {
    if (!payload) {
      setSvg(null);
      return;
    }
    let alive = true;
    import('qrcode')
      .then((QR) => QR.toString(payload, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: t.navy900, light: t.surface } }))
      .then((out) => alive && setSvg(out))
      .catch(() => alive && setSvg(null));
    return () => {
      alive = false;
    };
  }, [payload]);
  return svg;
}

/** Render an SVG string to a PNG blob on a white square canvas. */
export function svgToPng(svg: string, size: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) return resolve(null);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, size, size);
      const pad = Math.round(size * 0.06);
      ctx.drawImage(img, pad, pad, size - pad * 2, size - pad * 2);
      canvas.toBlob((b) => resolve(b), 'image/png');
    };
    img.onerror = () => resolve(null);
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

/** Hand the browser a file to save (Downloads on Android, which the gallery picker can open). */
export function downloadBlob(blob: Blob, filename: string): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
