import { Metadata } from 'next';
import { NOT_FOUND_LINKS } from '@/lib/not-found-links';

export const metadata: Metadata = {
  title: 'Page Not Found | Neram Classes',
  description: 'The page you are looking for does not exist. Browse our courses, coaching centers, or apply for NATA/JEE Paper 2 preparation.',
  robots: { index: false, follow: true },
};

// The root layout is a pass-through (html and body live in [locale]/layout.tsx),
// so this page, used only for paths outside [locale], must render its own.
export default function NotFound() {
  return (
    <html lang="en">
      <body style={{ margin: 0 }}>
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#060d1f',
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        color: '#ffffff',
      }}
    >
      <div style={{ textAlign: 'center', padding: '24px', maxWidth: '520px' }}>
        <div
          style={{
            fontSize: '72px',
            fontWeight: 800,
            margin: '0 0 8px',
            color: '#e8a020',
            lineHeight: 1,
          }}
        >
          404
        </div>
        <h1
          style={{
            fontSize: '22px',
            fontWeight: 600,
            margin: '0 0 12px',
            color: '#ffffff',
          }}
        >
          Page Not Found
        </h1>
        <p
          style={{
            fontSize: '15px',
            lineHeight: 1.6,
            margin: '0 0 32px',
            color: 'rgba(255, 255, 255, 0.7)',
          }}
        >
          Sorry, the page you&apos;re looking for doesn&apos;t exist or has been moved.
          Try one of these popular pages:
        </p>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            marginBottom: '32px',
          }}
        >
          {NOT_FOUND_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              style={{
                padding: '13px 20px',
                fontSize: '16px',
                fontWeight: 500,
                border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: '8px',
                color: '#ffffff',
                textDecoration: 'none',
                transition: 'all 0.2s',
              }}
            >
              {link.label}
            </a>
          ))}
        </div>
        <a
          href="/"
          style={{
            padding: '12px 32px',
            fontSize: '15px',
            fontWeight: 600,
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            backgroundColor: '#e8a020',
            color: '#060d1f',
            textDecoration: 'none',
            display: 'inline-block',
          }}
        >
          Go to Homepage
        </a>
      </div>
    </div>
      </body>
    </html>
  );
}
