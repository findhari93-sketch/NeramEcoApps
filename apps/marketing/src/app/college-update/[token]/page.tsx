import type { Metadata } from 'next';
import { Box, Paper, Typography } from '@mui/material';
import LinkOffOutlinedIcon from '@mui/icons-material/LinkOffOutlined';
import { createAdminClient } from '@neram/database';
import { loadLink, linkSections, PROBLEM_TEXT } from '@/lib/college-update/link';
import { loadLiveSections } from '@/lib/college-dashboard/content-data';
import UpdateForm from './UpdateForm';

// Per-link and always current: never cached or prerendered.
export const dynamic = 'force-dynamic';

async function load(token: string) {
  const db = createAdminClient() as any;
  const { link, problem } = await loadLink(db, token);
  if (problem || !link) return { problem: problem ?? 'invalid' as const };
  const { college, sections } = await loadLiveSections(db, link.college_id);
  const { data: extra } = await db.from('colleges').select('city, state').eq('id', link.college_id).single();
  return { link, college: { ...college, ...(extra ?? {}) }, sections };
}

export async function generateMetadata({ params }: { params: { token: string } }): Promise<Metadata> {
  const data = await load(params.token);
  const name = 'college' in data && data.college ? String(data.college.name) : null;
  return {
    title: name ? `Update ${name} on Neram Classes` : 'Update your college details | Neram Classes',
    description: 'Check and correct your college details on Neram Classes. About 5 minutes, no login needed.',
    robots: { index: false, follow: false },
  };
}

export default async function CollegeUpdatePage({ params }: { params: { token: string } }) {
  const data = await load(params.token);

  if ('problem' in data && data.problem) {
    const p = PROBLEM_TEXT[data.problem];
    return (
      <Box component="main" sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'grey.50', px: 2 }}>
        <Paper variant="outlined" sx={{ maxWidth: 440, p: 3, borderRadius: 3, textAlign: 'center' }}>
          <LinkOffOutlinedIcon aria-hidden sx={{ fontSize: 44, color: 'text.disabled', mb: 1 }} />
          <Typography variant="h1" sx={{ fontSize: 22, fontWeight: 700, mb: 1 }}>{p.title}</Typography>
          <Typography sx={{ color: 'text.secondary', fontSize: 15.5, lineHeight: 1.55 }}>{p.body}</Typography>
        </Paper>
      </Box>
    );
  }

  const { link, college, sections } = data as Exclude<typeof data, { problem: unknown }>;
  const asked = linkSections(link);
  return (
    <UpdateForm
      token={params.token}
      college={{
        name: String(college.name),
        city: (college.city as string | null) ?? null,
        logo: (college.logo_url as string | null) ?? null,
      }}
      recipientName={link.recipient_name}
      expiresAt={link.expires_at}
      sections={asked}
      live={Object.fromEntries(asked.map((s) => [s, sections[s]]))}
    />
  );
}
