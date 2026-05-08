import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { Alert } from '@mui/material';
import { buildAlternates } from '@/lib/seo/metadata';
import { generateItemListSchema } from '@/lib/seo/schemas';
import KeamSpokeShell from '@/components/keam-arch/KeamSpokeShell';
import CollegesLocator from '@/components/keam-arch/CollegesLocator';
import { colleges, districts, universities, totalSeats } from '@/data/keam-arch-2026';

export const revalidate = 86400;

const baseUrl = 'https://neramclasses.com';
const SPOKE = 'colleges-in-kerala';

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return {
    title: `KEAM B.Arch Colleges 2026: ${colleges.length} Architecture Colleges in Kerala`,
    description: `${colleges.length} B.Arch colleges in Kerala under KEAM 2026 with ${totalSeats}+ seats. Search by district, filter by affiliating university (Calicut, Kerala, CUSAT, KTU, MG). Address, phone, and Google Maps for every college.`,
    keywords:
      'KEAM B.Arch colleges 2026, architecture colleges Kerala, B.Arch colleges Kochi, B.Arch colleges Thiruvananthapuram, Kerala architecture colleges list, KEAM college codes',
    alternates: buildAlternates(locale, `/counseling/keam-arch/${SPOKE}`),
  };
}

export default function CollegesInKeralaPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  setRequestLocale(locale);

  const itemListSchema = generateItemListSchema(
    colleges.map((c) => ({
      name: c.name,
      url: `${baseUrl}/counseling/keam-arch/${SPOKE}#college-${c.code}`,
      description: `${c.city}, ${c.district}, Kerala (Code ${c.code}, affiliated to ${c.university}, ${c.seats} seats)`,
    })),
  );

  const collegeSchemas = colleges.map((c) => ({
    '@context': 'https://schema.org',
    '@type': 'CollegeOrUniversity',
    name: c.name,
    address: {
      '@type': 'PostalAddress',
      addressLocality: c.city,
      addressRegion: 'Kerala',
      addressCountry: 'IN',
    },
    ...(c.phones[0] && { telephone: c.phones[0] }),
    identifier: c.code,
    parentOrganization: {
      '@type': 'EducationalOrganization',
      name: `${c.university} University / Affiliating Body`,
    },
  }));

  return (
    <KeamSpokeShell
      locale={locale}
      spokeSlug={SPOKE}
      spokeChip="College Locator"
      topicTitle={`${colleges.length} B.Arch Colleges in Kerala under KEAM 2026`}
      topicSubtitle={`Combined intake of about ${totalSeats} seats across ${districts.length} districts and 5 affiliating universities. Use the search and filters to find the colleges you want to add to your KEAM option list.`}
      jsonLd={[itemListSchema, ...collegeSchemas]}
      related={[
        { label: 'Eligibility & Documents', href: 'eligibility-documents' },
        { label: 'CAP Allotment Process', href: 'allotment-process' },
        { label: 'Reservation & Fee Concession', href: 'reservation-fee-concession' },
      ]}
      aintraSuggestions={[
        'Top B.Arch colleges in Ernakulam?',
        'Government B.Arch colleges in Kerala?',
        'Colleges affiliated to KTU?',
        'Cheapest B.Arch college in Kerala?',
      ]}
      prefillCallbackNotes="Need help shortlisting B.Arch colleges in Kerala"
    >
      <Alert severity="info" sx={{ mb: 3, borderRadius: 1.5 }}>
        This list is based on the 2026 prospectus (Annexure II(1)(a)). The final college list, seat matrix, and tuition fee structure are notified by CEE before CAP-2026 begins.
      </Alert>

      <CollegesLocator colleges={colleges} districts={districts} universities={universities} />
    </KeamSpokeShell>
  );
}
