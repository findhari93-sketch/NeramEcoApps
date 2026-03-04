'use client';

import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import {
  Box,
  Container,
  Typography,
  Grid,
  Button,
} from '@neram/ui';
import {
  WhatsAppIcon,
  PhoneIcon,
  EmailIcon,
  m3Primary,
  m3Secondary,
  m3Neutral,
} from '@neram/ui';

const WHATSAPP_GREEN = '#25d366';

interface ContactCardData {
  icon: React.ReactNode;
  iconBg: string;
  accentColor: string;
  title: string;
  detail?: string;
  buttonLabel: string;
  buttonVariant: 'contained' | 'outlined';
  buttonColor: string;
  buttonTextColor?: string;
  href: string;
}

const contactCards: ContactCardData[] = [
  {
    icon: <WhatsAppIcon sx={{ fontSize: 28, color: WHATSAPP_GREEN }} />,
    iconBg: 'rgba(37, 211, 102, 0.1)',
    accentColor: WHATSAPP_GREEN,
    title: 'WhatsApp',
    buttonLabel: 'Chat Now',
    buttonVariant: 'contained',
    buttonColor: WHATSAPP_GREEN,
    buttonTextColor: '#fff',
    href: 'https://wa.me/919176137043?text=Hi%2C%20I%20need%20help%20with%20NATA%202026',
  },
  {
    icon: <PhoneIcon sx={{ fontSize: 28, color: m3Primary[40] }} />,
    iconBg: m3Primary[95],
    accentColor: m3Primary[40],
    title: 'Phone',
    detail: '+91 91761 37043',
    buttonLabel: 'Call Now',
    buttonVariant: 'outlined',
    buttonColor: m3Primary[40],
    href: 'tel:+919176137043',
  },
  {
    icon: <EmailIcon sx={{ fontSize: 28, color: m3Secondary[40] }} />,
    iconBg: m3Secondary[95],
    accentColor: m3Secondary[40],
    title: 'Email',
    detail: 'info@neramclasses.com',
    buttonLabel: 'Send Email',
    buttonVariant: 'outlined',
    buttonColor: m3Secondary[40],
    href: 'mailto:info@neramclasses.com',
  },
];

/** Individual contact card with hover effects */
function ContactCard({ card }: { card: ContactCardData }) {
  return (
    <Box
      sx={{
        bgcolor: '#fff',
        border: '1px solid',
        borderColor: m3Neutral[90],
        borderLeft: `3px solid ${card.accentColor}`,
        borderRadius: 2,
        p: 3,
        textAlign: 'center',
        transition: 'all 0.3s ease',
        '&:hover': {
          boxShadow: '0 8px 24px rgba(0,0,0,0.08)',
          '& .contact-icon-circle': {
            transform: 'scale(1.1)',
          },
        },
      }}
    >
      {/* Icon circle */}
      <Box
        className="contact-icon-circle"
        sx={{
          width: 48,
          height: 48,
          borderRadius: '50%',
          bgcolor: card.iconBg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          mx: 'auto',
          mb: 2,
          transition: 'transform 0.3s ease',
        }}
      >
        {card.icon}
      </Box>

      {/* Title */}
      <Typography
        variant="subtitle1"
        sx={{ fontWeight: 600, mb: 0.5 }}
      >
        {card.title}
      </Typography>

      {/* Detail (phone number / email) */}
      {card.detail && (
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ mb: 2, fontSize: '0.85rem' }}
        >
          {card.detail}
        </Typography>
      )}

      {!card.detail && <Box sx={{ mb: 2 }} />}

      {/* Action button */}
      <Button
        variant={card.buttonVariant}
        href={card.href}
        target={card.href.startsWith('http') ? '_blank' : undefined}
        rel={card.href.startsWith('http') ? 'noopener noreferrer' : undefined}
        sx={{
          borderRadius: 2,
          textTransform: 'none',
          fontWeight: 600,
          minHeight: 48,
          px: 3,
          ...(card.buttonVariant === 'contained'
            ? {
                bgcolor: card.buttonColor,
                color: card.buttonTextColor || '#fff',
                '&:hover': {
                  bgcolor: card.buttonColor,
                  opacity: 0.9,
                },
              }
            : {
                color: card.buttonColor,
                borderColor: card.buttonColor,
                '&:hover': {
                  borderColor: card.buttonColor,
                  bgcolor: `${card.buttonColor}10`,
                },
              }),
        }}
      >
        {card.buttonLabel}
      </Button>
    </Box>
  );
}

export default function ContactSection() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, amount: 0.2 });

  return (
    <Box
      component="section"
      ref={ref}
      sx={{
        bgcolor: m3Neutral[96],
        py: { xs: 6, md: 10 },
        px: { xs: 2, md: 0 },
      }}
    >
      <Container maxWidth="lg">
        {/* Heading */}
        <Typography
          variant="h4"
          component="h2"
          sx={{
            fontWeight: 700,
            textAlign: 'center',
            mb: 1,
            fontSize: { xs: '1.5rem', md: '2rem' },
          }}
        >
          Contact &amp; Help
        </Typography>

        <Typography
          variant="body1"
          color="text.secondary"
          sx={{ textAlign: 'center', mb: { xs: 4, md: 5 } }}
        >
          Have questions? We&apos;re here to help.
        </Typography>

        {/* Contact cards with stagger animation */}
        <motion.div
          initial="hidden"
          animate={isInView ? 'visible' : 'hidden'}
          variants={{
            hidden: {},
            visible: {
              transition: { staggerChildren: 0.1 },
            },
          }}
        >
          <Grid container spacing={3} justifyContent="center">
            {contactCards.map((card) => (
              <Grid item xs={12} sm={4} key={card.title}>
                <motion.div
                  variants={{
                    hidden: { opacity: 0, y: 20 },
                    visible: {
                      opacity: 1,
                      y: 0,
                      transition: {
                        duration: 0.5,
                        ease: [0.05, 0.7, 0.1, 1],
                      },
                    },
                  }}
                >
                  <ContactCard card={card} />
                </motion.div>
              </Grid>
            ))}
          </Grid>
        </motion.div>
      </Container>
    </Box>
  );
}
