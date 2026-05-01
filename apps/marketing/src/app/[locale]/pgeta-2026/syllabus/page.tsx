import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { Typography, Box, Stack, Paper } from '@neram/ui';
import ExamSpokeLayout from '@/components/exam-hub/sections/ExamSpokeLayout';
import { buildAlternates } from '@/lib/seo/metadata';

export const revalidate = 3600;

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return {
    title: 'PGETA 2026 Syllabus: Architecture, Building Science, Electives, Research Aptitude',
    description:
      'PGETA 2026 syllabus covers architectural theory and history, urban design and planning, climate-responsive design, construction systems, building services, professional practice, and research methodology. Detailed syllabus in the official COA Information Brochure.',
    keywords:
      'PGETA syllabus, PGEAT syllabus, M.Arch entrance syllabus, COA M.Arch syllabus, PGETA topics, PGETA brochure',
    alternates: buildAlternates(locale, '/pgeta-2026/syllabus'),
  };
}

export default function PgetaSyllabusPage({ params: { locale } }: { params: { locale: string } }) {
  setRequestLocale(locale);

  const sections = [
    {
      title: 'Architectural theory and history',
      summary:
        'Foundational vocabulary of architecture: classical orders, modernism, postmodernism, Indian architectural traditions (Hindu, Mughal, colonial, post-Independence), and contemporary movements. Architects and their canonical works. Critical theory.',
    },
    {
      title: 'Urban design and planning',
      summary:
        'City form, public space, transit-oriented development, density and zoning, urban morphology, smart cities. Land-use planning, master plans, zoning regulations. Indian urban context: census towns, slum upgradation, JNNURM and Smart Cities Mission.',
    },
    {
      title: 'Climate-responsive and sustainable design',
      summary:
        'Passive design strategies, orientation, shading, ventilation, daylighting. Embodied energy, life-cycle assessment. Green building rating systems: LEED, GRIHA, IGBC. Net-zero, regenerative design, vernacular precedents.',
    },
    {
      title: 'Building construction systems and services',
      summary:
        'Structural systems (load-bearing, framed, shell, tensile), construction materials, waterproofing, fenestration. MEP services: HVAC, plumbing, electrical, fire safety, vertical transportation. Acoustic and lighting design fundamentals.',
    },
    {
      title: 'Professional practice and ethics',
      summary:
        'Architect Act 1972, COA registration, code of conduct, fee scales, contracts, building bye-laws, RERA, project management basics. Architect-client and architect-contractor relationships. Ethics in design and practice.',
    },
    {
      title: 'Research and documentation',
      summary:
        'Research methodology, qualitative vs quantitative research, literature review, citation styles. Documentation techniques: measured drawings, photographic surveys, GIS, drone-based surveys. Thesis structure and viva preparation.',
    },
  ];

  return (
    <ExamSpokeLayout
      examName="PGETA 2026"
      examShortName="PGETA 2026"
      examHubHref="/pgeta-2026"
      examColor="secondary"
      topicTitle="PGETA 2026 syllabus, broad areas"
      topicSubtitle="Six broad areas, mapped to the 4-module exam pattern. The detailed topic list is published in the official PGETA Information Brochure on the COA portal. Always verify against the latest brochure."
      related={[
        { label: 'Exam pattern', href: '/pgeta-2026/exam-pattern' },
        { label: 'Preparation', href: '/pgeta-2026/preparation' },
        { label: 'Eligibility', href: '/pgeta-2026/eligibility' },
      ]}
    >
      <Stack spacing={2}>
        {sections.map((s, idx) => (
          <Paper
            key={s.title}
            elevation={0}
            sx={{
              p: 3,
              borderRadius: 2,
              border: '1px solid',
              borderColor: 'divider',
              borderLeft: '4px solid',
              borderLeftColor: 'secondary.main',
            }}
          >
            <Typography variant="overline" sx={{ color: 'secondary.main', fontWeight: 700 }}>
              Area {idx + 1}
            </Typography>
            <Typography variant="h6" component="h2" sx={{ fontWeight: 700, mb: 1 }}>
              {s.title}
            </Typography>
            <Typography sx={{ lineHeight: 1.8, color: 'text.primary' }}>{s.summary}</Typography>
          </Paper>
        ))}
        <Paper variant="outlined" sx={{ p: 3, borderRadius: 2, bgcolor: 'rgba(220, 0, 78, 0.04)' }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
            Cross-reference with the brochure
          </Typography>
          <Typography sx={{ lineHeight: 1.7 }}>
            COA publishes the authoritative syllabus in the PGETA 2026 Information Brochure. Download it from coa.gov.in or pgeta.in and verify each topic before exam day. The brochure also lists recommended texts and reference materials.
          </Typography>
        </Paper>
      </Stack>
    </ExamSpokeLayout>
  );
}
