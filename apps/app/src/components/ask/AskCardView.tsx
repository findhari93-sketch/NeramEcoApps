'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { Box, Button, Paper, Typography, alpha } from '@neram/ui';
import CalculateOutlinedIcon from '@mui/icons-material/CalculateOutlined';
import AccountBalanceOutlinedIcon from '@mui/icons-material/AccountBalanceOutlined';
import LeaderboardOutlinedIcon from '@mui/icons-material/LeaderboardOutlined';
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined';
import VerifiedOutlinedIcon from '@mui/icons-material/VerifiedOutlined';
import BuildOutlinedIcon from '@mui/icons-material/BuildOutlined';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import ErrorOutlineRoundedIcon from '@mui/icons-material/ErrorOutlineRounded';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import OpenInFullRoundedIcon from '@mui/icons-material/OpenInFullRounded';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import CurrencyRupeeRoundedIcon from '@mui/icons-material/CurrencyRupeeRounded';
import FactCheckOutlinedIcon from '@mui/icons-material/FactCheckOutlined';
import EventOutlinedIcon from '@mui/icons-material/EventOutlined';
import CancelOutlinedIcon from '@mui/icons-material/CancelOutlined';
import type { AskCard, CollegeRow, Tier } from '@/lib/ask/cards';
import ShareResultButton from './ShareResultButton';
import { getFirebaseAuth } from '@neram/auth';
import AintraCardView from '@/components/aintra/AintraCardView';

/** The signed-in student's token, for account cards that post on a tap. */
async function idToken(): Promise<string | null> {
  try {
    return (await getFirebaseAuth().currentUser?.getIdToken()) ?? null;
  } catch {
    return null;
  }
}

const TIER: Record<Tier, { label: string; hint: string; color: 'success' | 'info' | 'warning' }> = {
  safe: { label: 'Safe', hint: 'well above last year’s bar', color: 'success' },
  target: { label: 'Target', hint: 'just above the bar', color: 'info' },
  reach: { label: 'Reach', hint: 'a little below the bar', color: 'warning' },
};

const fmt = (n: number) => n.toLocaleString('en-IN');

export interface AskCardViewProps {
  card: AskCard;
  /** Inside the full-size panel: no expand button, longer lists. */
  expanded?: boolean;
  onExpand?: (card: AskCard) => void;
  onSignIn?: () => void;
}

function Shell({
  icon,
  title,
  source,
  children,
  actions,
}: {
  icon: ReactNode;
  title: string;
  source?: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <Paper
      variant="outlined"
      component="section"
      aria-label={title}
      sx={{ p: { xs: 1.75, sm: 2 }, borderRadius: 2.5, bgcolor: 'background.paper', minWidth: 0 }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.25 }}>
        <Box
          aria-hidden="true"
          sx={{
            width: 32,
            height: 32,
            flexShrink: 0,
            borderRadius: 1.5,
            display: 'grid',
            placeItems: 'center',
            color: 'primary.main',
            bgcolor: (t) => alpha(t.palette.primary.main, 0.1),
            '& svg': { fontSize: 20 },
          }}
        >
          {icon}
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography component="h3" sx={{ fontWeight: 700, fontSize: '0.9375rem', lineHeight: 1.3 }}>
            {title}
          </Typography>
          {source && (
            <Typography variant="caption" component="p" sx={{ color: 'text.secondary', lineHeight: 1.3 }}>
              Source: {source}
            </Typography>
          )}
        </Box>
      </Box>
      {children}
      {actions && <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1.5 }}>{actions}</Box>}
    </Paper>
  );
}

function OpenLink({ href, label }: { href: string; label: string }) {
  return (
    <Button
      component={Link}
      href={href}
      variant="outlined"
      size="small"
      endIcon={<ArrowForwardRoundedIcon />}
      sx={{ minHeight: 44, textTransform: 'none', fontWeight: 600, borderRadius: 2 }}
    >
      {label}
    </Button>
  );
}

function ExpandButton({ onClick }: { onClick: () => void }) {
  return (
    <Button
      onClick={onClick}
      size="small"
      startIcon={<OpenInFullRoundedIcon />}
      sx={{ minHeight: 44, textTransform: 'none', fontWeight: 600, borderRadius: 2 }}
    >
      Expand
    </Button>
  );
}

function CutoffBody({ card }: { card: Extract<AskCard, { kind: 'cutoff' }> }) {
  const d = card.data;
  return (
    <>
      <Typography component="p" sx={{ fontSize: '2rem', fontWeight: 800, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>
        {d.total}
        <Typography component="span" sx={{ fontSize: '1rem', fontWeight: 600, color: 'text.secondary', ml: 0.75 }}>
          out of 400
        </Typography>
      </Typography>
      {/* The 400 split into its two halves. Text below carries the same numbers. */}
      <Box aria-hidden="true" sx={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', bgcolor: 'action.hover', mt: 1.25 }}>
        <Box sx={{ width: `${(d.board200 / 400) * 100}%`, bgcolor: 'primary.main' }} />
        <Box sx={{ width: `${(d.nata / 400) * 100}%`, bgcolor: 'secondary.main' }} />
      </Box>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', columnGap: 2, rowGap: 0.5, mt: 1, fontSize: '0.875rem' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
          <Box aria-hidden="true" sx={{ width: 10, height: 10, flexShrink: 0, borderRadius: '50%', bgcolor: 'primary.main' }} />
          <span>
            12th {fmt(d.marks)}/{fmt(d.boardMax)} = <strong>{d.board200}</strong>/200
          </span>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
          <Box aria-hidden="true" sx={{ width: 10, height: 10, flexShrink: 0, borderRadius: '50%', bgcolor: 'secondary.main' }} />
          <span>
            NATA <strong>{d.nata}</strong>/200
          </span>
        </Box>
      </Box>
      <Typography variant="caption" component="p" sx={{ color: 'text.secondary', mt: 0.5 }}>
        {d.boardLabel} · {d.nataExplanation}
      </Typography>
      <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'flex-start', mt: 1 }}>
        {d.boardEligible ? (
          <CheckCircleRoundedIcon aria-hidden="true" sx={{ fontSize: 20, color: 'success.main', mt: '1px' }} />
        ) : (
          <ErrorOutlineRoundedIcon aria-hidden="true" sx={{ fontSize: 20, color: 'error.main', mt: '1px' }} />
        )}
        <Typography variant="body2">
          {d.boardPercent}% in 12th {d.boardEligible ? 'meets' : 'is below'} the 45% B.Arch rule
        </Typography>
      </Box>
    </>
  );
}

function TierGroup({ tier, rows, count, basis }: { tier: Tier; rows: CollegeRow[]; count: number; basis: 'mark' | 'rank' }) {
  const t = TIER[tier];
  if (count === 0) return null;
  return (
    <Box component="li" sx={{ listStyle: 'none' }}>
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mb: 0.5 }}>
        <Box
          component="span"
          sx={{
            px: 1,
            py: 0.25,
            borderRadius: 1,
            fontSize: '0.75rem',
            fontWeight: 700,
            color: `${t.color}.dark`,
            bgcolor: (th) => alpha(th.palette[t.color].main, 0.14),
          }}
        >
          {t.label} · {count}
        </Box>
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
          {t.hint}
        </Typography>
      </Box>
      <Box component="ul" sx={{ m: 0, p: 0, display: 'grid' }}>
        {rows.map((r) => (
          <Box
            component="li"
            key={`${r.name}-${r.category}`}
            sx={{ listStyle: 'none', display: 'flex', gap: 1.5, justifyContent: 'space-between', py: 0.75, borderTop: '1px solid', borderColor: 'divider' }}
          >
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.35 }}>
                {r.name}
              </Typography>
              {(r.city || r.institutionType) && (
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                  {[r.institutionType, r.city].filter(Boolean).join(' · ')}
                </Typography>
              )}
            </Box>
            <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
              <Typography variant="body2" sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                {basis === 'mark' ? r.closing : fmt(r.closing)}
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                {basis === 'mark' ? `closing, ${r.category}` : 'closing rank'}
              </Typography>
            </Box>
          </Box>
        ))}
      </Box>
    </Box>
  );
}

function CollegesBody({ card, onSignIn }: { card: Extract<AskCard, { kind: 'colleges' }>; onSignIn?: () => void }) {
  const d = card.data;
  const total = d.counts.safe + d.counts.target + d.counts.reach;
  if (total === 0) {
    return (
      <Typography variant="body2">
        No college in last year&apos;s list was within reach of {d.basis === 'mark' ? `${d.studentValue} out of 400` : `rank ${fmt(d.studentValue)}`}.
        Private colleges outside counselling may still admit you.
      </Typography>
    );
  }
  return (
    <>
      <Typography variant="body2" sx={{ mb: 1.25 }}>
        <strong>{total}</strong> college{total === 1 ? '' : 's'} for {d.basis === 'mark' ? `${d.studentValue} out of 400` : `rank ${fmt(d.studentValue)}`}, {d.category}
      </Typography>
      <Box component="ul" sx={{ m: 0, p: 0, display: 'grid', gap: 1.5 }}>
        {(['safe', 'target', 'reach'] as Tier[]).map((t) => (
          <TierGroup key={t} tier={t} rows={d.groups[t]} count={d.counts[t]} basis={d.basis} />
        ))}
      </Box>
      {d.hidden > 0 && (
        <Box
          sx={{
            mt: 1.5,
            p: 1.5,
            borderRadius: 2,
            display: 'flex',
            gap: 1.5,
            alignItems: 'center',
            flexWrap: 'wrap',
            bgcolor: (th) => alpha(th.palette.primary.main, 0.06),
          }}
        >
          <LockOutlinedIcon aria-hidden="true" sx={{ color: 'primary.main' }} />
          <Typography variant="body2" sx={{ flex: '1 1 160px' }}>
            {d.hidden} more college{d.hidden === 1 ? '' : 's'} match. Sign in free to see them all.
          </Typography>
          {onSignIn && (
            <Button variant="contained" onClick={onSignIn} sx={{ minHeight: 44, textTransform: 'none', fontWeight: 700 }}>
              Sign in free
            </Button>
          )}
        </Box>
      )}
    </>
  );
}

export default function AskCardView({ card, expanded, onExpand, onSignIn }: AskCardViewProps) {
  switch (card.kind) {
    case 'cutoff':
      return (
        <Shell
          icon={<CalculateOutlinedIcon />}
          title="Your B.Arch cutoff"
          source="NATA cutoff formula, your board's real maximum"
          actions={
            <>
              <OpenLink href={card.href} label="Open in Cutoff Calculator" />
              <ShareResultButton card={card} />
            </>
          }
        >
          <CutoffBody card={card} />
        </Shell>
      );
    case 'colleges': {
      const total = card.data.counts.safe + card.data.counts.target + card.data.counts.reach;
      const shownAll = card.data.groups.safe.length + card.data.groups.target.length + card.data.groups.reach.length >= total;
      return (
        <Shell
          icon={<AccountBalanceOutlinedIcon />}
          title={`${card.data.system === 'JOSAA' ? 'JoSAA' : card.data.system} colleges for you`}
          source={card.data.source}
          actions={
            <>
              {!expanded && onExpand && card.data.hidden === 0 && total > 3 && <ExpandButton onClick={() => onExpand(card)} />}
              <OpenLink href={card.href} label={shownAll ? 'Open College Predictor' : 'All colleges in the predictor'} />
              <ShareResultButton card={card} />
            </>
          }
        >
          <CollegesBody card={card} onSignIn={onSignIn} />
        </Shell>
      );
    }
    case 'rank':
      return (
        <Shell icon={<LeaderboardOutlinedIcon />} title={`Your likely ${card.data.system} rank`} source={`${card.data.system} B.Arch ${card.data.year} rank list`} actions={<OpenLink href={card.href} label="Open Rank Predictor" />}>
          <Typography component="p" sx={{ fontSize: '1.75rem', fontWeight: 800, lineHeight: 1.15, fontVariantNumeric: 'tabular-nums' }}>
            {fmt(card.data.bestRank)} to {fmt(card.data.worstRank)}
          </Typography>
          <Typography variant="body2" sx={{ mt: 0.5 }}>
            {card.data.students} students scored {card.data.bandFrom} to {card.data.bandTo} out of 400 last year and got these ranks, out of {fmt(card.data.totalRanked)} ranked.
          </Typography>
        </Shell>
      );
    case 'centres':
      return (
        <Shell icon={<PlaceOutlinedIcon />} title={`NATA test cities near ${card.data.place}`} source={`NATA ${card.data.year} test city list`} actions={<OpenLink href={card.href} label="Open Exam Centres" />}>
          <Box component="ul" sx={{ m: 0, p: 0, display: 'grid' }}>
            {card.data.centres.map((c) => (
              <Box component="li" key={c.label} sx={{ listStyle: 'none', py: 0.75, borderTop: '1px solid', borderColor: 'divider', '&:first-of-type': { borderTop: 0 } }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {c.label}
                  </Typography>
                  <Typography variant="body2" sx={{ color: 'text.secondary', flexShrink: 0 }}>
                    {c.inThisCity ? 'In your city' : c.km != null ? `${c.km} km` : ''}
                  </Typography>
                </Box>
                {c.venues.length > 0 && (
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                    {c.venues.join(' · ')}
                  </Typography>
                )}
              </Box>
            ))}
          </Box>
        </Shell>
      );
    case 'coa':
      return (
        <Shell icon={<VerifiedOutlinedIcon />} title="Council of Architecture approval" source="COA approved institutions list" actions={<OpenLink href={card.href} label="Open COA Checker" />}>
          {card.data.colleges.length === 0 ? (
            <Typography variant="body2">No approved college matched &ldquo;{card.data.query}&rdquo;. Try the exact name or the city.</Typography>
          ) : (
            <Box component="ul" sx={{ m: 0, p: 0, display: 'grid' }}>
              {card.data.colleges.map((c) => (
                <Box component="li" key={`${c.name}-${c.city}`} sx={{ listStyle: 'none', display: 'flex', gap: 1, py: 0.75, borderTop: '1px solid', borderColor: 'divider', '&:first-of-type': { borderTop: 0 } }}>
                  <CheckCircleRoundedIcon aria-hidden="true" sx={{ fontSize: 18, color: 'success.main', mt: '2px' }} />
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {c.name}
                    </Typography>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                      {[c.city, c.intake ? `${c.intake} seats` : null, c.period].filter(Boolean).join(' · ')}
                    </Typography>
                  </Box>
                </Box>
              ))}
              {card.data.more > 0 && (
                <Typography variant="caption" component="li" sx={{ listStyle: 'none', color: 'text.secondary', pt: 0.5 }}>
                  +{card.data.more} more in the checker
                </Typography>
              )}
            </Box>
          )}
        </Shell>
      );
    case 'cost': {
      const d = card.data;
      const rows: Array<[string, string]> = [
        [`Application fee (${d.attempts} × ₹${fmt(d.feePerAttempt)}, ${d.category})`, `₹${fmt(d.totalFee)}`],
        ...(d.travel ? ([[`Travel${d.state ? ` from ${d.state}` : ''} (estimate)`, `₹${fmt(d.travel)}`]] as Array<[string, string]>) : []),
        ...(d.stay ? ([['Stay near the test city (estimate)', `₹${fmt(d.stay)}`]] as Array<[string, string]>) : []),
        ['Study materials (range)', `₹${fmt(d.materials.min)} to ₹${fmt(d.materials.max)}`],
      ];
      return (
        <Shell
          icon={<CurrencyRupeeRoundedIcon />}
          title="What NATA will cost"
          source={`NATA ${d.feeYear} brochure fees; travel and stay are estimates`}
          actions={
            <>
              <OpenLink href={card.href} label="Open Cost Calculator" />
              <ShareResultButton card={card} />
            </>
          }
        >
          <Typography component="p" sx={{ fontSize: '1.75rem', fontWeight: 800, lineHeight: 1.15, fontVariantNumeric: 'tabular-nums' }}>
            ₹{fmt(d.totalMin)} to ₹{fmt(d.totalMax)}
          </Typography>
          <Box component="ul" sx={{ m: 0, p: 0, mt: 1, display: 'grid' }}>
            {rows.map(([label, value]) => (
              <Box
                component="li"
                key={label}
                sx={{ listStyle: 'none', display: 'flex', justifyContent: 'space-between', gap: 1.5, py: 0.75, borderTop: '1px solid', borderColor: 'divider' }}
              >
                <Typography variant="body2">{label}</Typography>
                <Typography variant="body2" sx={{ fontWeight: 700, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                  {value}
                </Typography>
              </Box>
            ))}
          </Box>
        </Shell>
      );
    }
    case 'eligibility': {
      const d = card.data;
      const verdict =
        d.barchEligible === null
          ? d.nataEligible
            ? 'You can sit NATA'
            : 'Not eligible for NATA yet'
          : d.nataEligible && d.barchEligible
            ? 'Eligible for NATA and B.Arch'
            : d.nataEligible
              ? 'You can sit NATA, but B.Arch needs more'
              : 'Not eligible yet';
      return (
        <Shell icon={<FactCheckOutlinedIcon />} title="Eligibility check" source="Council of Architecture rules" actions={<OpenLink href={card.href} label="Open Eligibility Checker" />}>
          <Typography component="p" sx={{ fontSize: '1.25rem', fontWeight: 800, lineHeight: 1.3, mb: 0.5 }}>
            {verdict}
          </Typography>
          <Box component="ul" sx={{ m: 0, p: 0, display: 'grid' }}>
            {d.conditions.map((c) => (
              <Box component="li" key={c.label} sx={{ listStyle: 'none', display: 'flex', gap: 1, py: 0.75, borderTop: '1px solid', borderColor: 'divider' }}>
                {c.met ? (
                  <CheckCircleRoundedIcon aria-label="Met" sx={{ fontSize: 20, color: 'success.main', mt: '1px' }} />
                ) : (
                  <CancelOutlinedIcon aria-label="Not met" sx={{ fontSize: 20, color: 'error.main', mt: '1px' }} />
                )}
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {c.label}
                  </Typography>
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                    {c.explanation}
                  </Typography>
                </Box>
              </Box>
            ))}
          </Box>
        </Shell>
      );
    }
    case 'dates': {
      const d = card.data;
      const day = (iso: string) =>
        new Date(`${iso}T00:00:00+05:30`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
      return (
        <Shell
          icon={<EventOutlinedIcon />}
          title={d.announced ? `NATA ${d.scheduleYear} dates` : `NATA ${d.cycleYear} dates`}
          source={`Council of Architecture NATA ${d.scheduleYear} schedule`}
          actions={<OpenLink href={card.href} label="Open Exam Planner" />}
        >
          {!d.announced && (
            <Typography variant="body2" sx={{ mb: 1 }}>
              NATA {d.cycleYear} dates are not announced yet. Last year&apos;s pattern, as a guide:
            </Typography>
          )}
          <Box component="ul" sx={{ m: 0, p: 0, display: 'grid' }}>
            {d.phases.map((p) => (
              <Box component="li" key={p.phase} sx={{ listStyle: 'none', display: 'flex', justifyContent: 'space-between', gap: 1.5, py: 0.75, borderTop: '1px solid', borderColor: 'divider' }}>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {p.phase}
                </Typography>
                <Typography variant="body2" sx={{ textAlign: 'right' }}>
                  {p.from === p.to ? day(p.from) : `${day(p.from)} to ${day(p.to)}`} · {p.days} day{p.days === 1 ? '' : 's'}
                </Typography>
              </Box>
            ))}
          </Box>
          {d.announced && d.upcoming.length > 0 && (
            <>
              <Typography variant="caption" component="p" sx={{ color: 'text.secondary', mt: 1.25, fontWeight: 600 }}>
                Next sessions
              </Typography>
              <Box component="ul" sx={{ m: 0, p: 0, display: 'grid' }}>
                {d.upcoming.map((u) => (
                  <Box component="li" key={`${u.date}-${u.time}`} sx={{ listStyle: 'none', py: 0.5 }}>
                    <Typography variant="body2">
                      {day(u.date)}, {u.day}, {u.time}
                    </Typography>
                  </Box>
                ))}
              </Box>
            </>
          )}
        </Shell>
      );
    }
    case 'account':
      return <AintraCardView card={card.data} getToken={idToken} />;
    case 'tool':
      return (
        <Paper
          variant="outlined"
          component={Link}
          href={card.href}
          sx={{
            p: 2,
            borderRadius: 2.5,
            display: 'flex',
            gap: 1.5,
            alignItems: 'center',
            textDecoration: 'none',
            color: 'inherit',
            minHeight: 56,
            transition: 'border-color 150ms ease',
            '&:hover': { borderColor: 'primary.main' },
            '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
          }}
        >
          <BuildOutlinedIcon aria-hidden="true" sx={{ color: 'primary.main' }} />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontWeight: 700 }}>{card.data.title}</Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              {card.data.description}
            </Typography>
          </Box>
          <ArrowForwardRoundedIcon aria-hidden="true" sx={{ color: 'text.secondary' }} />
        </Paper>
      );
  }
}
