'use client'

import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Divider from '@mui/material/Divider'
import Link from 'next/link'
import type { AskSeniorsEvent, AskSeniorsCollege } from '@neram/database'
import CollegesGrid from './CollegesGrid'
import RegistrationForm from './RegistrationForm'
import AskSeniorsFAQ from './AskSeniorsFAQ'

interface Props {
  event: AskSeniorsEvent
  colleges: AskSeniorsCollege[]
}

function formatEventDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('en-IN', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  } catch {
    return 'Coming June/July 2026'
  }
}

export default function AskSeniorsPageContent({ event, colleges }: Props) {
  const dateDisplay = event.event_date
    ? formatEventDate(event.event_date)
    : 'Coming June/July 2026'

  return (
    <Box sx={{ minHeight: '100vh', background: '#080d18', color: '#fff' }}>

      {/* ── Section 1: Hero ── */}
      <Box
        component="section"
        sx={{
          pt: { xs: 10, md: 14 },
          pb: { xs: 6, md: 9 },
          textAlign: 'center',
          px: 2,
          position: 'relative',
          overflow: 'hidden',
          '&::before': {
            content: '""',
            position: 'absolute',
            top: 0,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 800,
            height: 400,
            background: 'radial-gradient(ellipse, rgba(232,160,32,0.08) 0%, transparent 70%)',
            pointerEvents: 'none',
          },
        }}
      >
        {/* Free Online Event badge */}
        <Box
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 1,
            bgcolor: 'rgba(34,197,94,0.1)',
            border: '1px solid rgba(34,197,94,0.3)',
            borderRadius: 20,
            px: 2,
            py: 0.5,
            mb: 3,
          }}
        >
          <Box
            sx={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              bgcolor: '#4ade80',
              '@keyframes pulse': {
                '0%, 100%': { opacity: 1 },
                '50%': { opacity: 0.4 },
              },
              animation: 'pulse 2s infinite',
            }}
          />
          <Typography
            variant="caption"
            sx={{ color: '#4ade80', fontWeight: 700, lineHeight: 1 }}
          >
            Free Online Event
          </Typography>
        </Box>

        {/* Title */}
        <Typography
          component="h1"
          sx={{
            fontWeight: 900,
            fontSize: { xs: '2.5rem', md: '4rem' },
            lineHeight: 1.05,
            mb: 2,
            background: 'linear-gradient(90deg, #e8a020, #fbbf24, #e8a020)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}
        >
          #AskSeniors {event.year}
        </Typography>

        {/* Subtitle */}
        <Typography
          variant="h5"
          component="p"
          sx={{
            color: 'text.secondary',
            maxWidth: 600,
            mx: 'auto',
            mb: 2,
            lineHeight: 1.5,
          }}
        >
          Real students. Real answers. Before you decide.
        </Typography>

        {/* Date display */}
        <Typography
          sx={{
            color: '#e8a020',
            fontWeight: 600,
            mb: 4,
          }}
        >
          {dateDisplay}
        </Typography>

        {/* Stats row */}
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'row',
            gap: 3,
            justifyContent: 'center',
            mb: 5,
            flexWrap: 'wrap',
          }}
        >
          {[
            { value: `${colleges.length}+`, label: 'Colleges' },
            { value: 'Free', label: 'For Everyone' },
            { value: 'Live', label: 'Q&A Session' },
          ].map(({ value, label }) => (
            <Box key={label} sx={{ textAlign: 'center' }}>
              <Typography
                sx={{ fontSize: '2rem', fontWeight: 900, color: '#e8a020', lineHeight: 1 }}
              >
                {value}
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.disabled' }}>
                {label}
              </Typography>
            </Box>
          ))}
        </Box>

        {/* Primary CTA */}
        <Button
          component={Link}
          href="#register"
          variant="contained"
          size="large"
          sx={{
            background: 'linear-gradient(135deg, #e8a020, #f59e0b)',
            color: '#000',
            fontWeight: 800,
            px: 5,
            py: 1.5,
            fontSize: '1rem',
            textTransform: 'none',
            borderRadius: 2,
            '&:hover': { opacity: 0.88 },
          }}
        >
          Register Free
        </Button>

        {/* Optional description */}
        {event.description && (
          <Typography
            sx={{
              color: 'text.secondary',
              maxWidth: 580,
              mx: 'auto',
              mt: 4,
              lineHeight: 1.7,
            }}
          >
            {event.description}
          </Typography>
        )}
      </Box>

      <Divider sx={{ borderColor: 'rgba(255,255,255,0.06)' }} />

      {/* ── Section 2: Colleges Grid ── */}
      <CollegesGrid colleges={colleges} />

      <Divider sx={{ borderColor: 'rgba(255,255,255,0.06)' }} />

      {/* ── Section 3: Registration Form ── */}
      <Box
        component="section"
        sx={{ py: { xs: 6, md: 9 }, px: { xs: 2, md: 4 } }}
      >
        <Typography
          variant="overline"
          sx={{
            display: 'block',
            color: '#e8a020',
            letterSpacing: 3,
            fontWeight: 700,
            textAlign: 'center',
            mb: 1,
          }}
        >
          REGISTER
        </Typography>
        <Typography
          variant="h4"
          component="h2"
          sx={{
            fontWeight: 800,
            textAlign: 'center',
            color: '#fff',
            mb: 5,
          }}
        >
          Save Your Spot
        </Typography>
        <RegistrationForm event={event} colleges={colleges} />
      </Box>

      <Divider sx={{ borderColor: 'rgba(255,255,255,0.06)' }} />

      {/* ── Section 4: FAQ ── */}
      <AskSeniorsFAQ />

    </Box>
  )
}
