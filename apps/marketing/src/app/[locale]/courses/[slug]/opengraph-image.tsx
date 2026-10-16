import { ImageResponse } from 'next/og';
import { siteTokens as t } from '@neram/ui/site-tokens';

export const runtime = 'edge';
export const alt = 'Neram Classes Course';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image({ params }: { params: { slug: string } }) {
  const courseName = params.slug
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

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
            fontSize: 24,
            color: t.gold500,
            textTransform: 'uppercase',
            letterSpacing: 3,
            marginBottom: 16,
          }}
        >
          Neram Classes Course
        </div>
        <div
          style={{
            fontSize: 52,
            fontWeight: 800,
            color: t.paper,
            textAlign: 'center',
            lineHeight: 1.2,
            maxWidth: '80%',
          }}
        >
          {courseName}
        </div>
        <div
          style={{
            display: 'flex',
            gap: 30,
            marginTop: 40,
            color: t.paperMuted,
            fontSize: 22,
          }}
        >
          <span>Expert Faculty</span>
          <span>Comprehensive Material</span>
          <span>Proven Results</span>
        </div>
        <div
          style={{
            fontSize: 18,
            color: t.paperSubtle,
            marginTop: 24,
          }}
        >
          neramclasses.com | Enroll Now
        </div>
      </div>
    ),
    { ...size }
  );
}
