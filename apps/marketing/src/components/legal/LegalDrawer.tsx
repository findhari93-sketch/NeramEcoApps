'use client';

import { useState } from 'react';
import {
  Box,
  Typography,
  IconButton,
  Tab,
  Tabs,
  SwipeableDrawer,
  useMediaQuery,
  useTheme,
} from '@neram/ui';
import { CloseIcon } from '@neram/ui';
import { tokens as tk } from '@/design-system';
import TermsContent from './TermsContent';
import RefundPolicyContent from './RefundPolicyContent';

interface LegalDrawerProps {
  open: boolean;
  onClose: () => void;
  /** Which tab to open initially: 0 = Terms, 1 = Refund Policy */
  initialTab?: number;
}

/** Tabs in the site tokens: 14px semibold ink, gold underline on the open one. */
const tabSx = {
  textTransform: 'none',
  fontWeight: 600,
  fontSize: 14,
  minHeight: 48,
  color: tk.inkMuted,
  '&.Mui-selected': { color: tk.ink },
  '&.Mui-focusVisible': { outline: tk.focusOutline, outlineOffset: '-2px' },
} as const;

export default function LegalDrawer({ open, onClose, initialTab = 0 }: LegalDrawerProps) {
  const [tab, setTab] = useState(initialTab);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const content = (
    <Box
      sx={{
        height: isMobile ? '85vh' : '100vh',
        width: isMobile ? '100%' : 520,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 2,
          pt: isMobile ? 1 : 2,
          pb: 0,
          borderBottom: `1px solid ${tk.line}`,
        }}
      >
        {/* Drag handle for mobile */}
        {isMobile && (
          <Box
            sx={{
              position: 'absolute',
              top: 8,
              left: '50%',
              transform: 'translateX(-50%)',
              width: 40,
              height: 4,
              bgcolor: tk.lineStrong,
              borderRadius: '2px',
            }}
          />
        )}

        <Tabs
          value={tab}
          onChange={(_, v) => setTab(v)}
          sx={{
            flex: 1,
            minHeight: 48,
            '& .MuiTabs-indicator': { backgroundColor: tk.gold500, height: 3 },
          }}
        >
          <Tab label="Terms & Conditions" sx={tabSx} />
          <Tab label="Refund Policy" sx={tabSx} />
        </Tabs>

        <IconButton
          onClick={onClose}
          aria-label="Close"
          sx={{
            ml: 1,
            width: 44,
            height: 44,
            color: tk.ink,
            borderRadius: `${tk.radius}px`,
            '&.Mui-focusVisible': { outline: tk.focusOutline, outlineOffset: '2px' },
          }}
        >
          <CloseIcon />
        </IconButton>
      </Box>

      {/* Scrollable content */}
      <Box
        sx={{
          flex: 1,
          overflow: 'auto',
          px: { xs: 2, sm: 3 },
          py: 2,
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {tab === 0 ? (
          <TermsContent compact />
        ) : (
          <RefundPolicyContent compact />
        )}
      </Box>
    </Box>
  );

  return (
    <SwipeableDrawer
      anchor={isMobile ? 'bottom' : 'right'}
      open={open}
      onClose={onClose}
      onOpen={() => {}}
      disableSwipeToOpen
      PaperProps={{
        sx: {
          borderRadius: isMobile ? `${tk.radius}px ${tk.radius}px 0 0` : 0,
          maxHeight: isMobile ? '85vh' : '100vh',
        },
      }}
    >
      {content}
    </SwipeableDrawer>
  );
}
