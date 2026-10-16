import { Box } from '@mui/material';
import VerifiedOutlinedIcon from '@mui/icons-material/VerifiedOutlined';
import type { CollegeContentSection, CollegeDetail } from '@/lib/college-hub/types';
import { siteTokens } from '@neram/ui/site-tokens';

function day(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
}

/**
 * "Provided by the college, updated 15 Oct 2026": shown on a section when the
 * college sent this content from its dashboard and Neram staff approved it.
 */
export default function ProvidedByCollege({ college, section }: { college: CollegeDetail; section: CollegeContentSection }) {
  const at = college.college_provided?.[section];
  if (!at) return null;
  const when = day(at);
  return (
    <Box
      component="p"
      sx={{ m: 0, display: 'inline-flex', alignItems: 'center', gap: 0.5, fontSize: '0.8rem', fontWeight: 600, color: siteTokens.success }}
    >
      <VerifiedOutlinedIcon aria-hidden sx={{ fontSize: 16 }} />
      Provided by the college{when ? `, updated ${when}` : ''}
    </Box>
  );
}
