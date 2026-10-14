'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Box, Link as MuiLink, Snackbar, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import CheckIcon from '@mui/icons-material/Check';
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import ShareOutlinedIcon from '@mui/icons-material/ShareOutlined';
import VerifiedUserOutlinedIcon from '@mui/icons-material/VerifiedUserOutlined';
import VerifiedIcon from '@mui/icons-material/Verified';
import type { CollegeDetail } from '@/lib/college-hub/types';
import { useCompareList } from '@/lib/college-hub/compare-store';
import { admissionSystems, examList, formatRupees, formatRupeesFull, shortName, typeLabel } from '@/lib/college-hub/format';
import { annualFee } from '@/lib/college-hub/detail-content';
import SaveCollegeButton from '../SaveCollegeButton';
import CollegeLogo from '../directory/CollegeLogo';
import { coaChipSx, ctaButtonSx, naacChipSx, statLabelSx } from '../directory/hub-styles';

interface Props {
  college: CollegeDetail;
  summary: string;
  updated: { iso: string; label: string } | null;
  sources: string[];
}

interface Kpi {
  label: string;
  value: string;
  note?: string;
  muted?: boolean;
}

/** The KPI strip (canvas: Annual fee, 5-year fee, seats, admission, exam, established). */
export function profileKpis(c: CollegeDetail): Kpi[] {
  const fee = annualFee(c);
  const systems = admissionSystems(c);
  const exams = examList(c.accepted_exams, 'short');
  const out: Kpi[] = [
    fee
      ? { label: 'Annual fee', value: formatRupeesFull(fee.amount), note: fee.from ? 'Starting from' : 'Approx. tuition' }
      : { label: 'Annual fee', value: 'Not published', note: 'Ask the college', muted: true },
  ];
  if (fee && !fee.from) out.push({ label: '5-year fee', value: formatRupees(fee.amount * 5), note: 'Estimate' });
  out.push(
    c.total_barch_seats
      ? { label: 'B.Arch seats', value: String(c.total_barch_seats), note: 'Per year' }
      : { label: 'B.Arch seats', value: 'Not published', muted: true }
  );
  out.push(
    systems.length
      ? { label: 'Admission via', value: systems.slice(0, 2).join(' · '), note: systems.includes('JoSAA') ? 'Counselling' : 'State counselling' }
      : { label: 'Admission via', value: 'Check with college', muted: true }
  );
  if (exams.length) out.push({ label: 'Entrance exam', value: exams.join(' · '), note: exams.length > 1 ? 'Either one' : undefined });
  if (c.nirf_rank_architecture) out.push({ label: 'NIRF rank', value: `#${c.nirf_rank_architecture}`, note: c.nirf_year ? `Architecture ${c.nirf_year}` : 'Architecture' });
  else if (c.established_year) out.push({ label: 'Established', value: String(c.established_year) });
  return out;
}

const chip = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 0.5,
  height: 30,
  px: 1.5,
  borderRadius: 2,
  fontSize: '0.84rem',
  fontWeight: 700,
  whiteSpace: 'nowrap' as const,
};

const outlineButton = {
  display: 'flex',
  alignItems: 'center',
  gap: 1,
  height: 44,
  px: 1.75,
  border: '1px solid',
  borderColor: 'grey.400',
  borderRadius: 1.5,
  bgcolor: 'background.paper',
  color: 'text.primary',
  font: 'inherit',
  fontSize: '0.88rem',
  fontWeight: 600,
  cursor: 'pointer',
  '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
};

/** Header band of the college page (canvas: Desktop · College page, top). */
export default function ProfileHero({ college: c, summary, updated, sources }: Props) {
  const compare = useCompareList();
  const inCompare = compare.has(c.slug);
  const [toast, setToast] = useState<string | null>(null);
  const credit = c.hero_image_credit?.trim();
  const creditHref = c.hero_image_source_url?.trim() || null;
  const affiliation = c.affiliated_university ?? c.affiliation;
  const kpis = profileKpis(c);

  const toggleCompare = () => {
    const r = compare.toggle({ slug: c.slug, name: c.name, shortName: shortName(c), stateSlug: c.state_slug });
    if (r === 'added') setToast(`${shortName(c)} added to compare.`);
  };

  const share = async () => {
    const url = window.location.href.split('#')[0];
    try {
      if (navigator.share) {
        await navigator.share({ title: c.name, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setToast('Link copied.');
    } catch {
      // Share sheet dismissed.
    }
  };

  return (
    <Box component="section" aria-labelledby="college-name" sx={{ bgcolor: 'background.paper', borderBottom: '1px solid', borderColor: 'divider' }}>
      <Box sx={{ maxWidth: 1360, mx: 'auto', px: { xs: 2, md: 4 }, pt: { xs: 1.5, md: 2.5 }, pb: { xs: 2.5, md: 3 }, display: 'flex', flexDirection: 'column', gap: { xs: 2, md: 2.5 } }}>
        {c.hero_image_url && (
          <Box sx={{ position: 'relative', width: '100%', height: { xs: 168, sm: 220, md: 260 }, borderRadius: 2, overflow: 'hidden', bgcolor: 'grey.900' }}>
            <Image src={c.hero_image_url} alt={`${c.name} campus`} fill priority sizes="(max-width: 1360px) 100vw, 1360px" style={{ objectFit: 'cover' }} />
            {credit && (
              <Typography
                component="p"
                sx={{ position: 'absolute', right: 0, bottom: 0, m: 0, px: 1, py: 0.25, maxWidth: '100%', fontSize: '0.75rem', lineHeight: 1.6, color: '#fff', bgcolor: 'rgba(15, 23, 42, 0.72)', borderTopLeftRadius: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              >
                Photo:{' '}
                {creditHref ? (
                  <MuiLink href={creditHref} target="_blank" rel="nofollow noopener" sx={{ color: 'inherit', textDecorationColor: 'rgba(255,255,255,0.7)', display: 'inline-block', py: 0.5, '&:focus-visible': { outline: '2px solid #fff', outlineOffset: 2 } }}>
                    {credit}
                  </MuiLink>
                ) : (
                  credit
                )}
              </Typography>
            )}
          </Box>
        )}

        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: { xs: 2, md: '20px 28px' } }}>
          <Box sx={{ display: 'flex', gap: { xs: 1.75, md: 3 }, flex: '1 1 520px', minWidth: 0 }}>
            <Box sx={{ display: { xs: 'none', md: 'block' } }}>
              <CollegeLogo name={c.name} logoUrl={c.logo_url} size={88} radius={2.5} />
            </Box>
            <Box sx={{ display: { xs: 'block', md: 'none' } }}>
              <CollegeLogo name={c.name} logoUrl={c.logo_url} size={60} radius={2} />
            </Box>
            <Box sx={{ flex: '1 1 auto', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1.25 }}>
              <Typography id="college-name" variant="h1" sx={{ m: 0, fontSize: { xs: '1.35rem', md: 30 }, lineHeight: 1.2, fontWeight: 800, letterSpacing: '-0.02em', textWrap: 'balance' }}>
                {c.name}
                {c.verified && <VerifiedIcon titleAccess="Verified by Neram" sx={{ ml: 1, fontSize: { xs: 18, md: 22 }, color: 'primary.main', verticalAlign: 'middle' }} />}
              </Typography>
              <Typography component="p" sx={{ m: 0, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 10px', fontSize: { xs: '0.88rem', md: '0.95rem' }, color: 'text.secondary' }}>
                <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                  <PlaceOutlinedIcon aria-hidden sx={{ fontSize: 17 }} />
                  {[c.city, c.district && c.district !== c.city ? c.district : null, c.state].filter(Boolean).join(', ')}
                </Box>
                {c.established_year && (
                  <>
                    <span aria-hidden>·</span>
                    <span>Est. {c.established_year}</span>
                  </>
                )}
              </Typography>
              <Box component="ul" aria-label="Approvals and status" sx={{ listStyle: 'none', m: 0, mt: 0.5, p: 0, display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                {c.coa_approved && (
                  <Box component="li" sx={{ ...coaChipSx, ...chip }}>
                    <CheckIcon aria-hidden sx={{ fontSize: 15 }} />
                    COA approved
                  </Box>
                )}
                {c.naac_grade && <Box component="li" sx={{ ...naacChipSx, ...chip }}>NAAC {c.naac_grade}</Box>}
                {c.nba_accredited && <Box component="li" sx={{ ...naacChipSx, ...chip }}>NBA accredited</Box>}
                {c.partnership_page_status === 'approved' && (
                  <Box component="li" sx={{ ...chip, bgcolor: (t) => alpha(t.palette.primary.main, 0.1), color: 'primary.dark' }}>Neram partner</Box>
                )}
                <Box component="li" sx={{ ...chip, bgcolor: 'action.hover', color: 'text.secondary', fontWeight: 600 }}>{typeLabel(c.type)}</Box>
                {affiliation && (
                  <Box component="li" sx={{ ...chip, bgcolor: 'action.hover', color: 'text.secondary', fontWeight: 600, whiteSpace: 'normal', height: 'auto', minHeight: 30, py: 0.5 }}>
                    Affiliated to {affiliation}
                  </Box>
                )}
              </Box>
            </Box>
          </Box>

          <Box sx={{ flex: '0 1 auto', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1.25, width: { xs: '100%', md: 'auto' } }}>
            <Box sx={{ ...outlineButton, px: 0.25, width: 44, justifyContent: 'center', '& .MuiIconButton-root': { width: 42, height: 42 } }}>
              <SaveCollegeButton slug={c.slug} collegeId={c.id} collegeName={c.name} size="small" />
            </Box>
            <Box
              component="button"
              type="button"
              aria-pressed={inCompare}
              onClick={toggleCompare}
              sx={{
                ...outlineButton,
                borderColor: inCompare ? 'primary.main' : 'grey.400',
                bgcolor: (t) => (inCompare ? alpha(t.palette.primary.main, 0.08) : t.palette.background.paper),
                color: inCompare ? 'primary.dark' : 'text.primary',
              }}
            >
              {inCompare ? <CheckIcon aria-hidden sx={{ fontSize: 18 }} /> : <CompareArrowsIcon aria-hidden sx={{ fontSize: 18 }} />}
              {inCompare ? 'Added to compare' : 'Compare'}
            </Box>
            <Box component="button" type="button" aria-label="Share this college" onClick={share} sx={{ ...outlineButton, width: 44, px: 0, justifyContent: 'center' }}>
              <ShareOutlinedIcon aria-hidden sx={{ fontSize: 19 }} />
            </Box>
            <Box
              component="a"
              href="#admission-help"
              sx={{ ...ctaButtonSx, display: { xs: 'none', md: 'flex' }, alignItems: 'center', height: 44, px: 2.5, borderRadius: 1.5, fontSize: '0.95rem', textDecoration: 'none', '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 } }}
            >
              Get admission help
            </Box>
          </Box>
        </Box>

        {/* Answer-first summary (server-rendered facts); the speakable target. */}
        <Typography id="college-summary" component="p" sx={{ m: 0, fontSize: '1rem', lineHeight: 1.65, color: 'text.primary', maxWidth: 820 }}>
          {summary}
        </Typography>

        <Box
          component="dl"
          aria-label="Quick facts"
          sx={{
            m: 0,
            display: 'grid',
            gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(auto-fit, minmax(min(160px, 100%), 1fr))' },
            gap: { xs: 1, md: 0 },
            border: { md: '1px solid' },
            borderColor: { md: 'divider' },
            borderRadius: 2,
            overflow: 'hidden',
            bgcolor: { xs: 'transparent', md: 'action.hover' },
          }}
        >
          {kpis.map((k) => (
            <Box
              key={k.label}
              sx={{
                display: 'flex',
                flexDirection: 'column',
                gap: 0.25,
                px: { xs: 1.75, md: 2.5 },
                py: { xs: 1.5, md: 2 },
                borderRadius: { xs: 1.5, md: 0 },
                bgcolor: { xs: 'action.hover', md: 'transparent' },
                borderRight: { md: '1px solid' },
                borderColor: { md: 'divider' },
                '&:last-of-type': { borderRight: 0 },
                minWidth: 0,
              }}
            >
              <Box component="dt" sx={statLabelSx}>{k.label}</Box>
              <Box component="dd" sx={{ m: 0, fontSize: { xs: '1.1rem', md: '1.35rem' }, fontWeight: 700, color: k.muted ? 'text.secondary' : 'text.primary', fontVariantNumeric: 'tabular-nums', overflowWrap: 'anywhere' }}>
                {k.value}
              </Box>
              {k.note && (
                <Box component="dd" sx={{ m: 0, fontSize: '0.8rem', color: 'text.secondary' }}>
                  {k.note}
                </Box>
              )}
            </Box>
          ))}
        </Box>

        <Typography component="p" sx={{ m: 0, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 10px', fontSize: '0.84rem', color: 'text.secondary', lineHeight: 1.5 }}>
          <VerifiedUserOutlinedIcon aria-hidden sx={{ fontSize: 17, color: 'success.dark' }} />
          <span>
            {sources.length > 0 ? `Checked against ${sources.join(', ')}.` : 'From the college and public records.'}
            {updated && (
              <>
                {' '}Last updated <time dateTime={updated.iso}>{updated.label}</time>.
              </>
            )}
          </span>
          <MuiLink
            href={`mailto:info@neramclasses.com?subject=${encodeURIComponent(`Correction: ${c.name}`)}`}
            sx={{ fontWeight: 600, color: 'primary.dark', textDecoration: 'none', minHeight: 32, display: 'inline-flex', alignItems: 'center', '&:hover': { textDecoration: 'underline' } }}
          >
            Report a correction
          </MuiLink>
        </Typography>
      </Box>

      <Snackbar open={toast !== null} autoHideDuration={3500} onClose={() => setToast(null)} message={toast} anchorOrigin={{ vertical: 'top', horizontal: 'center' }} />
    </Box>
  );
}
