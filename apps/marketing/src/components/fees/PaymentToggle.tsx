'use client';

import { Box, Typography, ToggleButton, ToggleButtonGroup } from '@neram/ui';
import {
  PaymentOutlined,
  CalendarMonthOutlined,
} from '@mui/icons-material';

interface PaymentToggleProps {
  value: 'single' | 'installment';
  onChange: (mode: 'single' | 'installment') => void;
  t: (key: string) => string;
}

export default function PaymentToggle({ value, onChange, t }: PaymentToggleProps) {
  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: 'center',
        mb: 4,
      }}
    >
      <ToggleButtonGroup
        value={value}
        exclusive
        onChange={(_, newValue) => {
          if (newValue) onChange(newValue as 'single' | 'installment');
        }}
        sx={{
          bgcolor: 'grey.100',
          borderRadius: 1,
          p: 0.5,
          '& .MuiToggleButton-root': {
            border: 'none',
            borderRadius: '6px !important',
            px: { xs: 2, sm: 3 },
            py: 1,
            textTransform: 'none',
            fontWeight: 600,
            fontSize: { xs: '0.8rem', sm: '0.9rem' },
            transition: 'all 0.2s',
            '&.Mui-selected': {
              bgcolor: 'primary.main',
              color: 'primary.contrastText',
              boxShadow: 2,
              '&:hover': {
                bgcolor: 'primary.dark',
              },
            },
          },
        }}
      >
        <ToggleButton value="single" aria-label="Single payment">
          <PaymentOutlined sx={{ mr: 0.75, fontSize: 18 }} />
          {t('singlePayment')}
        </ToggleButton>
        <ToggleButton value="installment" aria-label="Installment payment">
          <CalendarMonthOutlined sx={{ mr: 0.75, fontSize: 18 }} />
          {t('installments')}
        </ToggleButton>
      </ToggleButtonGroup>
    </Box>
  );
}
