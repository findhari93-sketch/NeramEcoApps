import { Suspense } from 'react';
import { Box, Typography, CircularProgress } from '@neram/ui';
import { JsonLd } from '@/components/seo/JsonLd';
import { generateSoftwareApplicationSchema, generateFAQSchema, generateBreadcrumbSchema } from '@/lib/seo/schemas';
import { TOOLS, FAQS, STATS, STEPS } from '@/lib/landing-data';
import LandingPageContent from '@/components/landing/LandingPageContent';

function LoadingFallback() {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        bgcolor: '#060d1f',
        gap: 2,
      }}
    >
      <CircularProgress sx={{ color: '#e8a020' }} />
      <Typography sx={{ color: '#f5f0e8' }}>Loading...</Typography>
    </Box>
  );
}

export default function HomePage() {
  return (
    <>
      {/* SEO: JSON-LD Structured Data */}
      <JsonLd data={generateSoftwareApplicationSchema()} />
      <JsonLd data={generateFAQSchema([...FAQS])} />
      <JsonLd data={generateBreadcrumbSchema()} />

      <Suspense fallback={<LoadingFallback />}>
        <LandingPageContent />
      </Suspense>

      {/* Server-rendered SEO content — visible to crawlers even before JS loads */}
      <section style={{ backgroundColor: '#060d1f', color: '#ffffff', padding: '64px 0' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 24px' }}>

          <h1 style={{ fontSize: '2rem', fontWeight: 700, color: '#e8a020', marginBottom: '16px', lineHeight: 1.3 }}>
            aiArchitek — Free NATA Exam Preparation Tools by Neram Classes
          </h1>
          <p style={{ fontSize: '1.05rem', lineHeight: 1.8, color: 'rgba(255,255,255,0.85)', marginBottom: '32px', maxWidth: '800px' }}>
            From cutoffs to colleges, aiArchitek is your complete architecture exam companion. Built by Neram Classes (IIT/NIT alumni), our free AI-powered tools help {STATS[0].value} students prepare for NATA 2026. Access India&apos;s largest database of {STATS[1].value} B.Arch colleges, calculate cutoff scores, find exam centers, and practice with community question banks — all from your phone or desktop.
          </p>

          <h2 style={{ fontSize: '1.5rem', fontWeight: 600, color: '#e8a020', marginBottom: '16px', lineHeight: 1.3 }}>
            Free NATA Preparation Tools
          </h2>
          <ul style={{ fontSize: '1rem', lineHeight: 2, color: 'rgba(255,255,255,0.85)', marginBottom: '32px', paddingLeft: '20px', maxWidth: '800px' }}>
            {TOOLS.map((tool) => (
              <li key={tool.id}>
                <a href={tool.href} style={{ color: '#1a8fff', textDecoration: 'none' }}>{tool.title}</a>
                {' — '}{tool.description}
              </li>
            ))}
          </ul>

          <h2 style={{ fontSize: '1.5rem', fontWeight: 600, color: '#e8a020', marginBottom: '16px', lineHeight: 1.3 }}>
            How It Works
          </h2>
          <ol style={{ fontSize: '1rem', lineHeight: 2, color: 'rgba(255,255,255,0.85)', marginBottom: '32px', paddingLeft: '20px', maxWidth: '800px' }}>
            {STEPS.map((step) => (
              <li key={step.number}><strong>{step.title}</strong> — {step.description}</li>
            ))}
          </ol>

          <h2 style={{ fontSize: '1.5rem', fontWeight: 600, color: '#e8a020', marginBottom: '16px', lineHeight: 1.3 }}>
            Why Choose aiArchitek for NATA 2026 Preparation?
          </h2>
          <p style={{ fontSize: '1.05rem', lineHeight: 1.8, color: 'rgba(255,255,255,0.85)', marginBottom: '20px', maxWidth: '800px' }}>
            aiArchitek stands apart from generic exam prep apps because it is purpose-built for architecture entrance exams. Every tool is designed with input from practicing architects and NATA experts at Neram Classes. Our cutoff calculator uses real data from previous NATA sessions, covering section-wise scores and category-based cutoffs (General, OBC, SC, ST). The college predictor maps your NATA score against {STATS[1].value} colleges across all 28 states and 8 union territories of India, including fee structures, placement records, and infrastructure ratings.
          </p>
          <p style={{ fontSize: '1.05rem', lineHeight: 1.8, color: 'rgba(255,255,255,0.85)', marginBottom: '32px', maxWidth: '800px' }}>
            As a Progressive Web App (PWA), aiArchitek can be installed on any device — Android, iOS, Windows, or macOS — and works offline for core features. Whether you are a first-time NATA aspirant from Chennai or a repeat test-taker from Delhi, our tools give you the data-driven edge to plan your architecture education journey with confidence.
          </p>

          <h2 style={{ fontSize: '1.5rem', fontWeight: 600, color: '#e8a020', marginBottom: '16px', lineHeight: 1.3 }}>
            Frequently Asked Questions
          </h2>
          <dl style={{ fontSize: '1rem', lineHeight: 1.8, color: 'rgba(255,255,255,0.85)', marginBottom: '32px', maxWidth: '800px' }}>
            {FAQS.slice(0, 5).map((faq, i) => (
              <div key={i} style={{ marginBottom: '16px' }}>
                <dt style={{ fontWeight: 600, color: '#ffffff' }}>{faq.question}</dt>
                <dd style={{ margin: '4px 0 0 0', color: 'rgba(255,255,255,0.75)' }}>{faq.answer}</dd>
              </div>
            ))}
          </dl>

          <p style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.5)', marginTop: '32px' }}>
            aiArchitek is a product of Neram Classes — India&apos;s premier NATA &amp; JEE Paper 2 coaching institute. Rated {STATS[2].value} by students.
          </p>
        </div>
      </section>
    </>
  );
}
