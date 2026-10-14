import { Box, Typography } from '@mui/material';
import DirectionsOutlinedIcon from '@mui/icons-material/DirectionsOutlined';
import PhoneOutlinedIcon from '@mui/icons-material/PhoneOutlined';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import TrainOutlinedIcon from '@mui/icons-material/TrainOutlined';
import FlightOutlinedIcon from '@mui/icons-material/FlightOutlined';
import type { CollegeDetail } from '@/lib/college-hub/types';
import { statLabelSx } from '../directory/hub-styles';

export function fullAddress(c: CollegeDetail): string {
  const parts = [c.address, c.city, c.district && c.district !== c.city ? `${c.district} District` : null, c.state].filter(Boolean) as string[];
  // The address often already contains the city; drop exact repeats.
  const seen = new Set<string>();
  const out = parts.filter((p) => {
    const k = p.trim().toLowerCase();
    if (seen.has(k) || (c.address && p !== c.address && c.address.toLowerCase().includes(k))) return false;
    seen.add(k);
    return true;
  });
  return `${out.join(', ')}${c.pincode ? ` ${c.pincode}` : ''}`;
}

export function directionsUrl(c: CollegeDetail): string {
  if (c.latitude && c.longitude) return `https://www.google.com/maps/search/?api=1&query=${c.latitude},${c.longitude}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${c.name}, ${c.city}, ${c.state}`)}`;
}

const button = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 1,
  minHeight: 46,
  px: 2,
  borderRadius: 1.5,
  fontSize: '0.9rem',
  fontWeight: 600,
  textDecoration: 'none',
  '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
};

/** Location and contact (canvas: address, admissions phone, website, directions, call). */
export default function LocationContact({ college: c }: { college: CollegeDetail }) {
  const phone = c.admissions_phone ?? c.phone;
  const email = c.admissions_email ?? c.email;
  const travel = [
    c.nearest_railway && { Icon: TrainOutlinedIcon, label: 'Nearest railway station', value: `${c.nearest_railway}${c.railway_distance_km ? ` · ${c.railway_distance_km} km` : ''}` },
    c.nearest_airport && { Icon: FlightOutlinedIcon, label: 'Nearest airport', value: `${c.nearest_airport}${c.airport_distance_km ? ` · ${c.airport_distance_km} km` : ''}` },
  ].filter(Boolean) as Array<{ Icon: typeof TrainOutlinedIcon; label: string; value: string }>;

  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2.5 }}>
      <Box component="dl" sx={{ m: 0, flex: '1 1 300px', display: 'flex', flexDirection: 'column', gap: 1.75 }}>
        <Box>
          <Box component="dt" sx={statLabelSx}>Address</Box>
          <Box component="dd" sx={{ m: 0, mt: 0.25, fontSize: '0.95rem', lineHeight: 1.55 }}>{fullAddress(c)}</Box>
        </Box>
        {phone && (
          <Box>
            <Box component="dt" sx={statLabelSx}>Admissions phone</Box>
            <Box component="dd" sx={{ m: 0, mt: 0.25 }}>
              <Box component="a" href={`tel:${phone.replace(/\s/g, '')}`} sx={{ fontSize: '0.95rem', fontWeight: 600, color: 'primary.dark', textDecoration: 'none', display: 'inline-flex', minHeight: 32, alignItems: 'center' }}>
                {phone}
              </Box>
            </Box>
          </Box>
        )}
        {email && (
          <Box>
            <Box component="dt" sx={statLabelSx}>Email</Box>
            <Box component="dd" sx={{ m: 0, mt: 0.25, overflowWrap: 'anywhere' }}>
              <Box component="a" href={`mailto:${email}`} sx={{ fontSize: '0.95rem', fontWeight: 600, color: 'primary.dark', textDecoration: 'none', display: 'inline-flex', minHeight: 32, alignItems: 'center' }}>
                {email}
              </Box>
            </Box>
          </Box>
        )}
        {travel.map(({ Icon, label, value }) => (
          <Box key={label}>
            <Box component="dt" sx={{ ...statLabelSx, display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Icon aria-hidden sx={{ fontSize: 15 }} />
              {label}
            </Box>
            <Box component="dd" sx={{ m: 0, mt: 0.25, fontSize: '0.95rem' }}>{value}</Box>
          </Box>
        ))}
      </Box>

      <Box sx={{ flex: '1 1 240px', display: 'flex', flexDirection: 'column', gap: 1.25, justifyContent: 'flex-start' }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: phone ? 'repeat(2, minmax(0, 1fr))' : '1fr', gap: 1 }}>
          <Box component="a" href={directionsUrl(c)} target="_blank" rel="noopener noreferrer" sx={{ ...button, bgcolor: 'grey.900', color: 'common.white', '&:hover': { bgcolor: 'grey.800' } }}>
            <DirectionsOutlinedIcon aria-hidden sx={{ fontSize: 18 }} />
            Directions
          </Box>
          {phone && (
            <Box component="a" href={`tel:${phone.replace(/\s/g, '')}`} sx={{ ...button, border: '1px solid', borderColor: 'grey.400', color: 'text.primary', '&:hover': { bgcolor: 'action.hover' } }}>
              <PhoneOutlinedIcon aria-hidden sx={{ fontSize: 18 }} />
              Call admissions
            </Box>
          )}
        </Box>
        {c.website && (
          <Box component="a" href={c.website} target="_blank" rel="noopener noreferrer" sx={{ ...button, justifyContent: 'flex-start', px: 0, color: 'primary.dark' }}>
            Visit official website
            <OpenInNewIcon aria-hidden sx={{ fontSize: 16 }} />
          </Box>
        )}
        <Typography sx={{ m: 0, fontSize: '0.82rem', color: 'text.secondary', lineHeight: 1.5 }}>
          Opening hours and visit rules vary. Call before you travel.
        </Typography>
      </Box>
    </Box>
  );
}
