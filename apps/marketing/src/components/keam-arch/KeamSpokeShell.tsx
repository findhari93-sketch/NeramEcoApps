import CounsellingSpokeShell from '@/components/counselling/CounsellingSpokeShell';

const HUB_PATH = '/counseling/keam-arch';
const HUB_LABEL = 'KEAM B.Arch 2026';
const PRIMARY_GREEN = '#0d7a4a';
const PRIMARY_GREEN_DARK = '#0a5a36';

export interface KeamSpokeShellProps {
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
  'Is NATA mandatory for KEAM B.Arch?',
  'When does application close?',
  'How is the rank calculated?',
  'Which colleges are in Kerala?',
];

export default function KeamSpokeShell({
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
}: KeamSpokeShellProps) {
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
      ctaSecondary={{ label: 'See colleges in Kerala', href: 'colleges-in-kerala' }}
      callback={{
        context: 'KEAM B.Arch 2026',
        queryType: 'keam_arch_counselling',
        courseInterest: 'nata',
        ctaLabel: 'Get KEAM Counselling Guidance',
        drawerTitle: 'Free KEAM Counselling Call',
        drawerIntro:
          'Talk to a KEAM B.Arch counsellor about NATA, eligibility, college choice, and CAP allotment. Free, no obligation.',
        successMessage: 'Our KEAM B.Arch counsellor will call you back within 24 hours.',
        cutoffCalculatorUrl: 'https://app.neramclasses.com/tools/nata/cutoff-calculator',
        collegePredictorUrl:
          'https://app.neramclasses.com/tools/counseling/college-predictor?system=KEAM_ARCH',
        prefillNotes: prefillCallbackNotes,
      }}
      aintra={{
        topic: 'keam_arch_2026',
        endpoint: '/api/aintra/keam-arch',
        title: 'KEAM B.Arch 2026',
        subtitle: 'Your KEAM B.Arch counselling guide',
        greeting: `Hi! I'm Aintra. Ask me about ${topicTitle.toLowerCase()}, or anything else about KEAM B.Arch 2026.`,
        suggestions: aintraSuggestions,
        primaryColor: PRIMARY_GREEN,
        primaryColorDark: PRIMARY_GREEN_DARK,
        disclaimerSource: 'cee.kerala.gov.in',
      }}
    >
      {children}
    </CounsellingSpokeShell>
  );
}
