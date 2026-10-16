import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import ExamSpokeLayout from '@/components/exam-hub/sections/ExamSpokeLayout';
import { GuideNote, GuideP, GuidePills } from '@/components/exam-hub/sections/GuideBlocks';
import { buildAlternates } from '@/lib/seo/metadata';
import { AAT_SYLLABUS } from '@/components/aat/data/aatContent';
import { ArticleSection, CheckList } from '@/design-system';

export const revalidate = 86400;

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return {
    title: 'AAT 2026 Syllabus: 5 Sections, Freehand to Architectural Awareness',
    description:
      'Complete AAT 2026 syllabus: Freehand Drawing, Geometrical Drawing, 3D Perception, Imagination & Aesthetic Sensitivity, Architectural Awareness. Faithful breakdown with skills tested per section. Source: jeeadv.ac.in/documents/aat-syllabus.pdf.',
    keywords:
      'AAT 2026 syllabus, AAT syllabus PDF, AAT freehand drawing, AAT geometrical drawing, AAT 3D perception, architectural awareness syllabus, AAT topics',
    alternates: buildAlternates(locale, '/aat-2026/syllabus'),
  };
}

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

export default function AatSyllabusPage({ params: { locale } }: { params: { locale: string } }) {
  setRequestLocale(locale);

  return (
    <ExamSpokeLayout
      examName="AAT 2026"
      examShortName="AAT 2026"
      examHubHref="/aat-2026"
      spokeSlug="syllabus"
      topicTitle="AAT 2026 syllabus, the 5 sections explained"
      topicSubtitle="The official syllabus is published at jeeadv.ac.in/documents/aat-syllabus.pdf. Below is a faithful breakdown of each section with the skills it tests and what to practice."
      related={[
        { label: 'Exam pattern', href: '/aat-2026/exam-pattern' },
        { label: 'Drawing kit', href: '/aat-2026/drawing-kit' },
        { label: 'Preparation tips', href: '/aat-2026/preparation' },
      ]}
    >
      <GuideP>
        AAT covers five areas drawn from the practice of architecture: drawing skill (freehand and instrumental), spatial reasoning, creative imagination, and exposure to architectural history. The exam does not publish per-section weights; the candidate is expected to demonstrate competence across all five.
      </GuideP>

      {AAT_SYLLABUS.map((section, idx) => (
        <ArticleSection
          key={section.title}
          id={slugify(section.title)}
          eyebrow={`Section ${idx + 1}`}
          title={section.title}
          intro={section.summary}
        >
          <GuidePills label={`Skills tested in ${section.title}`} items={section.skills} />
        </ArticleSection>
      ))}

      <GuideNote title="Practical preparation focus">
        <CheckList
          variant="compact"
          items={[
            'Sketch everyday objects from memory: cycle, water bottle, chair, kettle. 5 to 10 minutes per object.',
            'Draw plans, elevations, and isometric views of cubes, cones, and stairs using your geometry box.',
            'Practice mental rotation puzzles to strengthen 3D visualisation.',
            'Read about 30 to 50 famous buildings (Indian and global) and the architects behind them.',
            'Time yourself: 16 questions in 3 hours means roughly 11 minutes per question.',
          ]}
        />
      </GuideNote>
    </ExamSpokeLayout>
  );
}
