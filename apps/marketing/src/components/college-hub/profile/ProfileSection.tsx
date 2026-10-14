import { Box, Typography } from '@mui/material';

interface Props {
  id: string;
  title: string;
  /** Optional link or button on the right of the heading. */
  action?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * One section of the college page (canvas: white card on desktop, full-width
 * band on phones). The id is the target of the sticky section tabs.
 */
export default function ProfileSection({ id, title, action, children }: Props) {
  return (
    <Box
      component="section"
      id={id}
      aria-labelledby={`${id}-heading`}
      sx={{
        scrollMarginTop: 'calc(var(--broadcast-banner-height, 0px) + 64px)',
        bgcolor: 'background.paper',
        border: { md: '1px solid' },
        borderColor: { md: 'divider' },
        borderRadius: { xs: 0, md: 2 },
        px: { xs: 2, md: 3.5 },
        py: { xs: 2.5, md: 3.5 },
        display: 'flex',
        flexDirection: 'column',
        gap: { xs: 1.75, md: 2.25 },
        minWidth: 0,
      }}
    >
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', gap: '8px 16px' }}>
        <Typography id={`${id}-heading`} variant="h2" sx={{ m: 0, fontSize: { xs: '1.15rem', md: 20 }, fontWeight: 700, lineHeight: 1.3 }}>
          {title}
        </Typography>
        {action}
      </Box>
      {children}
    </Box>
  );
}
