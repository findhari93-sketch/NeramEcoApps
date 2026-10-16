import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import ExamSpokeLayout from '@/components/exam-hub/sections/ExamSpokeLayout';
import { GuideNote, GuideP } from '@/components/exam-hub/sections/GuideBlocks';
import { buildAlternates } from '@/lib/seo/metadata';
import { PGETA_MODULES } from '@/components/pgeta/data/pgetaContent';
import { ArticleSection, CheckList } from '@/design-system';

export const revalidate = 86400;

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return {
    title: 'PGETA 2026 Exam Pattern: 2-Hour CBT, 100 Questions, 4 Modules',
    description:
      'PGETA 2026 exam pattern: Computer-Based Test (CBT) of 2 hours, 100 questions across four modules: Architecture and Design (64 Q), Building Sciences (14 Q), Professional Electives (6 Q), Skill Enhancement (16 Q). English only.',
    keywords:
      'PGETA exam pattern, PGEAT exam pattern, PGETA modules, PGETA marking scheme, PGETA CBT, PGETA total questions, PGETA duration',
    alternates: buildAlternates(locale, '/pgeta-2026/exam-pattern'),
  };
}

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

export default function PgetaExamPatternPage({ params: { locale } }: { params: { locale: string } }) {
  setRequestLocale(locale);

  return (
    <ExamSpokeLayout
      examName="PGETA 2026"
      examShortName="PGETA 2026"
      examHubHref="/pgeta-2026"
      spokeSlug="exam-pattern"
      topicTitle="PGETA 2026 exam pattern, 4 modules across 100 questions"
      topicSubtitle="Computer-Based Test, 2 hours, 100 questions in English. Architecture and Design carries 64 of 100 questions; the rest cover engineering, electives, and research aptitude."
      related={[
        { label: 'Syllabus', href: '/pgeta-2026/syllabus' },
        { label: 'Schedule', href: '/pgeta-2026/schedule' },
        { label: 'Preparation', href: '/pgeta-2026/preparation' },
      ]}
    >
      {PGETA_MODULES.map((mod, idx) => (
        <ArticleSection
          key={mod.title}
          id={slugify(mod.title)}
          eyebrow={`Module ${idx + 1} · ${mod.questions} Q`}
          title={mod.title}
          intro={mod.summary}
        />
      ))}

      <ArticleSection id="format-and-timing" title="Format and timing">
        <CheckList
          columnMin={600}
          items={[
            'Mode: Computer-Based Test at designated centres. Not a from-home online test.',
            'Duration: 2 hours (120 minutes), 10:00 AM to 12:00 PM IST.',
            'Total questions: 100. With 120 minutes, that is roughly 72 seconds per question on average.',
            'Language: English only.',
            'Marking scheme details (negative marking, marks per question) are published in the official PGETA Information Brochure on the COA portal. Verify the brochure before exam day.',
          ]}
        />
      </ArticleSection>

      <GuideNote title="Where to spend time">
        <GuideP muted>
          Module 1, Architecture and Design, is 64% of the paper. Allocate at least 75 of the 120 minutes to it. Module 4 (Skill Enhancement) and Module 2 (Building Sciences) are next-priority. Module 3 (Professional Electives) is the smallest, plan to clear it in 8 to 10 minutes if your specialisation aligns.
        </GuideP>
      </GuideNote>
    </ExamSpokeLayout>
  );
}
