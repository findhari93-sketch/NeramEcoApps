import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { JsonLd } from '@/components/seo/JsonLd';
import { generateOrganizationSchema, generateWebSiteSchema, generateBreadcrumbSchema, generateSoftwareApplicationSchema } from '@/lib/seo/schemas';
import HomePageContent from '@/components/HomePageContent';

const baseUrl = 'https://neramclasses.com';

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return {
    title: 'Best NATA Coaching India 2026',
    description:
      "India's top NATA & JEE Paper 2 coaching. IIT/NIT alumni faculty, 99.9% success rate. Online & offline classes across India. Free demo available.",
    keywords:
      'NATA coaching, best NATA coaching India, NATA preparation 2026, JEE Paper 2 coaching, architecture entrance exam, online NATA classes, NATA coaching Tamil Nadu, NATA coaching online, architecture entrance coaching India, NATA drawing classes, NATA mathematics coaching',
    alternates: {
      canonical: locale === 'en' ? baseUrl : `${baseUrl}/${locale}`,
      languages: {
        en: baseUrl,
        ta: `${baseUrl}/ta`,
        hi: `${baseUrl}/hi`,
        kn: `${baseUrl}/kn`,
        ml: `${baseUrl}/ml`,
        'x-default': baseUrl,
      },
    },
    openGraph: {
      title: 'Neram Classes - Best NATA & JEE Paper 2 Coaching in India',
      description:
        "India's top NATA coaching institute. IIT/NIT alumni faculty, online & offline classes. Join 5000+ successful students.",
      type: 'website',
      url: locale === 'en' ? baseUrl : `${baseUrl}/${locale}`,
    },
  };
}

export default function HomePage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  setRequestLocale(locale);

  return (
    <>
      <JsonLd data={generateOrganizationSchema()} />
      <JsonLd data={generateWebSiteSchema()} />
      <JsonLd
        data={generateBreadcrumbSchema([
          { name: 'Home', url: baseUrl },
        ])}
      />
      <JsonLd data={generateSoftwareApplicationSchema()} />
      <HomePageContent />

      {/* SEO Content — server-rendered for full crawler visibility */}
      <section style={{ backgroundColor: '#060d1f', color: '#ffffff', padding: '64px 0' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 24px' }}>

          <h2 style={{ fontFamily: 'var(--font-poppins), Poppins, sans-serif', fontSize: '2rem', fontWeight: 700, color: '#e8a020', marginBottom: '24px', lineHeight: 1.3 }}>
            Why Neram Classes for NATA 2026?
          </h2>
          <p style={{ fontSize: '1.05rem', lineHeight: 1.8, color: 'rgba(255,255,255,0.85)', marginBottom: '20px', maxWidth: '800px' }}>
            Neram Classes is India&apos;s premier coaching institute for the National Aptitude Test in Architecture (NATA) and JEE Paper 2. Founded by IIT and NIT alumni, our program has helped over 5,000 students secure admission to top architecture colleges across India since our inception. Our 2026 batch programme builds on a proven track record of a 99.9% success rate, combining rigorous academic preparation with hands-on drawing and design practice.
          </p>
          <p style={{ fontSize: '1.05rem', lineHeight: 1.8, color: 'rgba(255,255,255,0.85)', marginBottom: '20px', maxWidth: '800px' }}>
            What sets Neram apart is our faculty. Every instructor is a practising architect or designer with real-world experience in sustainable design, urban planning, and computational architecture. Our NATA coaching covers the complete syllabus — mathematics, general aptitude, and drawing — with dedicated modules for each section. Students receive personalised feedback on their sketching portfolio, timed mock tests that mirror the actual exam interface, and one-on-one doubt-clearing sessions every week.
          </p>
          <p style={{ fontSize: '1.05rem', lineHeight: 1.8, color: 'rgba(255,255,255,0.85)', marginBottom: '40px', maxWidth: '800px' }}>
            Whether you are aiming for the School of Planning and Architecture (SPA), Chandigarh College of Architecture, or any of the 450+ B.Arch colleges that accept NATA scores, Neram Classes provides the structured preparation you need. Our study material is updated for the 2026 exam pattern, including the new PCM-based aptitude questions and digital drawing components.
          </p>

          <h3 style={{ fontFamily: 'var(--font-poppins), Poppins, sans-serif', fontSize: '1.5rem', fontWeight: 600, color: '#e8a020', marginBottom: '16px', lineHeight: 1.3 }}>
            AI-Powered Architecture Entrance Preparation
          </h3>
          <p style={{ fontSize: '1.05rem', lineHeight: 1.8, color: 'rgba(255,255,255,0.85)', marginBottom: '20px', maxWidth: '800px' }}>
            Neram Classes integrates artificial intelligence into every stage of your NATA and JEE Paper 2 preparation. Our AI-powered NATA Cutoff Calculator analyses historical admission data from over 200 architecture colleges to predict your chances of admission based on your expected score. The College Predictor tool uses machine learning to recommend colleges that match your rank, location preference, and fee budget — saving you hours of manual research during the counselling process.
          </p>
          <p style={{ fontSize: '1.05rem', lineHeight: 1.8, color: 'rgba(255,255,255,0.85)', marginBottom: '40px', maxWidth: '800px' }}>
            Our AI study assistant, available 24/7, answers doubts on NATA mathematics, aptitude reasoning, and architectural concepts. It adapts to your learning pace and identifies weak areas in your preparation, recommending targeted practice sets. These tools, combined with expert human mentorship, ensure that every student receives a personalised coaching experience, regardless of whether they attend online or offline classes.
          </p>

          <h3 style={{ fontFamily: 'var(--font-poppins), Poppins, sans-serif', fontSize: '1.5rem', fontWeight: 600, color: '#e8a020', marginBottom: '16px', lineHeight: 1.3 }}>
            Online &amp; Offline NATA Classes Across India
          </h3>
          <p style={{ fontSize: '1.05rem', lineHeight: 1.8, color: 'rgba(255,255,255,0.85)', marginBottom: '20px', maxWidth: '800px' }}>
            Neram Classes offers both online and offline coaching for NATA 2026 and JEE Paper 2. Our flagship centres in Tamil Nadu provide in-person instruction with small batch sizes of 15 students, ensuring individual attention. For students across India and the Gulf countries, our live online classes deliver the same curriculum through interactive sessions with real-time drawing demonstrations and screen sharing.
          </p>
          <p style={{ fontSize: '1.05rem', lineHeight: 1.8, color: 'rgba(255,255,255,0.85)', marginBottom: '0', maxWidth: '800px' }}>
            Every enrolled student gets access to our progressive web app, which includes recorded lectures, a question bank with over 2,000 practice problems, and weekly full-length mock tests. Our hybrid model means you can switch between online and offline modes at any time during your preparation. Neram&apos;s architecture entrance coaching programme is designed for students in Class 11, Class 12, and repeaters — whether you are preparing for your first NATA attempt or targeting a higher score in your second sitting.
          </p>

        </div>
      </section>
    </>
  );
}
