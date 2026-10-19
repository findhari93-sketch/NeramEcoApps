'use client';

import { forwardRef, type ElementType } from 'react';
import Link from 'next/link';
import { Box, Paper, Typography, Button, Divider, UserAvatar, Checkbox, CircularProgress } from '@neram/ui';
import {
  describeBlockedReason,
  describeDuplicateEvidence,
  RELATION_LABELS,
  UNDO_WINDOW_DAYS,
} from '@neram/database/duplicate-evidence';
import { formatPhoneForDisplay, phoneKey } from '@neram/database/phone';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import FamilyRestroomIcon from '@mui/icons-material/FamilyRestroom';
import MergeTypeIcon from '@mui/icons-material/MergeType';
import PersonOffOutlinedIcon from '@mui/icons-material/PersonOffOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import AutoModeIcon from '@mui/icons-material/AutoMode';
import DoNotDisturbAltIcon from '@mui/icons-material/DoNotDisturbAlt';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import PauseCircleOutlineIcon from '@mui/icons-material/PauseCircleOutline';
import TravelExploreIcon from '@mui/icons-material/TravelExplore';
import UndoIcon from '@mui/icons-material/Undo';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { formatIstDate } from '@/lib/ops-format';
import { StatusChip, SignInChips, FOCUS_RING, TARGET_44 } from '@/components/ops/OpsUi';
import type { CandidatePerson, DuplicateRelation, QueuePair, DuplicateTab } from './types';

const RELATION_ICON: Record<DuplicateRelation, ElementType> = {
  self: PersonOutlineIcon,
  parent: FamilyRestroomIcon,
  unknown: HelpOutlineIcon,
};

/** Who the other record probably is. Icon and words, never colour alone. */
export function RelationChip({ relation }: { relation: DuplicateRelation | null }) {
  const r = relation || 'unknown';
  return <StatusChip icon={RELATION_ICON[r]} label={RELATION_LABELS[r]} tone={r === 'unknown' ? 'warning' : 'info'} />;
}

/** The one sentence that says why two records were paired. */
export function EvidenceLine({ pair }: { pair: Pick<QueuePair, 'reason' | 'evidence' | 'a' | 'b'> }) {
  return (
    <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
      <TravelExploreIcon aria-hidden fontSize="small" sx={{ color: 'primary.main', mt: '2px' }} />
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontWeight: 700 }}>
          Why they matched
        </Typography>
        <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>
          {describeDuplicateEvidence(pair.reason, pair.evidence as any, pair.a, pair.b)}
        </Typography>
      </Box>
    </Box>
  );
}

/** The value both records share, so it can be highlighted on each side. */
function matchedValues(pair: QueuePair): { phone: string | null; email: string | null } {
  const ev = pair.evidence || {};
  if (ev.kind === 'email' || ev.kind === 'classroom_email') return { phone: null, email: String(ev.value || '').toLowerCase() };
  if (ev.kind) return { phone: phoneKey(String(ev.value || '')), email: null };
  return { phone: null, email: null };
}

function Line({ label, value, matched }: { label: string; value: string | null | undefined; matched?: boolean }) {
  return (
    <Box sx={{ display: 'flex', gap: 1, minWidth: 0, alignItems: 'baseline' }}>
      <Typography variant="caption" color="text.secondary" sx={{ width: 92, flexShrink: 0, lineHeight: 1.7 }}>
        {label}
      </Typography>
      <Typography
        variant="body2"
        sx={{
          minWidth: 0,
          overflowWrap: 'anywhere',
          color: value ? 'text.primary' : 'text.secondary',
          ...(matched && {
            fontWeight: 700,
            px: 0.5,
            mx: -0.5,
            borderRadius: 0.5,
            bgcolor: 'action.selected',
            boxShadow: (t: any) => `inset 0 -2px 0 ${t.palette.primary.main}`,
          }),
        }}
      >
        {value || 'Not set'}
        {matched && (
          <Box component="span" sx={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
            {' '}(the matching value)
          </Box>
        )}
      </Typography>
    </Box>
  );
}

function PersonColumn({
  person,
  side,
  match,
  gone,
}: {
  person: CandidatePerson | null;
  side: string;
  match: { phone: string | null; email: string | null };
  gone?: boolean;
}) {
  if (!person) {
    return (
      <Box sx={{ flex: 1, minWidth: 0, p: 1.5, borderRadius: 1.5, bgcolor: 'action.hover' }}>
        <StatusChip icon={PersonOffOutlinedIcon} label={`Record ${side} no longer exists`} tone="warning" />
      </Box>
    );
  }
  const name = person.name && person.name !== 'User' ? person.name : formatPhoneForDisplay(person.phone) || person.email || 'Unnamed';
  const phoneMatched = !!match.phone && phoneKey(person.phone || '') === match.phone;
  const emailMatched = (v: string | null) => !!match.email && !!v && v.toLowerCase() === match.email;
  return (
    <Box sx={{ flex: 1, minWidth: 0, p: 1.5, borderRadius: 1.5, bgcolor: 'action.hover' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, minWidth: 0 }}>
        <UserAvatar src={person.avatar_url} name={name} size={32} tapToView={false} />
        <Box sx={{ minWidth: 0 }}>
          {gone ? (
            <Typography variant="body2" fontWeight={700} sx={{ overflowWrap: 'anywhere' }}>
              {name}
            </Typography>
          ) : (
            <Link href={`/crm/${person.id}`} style={{ display: 'inline-block', maxWidth: '100%' }}>
              <Typography
                component="span"
                variant="body2"
                fontWeight={700}
                sx={{ display: 'block', overflowWrap: 'anywhere', color: 'primary.main', textDecoration: 'underline', textUnderlineOffset: 2 }}
              >
                {name}
              </Typography>
            </Link>
          )}
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textTransform: 'capitalize' }}>
            {(person.user_type || 'user').replace(/_/g, ' ')}
            {person.academic_year ? `, batch ${person.academic_year}` : ''}
            {gone ? ', folded in' : ''}
          </Typography>
        </Box>
      </Box>
      <Line label="Email" value={person.email} matched={emailMatched(person.email)} />
      {person.personal_email && (
        <Line label="Personal email" value={person.personal_email} matched={emailMatched(person.personal_email)} />
      )}
      <Line label="Phone" value={formatPhoneForDisplay(person.phone)} matched={phoneMatched} />
      <Line label="Created" value={formatIstDate(person.created_at)} />
      {!gone && (
        <Line label="Last sign-in" value={person.last_login_at ? formatIstDate(person.last_login_at) : 'Never signed in'} />
      )}
      <Box sx={{ mt: 1 }}>
        <SignInChips person={person} />
      </Box>
    </Box>
  );
}

function daysLeft(mergedAt: string): number {
  const end = Date.parse(mergedAt) + UNDO_WINDOW_DAYS * 86_400_000;
  return Math.max(0, Math.ceil((end - Date.now()) / 86_400_000));
}

const PairCard = forwardRef<
  HTMLElement,
  {
    pair: QueuePair;
    tab: DuplicateTab;
    selected: boolean;
    focused: boolean;
    busy: 'merge' | 'undo' | null;
    onToggleSelect: (pair: QueuePair) => void;
    onReview: (pair: QueuePair) => void;
    onMerge: (pair: QueuePair) => void;
    onDismiss: (pair: QueuePair) => void;
    onUndo: (pair: QueuePair) => void;
    onFocusCard: () => void;
  }
>(function PairCard({ pair, tab, selected, focused, busy, onToggleSelect, onReview, onMerge, onDismiss, onUndo, onFocusCard }, ref) {
  const bothExist = !!pair.a && !!pair.b;
  const open = pair.status === 'open';
  const blocked = open && !pair.auto_ok ? describeBlockedReason(pair.blocked_reason) : null;
  const match = matchedValues(pair);
  // A merged pair: the kept record is still live; the other was folded in.
  const keptId = pair.status === 'merged' ? pair.kept_id : null;
  const foldedIn = (p: CandidatePerson | null) => !!keptId && !!p && p.id !== keptId;

  return (
    <Paper
      ref={ref as any}
      component="article"
      variant="outlined"
      tabIndex={-1}
      onFocus={onFocusCard}
      aria-label={`Possible duplicate: ${pair.a?.name || 'record'} and ${pair.b?.name || 'record'}`}
      sx={{
        borderRadius: 2,
        overflow: 'hidden',
        borderColor: selected ? 'primary.main' : focused ? 'text.secondary' : 'divider',
        boxShadow: selected ? (t: any) => `0 0 0 1px ${t.palette.primary.main}` : 'none',
        outline: 'none',
        transition: 'border-color 150ms ease',
        '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
      }}
    >
      <Box
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 1,
          pl: open ? 0.5 : 2,
          pr: 2,
          py: 0.75,
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}
      >
        {open && bothExist && (
          <Checkbox
            checked={selected}
            onChange={() => onToggleSelect(pair)}
            inputProps={{ 'aria-label': 'Select this pair for merging' }}
            sx={{ width: 44, height: 44, ...FOCUS_RING }}
          />
        )}
        <RelationChip relation={pair.relation_guess} />
        {pair.status === 'merged' && pair.resolution === 'auto' && (
          <StatusChip icon={AutoModeIcon} label="Merged automatically" tone="success" />
        )}
        {pair.status === 'merged' && pair.resolution !== 'auto' && (
          <StatusChip icon={CheckCircleOutlineIcon} label="Merged" tone="success" />
        )}
        {pair.status === 'dismissed' && <StatusChip icon={DoNotDisturbAltIcon} label="Not the same person" />}
        {pair.undo?.undoneAt && <StatusChip icon={UndoIcon} label="Merge undone" tone="warning" />}
        <Typography variant="caption" color="text.secondary" sx={{ ml: { sm: 'auto' } }}>
          Found {formatIstDate(pair.detected_at)}
          {pair.resolved_at ? `, closed ${formatIstDate(pair.resolved_at)}` : ''}
        </Typography>
      </Box>

      <Box sx={{ px: 2, pt: 1.5, display: 'grid', gap: 1 }}>
        <EvidenceLine pair={pair} />
        {blocked && (
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
            <PauseCircleOutlineIcon aria-hidden fontSize="small" sx={{ color: 'warning.dark', mt: '2px' }} />
            <Typography variant="body2" sx={{ color: 'text.primary' }}>
              <Box component="span" sx={{ fontWeight: 700 }}>
                Waits for you:{' '}
              </Box>
              {blocked}
            </Typography>
          </Box>
        )}
      </Box>

      <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, alignItems: 'stretch', gap: 1, p: 1.5 }}>
        <PersonColumn person={pair.a} side="A" match={match} gone={foldedIn(pair.a)} />
        <Box aria-hidden sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'text.secondary' }}>
          <CompareArrowsIcon sx={{ transform: { xs: 'rotate(90deg)', md: 'none' } }} />
        </Box>
        <PersonColumn person={pair.b} side="B" match={match} gone={foldedIn(pair.b)} />
      </Box>

      {pair.note && (
        <Box sx={{ px: 2, pb: 1.5 }}>
          <Typography variant="body2" color="text.secondary">
            Note: {pair.note}
          </Typography>
        </Box>
      )}

      {open && (
        <>
          <Divider />
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, px: 2, py: 1.25, justifyContent: 'flex-end' }}>
            <Button
              variant="outlined"
              color="inherit"
              startIcon={<PersonOffOutlinedIcon />}
              onClick={() => onDismiss(pair)}
              disabled={!!busy}
              sx={{ ...TARGET_44, ...FOCUS_RING, textTransform: 'none', flex: { xs: '1 1 100%', sm: '0 0 auto' } }}
            >
              Not the same person
            </Button>
            {bothExist && tab === 'ready' && (
              <>
                <Button
                  variant="outlined"
                  onClick={() => onReview(pair)}
                  disabled={!!busy}
                  sx={{ ...TARGET_44, ...FOCUS_RING, textTransform: 'none', flex: { xs: '1 1 100%', sm: '0 0 auto' } }}
                >
                  Review
                </Button>
                <Button
                  variant="contained"
                  startIcon={busy === 'merge' ? <CircularProgress size={16} color="inherit" /> : <MergeTypeIcon />}
                  onClick={() => onMerge(pair)}
                  disabled={!!busy}
                  sx={{ ...TARGET_44, ...FOCUS_RING, textTransform: 'none', flex: { xs: '1 1 100%', sm: '0 0 auto' } }}
                >
                  {busy === 'merge' ? 'Merging' : 'Merge'}
                </Button>
              </>
            )}
            {bothExist && tab !== 'ready' && (
              <Button
                variant="contained"
                startIcon={<MergeTypeIcon />}
                onClick={() => onReview(pair)}
                disabled={!!busy}
                sx={{ ...TARGET_44, ...FOCUS_RING, textTransform: 'none', flex: { xs: '1 1 100%', sm: '0 0 auto' } }}
              >
                Review and merge
              </Button>
            )}
          </Box>
        </>
      )}

      {pair.status === 'merged' && (keptId || pair.undo?.undoable) && (
        <>
          <Divider />
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, px: 2, py: 1.25, justifyContent: 'flex-end', alignItems: 'center' }}>
            {keptId && (
              <Button
                component={Link}
                href={`/crm/${keptId}`}
                variant="outlined"
                startIcon={<OpenInNewIcon />}
                sx={{ ...TARGET_44, ...FOCUS_RING, textTransform: 'none', flex: { xs: '1 1 100%', sm: '0 0 auto' } }}
              >
                Open the kept record
              </Button>
            )}
            {pair.undo?.undoable && (
              <Button
                variant="outlined"
                color="warning"
                startIcon={busy === 'undo' ? <CircularProgress size={16} color="inherit" /> : <UndoIcon />}
                onClick={() => onUndo(pair)}
                disabled={!!busy}
                sx={{ ...TARGET_44, ...FOCUS_RING, textTransform: 'none', flex: { xs: '1 1 100%', sm: '0 0 auto' } }}
              >
                {busy === 'undo' ? 'Undoing' : `Undo merge (${daysLeft(pair.undo.mergedAt)} days left)`}
              </Button>
            )}
          </Box>
        </>
      )}
    </Paper>
  );
});

export default PairCard;
