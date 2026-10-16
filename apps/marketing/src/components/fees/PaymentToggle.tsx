'use client';

import { Box, ToggleButton, ToggleButtonGroup } from '@neram/ui';
import { PaymentOutlined, CalendarMonthOutlined } from '@mui/icons-material';
import { tokens as t } from '@/design-system';

interface PaymentToggleProps {
  value: 'single' | 'installment';
  onChange: (mode: 'single' | 'installment') => void;
  t: (key: string) => string;
}

/** Segmented control: selected = navy fill + paper text (design-system selected state). */
export default function PaymentToggle({ value, onChange, t: tr }: PaymentToggleProps) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'center' }}>
      <ToggleButtonGroup
        value={value}
        exclusive
        onChange={(_, newValue) => {
          if (newValue) onChange(newValue as 'single' | 'installment');
        }}
        sx={{
          bgcolor: t.surface,
          border: `1px solid ${t.line}`,
          borderRadius: `${t.radius}px`,
          p: 0.5,
          gap: 0.5,
          '& .MuiToggleButton-root': {
            border: 'none',
            borderRadius: `${t.radius - 2}px !important`,
            px: { xs: 2, sm: 3 },
            py: 1,
            minHeight: 44,
            textTransform: 'none',
            fontWeight: 600,
            fontSize: { xs: '0.875rem', sm: '0.9375rem' },
            color: t.ink,
            transition: 'background-color 150ms ease, color 150ms ease',
            '&:hover': { bgcolor: t.surfaceHover },
            '&.Mui-focusVisible': { outline: t.focusOutline, outlineOffset: '2px' },
            '&.Mui-selected, &.Mui-selected:hover': { bgcolor: t.navy900, color: t.paper },
          },
        }}
      >
        <ToggleButton value="single" aria-label="Single payment">
          <PaymentOutlined sx={{ mr: 0.75, fontSize: 18 }} />
          {tr('singlePayment')}
        </ToggleButton>
        <ToggleButton value="installment" aria-label="Installment payment">
          <CalendarMonthOutlined sx={{ mr: 0.75, fontSize: 18 }} />
          {tr('installments')}
        </ToggleButton>
      </ToggleButtonGroup>
    </Box>
  );
}
