import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Box } from '@mui/material';
import { JsonLd } from '@/components/seo/JsonLd';
import { generateStateListingMetadata } from '@/lib/college-hub/seo';
import { generateListingBreadcrumbSchema } from '@/lib/college-hub/schema-markup';
import { getStateColleges } from '@/lib/college-hub/queries';
import { STATE_NAMES } from '@/lib/college-hub/constants';
import { toListingCollege } from '@/lib/college-hub/listing-filter';
import StateCollegeListing from '@/components/college-hub/StateCollegeListing';

// ISR daily (lazy: an empty generateStaticParams, so no new build files). It used to be
// force-dynamic to read searchParams: every view ran a function and three
// no-store queries. Filters are now applied in the browser over the state's
// list (StateCollegeListing); crawlers get the default ArchIndex order.
export const revalidate = 86400;

// An empty list registers the route for on-demand ISR. Without it Next 14 renders
// every request dynamically, and the revalidate above never takes effect. It adds
// no build files, so the 15k file cap is safe.
export function generateStaticParams() {
  return [];
}

type Props = {
  params: { locale: string; state: string };
};

function stateNameOf(state: string) {
  return STATE_NAMES[state] ?? state.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export async function generateMetadata({ params: { locale, state } }: Props): Promise<Metadata> {
  // Same cached read as the page (React.cache + Data Cache), not a second query.
  const colleges = await getStateColleges(state).catch(() => []);
  return generateStateListingMetadata(locale, state, stateNameOf(state), colleges.length);
}

export default async function StateCollegesPage({ params: { locale, state } }: Props) {
  setRequestLocale(locale);

  const stateName = stateNameOf(state);
  const colleges = await getStateColleges(state);
  if (colleges.length === 0) notFound();

  const breadcrumb = generateListingBreadcrumbSchema([
    { name: 'Home', path: '' },
    { name: 'Colleges', path: '/colleges' },
    { name: `B.Arch in ${stateName}`, path: `/colleges/${state}` },
  ]);

  return (
    <>
      <JsonLd data={breadcrumb} />
      <Box sx={{ py: { xs: 1, sm: 4 } }}>
        <StateCollegeListing colleges={colleges.map(toListingCollege)} state={state} stateName={stateName} />
      </Box>
    </>
  );
}
