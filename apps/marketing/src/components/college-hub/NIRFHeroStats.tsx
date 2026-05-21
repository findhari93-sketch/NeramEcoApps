import { Box, Typography, Stack } from '@mui/material';

interface StatProps {
  label: string;
  value: React.ReactNode;
  caption?: string;
}

function StatCell({ label, value, caption }: StatProps) {
  return (
    <Box
      sx={{
        flex: 1,
        minWidth: 0,
        px: { xs: 2, md: 3 },
        py: { xs: 1.75, md: 2 },
        borderLeft: { md: '1px solid' },
        borderColor: { md: 'divider' },
        '&:first-of-type': { borderLeft: 'none' },
      }}
    >
      <Typography
        variant="caption"
        sx={{
          display: 'block',
          textTransform: 'uppercase',
          letterSpacing: 0.6,
          fontSize: '0.68rem',
          fontWeight: 600,
          color: 'text.secondary',
          mb: 0.5,
        }}
      >
        {label}
      </Typography>
      <Typography
        sx={{
          fontSize: { xs: '1.5rem', md: '1.75rem' },
          fontWeight: 800,
          lineHeight: 1.1,
          letterSpacing: '-0.02em',
        }}
      >
        {value}
      </Typography>
      {caption && (
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: 'block', fontSize: '0.72rem', mt: 0.5 }}
        >
          {caption}
        </Typography>
      )}
    </Box>
  );
}

interface Props {
  institutionsRanked: number;
  topScore: number | null;
  statesCovered: number;
  govt: number;
  privateCount: number;
  year: number;
}

export default function NIRFHeroStats({
  institutionsRanked,
  topScore,
  statesCovered,
  govt,
  privateCount,
  year,
}: Props) {
  return (
    <Box
      sx={{
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 1.5,
        bgcolor: 'background.paper',
        overflow: 'hidden',
        mb: { xs: 2, md: 3 },
      }}
    >
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        divider={
          <Box
            sx={{
              display: { xs: 'block', md: 'none' },
              borderTop: '1px solid',
              borderColor: 'divider',
            }}
          />
        }
      >
        <StatCell
          label="Institutions ranked"
          value={institutionsRanked}
          caption={`in NIRF ${year}`}
        />
        <StatCell
          label="Top score"
          value={topScore !== null ? topScore.toFixed(2) : '.'}
          caption="rank #1"
        />
        <StatCell
          label="States covered"
          value={statesCovered}
          caption="across India"
        />
        <StatCell
          label="Govt : Private"
          value={`${govt} : ${privateCount}`}
          caption="mix"
        />
      </Stack>
    </Box>
  );
}
