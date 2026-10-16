import { Box, Typography } from '@mui/material';
import EventOutlinedIcon from '@mui/icons-material/EventOutlined';
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined';
import type { CollegeDetail } from '@/lib/college-hub/types';
import { siteTokens } from '@neram/ui/site-tokens';

function day(value: string): string {
  const d = new Date(`${value}T00:00:00+05:30`);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
}

/** Application dates and scholarships the college gave us (college dashboard). Nothing when neither is set. */
export default function AdmissionDates({ college }: { college: CollegeDetail }) {
  const opens = college.admission_opens_on;
  const closes = college.admission_closes_on;
  const scholarships = college.scholarships_text?.trim();
  if (!opens && !closes && !scholarships) return null;

  const dates = opens && closes ? `${day(opens)} to ${day(closes)}` : opens ? `From ${day(opens)}` : `Until ${day(closes!)}`;

  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(260px, 100%), 1fr))', gap: 1.5 }}>
      {(opens || closes) && (
        <Box sx={{ display: 'flex', gap: 1.25, p: 1.75, borderRadius: 1, bgcolor: siteTokens.surfaceHover }}>
          <EventOutlinedIcon aria-hidden sx={{ color: siteTokens.navy900, mt: '2px' }} />
          <Box>
            <Typography component="h3" sx={{ m: 0, fontSize: '0.95rem', fontWeight: 700 }}>Applications</Typography>
            <Typography sx={{ m: 0, fontSize: '0.92rem', color: siteTokens.inkMuted }}>{dates}</Typography>
          </Box>
        </Box>
      )}
      {scholarships && (
        <Box sx={{ display: 'flex', gap: 1.25, p: 1.75, borderRadius: 1, bgcolor: siteTokens.surface, boxShadow: `inset 3px 0 0 ${siteTokens.success}, inset 0 0 0 1px ${siteTokens.line}` }}>
          <SchoolOutlinedIcon aria-hidden sx={{ color: siteTokens.success, mt: '2px' }} />
          <Box sx={{ minWidth: 0 }}>
            <Typography component="h3" sx={{ m: 0, fontSize: '0.95rem', fontWeight: 700 }}>Scholarships</Typography>
            <Typography sx={{ m: 0, fontSize: '0.92rem', color: siteTokens.inkMuted, whiteSpace: 'pre-line' }}>{scholarships}</Typography>
          </Box>
        </Box>
      )}
    </Box>
  );
}
