import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';

export const runtime = 'edge';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const title = searchParams.get('title') || 'Neram Classes';
  const subtitle = searchParams.get('subtitle') || '';
  const type = searchParams.get('type') || 'default';

  const gradients: Record<string, string> = {
    nata: 'linear-gradient(135deg, #1a237e 0%, #0d47a1 100%)',
    coaching: 'linear-gradient(135deg, #004d40 0%, #00695c 100%)',
    blog: 'linear-gradient(135deg, #1b5e20 0%, #2e7d32 100%)',
    tool: 'linear-gradient(135deg, #4a148c 0%, #6a1b9a 100%)',
    default: 'linear-gradient(135deg, #1a237e 0%, #0d47a1 50%, #1565c0 100%)',
  };

  return new ImageResponse(
    (
      <div
        style={{
          background: gradients[type] || gradients.default,
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '60px',
        }}
      >
        <div style={{ fontSize: 24, color: 'rgba(255,255,255,0.6)', fontWeight: 600 }}>
          NERAM CLASSES
        </div>

        <div>
          <div
            style={{
              fontSize: title.length > 40 ? 48 : 56,
              fontWeight: 800,
              color: 'white',
              lineHeight: 1.2,
              maxWidth: '90%',
            }}
          >
            {title}
          </div>
          {subtitle && (
            <div style={{ fontSize: 24, color: '#90caf9', marginTop: 16 }}>
              {subtitle}
            </div>
          )}
        </div>

        <div style={{ fontSize: 18, color: '#bbdefb' }}>neramclasses.com</div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
