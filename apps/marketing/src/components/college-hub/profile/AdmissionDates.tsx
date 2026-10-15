import { Box, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import EventOutlinedIcon from '@mui/icons-material/EventOutlined';
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined';
import type { CollegeDetail } from '@/lib/college-hub/types';

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
        <Box sx={{ display: 'flex', gap: 1.25, p: 1.75, borderRadius: 2, bgcolor: (t) => alpha(t.palette.primary.main, 0.06) }}>
          <EventOutlinedIcon aria-hidden sx={{ color: 'primary.main', mt: '2px' }} />
          <Box>
            <Typography component="h3" sx={{ m: 0, fontSize: '0.95rem', fontWeight: 700 }}>Applications</Typography>
            <Typography sx={{ m: 0, fontSize: '0.92rem', color: 'text.secondary' }}>{dates}</Typography>
          </Box>
        </Box>
      )}
      {scholarships && (
        <Box sx={{ display: 'flex', gap: 1.25, p: 1.75, borderRadius: 2, bgcolor: (t) => alpha(t.palette.success.main, 0.07) }}>
          <SchoolOutlinedIcon aria-hidden sx={{ color: 'success.dark', mt: '2px' }} />
          <Box sx={{ minWidth: 0 }}>
            <Typography component="h3" sx={{ m: 0, fontSize: '0.95rem', fontWeight: 700 }}>Scholarships</Typography>
            <Typography sx={{ m: 0, fontSize: '0.92rem', color: 'text.secondary', whiteSpace: 'pre-line' }}>{scholarships}</Typography>
          </Box>
        </Box>
      )}
    </Box>
  );
}
