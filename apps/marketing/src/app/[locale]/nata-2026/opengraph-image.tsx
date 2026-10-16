import { ImageResponse } from 'next/og';
import { siteTokens as t } from '@neram/ui/site-tokens';

export const runtime = 'edge';
export const alt = 'NATA 2026 Complete Guide by Neram Classes';
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
          justifyContent: 'space-between',
          padding: '60px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div
            style={{
              background: t.goldTintBg,
              borderRadius: 8,
              padding: '8px 16px',
              fontSize: 20,
              color: t.gold500,
              fontWeight: 600,
            }}
          >
            NATA 2026
          </div>
          <div style={{ fontSize: 20, color: t.paperSubtle }}>
            NERAM CLASSES
          </div>
        </div>

        <div>
          <div
            style={{
              fontSize: 56,
              fontWeight: 800,
              color: t.paper,
              lineHeight: 1.2,
              maxWidth: '90%',
            }}
          >
            Complete NATA 2026 Guide
          </div>
          <div
            style={{
              fontSize: 28,
              color: t.paperMuted,
              marginTop: 16,
            }}
          >
            Eligibility • Syllabus • Exam Pattern • Drawing Test • Coaching
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
          }}
        >
          <div
            style={{
              display: 'flex',
              gap: 32,
              color: t.paper,
              fontSize: 18,
            }}
          >
            <span>200 Marks</span>
            <span>3 Hours</span>
            <span>April–June 2026</span>
          </div>
          <div style={{ fontSize: 16, color: t.paperSubtle }}>neramclasses.com</div>
        </div>
      </div>
    ),
    { ...size }
  );
}
