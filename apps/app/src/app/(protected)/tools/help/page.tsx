'use client';

import Link from 'next/link';
import { Box, Typography, Button } from '@neram/ui';
import { alpha, type Theme } from '@mui/material/styles';
import type { SvgIconComponent } from '@mui/icons-material';
import HowToRegOutlinedIcon from '@mui/icons-material/HowToRegOutlined';
import OpenInNewRoundedIcon from '@mui/icons-material/OpenInNewRounded';
import MailOutlineRoundedIcon from '@mui/icons-material/MailOutlineRounded';
import PhoneOutlinedIcon from '@mui/icons-material/PhoneOutlined';
import ScheduleOutlinedIcon from '@mui/icons-material/ScheduleOutlined';
import ConfirmationNumberOutlinedIcon from '@mui/icons-material/ConfirmationNumberOutlined';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import TawkToChat from '@/components/TawkToChat';
import ToolTile, { trackTint } from '@/components/tools-hub/ToolTile';
import { TOOL_CATALOG } from '@/lib/navigation-data';

/** The tools students ask about most. Each tile opens the tool itself. */
const HELP_TOOL_IDS = ['nata-cutoff-calculator', 'counseling-college-predictor', 'nata-exam-centers'];

const SUPPORT_EMAIL = 'info@neramclasses.com';
const SUPPORT_PHONE_DISPLAY = '+91 91761 37043';
const SUPPORT_PHONE_TEL = '+919176137043';

function ContactRow({
  Icon,
  label,
  value,
  href,
}: {
  Icon: SvgIconComponent;
  label: string;
  value: string;
  href?: string;
}) {
  const content = (
    <>
      <Box
        aria-hidden="true"
        sx={(theme: Theme) => ({
          width: 44,
          height: 44,
          flexShrink: 0,
          borderRadius: 2.5,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'primary.main',
          bgcolor: alpha(theme.palette.primary.main, theme.palette.mode === 'light' ? 0.1 : 0.16),
        })}
      >
        <Icon sx={{ fontSize: 22 }} />
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontSize: '0.8125rem', fontWeight: 600, color: 'text.secondary' }}>{label}</Typography>
        <Typography sx={{ fontSize: '1rem', fontWeight: 700, color: href ? 'primary.main' : 'text.primary', overflowWrap: 'anywhere' }}>
          {value}
        </Typography>
      </Box>
    </>
  );

  const rowSx = {
    display: 'flex',
    alignItems: 'center',
    gap: 1.5,
    minHeight: 64,
    p: 1.5,
    borderRadius: 3,
    border: '1px solid',
    borderColor: 'divider',
    bgcolor: 'background.paper',
    textDecoration: 'none',
  };

  if (!href) return <Box sx={rowSx}>{content}</Box>;

  return (
    <Box
      component="a"
      href={href}
      sx={{
        ...rowSx,
        transition: 'border-color 0.2s ease',
        '&:hover': { borderColor: 'primary.main' },
        '&:active': { bgcolor: 'action.hover' },
      }}
    >
      {content}
    </Box>
  );
}

export default function HelpPage() {
  const tools = HELP_TOOL_IDS.map((id) => TOOL_CATALOG.find((t) => t.id === id)).filter(
    (t): t is (typeof TOOL_CATALOG)[number] => !!t,
  );

  return (
    <Box sx={{ maxWidth: 960, mx: 'auto' }}>
      {/* Tawk.to live chat widget */}
      <TawkToChat />

      <Box component="header" sx={{ mb: { xs: 3, md: 4 } }}>
        <Typography variant="h1" sx={{ fontSize: { xs: '1.5rem', md: '1.875rem' }, mb: 0.75 }}>
          Help and Support
        </Typography>
        <Typography sx={{ color: 'text.secondary', fontSize: { xs: '0.9375rem', md: '1rem' }, lineHeight: 1.55, maxWidth: 640 }}>
          Chat with us using the chat button, raise a ticket, or call us. Most questions are answered the same day.
        </Typography>
      </Box>

      {/* Ticket */}
      <Box
        component="section"
        aria-labelledby="ticket-heading"
        sx={(theme: Theme) => ({
          display: 'flex',
          flexDirection: { xs: 'column', sm: 'row' },
          alignItems: { sm: 'center' },
          gap: 2,
          p: { xs: 2, sm: 2.5 },
          mb: { xs: 4, md: 5 },
          borderRadius: 3.5,
          border: '1px solid',
          borderColor: alpha(theme.palette.primary.main, 0.3),
          bgcolor: alpha(theme.palette.primary.main, theme.palette.mode === 'light' ? 0.06 : 0.12),
        })}
      >
        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start', flex: 1, minWidth: 0 }}>
          <ConfirmationNumberOutlinedIcon aria-hidden="true" sx={{ color: 'primary.main', fontSize: 28, mt: 0.25 }} />
          <Box>
            <Typography id="ticket-heading" component="h2" sx={{ fontSize: '1.0625rem', fontWeight: 700 }}>
              Need a hand with something specific?
            </Typography>
            <Typography sx={{ color: 'text.secondary', fontSize: '0.9375rem', mt: 0.25 }}>
              Raise a support ticket and track our reply in the app.
            </Typography>
          </Box>
        </Box>
        <Button
          component={Link}
          href="/support"
          variant="contained"
          endIcon={<ArrowForwardRoundedIcon />}
          sx={{ minHeight: 48, flexShrink: 0 }}
        >
          Raise a ticket
        </Button>
      </Box>

      {/* Tools people ask about */}
      <Box component="section" aria-labelledby="topics-heading" sx={{ mb: { xs: 4, md: 5 } }}>
        <Typography id="topics-heading" component="h2" sx={{ fontSize: { xs: '1.125rem', md: '1.25rem' }, fontWeight: 700 }}>
          Questions about a tool?
        </Typography>
        <Typography sx={{ color: 'text.secondary', fontSize: '0.9375rem', mt: 0.25, mb: 1.75 }}>
          Each tool explains its inputs on the page. Open the one you need, or ask us in the chat.
        </Typography>
        <Box
          component="ul"
          sx={{
            listStyle: 'none',
            m: 0,
            p: 0,
            display: 'grid',
            gap: 1.5,
            gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' },
          }}
        >
          {tools.map((tool) => (
            <li key={tool.id}>
              <ToolTile tool={tool} />
            </li>
          ))}
          <li>
            <Box
              component="a"
              href="https://neramclasses.com/apply"
              target="_blank"
              rel="noopener noreferrer"
              sx={(theme: Theme) => ({
                display: 'flex',
                alignItems: 'flex-start',
                gap: 1.75,
                height: '100%',
                p: 2,
                borderRadius: 3.5,
                border: '1px solid',
                borderColor: 'divider',
                bgcolor: 'background.paper',
                textDecoration: 'none',
                transition: 'border-color 0.2s ease',
                '&:hover': { borderColor: 'primary.main' },
                '&:active': { bgcolor: 'action.hover' },
                // The gold tint, at a contrast that holds in both modes
                '& .enrol-icon': { color: trackTint(theme, 'jee').fg, bgcolor: trackTint(theme, 'jee').bg },
              })}
            >
              <Box
                aria-hidden="true"
                className="enrol-icon"
                sx={{ width: 44, height: 44, flexShrink: 0, borderRadius: 2.5, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <HowToRegOutlinedIcon sx={{ fontSize: 24 }} />
              </Box>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography component="h3" sx={{ fontSize: '1rem', fontWeight: 700, lineHeight: 1.3, color: 'text.primary', mb: 0.25 }}>
                  Join Neram Classes
                </Typography>
                <Typography sx={{ fontSize: '0.875rem', lineHeight: 1.5, color: 'text.secondary' }}>
                  Apply for coaching, see fees, payment options and scholarships.
                </Typography>
                <Typography component="span" sx={{ display: 'inline-block', mt: 0.75, fontSize: '0.75rem', fontWeight: 600, color: 'text.secondary' }}>
                  Opens neramclasses.com
                </Typography>
              </Box>
              <OpenInNewRoundedIcon aria-hidden="true" sx={{ color: 'text.secondary', alignSelf: 'center', flexShrink: 0, fontSize: 20 }} />
            </Box>
          </li>
        </Box>
      </Box>

      {/* Contact */}
      <Box component="section" aria-labelledby="contact-heading">
        <Typography id="contact-heading" component="h2" sx={{ fontSize: { xs: '1.125rem', md: '1.25rem' }, fontWeight: 700 }}>
          Other ways to reach us
        </Typography>
        <Typography sx={{ color: 'text.secondary', fontSize: '0.9375rem', mt: 0.25, mb: 1.75 }}>
          Prefer email or a call? Tap to contact us directly.
        </Typography>
        <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))' } }}>
          <ContactRow Icon={MailOutlineRoundedIcon} label="Email" value={SUPPORT_EMAIL} href={`mailto:${SUPPORT_EMAIL}`} />
          <ContactRow Icon={PhoneOutlinedIcon} label="Phone" value={SUPPORT_PHONE_DISPLAY} href={`tel:${SUPPORT_PHONE_TEL}`} />
          <ContactRow Icon={ScheduleOutlinedIcon} label="Hours" value="Mon to Sat, 9 AM to 6 PM" />
        </Box>
      </Box>
    </Box>
  );
}
