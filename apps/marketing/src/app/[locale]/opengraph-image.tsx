import { ImageResponse } from 'next/og';
import { siteTokens as t } from '@neram/ui/site-tokens';

export const runtime = 'edge';
export const alt = 'Neram Classes - Best NATA Coaching in India';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          background: t.navy900,
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '60px',
        }}
      >
        <div
          style={{
            fontSize: 72,
            fontWeight: 800,
            color: t.paper,
            textAlign: 'center',
            lineHeight: 1.2,
          }}
        >
          Neram Classes
        </div>
        <div
          style={{
            fontSize: 36,
            color: t.gold500,
            marginTop: 20,
            textAlign: 'center',
          }}
        >
          NATA & JEE Paper 2 Coaching Since 2009
        </div>
        <div
          style={{
            display: 'flex',
            gap: 40,
            marginTop: 40,
            color: t.paper,
            fontSize: 24,
          }}
        >
          <span>10+ Years</span>
          <span>1,000+ Students</span>
          <span>AIR 1 JEE B.Arch 2024</span>
        </div>
        <div
          style={{
            fontSize: 20,
            color: t.paperSubtle,
            marginTop: 30,
          }}
        >
          neramclasses.com | +91-9176137043
        </div>
      </div>
    ),
    { ...size }
  );
}
