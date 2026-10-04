/**
 * "Visit our {City} classroom": the centre card on a centre's own city page
 * (the one page per classroom; /contact/{slug} 301s here). Map, address,
 * hours, phone, directions and visit booking. Server-rendered; the booking
 * form is the only client JS. The map iframe is lazy (below the fold) inside a
 * fixed 4:3 box, so it never shifts the page.
 */
import Link from 'next/link';
import { Box, Button, Typography } from '@neram/ui';
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined';
import ScheduleOutlinedIcon from '@mui/icons-material/ScheduleOutlined';
import PhoneOutlinedIcon from '@mui/icons-material/PhoneOutlined';
import DirectionsOutlinedIcon from '@mui/icons-material/DirectionsOutlined';
import StarOutlineRoundedIcon from '@mui/icons-material/StarOutlineRounded';
import type { ReactNode } from 'react';
import type { ClassroomCentre } from '@/lib/seo/facts';
import type { ClassroomFact } from '@/lib/seo/location-facts';
import { formatCentreHours } from '@/lib/seo/centre-hours';
import { CentreVisitForm } from './CentreVisitForm';
import { Section } from './parts';

import { googleRatingLine, mapEmbedUrl, streetOnly } from '@/lib/seo/centre-page';

export { streetOnly };

/** "+919176137043" -> "+91 91761 37043". */
export function formatIndianPhone(tel: string): string {
  const m = tel.replace(/\D/g, '').match(/^(?:91)?(\d{5})(\d{5})$/);
  return m ? `+91 ${m[1]} ${m[2]}` : tel;
}

function Line({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
      <Box aria-hidden sx={{ color: 'text.secondary', mt: '2px', display: 'flex' }}>
        {icon}
      </Box>
      <Box sx={{ minWidth: 0, lineHeight: 1.6 }}>{children}</Box>
    </Box>
  );
}

function CentreCard({ centre }: { centre: ClassroomCentre }) {
  const label = `Neram Classes ${centre.areaLabel}`;
  const hours = formatCentreHours(centre.hours);
  const street = streetOnly(centre.address, centre.city);
  const tel = centre.phone?.replace(/[^\d+]/g, '');
  const rating = googleRatingLine(centre.googleRating);

  return (
    <Box
      component="article"
      aria-labelledby={`centre-${centre.slug}`}
      sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, bgcolor: 'background.paper', overflow: 'hidden' }}
    >
      <Box sx={{ position: 'relative', aspectRatio: { xs: '4 / 3', sm: '16 / 9' }, bgcolor: 'grey.100' }}>
        <Box
          component="iframe"
          src={mapEmbedUrl(centre)}
          title={`Map: ${label}`}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }}
        />
      </Box>

      <Box sx={{ p: { xs: 2, sm: 3 } }}>
      <Typography id={`centre-${centre.slug}`} component="h3" sx={{ fontSize: '1.125rem', fontWeight: 700, mb: 2 }}>
        {label}
      </Typography>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        <Line icon={<PlaceOutlinedIcon fontSize="small" />}>
          <Typography component="address" sx={{ fontStyle: 'normal' }}>
            {street ? `${street}, ` : ''}
            {centre.city}, {centre.state}
            {centre.pincode ? ` ${centre.pincode}` : ''}
          </Typography>
          {centre.landmark && (
            <Typography component="span" sx={{ display: 'block', color: 'text.secondary' }}>
              {centre.landmark}
            </Typography>
          )}
        </Line>
        {hours.length > 0 && (
          <Line icon={<ScheduleOutlinedIcon fontSize="small" />}>
            {hours.map((h) => (
              <Typography key={h} component="span" sx={{ display: 'block' }}>
                {h}
              </Typography>
            ))}
          </Line>
        )}
        {tel && (
          <Line icon={<PhoneOutlinedIcon fontSize="small" />}>
            <Box component="a" href={`tel:${tel}`} sx={{ color: 'primary.main', display: 'inline-flex', alignItems: 'center', minHeight: 44 }}>
              {formatIndianPhone(tel)}
            </Box>
          </Line>
        )}
        {rating && (
          <Line icon={<StarOutlineRoundedIcon fontSize="small" />}>
            {centre.googleRating?.url ? (
              <Box component="a" href={centre.googleRating.url} target="_blank" rel="noopener noreferrer" sx={{ color: 'primary.main', display: 'inline-flex', alignItems: 'center', minHeight: 44 }}>
                {rating}
              </Box>
            ) : (
              rating
            )}
          </Line>
        )}
      </Box>

      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 2.5 }}>
        {centre.id && <CentreVisitForm centreId={centre.id} centreLabel={label} />}
        <Button
          component="a"
          variant="outlined"
          href={centre.mapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          startIcon={<DirectionsOutlinedIcon aria-hidden />}
          sx={{ minHeight: 48, fontWeight: 600, flex: { xs: '1 1 100%', sm: '0 0 auto' } }}
        >
          Get directions
        </Button>
        {centre.gbpUrl && (
          <Button
            component="a"
            href={centre.gbpUrl}
            target="_blank"
            rel="noopener noreferrer"
            sx={{ minHeight: 48, fontWeight: 600, flex: { xs: '1 1 100%', sm: '0 0 auto' } }}
          >
            Google reviews
          </Button>
        )}
      </Box>
      </Box>
    </Box>
  );
}

export function CentreVisit({
  placeName,
  centres,
  siblings,
  muted = false,
}: {
  placeName: string;
  centres: ClassroomCentre[];
  siblings: ClassroomFact[];
  muted?: boolean;
}) {
  if (centres.length === 0) return null;
  const title = centres.length > 1 ? `Visit our ${placeName} classrooms` : `Visit our ${placeName} classroom`;
  return (
    <Section id="visit" title={title} muted={muted}>
      <Typography sx={{ color: 'text.secondary', mb: 2 }}>
        Visit before you join. See the classroom and talk to a tutor about batches and fees.
      </Typography>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {centres.map((c) => (
          <CentreCard key={c.slug} centre={c} />
        ))}
      </Box>
      {siblings.length > 0 && (
        <Typography sx={{ mt: 2 }}>
          Also near {placeName}:{' '}
          {siblings.map((s, i) => (
            <span key={s.centre.slug}>
              {i > 0 && ', '}
              <Link href={s.url}>Neram Classes {s.centre.areaLabel}</Link>, about {s.km} km away
            </span>
          ))}
          .
        </Typography>
      )}
    </Section>
  );
}
