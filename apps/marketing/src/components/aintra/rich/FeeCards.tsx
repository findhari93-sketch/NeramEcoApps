'use client';

import Link from 'next/link';
import { Box, Button, Chip, Typography } from '@neram/ui';
import { alpha } from '@mui/material/styles';
import OpenInFullRoundedIcon from '@mui/icons-material/OpenInFullRounded';
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined';
import CreditCardOutlinedIcon from '@mui/icons-material/CreditCardOutlined';
import YouTubeIcon from '@mui/icons-material/YouTube';
import { COURSE_FEES, FEE_NOTES, formatRupees, fullPaymentSaving } from '@/lib/aintra/fees';

interface Props {
  /** Program ids from [[fees:...]], or null for all of them. */
  ids: string[] | null;
  variant: 'chat' | 'canvas';
  onOpenCanvas?: () => void;
}

/**
 * Neram's course fees as cards, drawn from lib/aintra/fees.ts so the numbers
 * are always the real ones, whatever the model wrote around them.
 *
 * Each card leads with the pay-in-full price, says what installments come to,
 * and shows the saving, which is the comparison a parent actually makes.
 */
export default function FeeCards({ ids, variant, onOpenCanvas }: Props) {
  const picked = ids ? COURSE_FEES.filter((f) => ids.includes(f.id)) : COURSE_FEES;
  const fees = picked.length ? picked : COURSE_FEES;

  return (
    <Box
      component="section"
      aria-label="Course fees"
      sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 3, bgcolor: 'grey.50', p: { xs: 1.25, sm: 1.5 } }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1, pl: 0.5 }}>
        <Typography component="h3" sx={{ fontSize: '0.875rem', fontWeight: 700, color: 'text.secondary', letterSpacing: '0.02em' }}>
          Course fees
        </Typography>
        {variant === 'chat' && onOpenCanvas && fees.length > 1 && (
          <Button
            size="small"
            onClick={onOpenCanvas}
            startIcon={<OpenInFullRoundedIcon sx={{ fontSize: 16 }} />}
            sx={{ minHeight: 44, textTransform: 'none', fontWeight: 600, px: 1.25 }}
          >
            Open in canvas
          </Button>
        )}
      </Box>

      <Box
        component="ul"
        sx={{
          listStyle: 'none',
          p: 0,
          m: 0,
          display: 'grid',
          gap: 1,
          gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
        }}
      >
        {fees.map((fee) => {
          const saving = fullPaymentSaving(fee);
          return (
            <Box
              component="li"
              key={fee.id}
              data-testid="aintra-fee-card"
              sx={{
                bgcolor: 'background.paper',
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 2.5,
                p: 2,
                display: 'flex',
                flexDirection: 'column',
                gap: 0.5,
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
                <Typography component="h4" sx={{ fontSize: '1rem', fontWeight: 700, lineHeight: 1.3 }}>
                  {fee.name}
                </Typography>
                <Chip
                  label={`${fee.months} months`}
                  size="small"
                  variant="outlined"
                  sx={{ fontWeight: 600, fontSize: '0.75rem', flexShrink: 0 }}
                />
              </Box>

              <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.75, mt: 0.75, flexWrap: 'wrap' }}>
                <Typography
                  component="p"
                  sx={{ fontSize: variant === 'canvas' ? '1.75rem' : '1.5rem', fontWeight: 800, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}
                >
                  {formatRupees(fee.fullPrice)}
                </Typography>
                <Typography component="span" sx={{ fontSize: '0.875rem', color: 'text.secondary', fontWeight: 500 }}>
                  pay in full
                </Typography>
              </Box>

              <Typography component="p" sx={{ fontSize: '0.9375rem', color: 'text.secondary', lineHeight: 1.5 }}>
                {fee.installmentTotal == null ? (
                  'Single payment only'
                ) : (
                  <>
                    or <Box component="strong" sx={{ color: 'text.primary', fontWeight: 600 }}>{formatRupees(fee.installmentTotal)}</Box> in installments
                  </>
                )}
              </Typography>

              {saving != null && (
                <Box
                  sx={(theme) => ({
                    alignSelf: 'flex-start',
                    mt: 0.5,
                    px: 1,
                    py: 0.25,
                    borderRadius: 1,
                    fontSize: '0.8125rem',
                    fontWeight: 700,
                    color: theme.palette.success.dark,
                    bgcolor: alpha(theme.palette.success.main, 0.12),
                  })}
                >
                  Save {formatRupees(saving)} paying in full
                </Box>
              )}
            </Box>
          );
        })}
      </Box>

      <Box component="ul" sx={{ listStyle: 'none', p: 0, m: 0, mt: 1.5, display: 'grid', gap: 0.75, px: 0.5 }}>
        {[
          { icon: <SchoolOutlinedIcon />, text: FEE_NOTES.scholarship },
          { icon: <CreditCardOutlinedIcon />, text: FEE_NOTES.emi },
          { icon: <YouTubeIcon />, text: FEE_NOTES.youtube },
        ].map((note) => (
          <Box
            component="li"
            key={note.text}
            sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, fontSize: '0.875rem', color: 'text.secondary', lineHeight: 1.5, '& svg': { fontSize: 18, mt: '2px', color: 'text.secondary', flexShrink: 0 } }}
          >
            {note.icon}
            {note.text}
          </Box>
        ))}
      </Box>

      <Box sx={{ display: 'flex', gap: 1, mt: 1.5, flexWrap: 'wrap' }}>
        <Button
          component={Link}
          href="/apply"
          variant="contained"
          disableElevation
          sx={{ flex: '1 1 140px', minHeight: 48, textTransform: 'none', fontWeight: 700, borderRadius: 2 }}
        >
          Apply now
        </Button>
        <Button
          component={Link}
          href="/demo-class"
          variant="outlined"
          sx={(theme) => ({
            flex: '1 1 140px',
            minHeight: 48,
            textTransform: 'none',
            fontWeight: 700,
            borderRadius: 2,
            bgcolor: 'background.paper',
            '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.04) },
          })}
        >
          Book a demo
        </Button>
      </Box>
    </Box>
  );
}
