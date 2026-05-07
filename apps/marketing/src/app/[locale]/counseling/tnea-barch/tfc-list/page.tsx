import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { Alert } from '@mui/material';
import { buildAlternates } from '@/lib/seo/metadata';
import {
  generateItemListSchema,
  generateGenericLocalBusinessSchema,
} from '@/lib/seo/schemas';
import TneaSpokeShell from '@/components/tnea-barch/TneaSpokeShell';
import TfcLocator from '@/components/tnea-barch/TfcLocator';
import { tfcs, districts } from '@/data/tnea-barch-2026';

const baseUrl = 'https://neramclasses.com';
const SPOKE = 'tfc-list';

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return {
    title: `TNEA TFC List 2026: ${tfcs.length}+ Facilitation Centres in Tamil Nadu`,
    description: `Find your nearest TNEA Facilitation Centre. Search ${tfcs.length}+ TFCs across ${districts.length} districts of Tamil Nadu. Address, phone, working hours (9 AM to 5 PM), and map for every centre.`,
    keywords:
      'TNEA TFC list 2026, TNEA facilitation centre, TNEA centre Chennai, TNEA centre Coimbatore, TNEA centre Madurai, TNEA registration centre near me',
    alternates: buildAlternates(locale, `/counseling/tnea-barch/${SPOKE}`),
  };
}

export default function TfcListPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  setRequestLocale(locale);

  const itemListSchema = generateItemListSchema(
    tfcs.map((t) => ({
      name: t.name,
      url: `${baseUrl}/counseling/tnea-barch/${SPOKE}#tfc-${t.tfc_number}`,
      description: `${t.address} (TFC ${t.tfc_number}, ${t.district})`,
    })),
  );

  const localBusinessSchemas = tfcs.map((t) =>
    generateGenericLocalBusinessSchema({
      name: t.name,
      addressLocality: t.district,
      addressRegion: 'Tamil Nadu',
      streetAddress: t.address,
      postalCode: t.pincode,
      telephone: t.coordinator_phone,
      opens: '09:00',
      closes: '17:00',
      identifier: `TFC-${t.tfc_number}`,
    }),
  );

  return (
    <TneaSpokeShell
      locale={locale}
      spokeSlug={SPOKE}
      spokeChip="TFC Locator"
      topicTitle={`${tfcs.length}+ TNEA Facilitation Centres in Tamil Nadu`}
      topicSubtitle={`Search by city, college name, or filter by district. Every TFC has working hours of 9 AM to 5 PM, click-to-call phone numbers, and a Google Maps link.`}
      jsonLd={[itemListSchema, ...localBusinessSchemas]}
      related={[
        { label: 'How to Apply', href: 'how-to-apply' },
        { label: 'Counselling Procedure', href: 'counselling-procedure' },
        { label: 'Eligibility & Documents', href: 'eligibility-documents' },
      ]}
      aintraSuggestions={[
        'TFC nearest to Chennai?',
        'Coimbatore TFC list',
        'TFC working hours?',
        'Do I need to visit a TFC?',
      ]}
      prefillCallbackNotes="Need help finding the nearest TFC for TNEA B.Arch"
    >
      <Alert severity="info" sx={{ mb: 3, borderRadius: 1.5 }}>
        Visiting a TFC is optional. You can register and upload certificates from anywhere at <strong>tneaonline.org</strong>. TFCs help with verification and provide assistance to candidates who need it.
      </Alert>

      <TfcLocator tfcs={tfcs} districts={districts} />
    </TneaSpokeShell>
  );
}
