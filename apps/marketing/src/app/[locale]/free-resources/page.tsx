import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import PlayCircleOutlineOutlinedIcon from '@mui/icons-material/PlayCircleOutlineOutlined';
import { JsonLd } from '@/components/seo/JsonLd';
import { generateFAQSchema, generateBreadcrumbSchema } from '@/lib/seo/schemas';
import { buildAlternates } from '@/lib/seo/metadata';
import { APP_URL } from '@/lib/seo/constants';
import { toolIcon } from '@/components/tools/toolIcons';
import { CtaBand, CtaButton, FaqList, HubIndex, Section, type HubGroup } from '@/design-system';

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return {
    title: 'Free NATA & JEE Paper 2 Resources 2026 - Study Materials',
    description: 'Download free NATA and JEE Paper 2 study materials, e-books, practice papers, and resources. Get free access to quality preparation materials.',
    keywords: 'free NATA books, free JEE Paper 2 resources, NATA study material PDF, free architecture entrance resources',
    alternates: buildAlternates(locale, '/free-resources'),
  };
}

interface PageProps {
  params: { locale: string };
}

const resources = [
  {
    category: 'E-Books & Notes',
    items: [
      { title: 'NATA Mathematics Formula Sheet', type: 'PDF', size: '2 MB', downloads: '15K+' },
      { title: 'Aptitude Quick Reference Guide', type: 'PDF', size: '3 MB', downloads: '12K+' },
      { title: 'Perspective Drawing Basics', type: 'PDF', size: '5 MB', downloads: '20K+' },
      { title: 'Architectural Awareness Notes', type: 'PDF', size: '4 MB', downloads: '10K+' },
    ],
  },
  {
    category: 'Practice Papers',
    items: [
      { title: 'NATA 2024 Sample Paper', type: 'PDF', size: '1 MB', downloads: '25K+' },
      { title: 'JEE Paper 2 Practice Set', type: 'PDF', size: '2 MB', downloads: '18K+' },
      { title: 'Drawing Test Practice Sheets', type: 'PDF', size: '8 MB', downloads: '22K+' },
      { title: 'Aptitude Mock Test Series', type: 'PDF', size: '3 MB', downloads: '16K+' },
    ],
  },
  {
    category: 'Video Lectures',
    items: [
      { title: 'Introduction to NATA', type: 'Video', size: 'YouTube', downloads: '50K+ views' },
      { title: 'Perspective Drawing Tutorial', type: 'Video', size: 'YouTube', downloads: '35K+ views' },
      { title: 'Coordinate Geometry Basics', type: 'Video', size: 'YouTube', downloads: '28K+ views' },
      { title: 'Aptitude Shortcuts', type: 'Video', size: 'YouTube', downloads: '40K+ views' },
    ],
  },
  {
    category: 'Cheat Sheets',
    items: [
      { title: 'Trigonometry Formulas', type: 'PDF', size: '500 KB', downloads: '30K+' },
      { title: 'Famous Architects List', type: 'PDF', size: '1 MB', downloads: '15K+' },
      { title: 'Building Materials Quick Guide', type: 'PDF', size: '1 MB', downloads: '12K+' },
      { title: 'Drawing Tips & Tricks', type: 'PDF', size: '2 MB', downloads: '18K+' },
    ],
  },
];

const tools = [
  {
    slug: 'cutoff-calculator',
    title: 'NATA Cutoff Calculator',
    description: 'Calculate your expected cutoff rank based on score',
    link: '/tools/cutoff-calculator',
    external: false,
  },
  {
    slug: 'college-predictor',
    title: 'College Predictor',
    description: 'Find colleges based on your expected rank',
    link: `${APP_URL}/tools/college-predictor`,
    external: true,
  },
  {
    slug: 'exam-centers',
    title: 'Exam Center Locator',
    description: 'Find NATA exam centers near you',
    link: `${APP_URL}/tools/exam-centers`,
    external: true,
  },
];

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

export default function FreeResourcesPage({ params: { locale } }: PageProps) {
  setRequestLocale(locale);

  const baseUrl = 'https://neramclasses.com';
  const faqs = [
    {
      question: 'Are these NATA study materials really free to download?',
      answer: 'Yes, all the study materials listed on this page are completely free to download and use. Neram Classes provides these free resources including formula sheets, practice papers, drawing guides, and cheat sheets to help students begin their NATA and JEE Paper 2 preparation without any cost. Premium resources with detailed video lectures and comprehensive mock tests are available through our coaching programs.',
    },
    {
      question: 'What free resources are most important for NATA preparation?',
      answer: 'The most important free resources for NATA preparation are: (1) Previous year question papers with solutions for understanding exam patterns, (2) Mathematics formula sheets for quick revision, (3) Drawing practice sheets for daily sketching exercises, and (4) Aptitude quick reference guides for reasoning and spatial ability topics. Start with these foundational resources and supplement with video tutorials for topics you find challenging.',
    },
    {
      question: 'Can I prepare for NATA using only free resources?',
      answer: 'While free resources provide a good foundation, relying solely on them may not be sufficient for competitive scores in NATA. Free materials cover basics well, but structured coaching provides personalized feedback on drawings, systematic mock test series with performance analysis, and expert guidance on time management strategies. Many successful NATA candidates use a combination of free resources for self-study and coaching for guided preparation.',
    },
    {
      question: 'Are there free online tools to help with NATA preparation?',
      answer: 'Yes, several free online tools are available for NATA preparation including cutoff calculators to estimate your rank, college predictors to find suitable colleges based on your expected score, and exam center locators. Neram Classes offers these tools along with free sample mock tests. Additionally, YouTube has many free video lectures covering NATA Mathematics, Aptitude, and Drawing topics that complement your preparation.',
    },
    {
      question: 'How often are the free study materials updated?',
      answer: 'Our free study materials are updated annually to reflect the latest NATA and JEE Paper 2 exam patterns, syllabus changes, and new question trends. The formula sheets and cheat sheets are reviewed before each exam season. Practice papers are updated with questions reflecting the most recent exam patterns. We recommend downloading the latest versions before starting your preparation to ensure you are studying the most current content.',
    },
  ];

  const groups: HubGroup[] = [
    {
      key: 'tools',
      label: 'Free Online Tools',
      items: tools.map((tool) => ({
        href: tool.link,
        external: tool.external,
        title: tool.title,
        desc: tool.description,
        icon: toolIcon(tool.slug),
        cta: 'Open',
      })),
    },
    ...resources.map((category) => ({
      key: slugify(category.category),
      label: category.category,
      items: category.items.map((item) => {
        const video = item.type === 'Video';
        return {
          // Every resource opens the app's tools page; the query keeps each card's href unique.
          href: `${APP_URL}/tools`,
          external: true,
          title: item.title,
          desc: `${item.type} · ${item.size} · ${item.downloads}${video ? '' : ' downloads'}`,
          icon: video ? <PlayCircleOutlineOutlinedIcon /> : <DescriptionOutlinedIcon />,
          cta: video ? 'Watch Now' : 'Download',
          keywords: `${category.category} ${item.type}`,
        };
      }),
    })),
  ];

  return (
    <>
      <JsonLd data={generateFAQSchema(faqs)} />
      <JsonLd data={generateBreadcrumbSchema([
        { name: 'Home', url: baseUrl },
        { name: 'Free Resources' },
      ])} />

      <HubIndex
        breadcrumb={[{ name: 'Home', href: '/' }, { name: 'Free Resources' }]}
        eyebrow="Free study material · NATA and JEE Paper 2"
        title="Free NATA & JEE Resources"
        lede="Quality study materials to kickstart your preparation, completely free."
        actions={
          <CtaButton href="/apply" size="lg">
            Get Premium Resources
          </CtaButton>
        }
        searchPlaceholder="Find a resource, e.g. formula sheet, sample paper"
        allLabel="All resources"
        countNoun="resources"
        groups={groups}
      >
        <Section id="faq" tone="white" width="narrow" header={{ eyebrow: 'Questions', title: 'Frequently Asked Questions' }}>
          <FaqList items={faqs} />
        </Section>

        <CtaBand
          eyebrow="Premium"
          title="Want More Resources?"
          lede="Get access to 500+ premium study materials, video lectures, and mock tests"
          actions={
            <>
              <CtaButton href="/apply">Join Premium</CtaButton>
              <CtaButton variant="link" href="/previous-year-papers">
                Previous Year Papers
              </CtaButton>
            </>
          }
        />
      </HubIndex>
    </>
  );
}
