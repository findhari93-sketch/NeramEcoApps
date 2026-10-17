import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { Box } from '@mui/material';
import { Callout } from '@/design-system';
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
    title: `TNEA TFC Centre Near Me: ${tfcs.length}+ Centres`,
    description: `Find the TNEA TFC centre near you: ${tfcs.length}+ facilitation centres across ${districts.length} districts of Tamil Nadu, each with address, phone, hours (9 AM to 5 PM) and a map link.`,
    keywords:
      'TFC centre near me, TNEA TFC centre, TNEA TFC list 2026, TNEA facilitation centre, TNEA centre Chennai, TNEA centre Coimbatore, TNEA centre Madurai, TNEA registration centre near me',
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
      topicTitle={`Find a TNEA TFC Centre Near You: ${tfcs.length}+ in Tamil Nadu`}
      topicSubtitle={`To find your nearest TFC centre, search by city or college name, or filter by district. Every TFC has working hours of 9 AM to 5 PM, click-to-call phone numbers, and a Google Maps link.`}
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
      <Box sx={{ mb: 3 }}>
        <Callout>
          <Box component="p" sx={{ m: 0 }}>
              Visiting a TFC is optional. You can register and upload certificates from anywhere at <strong>tneaonline.org</strong>. TFCs help with verification and provide assistance to candidates who need it.
          </Box>
        </Callout>
      </Box>

      <TfcLocator tfcs={tfcs} districts={districts} />
    </TneaSpokeShell>
  );
}
