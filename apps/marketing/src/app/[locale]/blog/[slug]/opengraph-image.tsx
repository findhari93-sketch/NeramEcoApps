import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'Neram Classes Blog';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image({ params }: { params: { slug: string } }) {
  const title = params.slug
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

  return new ImageResponse(
    (
      <div
        style={{
          background: 'linear-gradient(135deg, #ec407a 0%, #d81b60 100%)',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          justifyContent: 'flex-end',
          padding: '60px',
        }}
      >
        <div
          style={{
            fontSize: 20,
            color: '#fce4ec',
            marginBottom: 16,
            textTransform: 'uppercase',
            letterSpacing: 2,
          }}
        >
          Neram Classes Blog
        </div>
        <div
          style={{
            fontSize: 48,
            fontWeight: 800,
            color: 'white',
            lineHeight: 1.2,
            maxWidth: '80%',
          }}
        >
          {title}
        </div>
        <div
          style={{
            fontSize: 20,
            color: '#f8bbd0',
            marginTop: 24,
          }}
        >
          neramclasses.com
        </div>
      </div>
    ),
    { ...size }
  );
}
