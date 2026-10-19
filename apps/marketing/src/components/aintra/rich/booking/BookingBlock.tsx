'use client';

import Link from 'next/link';
import { Box, Button } from '@neram/ui';
import EventAvailableRoundedIcon from '@mui/icons-material/EventAvailableRounded';
import PhoneCallbackRoundedIcon from '@mui/icons-material/PhoneCallbackRounded';
import type { BookSuggestion } from '@/lib/aintra/booking';
import { useAintraBooking } from './BookingContext';
import CallbackCard from './CallbackCard';
import DemoCard from './DemoCard';

/**
 * A [[book:...]] line. Inside the Aintra drawer it is a card the visitor
 * confirms in place; anywhere else (the canvas, other chat widgets) it is a
 * plain link to the page that does the same job.
 */
export default function BookingBlock({ suggestion, interactive }: { suggestion: BookSuggestion; interactive: boolean }) {
  const ctx = useAintraBooking();
  if (ctx && interactive) {
    return suggestion.kind === 'demo' ? <DemoCard suggestion={suggestion} /> : <CallbackCard suggestion={suggestion} />;
  }
  const demo = suggestion.kind === 'demo';
  return (
    <Box>
      <Button
        component={Link}
        href={demo ? '/demo-class' : '/apply/callback'}
        variant="contained"
        disableElevation
        startIcon={demo ? <EventAvailableRoundedIcon /> : <PhoneCallbackRoundedIcon />}
        sx={{ minHeight: 48, px: 2.25, borderRadius: 2, textTransform: 'none', fontWeight: 700 }}
      >
        {demo ? 'Book a demo class' : 'Request a callback'}
      </Button>
    </Box>
  );
}
