import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { JsonLd } from '@/components/seo/JsonLd';
import { generateBreadcrumbSchema } from '@/lib/seo/schemas';
import { createServerClient, getPublishedJobBySlug } from '@neram/database';
import type { JobPosting, EmploymentType } from '@neram/database';
import JobDetailContent from '@/components/careers/JobDetailContent';

const baseUrl = 'https://neramclasses.com';

function mapEmploymentType(type: EmploymentType): string {
  const map: Record<EmploymentType, string> = {
    full_time: 'FULL_TIME',
    part_time: 'PART_TIME',
    contract: 'CONTRACTOR',
    internship: 'INTERN',
  };
  return map[type] || 'OTHER';
}

function generateJobPostingSchema(job: JobPosting) {
  return {
    '@context': 'https://schema.org',
    '@type': 'JobPosting',
    title: job.title,
    description: job.description,
    datePosted: job.published_at || job.created_at,
    employmentType: mapEmploymentType(job.employment_type),
    jobLocation: {
      '@type': 'Place',
      address: {
        '@type': 'PostalAddress',
        addressLocality: job.location,
        addressCountry: 'IN',
      },
    },
    hiringOrganization: {
      '@type': 'Organization',
      name: 'Neram Classes',
      sameAs: baseUrl,
      logo: `${baseUrl}/logo.png`,
    },
    ...(job.experience_required && {
      experienceRequirements: job.experience_required,
    }),
    ...(job.skills_required && job.skills_required.length > 0 && {
      skills: job.skills_required.join(', '),
    }),
  };
}

export async function generateMetadata({
  params: { locale, slug },
}: {
  params: { locale: string; slug: string };
}): Promise<Metadata> {
  const client = createServerClient();
  const job = await getPublishedJobBySlug(slug, client);

  if (!job) {
    return {
      title: 'Job Not Found - Careers at Neram Classes',
    };
  }

  const description = job.description.substring(0, 160);

  return {
    title: `${job.title} - Careers at Neram Classes`,
    description,
    alternates: {
      canonical: locale === 'en' ? `${baseUrl}/careers/${slug}` : `${baseUrl}/${locale}/careers/${slug}`,
    },
    openGraph: {
      title: `${job.title} - Careers at Neram Classes`,
      description,
      type: 'article',
      url: locale === 'en' ? `${baseUrl}/careers/${slug}` : `${baseUrl}/${locale}/careers/${slug}`,
    },
  };
}

export default async function CareerDetailPage({
  params: { locale, slug },
}: {
  params: { locale: string; slug: string };
}) {
  setRequestLocale(locale);

  const client = createServerClient();
  const job = await getPublishedJobBySlug(slug, client);

  if (!job) {
    notFound();
  }

  return (
    <>
      <JsonLd
        data={[
          generateBreadcrumbSchema([
            { name: 'Home', url: baseUrl },
            { name: 'Careers', url: `${baseUrl}/careers` },
            { name: job.title },
          ]),
          generateJobPostingSchema(job),
        ]}
      />
      <JobDetailContent job={job} />
    </>
  );
}
