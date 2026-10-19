'use client';

import { useRef, type KeyboardEvent } from 'react';
import { Box, Typography } from '@neram/ui';
import CheckCircleOutlined from '@mui/icons-material/CheckCircleOutlined';
import RadioButtonUncheckedOutlined from '@mui/icons-material/RadioButtonUncheckedOutlined';
import LockOutlined from '@mui/icons-material/LockOutlined';
import EventAvailableOutlined from '@mui/icons-material/EventAvailableOutlined';
import { tokens as t, focusRing } from '@/design-system';
import { rupees, formatDay, addDays, istTodayKey, type StudentPayOffer } from './student-pay-types';

interface PlanChoiceStepProps {
  offer: StudentPayOffer & { balanceDueDays: number };
  scheme: 'full' | 'installment';
  onChange: (scheme: 'full' | 'installment') => void;
  /** "September 2027" */
  accessUntil: string;
  payeeName: string;
}

/**
 * Two plans as one radio group. Paying in full is the first, preselected and
 * marked best value; the installment card states plainly what it costs extra.
 */
export default function PlanChoiceStep({ offer, scheme, onChange, accessUntil, payeeName }: PlanChoiceStepProps) {
  const fullRef = useRef<HTMLDivElement>(null);
  const instRef = useRef<HTMLDivElement>(null);
  const dueBy = formatDay(addDays(istTodayKey(), offer.balanceDueDays || 45));

  const onKey = (e: KeyboardEvent) => {
    if (!offer.allowsInstallments) return;
    if (['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft'].includes(e.key)) {
      e.preventDefault();
      const next = scheme === 'full' ? 'installment' : 'full';
      onChange(next);
      (next === 'full' ? fullRef : instRef).current?.focus();
    }
  };

  const fullBenefits = [
    'One payment and you are done. No second due date, no reminders.',
    `Full access to the Neram app, live classes, recordings and the question bank until ${accessUntil}.`,
    `Your fee is locked today${offer.savings > 0 ? `, and you keep the ${rupees(offer.savings)} saving` : ''}.`,
  ];

  return (
    <Box>
      <Typography component="h2" sx={{ fontSize: { xs: 20, md: 22 }, fontWeight: 700, color: t.ink, mb: 0.5 }}>
        Choose how you want to pay
      </Typography>
      <Typography sx={{ fontSize: 16, color: t.inkMuted, mb: 2.5, lineHeight: 1.5 }}>
        The amount is set for you. You only pick the plan.
      </Typography>

      <Box role="radiogroup" aria-label="Payment plan" onKeyDown={onKey} sx={{ display: 'grid', gap: 2 }}>
        <PlanCard
          refEl={fullRef}
          selected={scheme === 'full'}
          onSelect={() => onChange('full')}
          badge={offer.savings > 0 ? `Best value, save ${rupees(offer.savings)}` : 'Recommended'}
          title="Pay in full"
          price={rupees(offer.fullAmount)}
          strike={offer.savings > 0 ? rupees(offer.installmentTotal) : null}
          priceNote="one time"
        >
          <Box component="ul" sx={{ m: 0, mt: 1.5, p: 0, listStyle: 'none', display: 'grid', gap: 1 }}>
            {fullBenefits.map((b) => (
              <Box component="li" key={b} sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
                <CheckCircleOutlined aria-hidden sx={{ fontSize: 20, color: t.success, mt: '2px', flexShrink: 0 }} />
                <Typography sx={{ fontSize: 15, color: t.ink, lineHeight: 1.5 }}>{b}</Typography>
              </Box>
            ))}
          </Box>
        </PlanCard>

        {offer.allowsInstallments && offer.installment1 !== null && offer.installment2 !== null && (
          <PlanCard
            refEl={instRef}
            selected={scheme === 'installment'}
            onSelect={() => onChange('installment')}
            title="Two installments"
            price={rupees(offer.installment1)}
            priceNote="today"
          >
            <Box sx={{ mt: 1.5, display: 'grid', gap: 0.75 }}>
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
                <EventAvailableOutlined aria-hidden sx={{ fontSize: 20, color: t.inkMuted, mt: '2px' }} />
                <Typography sx={{ fontSize: 15, color: t.ink, lineHeight: 1.5 }}>
                  Then {rupees(offer.installment2)} by {dueBy}. We will remind you before it is due.
                </Typography>
              </Box>
              <Typography sx={{ fontSize: 14, color: t.inkMuted, lineHeight: 1.5, pl: '28px' }}>
                Total {rupees(offer.installmentTotal)}
                {offer.savings > 0 ? `, which is ${rupees(offer.savings)} more than paying in full.` : '.'}
              </Typography>
            </Box>
          </PlanCard>
        )}
      </Box>

      <Box
        sx={{
          mt: 2.5,
          display: 'flex',
          gap: 1,
          alignItems: 'flex-start',
          p: 1.5,
          borderRadius: `${t.radius}px`,
          bgcolor: t.ground,
          border: `1px solid ${t.line}`,
        }}
      >
        <LockOutlined aria-hidden sx={{ fontSize: 20, color: t.inkMuted, mt: '2px' }} />
        <Typography sx={{ fontSize: 14, color: t.inkMuted, lineHeight: 1.5 }}>
          You pay {payeeName}, the trust that runs Neram Classes, directly by UPI or bank transfer. Neram never asks for your UPI PIN, OTP or card details. You get an emailed receipt once we confirm the payment.
        </Typography>
      </Box>
    </Box>
  );
}

function PlanCard(props: {
  refEl: React.RefObject<HTMLDivElement>;
  selected: boolean;
  onSelect: () => void;
  title: string;
  price: string;
  strike?: string | null;
  priceNote: string;
  badge?: string;
  children: React.ReactNode;
}) {
  const { selected } = props;
  return (
    <Box
      ref={props.refEl}
      role="radio"
      aria-checked={selected}
      tabIndex={selected ? 0 : -1}
      onClick={props.onSelect}
      onKeyDown={(e) => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          props.onSelect();
        }
      }}
      sx={{
        position: 'relative',
        cursor: 'pointer',
        p: { xs: 2, sm: 2.5 },
        pt: props.badge ? { xs: 3.5, sm: 3.5 } : { xs: 2, sm: 2.5 },
        borderRadius: `${t.radius}px`,
        bgcolor: t.surface,
        border: `${selected ? 2 : 1}px solid ${selected ? t.navy900 : t.lineStrong}`,
        // Keeps the card the same size when the border thickens.
        m: selected ? 0 : '1px',
        transition: 'border-color 150ms ease',
        '&:hover': { borderColor: selected ? t.navy900 : t.gold500 },
        '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
        ...focusRing,
      }}
    >
      {props.badge && (
        <Box
          sx={{
            position: 'absolute',
            top: 0,
            left: 16,
            transform: 'translateY(-50%)',
            px: 1.25,
            py: 0.25,
            borderRadius: `${t.radiusPill}px`,
            bgcolor: t.gold500,
            color: t.navy900,
            fontSize: 13,
            fontWeight: 700,
            whiteSpace: 'nowrap',
          }}
        >
          {props.badge}
        </Box>
      )}
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
        {selected ? (
          <CheckCircleOutlined aria-hidden sx={{ fontSize: 26, color: t.navy900, flexShrink: 0 }} />
        ) : (
          <RadioButtonUncheckedOutlined aria-hidden sx={{ fontSize: 26, color: t.lineStrong, flexShrink: 0 }} />
        )}
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 1, flexWrap: 'wrap' }}>
            <Typography sx={{ fontSize: 18, fontWeight: 700, color: t.ink }}>{props.title}</Typography>
            <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.75, flexWrap: 'wrap' }}>
              {props.strike && (
                <Typography component="s" sx={{ fontSize: 15, color: t.inkMuted }} aria-label={`was ${props.strike}`}>
                  {props.strike}
                </Typography>
              )}
              <Typography sx={{ fontSize: 24, fontWeight: 800, color: t.ink, fontVariantNumeric: 'tabular-nums' }}>
                {props.price}
              </Typography>
              <Typography sx={{ fontSize: 14, color: t.inkMuted }}>{props.priceNote}</Typography>
            </Box>
          </Box>
          {props.children}
        </Box>
      </Box>
    </Box>
  );
}
