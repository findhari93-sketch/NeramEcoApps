import { ImageResponse } from 'next/og';
import { siteTokens as t } from '@neram/ui/site-tokens';
import { NextRequest } from 'next/server';

export const runtime = 'edge';

// Every card shares the navy900 ground of the 2026 design system; `type`
// picks the gold label in the top row so NATA, coaching, blog and tool cards
// still read differently in a feed.
const TYPE_LABELS: Record<string, string> = {
  nata: 'NATA 2026',
  coaching: 'COACHING',
  blog: 'BLOG',
  tool: 'FREE TOOL',
};

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const title = searchParams.get('title') || 'Neram Classes';
  const subtitle = searchParams.get('subtitle') || '';
  const label = TYPE_LABELS[searchParams.get('type') || ''];

  return new ImageResponse(
    (
      <div
        style={{
          background: t.navy900,
          borderTop: `8px solid ${t.gold500}`,
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '60px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 24, color: t.paperSubtle, fontWeight: 600 }}>NERAM CLASSES</div>
          {label && (
            <div
              style={{
                fontSize: 20,
                fontWeight: 700,
                letterSpacing: 2,
                color: t.gold500,
                border: `2px solid ${t.gold500}`,
                borderRadius: 100,
                padding: '6px 18px',
              }}
            >
              {label}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              fontSize: title.length > 40 ? 48 : 56,
              fontWeight: 800,
              color: t.paper,
              lineHeight: 1.2,
              maxWidth: '90%',
            }}
          >
            {title}
          </div>
          {subtitle && (
            <div style={{ fontSize: 24, color: t.gold500, marginTop: 16 }}>
              {subtitle}
            </div>
          )}
        </div>

        <div style={{ fontSize: 18, color: t.paperSubtle }}>neramclasses.com</div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
