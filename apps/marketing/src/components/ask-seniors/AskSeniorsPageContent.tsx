'use client'

import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import type { AskSeniorsEvent, AskSeniorsCollege } from '@neram/database'

interface Props {
  event: AskSeniorsEvent
  colleges: AskSeniorsCollege[]
}

export default function AskSeniorsPageContent({ event, colleges }: Props) {
  return (
    <Box sx={{ minHeight: '100vh', background: '#080d18', color: '#fff' }}>
      <Box sx={{ py: 8, textAlign: 'center' }}>
        <Typography variant="h1" sx={{ fontWeight: 900, mb: 2 }}>{event.title}</Typography>
        <Typography sx={{ color: 'text.secondary' }}>{colleges.length} colleges participating</Typography>
      </Box>
    </Box>
  )
}
