import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { Box, Typography } from '@neram/ui';
import ArchitectureOutlinedIcon from '@mui/icons-material/ArchitectureOutlined';
import MoneyOffOutlinedIcon from '@mui/icons-material/MoneyOffOutlined';
import InstallMobileOutlinedIcon from '@mui/icons-material/InstallMobileOutlined';
import AccountBalanceOutlinedIcon from '@mui/icons-material/AccountBalanceOutlined';
import WorkspacePremiumOutlinedIcon from '@mui/icons-material/WorkspacePremiumOutlined';
import PhoneAndroidOutlinedIcon from '@mui/icons-material/PhoneAndroidOutlined';
import { siteTokens as t } from '@neram/ui/site-tokens';
import { Link } from '@/i18n/routing';
import { JsonLd } from '@/components/seo/JsonLd';
import { toolIcon } from '@/components/tools/toolIcons';
import { generateSoftwareApplicationSchema, generateBreadcrumbSchema, generateFAQSchema } from '@/lib/seo/schemas';
import { buildAlternates } from '@/lib/seo/metadata';
import { APP_URL } from '@/lib/seo/constants';
import {
  CtaBand,
  CtaButton,
  DataTable,
  FactsCard,
  FaqList,
  FeatureCard,
  HubCard,
  PageHero,
  Section,
  StepList,
} from '@/design-system';


export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return {
    title: 'Best Free NATA Exam Preparation App 2026',
    description:
      'Free NATA preparation app by Neram Classes: a cutoff calculator, a B.Arch college predictor, an exam centre locator and study tools. Install it on any phone from the browser.',
    keywords:
      'best NATA app, NATA preparation app, free NATA study app, best app for NATA exam, NATA exam app 2026, NATA cutoff calculator app, NATA college predictor app, free NATA tools',
    alternates: buildAlternates(locale, '/nata-app'),
  };
}

interface PageProps {
  params: { locale: string };
}

const freeTools = [
  {
    title: 'NATA Cutoff Calculator',
    desc: 'Calculate your expected cutoff score based on your NATA marks, category, and preferred colleges. Built on published counselling cutoffs for B.Arch colleges.',
    link: `${APP_URL}/tools/nata/cutoff-calculator`,
    slug: 'cutoff-calculator',
  },
  {
    title: 'College Predictor',
    desc: 'Predict which architecture colleges you can get into based on your NATA score. Covers COA-approved government, private and deemed colleges.',
    link: `${APP_URL}/tools/counseling/college-predictor`,
    slug: 'college-predictor',
  },
  {
    title: 'Exam Center Locator',
    desc: 'Find the nearest NATA exam center to your location. View center details, past exam patterns, and plan your exam day with our interactive locator tool.',
    link: `${APP_URL}/tools/nata/exam-centers`,
    slug: 'exam-centers',
  },
];

const appFeatures = [
  {
    icon: () => <ArchitectureOutlinedIcon />,
    title: 'NATA-Specific Tools',
    desc: 'Purpose-built for NATA aspirants. Every tool, every feature is designed around the NATA exam pattern and B.Arch admission process.',
  },
  {
    icon: () => <MoneyOffOutlinedIcon />,
    title: '100% Free Tools',
    desc: 'Cutoff calculator, college predictor, and exam center locator are completely free. No hidden charges, no premium walls.',
  },
  {
    icon: () => <InstallMobileOutlinedIcon />,
    title: 'Installable PWA',
    desc: 'Install the app on your phone like a native app. Works offline, fast loading, and no app store download required.',
  },
  {
    icon: () => <AccountBalanceOutlinedIcon />,
    title: 'B.Arch College Database',
    desc: 'COA-approved architecture colleges in India: government, private and deemed, with cutoff data where counselling publishes it.',
  },
  {
    icon: () => <WorkspacePremiumOutlinedIcon />,
    title: 'Expert-Backed Content',
    desc: 'All data and tools are curated by IIT/NIT alumni and experienced NATA coaches with 10+ years of mentoring experience.',
  },
  {
    icon: () => <PhoneAndroidOutlinedIcon />,
    title: 'Mobile-First Design',
    desc: 'Designed for students who study on their phones. Fast, lightweight, and optimized for mobile data connections.',
  },
];

const howItWorks = [
  {
    step: '01',
    title: 'Visit the App',
    desc: 'Open app.neramclasses.com in any browser on your phone, tablet, or computer. No download or signup required.',
  },
  {
    step: '02',
    title: 'Use Free Tools',
    desc: 'Access the cutoff calculator, college predictor, and exam center locator instantly. Get personalized results based on your NATA score.',
  },
  {
    step: '03',
    title: 'Install as PWA',
    desc: 'Tap "Add to Home Screen" to install the app. Access all tools offline and get a native app-like experience.',
  },
  {
    step: '04',
    title: 'Track Your Progress',
    desc: 'Create a free account to save your predictions, track preparation progress, and get personalized recommendations.',
  },
];

const comparisonFeatures = [
  { feature: 'NATA-specific cutoff calculator', neram: true, generic: false, youtube: false },
  { feature: 'B.Arch college predictor', neram: true, generic: false, youtube: false },
  { feature: 'Exam center locator', neram: true, generic: false, youtube: false },
  { feature: 'Works offline (PWA)', neram: true, generic: false, youtube: false },
  { feature: 'Free to use', neram: true, generic: false, youtube: true },
  { feature: 'Mobile-optimized', neram: true, generic: true, youtube: true },
  { feature: 'Expert-curated data', neram: true, generic: false, youtube: false },
  { feature: 'Updated for 2026', neram: true, generic: false, youtube: false },
  { feature: 'No ads or distractions', neram: true, generic: false, youtube: false },
  { feature: 'Personalized predictions', neram: true, generic: true, youtube: false },
];

const cardGridSx = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))',
  gap: { xs: 2, md: 2.5 },
} as const;

const yesNo = (value: boolean) => (value ? 'Yes' : 'No');

export default function NataAppPage({ params: { locale } }: PageProps) {
  setRequestLocale(locale);

  const baseUrl = 'https://neramclasses.com';
  const appUrl = APP_URL;

  const faqs = [
    {
      question: 'What is the best free app for NATA preparation?',
      answer:
        'The Neram Classes NATA App (app.neramclasses.com) is the best free app for NATA preparation. It offers a cutoff calculator, a B.Arch college predictor, an exam centre locator and study resources, and it is free to use.',
    },
    {
      question: 'Does Neram Classes have a NATA mobile app?',
      answer:
        'Yes, Neram Classes has a Progressive Web App (PWA) for NATA preparation available at app.neramclasses.com. You can install it on your phone, tablet, or computer directly from the browser without needing to download from an app store. It works like a native app with offline support.',
    },
    {
      question: 'Can I prepare for NATA using only the Neram app?',
      answer:
        'The Neram app provides essential preparation tools like cutoff calculators, college predictors, and exam center locators. While these tools are invaluable for planning and strategy, comprehensive NATA preparation also benefits from coaching, drawing practice, and mock tests. Neram Classes offers both the free app tools and full coaching programs.',
    },
    {
      question: 'What free NATA tools does the Neram app offer?',
      answer:
        'The Neram NATA App offers three major free tools: (1) NATA Cutoff Calculator: calculate expected cutoffs based on your marks and category, (2) College Predictor: find which B.Arch colleges match your score, and (3) Exam Center Locator: find the nearest NATA exam center with complete details.',
    },
    {
      question: 'Is the Neram NATA app available offline?',
      answer:
        'Yes, the Neram NATA app is a Progressive Web App (PWA) that can be installed on your device and used offline. Once installed, core features like the cutoff calculator and saved college predictions work without an internet connection. Simply visit app.neramclasses.com and tap "Add to Home Screen."',
    },
    {
      question: 'Do I need to pay for the Neram NATA app?',
      answer:
        'No, the Neram NATA app is completely free. All core tools including the cutoff calculator, college predictor, and exam center locator are available at no cost. There are no hidden charges, no premium paywalls, and no mandatory sign-ups required to use the tools.',
    },
  ];
  return (
    <>
      <JsonLd data={generateSoftwareApplicationSchema()} />
      <JsonLd
        data={generateBreadcrumbSchema([
          { name: 'Home', url: baseUrl },
          { name: 'NATA App' },
        ])}
      />
      <JsonLd data={generateFAQSchema(faqs)} />

      <PageHero
        breadcrumb={[{ name: 'Home', href: '/' }, { name: 'NATA App' }]}
        pills={['Free NATA App 2026']}
        eyebrow="Neram NATA App · Part of aiArchitek"
        title="Best Free App for NATA Exam Preparation 2026"
        lede="Cutoff calculator, B.Arch college predictor and exam centre locator, all free. Install it on any device from the browser."
        actions={
          <>
            <CtaButton href={appUrl} external>
              Open App Free
            </CtaButton>
            <CtaButton variant="outline" href="/demo-class">
              Book Free Demo
            </CtaButton>
          </>
        }
        aside={
          <FactsCard
            title="App Highlights"
            items={[
              { label: 'Price', value: 'Completely Free' },
              { label: 'Colleges Covered', value: 'COA-approved B.Arch' },
              { label: 'Platform', value: 'Web PWA (Any Device)' },
              { label: 'Offline Support', value: 'Yes' },
            ]}
          />
        }
      />

      <Section
        id="free-tools"
        tone="light"
        gap={4}
        header={{
          title: 'Free NATA Preparation Tools',
          lede: 'Three powerful tools built specifically for NATA aspirants, all completely free',
          align: 'start',
        }}
      >
        <Box sx={cardGridSx}>
          {freeTools.map((tool) => (
            <HubCard
              key={tool.slug}
              href={tool.link}
              external
              title={tool.title}
              desc={tool.desc}
              icon={toolIcon(tool.slug)}
              badge="Free"
              cta="Use Free"
            />
          ))}
        </Box>
        <Typography component="p" sx={{ m: 0, fontSize: '1rem', lineHeight: 1.6, color: t.inkMuted }}>
          See every tool and AI feature in{' '}
          <Link href="/aiarchitek" style={{ color: t.gold800, fontWeight: 600, textDecoration: 'underline', textUnderlineOffset: '2px' }}>
            aiArchitek, the Neram NATA platform
          </Link>
          .
        </Typography>
      </Section>

      <Section
        id="why-neram-app"
        tone="white"
        gap={4}
        header={{
          title: 'Why Neram App is the Best for NATA Preparation',
          lede: 'Purpose-built for NATA aspirants by experienced coaches',
          align: 'start',
        }}
      >
        <Box sx={cardGridSx}>
          {appFeatures.map((feature) => (
            <FeatureCard key={feature.title} icon={feature.icon()} title={feature.title} body={feature.desc} />
          ))}
        </Box>
      </Section>

      <Section
        id="how-it-works"
        tone="light"
        gap={4}
        header={{
          title: 'How to Use the Neram NATA App',
          lede: 'Get started in under a minute, no download required',
          align: 'start',
        }}
      >
        <StepList items={howItWorks.map((item) => ({ title: item.title, body: item.desc }))} />
      </Section>

      <Section
        id="comparison"
        tone="white"
        gap={4}
        header={{
          title: 'Neram App vs Other NATA Preparation Options',
          lede: 'See how the Neram NATA App compares to generic apps and YouTube',
          align: 'start',
        }}
      >
        <DataTable
          caption="Neram NATA App compared with generic apps and YouTube"
          hideCaption
          columns={['Feature', 'Neram App', 'Generic Apps', 'YouTube']}
          rows={comparisonFeatures.map((row) => [row.feature, yesNo(row.neram), yesNo(row.generic), yesNo(row.youtube)])}
        />
      </Section>

      <Section
        id="faq"
        tone="light"
        width="narrow"
        header={{
          eyebrow: 'Questions',
          title: 'Frequently Asked Questions',
          lede: 'Common questions about the Neram NATA Preparation App',
        }}
      >
        <FaqList items={faqs} />
      </Section>

      <CtaBand
        title="Start Your NATA Preparation Today"
        lede="Open the Neram NATA App and use free tools to plan your architecture career. No signup needed. No downloads. Just open and start."
        actions={
          <>
            <CtaButton href={appUrl} external>
              Open App Free
            </CtaButton>
            <CtaButton variant="link" href="/coaching/nata-coaching">
              Explore NATA Coaching
            </CtaButton>
          </>
        }
      />
    </>
  );
}
