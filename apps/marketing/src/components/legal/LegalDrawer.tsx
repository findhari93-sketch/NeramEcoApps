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
import TermsContent from './TermsContent';
import RefundPolicyContent from './RefundPolicyContent';

interface LegalDrawerProps {
  open: boolean;
  onClose: () => void;
  /** Which tab to open initially: 0 = Terms, 1 = Refund Policy */
  initialTab?: number;
}

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
          borderBottom: '1px solid',
          borderColor: 'divider',
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
              bgcolor: 'grey.400',
              borderRadius: 2,
            }}
          />
        )}

        <Tabs
          value={tab}
          onChange={(_, v) => setTab(v)}
          sx={{ flex: 1, minHeight: 44 }}
        >
          <Tab label="Terms & Conditions" sx={{ textTransform: 'none', fontWeight: 600, fontSize: 13 }} />
          <Tab label="Refund Policy" sx={{ textTransform: 'none', fontWeight: 600, fontSize: 13 }} />
        </Tabs>

        <IconButton onClick={onClose} size="small" sx={{ ml: 1 }}>
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
          borderRadius: isMobile ? '16px 16px 0 0' : 0,
          maxHeight: isMobile ? '85vh' : '100vh',
        },
      }}
    >
      {content}
    </SwipeableDrawer>
  );
}
