import CounsellingSpokeShell from '@/components/counselling/CounsellingSpokeShell';

const HUB_PATH = '/counseling/tnea-barch';
const HUB_LABEL = 'TNEA B.Arch 2026';

export interface TneaSpokeShellProps {
  locale: string;
  spokeSlug: string;
  topicTitle: string;
  topicSubtitle: string;
  spokeChip?: string;
  jsonLd?: Record<string, unknown> | Record<string, unknown>[];
  related?: Array<{ label: string; href: string }>;
  aintraSuggestions?: string[];
  prefillCallbackNotes?: string;
  children: React.ReactNode;
}

const DEFAULT_SUGGESTIONS = [
  'Eligibility for TNEA B.Arch?',
  'When does registration close?',
  'How many counselling rounds?',
  'TFC near me?',
];

export default function TneaSpokeShell({
  locale,
  spokeSlug,
  topicTitle,
  topicSubtitle,
  spokeChip,
  jsonLd,
  related,
  aintraSuggestions = DEFAULT_SUGGESTIONS,
  prefillCallbackNotes,
  children,
}: TneaSpokeShellProps) {
  return (
    <CounsellingSpokeShell
      locale={locale}
      hubPath={HUB_PATH}
      hubLabel={HUB_LABEL}
      spokeSlug={spokeSlug}
      topicTitle={topicTitle}
      topicSubtitle={topicSubtitle}
      spokeChip={spokeChip}
      jsonLd={jsonLd}
      related={related}
      ctaSecondary={{ label: 'Find your nearest TFC', href: 'tfc-list' }}
      callback={{
        context: 'TNEA B.Arch 2026',
        queryType: 'b_arch_counselling',
        courseInterest: 'nata',
        ctaLabel: 'Get TNEA Counselling Guidance',
        drawerTitle: 'Free TNEA Counselling Call',
        drawerIntro:
          'Talk to a TNEA B.Arch counsellor about eligibility, college choice, and counselling rounds. Free, no obligation.',
        successMessage: 'Our TNEA B.Arch counsellor will call you back within 24 hours.',
        cutoffCalculatorUrl: 'https://app.neramclasses.com/tools/nata/cutoff-calculator',
        collegePredictorUrl:
          'https://app.neramclasses.com/tools/counseling/college-predictor?system=TNEA_BARCH',
        prefillNotes: prefillCallbackNotes,
      }}
      aintra={{
        topic: 'tnea_barch_2026',
        endpoint: '/api/aintra/tnea-barch',
        title: 'TNEA B.Arch 2026',
        subtitle: 'Your TNEA B.Arch counselling guide',
        greeting: `Hi! I'm Aintra. Ask me about ${topicTitle.toLowerCase()}, or anything else about TNEA B.Arch 2026.`,
        suggestions: aintraSuggestions,
        primaryColor: '#1d4ed8',
        primaryColorDark: '#1e3a8a',
        disclaimerSource: 'tneaonline.org',
      }}
    >
      {children}
    </CounsellingSpokeShell>
  );
}
