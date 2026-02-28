import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'Neram Classes - Best NATA Coaching in India';
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
          alignItems: 'center',
          justifyContent: 'center',
          padding: '60px',
        }}
      >
        <div
          style={{
            fontSize: 72,
            fontWeight: 800,
            color: 'white',
            textAlign: 'center',
            lineHeight: 1.2,
          }}
        >
          Neram Classes
        </div>
        <div
          style={{
            fontSize: 36,
            color: '#90caf9',
            marginTop: 20,
            textAlign: 'center',
          }}
        >
          #1 NATA & JEE Paper 2 Coaching
        </div>
        <div
          style={{
            display: 'flex',
            gap: 40,
            marginTop: 40,
            color: 'white',
            fontSize: 24,
          }}
        >
          <span>99.9% Success Rate</span>
          <span>5000+ Students</span>
          <span>150+ Cities</span>
        </div>
        <div
          style={{
            fontSize: 20,
            color: '#bbdefb',
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
