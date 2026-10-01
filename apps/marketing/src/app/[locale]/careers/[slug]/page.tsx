import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { JsonLd } from '@/components/seo/JsonLd';
import { generateBreadcrumbSchema } from '@/lib/seo/schemas';
import { unstable_cache } from 'next/cache';
import { createAdminClientISR, getPublishedJobBySlug } from '@neram/database';
import { CACHE_TAGS } from '@/lib/cache-tags';
import type { JobPosting, EmploymentType } from '@neram/database';
import JobDetailContent from '@/components/careers/JobDetailContent';

// ISR daily. The read was a no-store client, which made this page render on
// every request; it is now cached (ISR client inside unstable_cache).
export const revalidate = 86400;

// An empty list registers the route for on-demand ISR. Without it Next 14 renders
// every request dynamically, and the revalidate above never takes effect. It adds
// no build files, so the 15k file cap is safe.
export function generateStaticParams() {
  return [];
}

const getJob = unstable_cache(
  async (slug: string) => getPublishedJobBySlug(slug, createAdminClientISR(86400)),
  ['marketing-job-by-slug-v1'],
  { revalidate: 86400, tags: [CACHE_TAGS.careers] },
);

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
  const job = await getJob(slug);

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

  const job = await getJob(slug);

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
