import type { ReactNode } from 'react';
import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { Box, Typography } from '@neram/ui';
import LocationOnOutlinedIcon from '@mui/icons-material/LocationOnOutlined';
import CalculateOutlinedIcon from '@mui/icons-material/CalculateOutlined';
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import PaymentsOutlinedIcon from '@mui/icons-material/PaymentsOutlined';
import CropOutlinedIcon from '@mui/icons-material/CropOutlined';
import QuizOutlinedIcon from '@mui/icons-material/QuizOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import VerifiedOutlinedIcon from '@mui/icons-material/VerifiedOutlined';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import ChatOutlinedIcon from '@mui/icons-material/ChatOutlined';
import PhoneOutlinedIcon from '@mui/icons-material/PhoneOutlined';
import EmailOutlinedIcon from '@mui/icons-material/EmailOutlined';
import { JsonLd } from '@/components/seo/JsonLd';
import {
  generateBreadcrumbSchema,
  generateFAQSchema,
} from '@/lib/seo/schemas';
import { buildAlternates } from '@/lib/seo/metadata';
import { APP_URL } from '@/lib/seo/constants';
import { buildWhatsAppLink } from '@/lib/whatsapp';
import {
  getActiveNataBrochures,
  getActiveNataFaqs,
  getActiveNataAnnouncements,
  getActiveNataBanners,
} from '@neram/database';
import { NataAssistanceForm } from '@/components/nata/NataAssistanceForm';
import { spokeMeta } from '@/components/nata/data/spokeMeta';
import { nataSpokeIcon } from '@/components/nata/guideNav';
import {
  CtaBand,
  CtaButton,
  EmptyState,
  FactGrid,
  FactsCard,
  FaqList,
  HubCard,
  InfoCard,
  PageHero,
  Section,
  tokens as t,
} from '@/design-system';

// ISR: Revalidate every hour since hub fetches dynamic data from Supabase
export const revalidate = 86400;

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return {
    title:
      'NATA 2026: Complete Exam Guide, Dates, Syllabus, Eligibility & Free Tools',
    description:
      'Everything about NATA 2026 exam: eligibility, syllabus, exam pattern, fee structure, exam centers, how to apply, cutoff calculator & free preparation tools.',
    keywords:
      'NATA 2026, NATA exam 2026, NATA eligibility, NATA syllabus, NATA exam pattern, NATA exam centers, NATA fee, NATA cutoff, NATA preparation, NATA guide',
    alternates: buildAlternates(locale, '/nata-2026'),
  };
}

interface PageProps {
  params: { locale: string };
}

const defaultFaqs = [
  {
    question: 'What is NATA 2026?',
    answer:
      'NATA (National Aptitude Test in Architecture) 2026 is a national-level entrance exam conducted by the Council of Architecture (CoA) for admission to B.Arch (Bachelor of Architecture) programs in India. It tests aptitude in drawing, observation, and critical thinking.',
  },
  {
    question: 'How many times can I attempt NATA 2026?',
    answer:
      'You can take up to 2 tests in Phase 1 (April–June 2026) or 1 test in Phase 2 (August 2026). You cannot appear in both phases. The best score among your attempts is considered for admission. Each test requires a separate fee payment.',
  },
  {
    question: 'What is the total marks for NATA 2026?',
    answer:
      'NATA 2026 is for 200 marks total. Part A (Drawing Test) is worth 80 marks and is conducted offline. Part B (MCQ/NCQ) is worth 120 marks and is conducted online in an adaptive format.',
  },
  {
    question: 'Is NATA 2026 online or offline?',
    answer:
      'NATA 2026 has two parts: Part A (Drawing Test, 80 marks) is conducted offline on paper, and Part B (MCQ/NCQ, 120 marks) is conducted online in a computer-based adaptive test format. Both parts are held on the same day.',
  },
  {
    question: 'What is the minimum qualifying score for NATA 2026?',
    answer:
      'NATA 2026 does not prescribe a minimum raw score for qualifying. Instead, Phase 1 uses percentile-based scoring calculated from all test-takers across both tests. Phase 2 uses raw marks. Admission eligibility depends on the participating institution\'s cutoff.',
  },
  {
    question: 'How long is the NATA 2026 score valid?',
    answer:
      'The NATA 2026 score is valid for 1 academic year (2026-2027 session only). However, valid NATA 2025 scores can also be used for 2026-27 admissions as per CoA rules.',
  },
];

// ─── Static content (kept from the former client sections) ───

const HERO_STATS = [
  { value: '200', label: 'Total Marks' },
  { value: '3 Hours', label: 'Duration' },
  { value: 'Up to 2', label: 'Attempts' },
  { value: 'Hybrid', label: 'Mode' },
];

const QUICK_FACTS = [
  { label: 'Exam', value: 'NATA 2026' },
  { label: 'Conducted By', value: 'CoA (Council of Architecture)' },
  { label: 'Total Marks', value: '200' },
  { label: 'Duration', value: '3 Hours' },
  { label: 'Max Attempts', value: '2 (Phase 1)' },
  { label: 'Score Validity', value: '1 Year' },
];

const GLANCE: Array<{ label: string; value: string; subtext?: string }> = [
  { label: 'Conducting Body', value: 'Council of Architecture (CoA)' },
  { label: 'Exam Level', value: 'National' },
  { label: 'Mode', value: 'Part A (Offline) + Part B (Online Adaptive)' },
  { label: 'Medium', value: 'English and Hindi' },
  { label: 'Total Marks', value: '200', subtext: 'Part A: 80 + Part B: 120' },
  { label: 'Duration', value: '3 Hours', subtext: '90 min each part' },
  { label: 'Maximum Attempts', value: '2 in Phase 1 or 1 in Phase 2' },
  { label: 'Score Validity', value: '1 academic year (2026-2027)' },
  { label: 'Website', value: 'www.nata.in' },
];

const FREE_TOOLS: Array<{ title: string; link: string; icon: ReactNode }> = [
  { title: 'Exam Centers', link: `${APP_URL}/tools/nata/exam-centers`, icon: <LocationOnOutlinedIcon /> },
  { title: 'Cutoff Calculator', link: `${APP_URL}/tools/nata/cutoff-calculator`, icon: <CalculateOutlinedIcon /> },
  { title: 'College Predictor', link: `${APP_URL}/tools/nata/college-predictor`, icon: <SchoolOutlinedIcon /> },
  { title: 'Eligibility Checker', link: `${APP_URL}/tools/nata/eligibility-checker`, icon: <CheckCircleOutlineIcon /> },
  { title: 'Cost Calculator', link: `${APP_URL}/tools/nata/cost-calculator`, icon: <PaymentsOutlinedIcon /> },
  { title: 'Image Crop', link: `${APP_URL}/tools/nata/image-crop`, icon: <CropOutlinedIcon /> },
  { title: 'Question Bank', link: `${APP_URL}/tools/nata/question-bank`, icon: <QuizOutlinedIcon /> },
];

const CONTACTS = [
  {
    title: 'WhatsApp',
    icon: <ChatOutlinedIcon />,
    label: 'Chat Now',
    href: buildWhatsAppLink({ text: 'Hi, I need help with NATA 2026' }).href,
    external: true,
  },
  { title: 'Phone', detail: '+91 91761 37043', icon: <PhoneOutlinedIcon />, label: 'Call Now', href: 'tel:+919176137043' },
  { title: 'Email', detail: 'info@neramclasses.com', icon: <EmailOutlinedIcon />, label: 'Send Email', href: 'mailto:info@neramclasses.com' },
];

interface Brochure {
  id: string;
  year: number;
  version: string;
  release_date: string;
  file_size_bytes: number | null;
  changelog: string | null;
  file_url: string;
  is_current: boolean;
}

/** Format bytes to a human-readable string. */
function formatFileSize(bytes: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

/** Format a date string as "13 March 2026". */
function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

/** Auto-fill card grid: one column on phones. */
function CardGrid({ min = 280, children }: { min?: number; children: ReactNode }) {
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${min}px), 1fr))`, gap: { xs: 2, md: 2.5 } }}>
      {children}
    </Box>
  );
}

export default async function Nata2026HubPage({ params: { locale } }: PageProps) {
  setRequestLocale(locale);

  const baseUrl = 'https://neramclasses.com';

  // Fetch dynamic content from Supabase (server-side)
  const [brochures, dbFaqs] = await Promise.all([
    getActiveNataBrochures(2026).catch(() => []),
    getActiveNataFaqs({ year: 2026, pageSlug: 'nata-2026-hub' }).catch(() => []),
    // Prefetch for potential future use
    getActiveNataAnnouncements(2026).catch(() => []),
    getActiveNataBanners('hub-hero').catch(() => []),
  ]);

  // Merge DB FAQs with defaults
  const dynamicFaqs = dbFaqs.map((faq) => ({
    question: faq.question[locale] || faq.question['en'] || '',
    answer: faq.answer[locale] || faq.answer['en'] || '',
  }));
  const faqs = dynamicFaqs.length > 0 ? dynamicFaqs : defaultFaqs;

  const brochureList: Brochure[] = brochures.map((b) => ({
    id: b.id,
    year: b.year,
    version: b.version,
    release_date: b.release_date,
    file_size_bytes: b.file_size_bytes,
    changelog: b.changelog,
    file_url: b.file_url,
    is_current: b.is_current,
  }));

  return (
    <>
      <JsonLd
        data={generateBreadcrumbSchema([
          { name: 'Home', url: baseUrl },
          { name: 'NATA 2026' },
        ])}
      />
      <JsonLd data={generateFAQSchema(faqs)} />

      <PageHero
        breadcrumb={[{ name: 'Home', href: '/' }, { name: 'NATA 2026' }]}
        eyebrow="NATA 2026 Complete Guide"
        title={
          <>
            NATA 2026: Complete <em>Exam Guide</em>
          </>
        }
        lede="Everything you need to know about NATA 2026"
        actions={
          <>
            <CtaButton href="/nata-2026/eligibility">Check Eligibility</CtaButton>
            <CtaButton variant="outline" href="/nata-2026/how-to-apply">
              How to Apply
            </CtaButton>
          </>
        }
        stats={HERO_STATS}
        aside={<FactsCard title="NATA 2026 Quick Facts" items={QUICK_FACTS} />}
        asideMin={380}
      >
        <Box
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 1,
            flexWrap: 'wrap',
            width: 'fit-content',
            border: `1px solid ${t.lineDark}`,
            borderRadius: `${t.radius}px`,
            px: 1.25,
            py: 0.75,
            fontSize: '0.8125rem',
            color: t.paperMuted,
          }}
        >
          <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, color: t.paper, fontWeight: 700, fontSize: '0.75rem', letterSpacing: '0.05em' }}>
            <VerifiedOutlinedIcon aria-hidden sx={{ fontSize: 16, color: t.gold500 }} />
            VERIFIED
          </Box>
          Updated March 13, 2026 · Source: Official NATA 2026 Brochure V1.0
        </Box>
        <CtaButton variant="link" href="/nata-2027">
          Preparing for NATA 2027? See expected dates
        </CtaButton>
      </PageHero>

      <Section
        id="topics"
        tone="light"
        header={{ eyebrow: 'NATA 2026 guide', title: 'Explore NATA 2026 Topics', lede: 'Quick links to everything about the NATA exam', align: 'start' }}
      >
        <CardGrid min={260}>
          {spokeMeta.map((page) => (
            <HubCard
              key={page.slug}
              href={`/nata-2026/${page.slug}`}
              title={page.title}
              desc={page.desc}
              icon={nataSpokeIcon(page.slug)}
              cta="Read guide"
            />
          ))}
        </CardGrid>
      </Section>

      <Section id="what-is-nata" tone="white" header={{ title: 'What is NATA?', align: 'start' }}>
        <Typography component="p" sx={{ m: 0, maxWidth: t.container.article, fontSize: '1.0625rem', lineHeight: 1.7, color: t.ink }}>
          NATA (National Aptitude Test in Architecture) is a national-level entrance exam conducted by the{' '}
          <strong>Council of Architecture (CoA)</strong> since 2006. It is <strong>mandatory for admission to B.Arch programs</strong>{' '}
          across India. The exam tests a candidate&apos;s aptitude in drawing, observation skills, critical thinking, and aesthetic
          sensitivity, the core skills required for a career in architecture. NATA scores are accepted by{' '}
          <strong>hundreds of government and private architecture colleges</strong> across India.
        </Typography>
      </Section>

      <Section id="at-a-glance" tone="light" header={{ title: 'NATA 2026 at a Glance', align: 'start' }}>
        <FactGrid
          cellMin={260}
          items={GLANCE.map((item) => ({
            label: item.label,
            value: item.subtext ? (
              <>
                {item.value}
                <Box component="span" sx={{ display: 'block', mt: 0.25, fontSize: '0.875rem', fontWeight: 400, color: t.inkMuted }}>
                  {item.subtext}
                </Box>
              </>
            ) : (
              item.value
            ),
          }))}
        />
      </Section>

      <Section
        id="free-tools"
        tone="white"
        header={{ eyebrow: 'Free', title: 'Free NATA Tools', lede: 'Use our free tools to prepare smarter for NATA 2026', align: 'start' }}
      >
        <CardGrid min={240}>
          {FREE_TOOLS.map((tool) => (
            <HubCard key={tool.title} href={tool.link} title={tool.title} icon={tool.icon} badge="Free" cta="Open" external />
          ))}
        </CardGrid>
      </Section>

      <Section
        id="brochure"
        tone="light"
        header={{ title: 'Download Official Brochure', lede: 'Get the latest NATA 2026 information booklet from CoA', align: 'start' }}
      >
        {brochureList.length > 0 ? (
          <CardGrid min={340}>
            {brochureList.map((brochure) => (
              <InfoCard
                key={brochure.id}
                icon={<DescriptionOutlinedIcon />}
                title={`NATA ${brochure.year}, v${brochure.version}`}
                meta={brochure.is_current ? 'Current Version' : undefined}
                body={`Released: ${formatDate(brochure.release_date)}${brochure.file_size_bytes ? ` · ${formatFileSize(brochure.file_size_bytes)}` : ''}`}
              >
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, alignItems: 'flex-start', mt: 0.5 }}>
                  {brochure.changelog && <Box component="span">{brochure.changelog}</Box>}
                  <CtaButton
                    variant={brochure.is_current ? 'primary' : 'outline'}
                    size="md"
                    href={brochure.file_url}
                    external
                    startIcon={<DownloadOutlinedIcon />}
                  >
                    Download PDF
                  </CtaButton>
                </Box>
              </InfoCard>
            ))}
          </CardGrid>
        ) : (
          <EmptyState
            icon={<DescriptionOutlinedIcon />}
            titleAs="h3"
            title="NATA 2026 Brochure: Coming Soon"
            body="The official brochure has not been released yet by CoA. We'll update this section as soon as available."
          />
        )}
      </Section>

      <Section
        id="assistance"
        tone="white"
        width="narrow"
        header={{ title: 'Need Help Applying?', lede: 'Our team will guide you through the NATA application process' }}
      >
        <Box
          sx={{
            width: '100%',
            maxWidth: 600,
            mx: 'auto',
            boxSizing: 'border-box',
            bgcolor: t.surface,
            border: `1px solid ${t.line}`,
            borderRadius: `${t.radius}px`,
            p: { xs: 2.5, sm: 4 },
          }}
        >
          <NataAssistanceForm locale={locale} bare />
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, color: t.inkMuted, fontSize: '0.9375rem', fontWeight: 600 }}>
          <GroupsOutlinedIcon aria-hidden sx={{ fontSize: 20, color: t.gold800 }} />
          Helped 1,000+ students
        </Box>
      </Section>

      <Section id="faq" tone="light" width="narrow" header={{ eyebrow: 'Questions', title: 'Frequently Asked Questions', lede: 'Common questions about NATA 2026' }}>
        <FaqList items={faqs} defaultOpen={-1} />
      </Section>

      <Section id="contact" tone="white" header={{ title: 'Contact & Help', lede: "Have questions? We're here to help.", align: 'start' }}>
        <CardGrid min={260}>
          {CONTACTS.map((card) => (
            <InfoCard key={card.title} icon={card.icon} title={card.title} body={card.detail}>
              <Box sx={{ mt: 1.5 }}>
                <CtaButton variant="outline" size="md" href={card.href} external={card.external}>
                  {card.label}
                </CtaButton>
              </Box>
            </InfoCard>
          ))}
        </CardGrid>
      </Section>

      <CtaBand
        eyebrow="1,000+ Students · 50+ Colleges · 7+ Free Tools"
        title="Prepare for NATA 2026 with India's First AI-Enabled Learning Platform"
        lede="Expert coaching, free tools, personalized preparation plans"
        actions={
          <>
            <CtaButton href="/free-trial">Start Free Trial</CtaButton>
            <CtaButton variant="link" href="/coaching">
              Explore Coaching
            </CtaButton>
          </>
        }
      />
    </>
  );
}
