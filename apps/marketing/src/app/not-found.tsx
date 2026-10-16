import { Metadata } from 'next';
import { siteTokens as t } from '@neram/ui/site-tokens';
import { NOT_FOUND_LINKS } from '@/lib/not-found-links';

// The Inter variable is not defined when this renders outside [locale]/layout, and an
// undefined var() voids the whole font stack (serif). Give it a fallback.
const fontFamily = t.fontSans.replace('var(--font-inter)', 'var(--font-inter, "Inter")');

export const metadata: Metadata = {
  title: 'Page Not Found | Neram Classes',
  description: 'The page you are looking for does not exist. Browse our courses, coaching centers, or apply for NATA/JEE Paper 2 preparation.',
  robots: { index: false, follow: true },
};

// This page has no MUI theme or global CSS, so hover and focus states live in
// one small stylesheet built from the site tokens.
const css = `
.nf-link{transition:border-color 150ms ease}
.nf-link:hover{border-color:${t.gold500}}
.nf-primary{transition:background-color 150ms ease}
.nf-primary:hover{background-color:${t.gold300}}
a:focus-visible{outline:${t.focusOutline};outline-offset:2px}
`;

// The root layout is a pass-through (html and body live in [locale]/layout.tsx),
// so this page renders its own. It is the 404 for every URL that matches no
// route (including unknown /blog and /courses slugs, which set dynamicParams =
// false): a light static page with no site chrome and no translation bundle,
// served without rendering or caching a page per junk URL.
export default function NotFound() {
  return (
    <html lang="en">
      <body style={{ margin: 0, backgroundColor: t.ground }}>
        <style>{css}</style>
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: t.ground,
            fontFamily,
            color: t.ink,
          }}
        >
          <main style={{ boxSizing: 'border-box', width: '100%', maxWidth: '520px', padding: '48px 16px', textAlign: 'center' }}>
            <p
              style={{
                fontFamily: t.fontMono,
                fontSize: '12px',
                fontWeight: 700,
                letterSpacing: '0.2em',
                textTransform: 'uppercase',
                color: t.gold800,
                margin: '0 0 12px',
              }}
            >
              Error 404
            </p>
            <h1 style={{ fontSize: '28px', fontWeight: 700, lineHeight: 1.25, margin: '0 0 12px', color: t.ink }}>
              Page Not Found
            </h1>
            <p style={{ fontSize: '16px', lineHeight: 1.6, margin: '0 0 32px', color: t.inkMuted }}>
              Sorry, the page you&apos;re looking for doesn&apos;t exist or has been moved.
              Try one of these popular pages:
            </p>
            <nav aria-label="Popular pages" style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '32px' }}>
              {NOT_FOUND_LINKS.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  className="nf-link"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    boxSizing: 'border-box',
                    minHeight: '48px',
                    padding: '12px 20px',
                    fontSize: '16px',
                    fontWeight: 500,
                    textAlign: 'left',
                    backgroundColor: t.surface,
                    border: `1px solid ${t.line}`,
                    borderRadius: `${t.radius}px`,
                    color: t.ink,
                    textDecoration: 'none',
                  }}
                >
                  {link.label}
                </a>
              ))}
            </nav>
            <a
              href="/"
              className="nf-primary"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxSizing: 'border-box',
                minHeight: '48px',
                padding: '12px 32px',
                fontSize: '16px',
                fontWeight: 700,
                borderRadius: `${t.radius}px`,
                backgroundColor: t.gold500,
                color: t.navy900,
                textDecoration: 'none',
              }}
            >
              Go to Homepage
            </a>
          </main>
        </div>
      </body>
    </html>
  );
}
