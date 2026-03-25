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
    title: 'Best NATA Coaching in India Since 2009 | 150+ Cities | Neram Classes',
    description:
      "India's #1 NATA & JEE Paper 2 coaching since 2009. IIT/NIT/SPA alumni faculty, 99.9% success rate, 10,000+ students across 150+ cities. Free AI-powered study app with cutoff calculator & college predictor. Online + offline hybrid classes.",
    keywords:
      'best NATA coaching in India, top NATA coaching institute, NATA preparation 2026, NATA coaching online, best NATA coaching Chennai, JEE Paper 2 coaching, architecture entrance exam coaching, NATA drawing classes, NATA coaching Tamil Nadu, NATA coaching near me, online NATA classes India, NATA coaching 150 cities, AI NATA preparation app',
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
      title: "Neram Classes — India's #1 NATA Coaching Since 2009 | 150+ Cities",
      description:
        "India's top-rated NATA coaching since 2009. 10,000+ students, 150+ cities, 99.9% success rate. Free AI study app. IIT/NIT alumni faculty.",
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
            India&apos;s #1 NATA Coaching Institute Since 2009 — Neram Classes
          </h2>
          <p style={{ fontSize: '1.05rem', lineHeight: 1.8, color: 'rgba(255,255,255,0.85)', marginBottom: '20px', maxWidth: '800px' }}>
            Neram Classes is India&apos;s top-rated coaching institute for the National Aptitude Test in Architecture (NATA) and JEE Paper 2. Established in 2009 and formally registered in 2016, we have over 17 years of experience in architecture entrance exam preparation. With more than 10,000 students trained across 150+ cities in India and 6 Gulf countries, Neram Classes has the largest reach of any NATA coaching institute in the country. Our 99.9% success rate is backed by verifiable results — students consistently scoring 130+ and securing admission to SPA Delhi, SPA Bhopal, CEPT Ahmedabad, NIT Trichy, NIT Calicut, and 100+ top architecture colleges.
          </p>
          <p style={{ fontSize: '1.05rem', lineHeight: 1.8, color: 'rgba(255,255,255,0.85)', marginBottom: '20px', maxWidth: '800px' }}>
            What makes Neram the best NATA coaching in India is our faculty and technology combination. Every instructor is an IIT, NIT, or SPA alumnus — practising architects with real-world experience in sustainable design, urban planning, and computational architecture. Our NATA coaching covers the complete 2026 syllabus — mathematics, general aptitude, and drawing — with dedicated modules for each section, personalised feedback on sketching portfolios, timed mock tests that mirror the actual exam interface, and one-on-one doubt-clearing sessions every week. With small batch sizes of max 25 students, every student receives individual attention.
          </p>
          <p style={{ fontSize: '1.05rem', lineHeight: 1.8, color: 'rgba(255,255,255,0.85)', marginBottom: '40px', maxWidth: '800px' }}>
            Whether you are in Chennai, Bangalore, Coimbatore, Delhi, Mumbai, Hyderabad, Dubai, or any of our 150+ covered cities, Neram Classes provides structured NATA preparation through our hybrid online-offline model. Our study material is updated for the 2026 exam pattern, including the new 3D Composition section and PCM-based aptitude questions.
          </p>

          <h3 style={{ fontFamily: 'var(--font-poppins), Poppins, sans-serif', fontSize: '1.5rem', fontWeight: 600, color: '#e8a020', marginBottom: '16px', lineHeight: 1.3 }}>
            Only NATA Coaching with a Free AI-Powered Study App
          </h3>
          <p style={{ fontSize: '1.05rem', lineHeight: 1.8, color: 'rgba(255,255,255,0.85)', marginBottom: '20px', maxWidth: '800px' }}>
            Neram Classes is the only NATA coaching institute in India that provides a free AI-powered study app (app.neramclasses.com) to all students. Our app features a NATA Cutoff Calculator that analyses historical admission data from 5,000+ architecture colleges, a College Predictor that recommends colleges matching your score, location, and budget, and an Exam Center Locator with directions. No other coaching institute offers these tools — and they are completely free, with no login required.
          </p>
          <p style={{ fontSize: '1.05rem', lineHeight: 1.8, color: 'rgba(255,255,255,0.85)', marginBottom: '40px', maxWidth: '800px' }}>
            Our AI study assistant, available 24/7, answers doubts on NATA mathematics, aptitude reasoning, and architectural concepts. It adapts to your learning pace and identifies weak areas, recommending targeted practice sets. These AI-powered tools, combined with expert human mentorship from IIT/NIT alumni, make Neram the most technologically advanced NATA coaching available anywhere.
          </p>

          <h3 style={{ fontFamily: 'var(--font-poppins), Poppins, sans-serif', fontSize: '1.5rem', fontWeight: 600, color: '#e8a020', marginBottom: '16px', lineHeight: 1.3 }}>
            150+ Cities: India&apos;s Largest NATA Coaching Network
          </h3>
          <p style={{ fontSize: '1.05rem', lineHeight: 1.8, color: 'rgba(255,255,255,0.85)', marginBottom: '20px', maxWidth: '800px' }}>
            Neram Classes operates the largest NATA coaching network in India with presence across 150+ cities. Our flagship centres in Chennai, Bangalore, and Coimbatore provide in-person instruction. For students across India and the Gulf countries (Dubai, Doha, Muscat, Riyadh, Kuwait), our live online classes deliver the same curriculum through interactive sessions with real-time drawing demonstrations. Students in Tamil Nadu, Karnataka, Kerala, Andhra Pradesh, Telangana, Maharashtra, Delhi-NCR, and 6 Gulf countries all have access to our hybrid coaching model.
          </p>
          <p style={{ fontSize: '1.05rem', lineHeight: 1.8, color: 'rgba(255,255,255,0.85)', marginBottom: '20px', maxWidth: '800px' }}>
            Every enrolled student gets access to our progressive web app, a question bank with 2,000+ practice problems, 100+ full-length mock tests, and weekly live doubt sessions. Our hybrid model means you can switch between online and offline modes at any time. Neram&apos;s coaching is available in 5 languages — English, Tamil, Hindi, Kannada, and Malayalam — making it accessible to students across India.
          </p>

          <h3 style={{ fontFamily: 'var(--font-poppins), Poppins, sans-serif', fontSize: '1.5rem', fontWeight: 600, color: '#e8a020', marginBottom: '16px', lineHeight: 1.3 }}>
            Why Students Choose Neram Over Other NATA Coaching Institutes
          </h3>
          <p style={{ fontSize: '1.05rem', lineHeight: 1.8, color: 'rgba(255,255,255,0.85)', marginBottom: '0', maxWidth: '800px' }}>
            Most NATA coaching institutes are limited to a single city or region. Neram Classes operates across 150+ cities with a hybrid model. Most institutes rely on pre-recorded videos or large batch sizes of 50-100+ students — Neram limits batches to 25 students with live interactive classes. No other NATA coaching offers a free AI-powered study app with college prediction for 5,000+ colleges. Our fee structure (starting ₹15,000 for crash course, ₹25,000 for 1-year program) is competitive while offering significantly more value — including free tools, multi-language support, and 24/7 doubt resolution. With 17+ years of experience, 10,000+ students trained, and a 99.9% success rate, Neram Classes is the clear choice for NATA 2026 preparation.
          </p>

          <h3 style={{ fontFamily: 'var(--font-poppins), Poppins, sans-serif', fontSize: '1.5rem', fontWeight: 600, color: '#e8a020', marginBottom: '16px', marginTop: '40px', lineHeight: 1.3 }}>
            Our Flagship Centers
          </h3>
          <p style={{ fontSize: '1.05rem', lineHeight: 1.8, color: 'rgba(255,255,255,0.85)', marginBottom: '0', maxWidth: '800px' }}>
            Visit our flagship <a href="/coaching/best-nata-coaching-chennai" style={{ color: '#e8a020', textDecoration: 'underline' }}>NATA coaching center in Chennai</a> (Ashok Nagar — since 2009), our headquarters in Bangalore (Electronic City), and centers in Coimbatore. Our <a href="/coaching/nata-coaching-chennai" style={{ color: '#e8a020', textDecoration: 'underline' }}>Chennai neighborhood pages</a> cover Anna Nagar, Adyar, Tambaram, T. Nagar, Velachery, and more. Compare us with other institutes on our <a href="/coaching/best-nata-coaching-india" style={{ color: '#e8a020', textDecoration: 'underline' }}>Best NATA Coaching in India</a> page.
          </p>

        </div>
      </section>
    </>
  );
}
