'use client';

import React from 'react';
import { Box, Typography, Button, Divider } from '@mui/material';
import PhoneIcon from '@mui/icons-material/Phone';
import ChatIcon from '@mui/icons-material/Chat';

const OFFICE_PHONE = '+919176137043';
const OFFICE_PHONE_DISPLAY = '+91 91761 37043';
const WHATSAPP_MESSAGE = encodeURIComponent(
  "Hello! I need help with my application at Neram Classes."
);

interface ConnectToOfficeProps {
  onRequestCallback?: () => void;
}

export function ConnectToOffice({ onRequestCallback }: ConnectToOfficeProps) {
  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="subtitle2" fontWeight={600} gutterBottom>
        Need human help?
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Our team is happy to assist you with your application.
      </Typography>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        <Button
          variant="outlined"
          size="small"
          startIcon={<PhoneIcon />}
          href={`tel:${OFFICE_PHONE}`}
          sx={{ justifyContent: 'flex-start', textTransform: 'none' }}
        >
          Call us: {OFFICE_PHONE_DISPLAY}
        </Button>

        <Button
          variant="outlined"
          size="small"
          startIcon={<ChatIcon />}
          href={`https://wa.me/${OFFICE_PHONE}?text=${WHATSAPP_MESSAGE}`}
          target="_blank"
          rel="noopener noreferrer"
          sx={{
            justifyContent: 'flex-start',
            textTransform: 'none',
            borderColor: '#25D366',
            color: '#25D366',
            '&:hover': { borderColor: '#128C7E', bgcolor: 'rgba(37,211,102,0.04)' },
          }}
        >
          WhatsApp us
        </Button>

        {onRequestCallback && (
          <>
            <Divider sx={{ my: 0.5 }}>
              <Typography variant="caption" color="text.secondary">
                or
              </Typography>
            </Divider>
            <Button
              variant="contained"
              size="small"
              onClick={onRequestCallback}
              sx={{ textTransform: 'none' }}
            >
              Request a Callback
            </Button>
          </>
        )}
      </Box>
    </Box>
  );
}

export default ConnectToOffice;
