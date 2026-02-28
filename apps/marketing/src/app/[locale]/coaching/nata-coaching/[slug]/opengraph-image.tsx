import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'NATA Coaching - Neram Classes';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image({ params }: { params: { slug: string } }) {
  const city = params.slug.replace('nata-coaching-centers-in-', '');
  const cityDisplay = city
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

  return new ImageResponse(
    (
      <div
        style={{
          background: 'linear-gradient(135deg, #1a237e 0%, #0d47a1 100%)',
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
            fontSize: 28,
            color: '#90caf9',
            textTransform: 'uppercase',
            letterSpacing: 3,
            marginBottom: 16,
          }}
        >
          Best NATA Coaching in
        </div>
        <div
          style={{
            fontSize: 64,
            fontWeight: 800,
            color: 'white',
            textAlign: 'center',
          }}
        >
          {cityDisplay}
        </div>
        <div
          style={{
            fontSize: 32,
            color: '#bbdefb',
            marginTop: 24,
          }}
        >
          Neram Classes
        </div>
        <div
          style={{
            display: 'flex',
            gap: 30,
            marginTop: 30,
            color: 'white',
            fontSize: 20,
          }}
        >
          <span>IIT/NIT Faculty</span>
          <span>99.9% Success Rate</span>
          <span>Online & Offline</span>
        </div>
      </div>
    ),
    { ...size }
  );
}
