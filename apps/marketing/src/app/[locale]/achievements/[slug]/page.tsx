import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { createAdminClient } from '@neram/database';
import type { StudentResult, StudentResultExamType } from '@neram/database';
import { JsonLd } from '@/components/seo/JsonLd';
import { buildAlternates } from '@/lib/seo/metadata';
import { BASE_URL, ORG_NAME } from '@/lib/seo/constants';
import StudentDetailContent from '@/components/achievements/StudentDetailContent';

interface PageProps {
  params: { locale: string; slug: string };
}

const EXAM_TYPE_LABELS: Record<StudentResultExamType, string> = {
  nata: 'NATA',
  jee_paper2: 'JEE Paper 2',
  tnea: 'TNEA',
  other: 'Exam',
};

async function getStudentResult(slug: string): Promise<StudentResult | null> {
  const supabase = createAdminClient();
  const { data, error } = await (supabase
    .from('student_results' as any) as any)
    .select('*')
    .eq('slug', slug)
    .eq('is_published', true)
    .single();

  if (error || !data) return null;
  return data as unknown as StudentResult;
}

export async function generateMetadata({ params: { locale, slug } }: PageProps): Promise<Metadata> {
  const result = await getStudentResult(slug);

  if (!result) {
    return {
      title: 'Result Not Found | Neram Classes',
      description: 'The student result you are looking for could not be found.',
    };
  }

  const examLabel = EXAM_TYPE_LABELS[result.exam_type] || 'Exam';
  const scoreText = result.score != null && result.max_score != null
    ? `${result.score}/${result.max_score}`
    : result.rank != null
      ? `Rank ${result.rank}`
      : '';

  const title = scoreText
    ? `${result.student_name} scored ${scoreText} in ${examLabel} ${result.exam_year} | ${ORG_NAME}`
    : `${result.student_name} in ${examLabel} ${result.exam_year} | ${ORG_NAME}`;

  const descriptionParts: string[] = [
    `${result.student_name} achieved`,
  ];
  if (result.score != null && result.max_score != null) {
    descriptionParts.push(`a score of ${result.score}/${result.max_score}`);
  }
  if (result.rank != null) {
    descriptionParts.push(`All India Rank ${result.rank}`);
  }
  descriptionParts.push(`in ${examLabel} ${result.exam_year}`);
  if (result.college_name) {
    descriptionParts.push(`and secured admission at ${result.college_name}`);
  }
  descriptionParts.push(`with coaching from ${ORG_NAME}.`);
  const description = descriptionParts.join(' ');

  const ogImages: Array<{ url: string; width: number; height: number; alt: string }> = [];
  if (result.scorecard_watermarked_url) {
    ogImages.push({
      url: result.scorecard_watermarked_url,
      width: 1200,
      height: 630,
      alt: `${result.student_name} ${examLabel} ${result.exam_year} Scorecard`,
    });
  }

  const path = `/achievements/${slug}`;

  return {
    title,
    description,
    alternates: buildAlternates(locale, path),
    openGraph: {
      title,
      description,
      url: `${BASE_URL}${path}`,
      type: 'article',
      ...(ogImages.length > 0 && { images: ogImages }),
    },
    twitter: {
      card: ogImages.length > 0 ? 'summary_large_image' : 'summary',
      title,
      description,
      ...(ogImages.length > 0 && { images: [ogImages[0].url] }),
    },
  };
}

function generateStudentResultJsonLd(result: StudentResult) {
  const examLabel = EXAM_TYPE_LABELS[result.exam_type] || 'Exam';
  const resultUrl = `${BASE_URL}/achievements/${result.slug}`;

  const credentialSchema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'EducationalOccupationalCredential',
    name: `${examLabel} ${result.exam_year} Result`,
    description: result.score != null && result.max_score != null
      ? `${result.student_name} scored ${result.score}/${result.max_score} in ${examLabel} ${result.exam_year}`
      : `${result.student_name} participated in ${examLabel} ${result.exam_year}`,
    url: resultUrl,
    credentialCategory: 'Entrance Exam Result',
    recognizedBy: {
      '@type': 'EducationalOrganization',
      name: ORG_NAME,
      url: BASE_URL,
    },
  };

  if (result.score != null && result.max_score != null) {
    credentialSchema.educationalLevel = `Score: ${result.score}/${result.max_score}`;
  }

  if (result.scorecard_watermarked_url) {
    credentialSchema.image = result.scorecard_watermarked_url;
  }

  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Home',
        item: BASE_URL,
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Achievements',
        item: `${BASE_URL}/achievements`,
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: result.student_name,
        item: resultUrl,
      },
    ],
  };

  return [credentialSchema, breadcrumbSchema];
}

export default async function StudentDetailPage({ params: { locale, slug } }: PageProps) {
  setRequestLocale(locale);

  const result = await getStudentResult(slug);

  if (!result) {
    notFound();
  }

  const jsonLdData = generateStudentResultJsonLd(result);

  return (
    <>
      <JsonLd data={jsonLdData} />
      <StudentDetailContent slug={slug} locale={locale} />
    </>
  );
}
