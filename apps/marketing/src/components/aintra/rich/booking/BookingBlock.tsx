'use client';

import Link from 'next/link';
import { Box, Button } from '@neram/ui';
import EventAvailableRoundedIcon from '@mui/icons-material/EventAvailableRounded';
import EventBusyRoundedIcon from '@mui/icons-material/EventBusyRounded';
import PhoneCallbackRoundedIcon from '@mui/icons-material/PhoneCallbackRounded';
import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined';
import StoreMallDirectoryOutlinedIcon from '@mui/icons-material/StoreMallDirectoryOutlined';
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined';
import MailOutlineRoundedIcon from '@mui/icons-material/MailOutlineRounded';
import type { BookKind, BookSuggestion } from '@/lib/aintra/booking';
import { useAintraBooking } from './BookingContext';
import ApplicationCard from './ApplicationCard';
import CallbackCard from './CallbackCard';
import DemoCard from './DemoCard';
import DemoCancelCard from './DemoCancelCard';
import QuickFormCard from './QuickFormCard';

const FALLBACK: Record<BookKind, { href: string; label: string; icon: JSX.Element }> = {
  demo: { href: '/demo-class', label: 'Book a demo class', icon: <EventAvailableRoundedIcon /> },
  'cancel-demo': { href: '/demo-class/my', label: 'Manage my demo class', icon: <EventBusyRoundedIcon /> },
  callback: { href: '/apply/callback', label: 'Request a callback', icon: <PhoneCallbackRoundedIcon /> },
  apply: { href: '/apply', label: 'Fill in the application', icon: <AssignmentOutlinedIcon /> },
  visit: { href: '/centers', label: 'Book a centre visit', icon: <StoreMallDirectoryOutlinedIcon /> },
  'college-enquiry': { href: '/colleges', label: 'Find the college', icon: <SchoolOutlinedIcon /> },
  message: { href: '/contact', label: 'Message our team', icon: <MailOutlineRoundedIcon /> },
};

/**
 * A [[book:...]] line. Inside the Aintra drawer it is a card the visitor
 * confirms in place; anywhere else (the canvas, other chat widgets) it is a
 * plain link to the page that does the same job.
 */
export default function BookingBlock({ suggestion, interactive }: { suggestion: BookSuggestion; interactive: boolean }) {
  const ctx = useAintraBooking();
  if (ctx && interactive) {
    switch (suggestion.kind) {
      case 'demo':
        return <DemoCard suggestion={suggestion} />;
      case 'cancel-demo':
        return <DemoCancelCard suggestion={suggestion} />;
      case 'apply':
        return <ApplicationCard />;
      case 'visit':
      case 'college-enquiry':
      case 'message':
        return <QuickFormCard suggestion={{ ...suggestion, kind: suggestion.kind }} />;
      default:
        return <CallbackCard suggestion={suggestion} />;
    }
  }
  const link = FALLBACK[suggestion.kind];
  return (
    <Box>
      <Button
        component={Link}
        href={link.href}
        variant="contained"
        disableElevation
        startIcon={link.icon}
        sx={{ minHeight: 48, px: 2.25, borderRadius: 2, textTransform: 'none', fontWeight: 700 }}
      >
        {link.label}
      </Button>
    </Box>
  );
}
