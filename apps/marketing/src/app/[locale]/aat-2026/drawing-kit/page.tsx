import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import SquareFootOutlinedIcon from '@mui/icons-material/SquareFootOutlined';
import PaletteOutlinedIcon from '@mui/icons-material/PaletteOutlined';
import BadgeOutlinedIcon from '@mui/icons-material/BadgeOutlined';
import ExamSpokeLayout from '@/components/exam-hub/sections/ExamSpokeLayout';
import { GuideList, GuideStack } from '@/components/exam-hub/sections/GuideBlocks';
import { buildAlternates } from '@/lib/seo/metadata';
import { AAT_DRAWING_KIT } from '@/components/aat/data/aatContent';
import { ArticleSection, CheckList, InfoCard } from '@/design-system';

export const revalidate = 86400;

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return {
    title: 'AAT 2026 Drawing Kit Checklist: What to Bring, What to Avoid',
    description:
      'Pack your AAT 2026 drawing kit the night before. Pencils (HB to 2B), sharpener, soft erasers, geometry box, ruler, colour pencils. Avoid wet paints, mobile phones, calculators. Plus admit card and ID requirements.',
    keywords:
      'AAT drawing kit, AAT exam materials, AAT what to bring, AAT pencils, AAT geometry box, AAT colouring aids',
    alternates: buildAlternates(locale, '/aat-2026/drawing-kit'),
  };
}

const whyItMatters = [
  {
    title: 'Pencils HB to 2B',
    icon: <EditOutlinedIcon />,
    body: 'HB for clean linework and structural drawing. 2B for shading and tonal range. Avoid darker grades like 4B or 6B; they smudge and reduce control. A 2H is useful for very fine guide lines you intend to erase later.',
  },
  {
    title: 'Geometry box',
    icon: <SquareFootOutlinedIcon />,
    body: 'Compass for circles and arcs, scales (15 cm and 30 cm), set squares (45° and 30/60), protractor. Geometrical Drawing section requires technical accuracy that is hard to achieve freehand.',
  },
  {
    title: 'Colouring aids',
    icon: <PaletteOutlinedIcon />,
    body: 'Colour pencils or crayons only. Wet paints and watercolours risk smudging your answer sheet and the answer sheets near you. Stick to a small palette of 12 to 24 well-blended colours; speed of selection matters.',
  },
  {
    title: 'Admit card and ID',
    icon: <BadgeOutlinedIcon />,
    body: 'The printed JEE (Advanced) 2026 admit card serves as the AAT admit card; no separate AAT admit card is issued. Carry a clean printout (not a phone screenshot) plus an original government photo ID. Without these, you will not be permitted to sit for AAT.',
  },
];

export default function AatDrawingKitPage({ params: { locale } }: { params: { locale: string } }) {
  setRequestLocale(locale);

  return (
    <ExamSpokeLayout
      examName="AAT 2026"
      examShortName="AAT 2026"
      examHubHref="/aat-2026"
      spokeSlug="drawing-kit"
      topicTitle="AAT 2026 drawing kit checklist"
      topicSubtitle="Candidates must bring their own drawing and colouring aids. Pack the night before. The centre does not provide pencils, erasers, or instruments."
      related={[
        { label: 'Centres', href: '/aat-2026/centres' },
        { label: 'Schedule', href: '/aat-2026/schedule' },
        { label: 'Preparation tips', href: '/aat-2026/preparation' },
      ]}
    >
      <ArticleSection id="bring" title="Bring">
        <CheckList items={AAT_DRAWING_KIT.bring} />
      </ArticleSection>

      <ArticleSection id="avoid" title="Avoid">
        <GuideList items={AAT_DRAWING_KIT.avoid} />
      </ArticleSection>

      <ArticleSection id="why-each-item-matters" title="Why each item matters">
        <GuideStack>
          {whyItMatters.map((item) => (
            <InfoCard key={item.title} icon={item.icon} title={item.title} body={item.body} />
          ))}
        </GuideStack>
      </ArticleSection>
    </ExamSpokeLayout>
  );
}
