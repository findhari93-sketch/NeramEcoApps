/**
 * "Our {City} centre": the block a student looks for when they search
 * "coaching centre in {city}". Only real facts: the staff-written description
 * (once reviewed), the year the centre opened, its facilities, the towns
 * students travel from, and real photos uploaded in Admin > Centres. Never
 * stock images. Server-rendered, no client JS.
 *
 * Also exports CentreHeroPhoto, the large photo in the page header that Google
 * can use as the result thumbnail.
 */
import Image from 'next/image';
import Link from 'next/link';
import { Box, Chip, Typography } from '@neram/ui';
import EventAvailableOutlinedIcon from '@mui/icons-material/EventAvailableOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import type { ClassroomCentre } from '@/lib/seo/facts';
import type { CentrePhoto } from '@/lib/seo/centre-photos';
import { Section } from './parts';

export interface TravelFrom {
  label: string;
  href: string;
  km: number;
}

/** The first real photo across the page's centres (hero first per centre). */
export function heroPhotoOf(centres: ClassroomCentre[]): CentrePhoto | null {
  return centres.flatMap((c) => c.photos ?? [])[0] ?? null;
}

export function CentreHeroPhoto({ photo }: { photo: CentrePhoto }) {
  return (
    <Box
      component="figure"
      sx={{ m: 0, position: 'relative', aspectRatio: '16 / 9', borderRadius: 2, overflow: 'hidden', bgcolor: 'grey.200' }}
    >
      <Image
        src={photo.url}
        alt={photo.alt}
        fill
        priority
        sizes="(max-width: 900px) 100vw, 440px"
        style={{ objectFit: 'cover' }}
      />
    </Box>
  );
}

function Gallery({ photos }: { photos: CentrePhoto[] }) {
  return (
    <Box
      component="ul"
      aria-label="Photos of the centre"
      sx={{ listStyle: 'none', p: 0, m: 0, display: 'grid', gap: { xs: 1, sm: 1.5 }, gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' } }}
    >
      {photos.map((p) => (
        <Box component="li" key={p.url}>
          <Box component="figure" sx={{ m: 0 }}>
            <Box sx={{ position: 'relative', aspectRatio: '4 / 3', borderRadius: 1.5, overflow: 'hidden', bgcolor: 'grey.200' }}>
              <Image src={p.url} alt={p.alt} fill loading="lazy" sizes="(max-width: 900px) 50vw, 220px" style={{ objectFit: 'cover' }} />
            </Box>
            <Typography component="figcaption" sx={{ mt: 0.75, fontSize: '0.875rem', lineHeight: 1.45, color: 'text.secondary' }}>
              {p.alt}
            </Typography>
          </Box>
        </Box>
      ))}
    </Box>
  );
}

export function CentreAbout({
  placeName,
  centres,
  travelFrom,
  heroShown,
}: {
  placeName: string;
  centres: ClassroomCentre[];
  travelFrom: TravelFrom[];
  /** The header already shows the first photo; the gallery starts after it. */
  heroShown: boolean;
}) {
  if (centres.length === 0) return null;
  const many = centres.length > 1;
  const photos = centres.flatMap((c) => c.photos ?? []).slice(heroShown ? 1 : 0, 9);
  const years = centres.map((c) => c.establishedYear).filter((y): y is number => !!y);
  const facilities = Array.from(new Set(centres.flatMap((c) => c.facilities ?? []))).slice(0, 8);
  const described = centres.filter((c) => c.description);

  return (
    <Section id="centre" title={many ? `Our ${placeName} centres` : `Our ${placeName} centre`}>
      {described.map((c) => (
        <Box key={c.slug} sx={{ mb: 2 }}>
          {many && (
            <Typography component="h3" sx={{ fontWeight: 700, mb: 0.5 }}>
              Neram Classes {c.areaLabel}
            </Typography>
          )}
          {c.description!.split(/\n{2,}/).map((para) => (
            <Typography key={para.slice(0, 40)} sx={{ fontSize: '1.0625rem', lineHeight: 1.7, mb: 1.5 }}>
              {para}
            </Typography>
          ))}
        </Box>
      ))}

      {(years.length > 0 || facilities.length > 0) && (
        <Box component="ul" aria-label="About the centre" sx={{ listStyle: 'none', p: 0, m: 0, mb: 2.5, display: 'flex', flexWrap: 'wrap', gap: 1 }}>
          {years.length > 0 && (
            <li>
              <Chip icon={<EventAvailableOutlinedIcon aria-hidden />} label={`Teaching here since ${Math.min(...years)}`} color="primary" variant="outlined" />
            </li>
          )}
          {facilities.map((f) => (
            <li key={f}>
              <Chip icon={<CheckCircleOutlineIcon aria-hidden />} label={f} variant="outlined" />
            </li>
          ))}
        </Box>
      )}

      {travelFrom.length > 0 && (
        <Typography sx={{ lineHeight: 1.8, mb: photos.length ? 3 : 0 }}>
          <Box component="strong" sx={{ fontWeight: 700 }}>
            Students travel here from{' '}
          </Box>
          {travelFrom.map((t, i) => (
            <span key={t.href}>
              {i > 0 && (i === travelFrom.length - 1 ? ' and ' : ', ')}
              <Link href={t.href}>{t.label}</Link> ({t.km} km)
            </span>
          ))}
          .
        </Typography>
      )}

      {photos.length > 0 && <Gallery photos={photos} />}
    </Section>
  );
}
