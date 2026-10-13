import Link from 'next/link';
import { Box, Typography } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import {
  displayName,
  joinList,
  placeLabel,
  type NIRFInsightItem,
  type NIRFInsights as Insights,
} from '@/lib/college-hub/nirf-insights';

/**
 * Written sections under the NIRF table: top 10, IITs, NITs and SPAs, government
 * vs private, Tamil Nadu, methodology, admission routes and the FAQ. Server
 * rendered with no client JS, so every sentence is in the HTML Google reads.
 */

const focusRing = {
  outline: '2px solid',
  outlineColor: 'primary.main',
  outlineOffset: '-2px',
} as const;

const prose = {
  fontSize: '1rem',
  lineHeight: 1.6,
  color: 'text.primary',
  maxWidth: '70ch',
  mb: 2,
} as const;

function SectionHeading({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <Typography
      id={id}
      variant="h2"
      sx={{ fontSize: { xs: '1.3rem', md: '1.6rem' }, fontWeight: 800, letterSpacing: '-0.01em', lineHeight: 1.25, mb: 1.5 }}
    >
      {children}
    </Typography>
  );
}

function RankRow({ item, prefix }: { item: NIRFInsightItem; prefix: string }) {
  const body = (
    <>
      <Box
        sx={{
          flexShrink: 0,
          minWidth: 40,
          height: 40,
          px: 0.75,
          borderRadius: 1.5,
          display: 'grid',
          placeItems: 'center',
          bgcolor: item.rank <= 3 ? 'primary.main' : 'action.hover',
          color: item.rank <= 3 ? 'primary.contrastText' : 'text.primary',
          fontWeight: 800,
          fontSize: '0.95rem',
        }}
      >
        #{item.rank}
      </Box>
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography sx={{ fontWeight: 600, fontSize: '1rem', lineHeight: 1.35 }}>{item.name}</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.4 }}>
          {placeLabel(item)}
        </Typography>
      </Box>
      {item.score !== null && (
        <Box sx={{ flexShrink: 0, textAlign: 'right' }}>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.2 }}>
            Score
          </Typography>
          <Typography sx={{ fontWeight: 700, fontSize: '0.95rem' }}>{item.score.toFixed(2)}</Typography>
        </Box>
      )}
    </>
  );
  const row = {
    display: 'flex',
    alignItems: 'center',
    gap: 1.5,
    minHeight: 64,
    px: { xs: 1.5, sm: 2 },
    py: 1,
  } as const;

  return (
    <Box component="li" sx={{ '& + li': { borderTop: '1px solid', borderColor: 'divider' } }}>
      {item.slug ? (
        <Box
          component={Link}
          href={`${prefix}/colleges/rankings/nirf/${item.slug}`}
          sx={{
            ...row,
            color: 'inherit',
            textDecoration: 'none',
            cursor: 'pointer',
            transition: 'background-color 150ms',
            '&:hover': { bgcolor: 'action.hover' },
            '&:focus-visible': focusRing,
          }}
        >
          {body}
        </Box>
      ) : (
        <Box sx={row}>{body}</Box>
      )}
    </Box>
  );
}

function RankList({ items, prefix }: { items: NIRFInsightItem[]; prefix: string }) {
  return (
    <Box
      component="ol"
      sx={{ listStyle: 'none', p: 0, m: 0, mb: 2, border: '1px solid', borderColor: 'divider', borderRadius: 2, overflow: 'hidden', bgcolor: 'background.paper' }}
    >
      {items.map((i) => (
        <RankRow key={`${i.rank}-${i.name}`} item={i} prefix={prefix} />
      ))}
    </Box>
  );
}

function InstituteGroup({ title, items, empty, prefix }: { title: string; items: NIRFInsightItem[]; empty: string; prefix: string }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      {/* subtitle1 look on an h3: the theme's responsive h3 sizes would beat sx here */}
      <Typography variant="subtitle1" component="h3" sx={{ fontSize: '1.1rem', fontWeight: 700, mb: 1 }}>
        {title}
      </Typography>
      {items.length ? <RankList items={items} prefix={prefix} /> : <Typography sx={prose}>{empty}</Typography>}
    </Box>
  );
}

const PARAMETERS: { code: string; name: string; what: string }[] = [
  { code: 'TLR', name: 'Teaching, Learning and Resources', what: 'Faculty strength and qualifications, student to faculty ratio, and money spent on labs, studios and libraries.' },
  { code: 'RPC', name: 'Research and Professional Practice', what: 'Published research, citations, patents and professional or consultancy work by faculty.' },
  { code: 'GO', name: 'Graduation Outcomes', what: 'How many students graduate on time, go on to higher studies or get placed, and median salaries.' },
  { code: 'OI', name: 'Outreach and Inclusivity', what: 'Share of students from other states, women, economically weaker sections and students with disabilities.' },
  { code: 'PR', name: 'Perception', what: 'How employers, academics and peer institutions rate the college in NIRF surveys.' },
];

export default function NIRFInsights({ insights: n, prefix }: { insights: Insights; prefix: string }) {
  const [first, second, third] = n.ranked;
  const govtShare = n.govtCount + n.privateCount > 0 ? Math.round((n.govtCount / (n.govtCount + n.privateCount)) * 100) : null;

  return (
    <Box component="section" aria-label={`NIRF ${n.year} architecture rankings explained`} sx={{ mt: { xs: 5, md: 7 } }}>
      {/* Top 10 */}
      <Box component="section" aria-labelledby="nirf-top10" sx={{ mb: { xs: 5, md: 6 } }}>
        <SectionHeading id="nirf-top10">Top 10 Architecture Colleges in India (NIRF {n.year})</SectionHeading>
        <Typography sx={prose}>
          {first.name} is ranked No. 1 in the NIRF {n.year} Architecture and Planning ranking
          {first.score !== null ? ` with a score of ${first.score.toFixed(2)}` : ''}.
          {second && third ? ` ${displayName(second)} and ${displayName(third)} complete the top three.` : ''}{' '}
          Open any college to see its rank for every year it was ranked.
        </Typography>
        <RankList items={n.top10} prefix={prefix} />
      </Box>

      {/* IITs, NITs, SPAs */}
      <Box component="section" aria-labelledby="nirf-iit-nit" sx={{ mb: { xs: 5, md: 6 } }}>
        <SectionHeading id="nirf-iit-nit">Best IITs, NITs and SPAs for Architecture</SectionHeading>
        <Typography sx={prose}>
          {n.nits.length ? `${n.nits.length} NITs are ranked in NIRF ${n.year}, led by ${displayName(n.nits[0])} at rank ${n.nits[0].rank}. ` : ''}
          {n.iits.length ? `The ranked IITs are ${joinList(n.iits.map(displayName))}. ` : ''}
          IITs admit B.Arch students through JEE Advanced and AAT, while NITs and SPAs admit through JEE Main Paper 2 and JoSAA counselling.
        </Typography>
        <Box sx={{ display: 'grid', gap: { xs: 3, md: 2.5 }, gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))' } }}>
          <InstituteGroup title="IITs" items={n.iits} empty={`No IIT is ranked in NIRF ${n.year} Architecture.`} prefix={prefix} />
          <InstituteGroup title="NITs" items={n.nits} empty={`No NIT is ranked in NIRF ${n.year} Architecture.`} prefix={prefix} />
          <InstituteGroup title="Schools of Planning and Architecture" items={n.spas} empty={`No SPA is ranked in NIRF ${n.year} Architecture.`} prefix={prefix} />
        </Box>
      </Box>

      {/* Government vs private */}
      {n.topGovt && n.topPrivate && (
        <Box component="section" aria-labelledby="nirf-govt-private" sx={{ mb: { xs: 5, md: 6 } }}>
          <SectionHeading id="nirf-govt-private">Government vs Private Architecture Colleges</SectionHeading>
          <Typography sx={prose}>
            Of the ranked institutions we list for {n.year}, {n.govtCount} are government colleges and {n.privateCount} are
            private or deemed universities{govtShare !== null ? `, so about ${govtShare}% of the list is government run` : ''}.
            The best ranked government college is {displayName(n.topGovt)} (rank {n.topGovt.rank}) and the best ranked
            private college is {n.topPrivate.name} (rank {n.topPrivate.rank}, {placeLabel(n.topPrivate)}).
          </Typography>
        </Box>
      )}

      {/* Tamil Nadu */}
      {n.tamilNadu.length > 0 && (
        <Box component="section" aria-labelledby="nirf-tamil-nadu" sx={{ mb: { xs: 5, md: 6 } }}>
          <SectionHeading id="nirf-tamil-nadu">NIRF Ranked Architecture Colleges in Tamil Nadu</SectionHeading>
          <Typography sx={prose}>
            {n.tamilNadu.length} Tamil Nadu {n.tamilNadu.length === 1 ? 'institution is' : 'institutions are'} ranked in NIRF {n.year} Architecture,
            led by {displayName(n.tamilNadu[0])} at rank {n.tamilNadu[0].rank}. Government and affiliated colleges in Tamil Nadu fill
            B.Arch seats through TNEA B.Arch counselling, which uses your NATA score, while deemed universities run their own admissions.
          </Typography>
          <RankList items={n.tamilNadu} prefix={prefix} />
        </Box>
      )}

      {/* Methodology */}
      <Box component="section" aria-labelledby="nirf-method" sx={{ mb: { xs: 5, md: 6 } }}>
        <SectionHeading id="nirf-method">How NIRF Architecture Scores Are Calculated</SectionHeading>
        <Typography sx={prose}>
          The National Institutional Ranking Framework, run by the Ministry of Education, scores each institution out of 100 on
          five parameters. Colleges take part by applying, so a good college that did not submit data will not appear in the list.
        </Typography>
        <Box
          component="dl"
          sx={{ m: 0, display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(3, minmax(0, 1fr))' } }}
        >
          {PARAMETERS.map((p) => (
            <Box key={p.code} sx={{ p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 2, bgcolor: 'background.paper' }}>
              <Typography component="dt" sx={{ fontWeight: 700, fontSize: '1rem', mb: 0.5 }}>
                {p.code}: {p.name}
              </Typography>
              <Typography component="dd" sx={{ m: 0, fontSize: '0.95rem', lineHeight: 1.55, color: 'text.secondary' }}>
                {p.what}
              </Typography>
            </Box>
          ))}
        </Box>
      </Box>

      {/* Admission routes */}
      <Box component="section" aria-labelledby="nirf-admission" sx={{ mb: { xs: 5, md: 6 } }}>
        <SectionHeading id="nirf-admission">How to Get Into a Top NIRF Architecture College</SectionHeading>
        <Typography sx={prose}>
          A NIRF rank tells you about a college, but admission depends on your entrance exam. Each route below has its own exam:
        </Typography>
        <Box component="ul" sx={{ m: 0, mb: 2, pl: 0, listStyle: 'none', display: 'grid', gap: 1, gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))' } }}>
          {[
            { href: `${prefix}/aat-2026`, title: 'IITs', text: 'JEE Advanced, then the Architecture Aptitude Test (AAT)' },
            { href: `${prefix}/jee-barch-hub`, title: 'NITs and SPAs', text: 'JEE Main Paper 2 and JoSAA counselling' },
            { href: `${prefix}/nata-2026`, title: 'State and private colleges', text: 'NATA score, then state counselling such as TNEA' },
          ].map((r) => (
            <li key={r.title}>
              <Box
                component={Link}
                href={r.href}
                sx={{
                  display: 'block',
                  minHeight: 48,
                  height: '100%',
                  p: 2,
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: 2,
                  color: 'inherit',
                  textDecoration: 'none',
                  bgcolor: 'background.paper',
                  transition: 'border-color 150ms, background-color 150ms',
                  '&:hover': { borderColor: 'primary.main', bgcolor: 'action.hover' },
                  '&:focus-visible': focusRing,
                }}
              >
                <Typography sx={{ fontWeight: 700, fontSize: '1rem', color: 'primary.main' }}>{r.title}</Typography>
                <Typography sx={{ fontSize: '0.95rem', lineHeight: 1.5 }}>{r.text}</Typography>
              </Box>
            </li>
          ))}
        </Box>
      </Box>

      {/* FAQ */}
      <Box component="section" aria-labelledby="nirf-faq">
        <SectionHeading id="nirf-faq">NIRF Architecture Ranking: Frequently Asked Questions</SectionHeading>
        <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, bgcolor: 'background.paper', overflow: 'hidden' }}>
          {n.faqs.map((f) => (
            <Box
              key={f.question}
              component="details"
              sx={{
                '& + details': { borderTop: '1px solid', borderColor: 'divider' },
                '& > summary': {
                  listStyle: 'none',
                  cursor: 'pointer',
                  minHeight: 56,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 1.5,
                  px: { xs: 1.5, sm: 2 },
                  py: 1.5,
                  fontWeight: 600,
                  fontSize: '1rem',
                  lineHeight: 1.4,
                  '&::-webkit-details-marker': { display: 'none' },
                  '&:hover': { bgcolor: 'action.hover' },
                  '&:focus-visible': focusRing,
                },
                '& .nirf-faq-chevron': { flexShrink: 0, color: 'text.secondary', transition: 'transform 200ms' },
                '&[open] .nirf-faq-chevron': { transform: 'rotate(180deg)' },
                '@media (prefers-reduced-motion: reduce)': { '& .nirf-faq-chevron': { transition: 'none' } },
              }}
            >
              <summary>
                <Typography component="h3" sx={{ fontWeight: 600, fontSize: '1rem', lineHeight: 1.4 }}>
                  {f.question}
                </Typography>
                <ExpandMoreIcon className="nirf-faq-chevron" aria-hidden />
              </summary>
              <Typography sx={{ ...prose, mb: 0, px: { xs: 1.5, sm: 2 }, pb: 2 }}>{f.answer}</Typography>
            </Box>
          ))}
        </Box>
      </Box>
    </Box>
  );
}
