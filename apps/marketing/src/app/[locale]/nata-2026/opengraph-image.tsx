import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'NATA 2026 Complete Guide — Neram Classes';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          background: 'linear-gradient(135deg, #1a237e 0%, #0d47a1 50%, #1565c0 100%)',
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
              background: 'rgba(255,255,255,0.15)',
              borderRadius: 8,
              padding: '8px 16px',
              fontSize: 20,
              color: '#90caf9',
              fontWeight: 600,
            }}
          >
            NATA 2026
          </div>
          <div style={{ fontSize: 20, color: 'rgba(255,255,255,0.6)' }}>
            NERAM CLASSES
          </div>
        </div>

        <div>
          <div
            style={{
              fontSize: 56,
              fontWeight: 800,
              color: 'white',
              lineHeight: 1.2,
              maxWidth: '90%',
            }}
          >
            Complete NATA 2026 Guide
          </div>
          <div
            style={{
              fontSize: 28,
              color: '#90caf9',
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
              color: 'white',
              fontSize: 18,
            }}
          >
            <span>200 Marks</span>
            <span>3 Hours</span>
            <span>April–June 2026</span>
          </div>
          <div style={{ fontSize: 16, color: '#bbdefb' }}>neramclasses.com</div>
        </div>
      </div>
    ),
    { ...size }
  );
}
