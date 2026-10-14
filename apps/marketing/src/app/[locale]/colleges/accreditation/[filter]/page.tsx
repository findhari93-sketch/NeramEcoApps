import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { JsonLd } from '@/components/seo/JsonLd';
import { generateAccreditationMetadata } from '@/lib/college-hub/seo';
import { generateListingBreadcrumbSchema } from '@/lib/college-hub/schema-markup';
import { getCollegesByAccreditation } from '@/lib/college-hub/queries';
import { ACCREDITATION_FILTERS } from '@/lib/college-hub/constants';
import { Box } from '@mui/material';
import DirectoryListing from '@/components/college-hub/directory/DirectoryListing';
import { toListingCollege } from '@/lib/college-hub/listing-filter';
import { CATEGORY_INDEX_HREF, relatedCategories } from '@/lib/college-hub/categories';

export const revalidate = 86400;

type Props = { params: { locale: string; filter: string } };

// English only. See colleges/[state]/[slug] for the rationale.
export async function generateStaticParams() {
  return Object.keys(ACCREDITATION_FILTERS).map((filter) => ({ locale: 'en', filter }));
}

export async function generateMetadata({ params: { locale, filter } }: Props): Promise<Metadata> {
  if (!ACCREDITATION_FILTERS[filter]) return { title: 'Not Found' };
  const colleges = await getCollegesByAccreditation(filter);
  return generateAccreditationMetadata(locale, filter, colleges.length);
}

export default async function AccreditationCollegesPage({ params: { locale, filter } }: Props) {
  setRequestLocale(locale);

  const filterConfig = ACCREDITATION_FILTERS[filter];
  if (!filterConfig) notFound();

  const colleges = await getCollegesByAccreditation(filter);
  if (colleges.length === 0) notFound();

  const breadcrumb = generateListingBreadcrumbSchema([
    { name: 'Home', path: '' },
    { name: 'Colleges', path: '/colleges' },
    { name: filterConfig.label, path: `/colleges/accreditation/${filter}` },
  ]);

  const coa = filter === 'coa-approved';
  return (
    <>
      <JsonLd data={breadcrumb} />
      <Box>
        <DirectoryListing
          mode="category"
          colleges={colleges.map(toListingCollege)}
          breadcrumbs={[{ name: 'Colleges', href: '/colleges' }, { name: `${filterConfig.label} Colleges` }]}
          category={{
            eyebrow: 'Category · Accreditation',
            title: `${filterConfig.label} Architecture Colleges`,
            shortTitle: coa ? 'COA approved' : 'NAAC A+ and above',
            subtitle: coa
              ? `${colleges.length} colleges across India, approved by the Council of Architecture to teach B.Arch.`
              : `${colleges.length} colleges with a NAAC grade of A+ or A++.`,
            why: coa
              ? {
                  label: 'Why COA approval matters',
                  text: 'The Council of Architecture is the statutory body that approves B.Arch programmes in India. You need a degree from an approved college to register as an architect, so check this before you take a seat.',
                }
              : {
                  label: 'What NAAC grades mean',
                  text: 'NAAC, the National Assessment and Accreditation Council, grades colleges on teaching, research, infrastructure and student support. A++ is the highest grade, followed by A+ and A.',
                },
            related: relatedCategories(`/colleges/accreditation/${filter}`),
          }}
          hide={coa ? ['coa'] : ['naac']}
          locked={{ label: coa ? 'COA approved only' : 'NAAC A+ or A++', changeHref: CATEGORY_INDEX_HREF }}
        />
      </Box>
    </>
  );
}
