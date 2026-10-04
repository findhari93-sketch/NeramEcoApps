import Link from 'next/link';
import { Box, Typography, Button } from '@neram/ui';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { appToolUrl, type LiveTool } from '@/lib/aiarchitek/content';

/**
 * One live tool. The title links to the marketing guide for the tool (internal
 * link), the button opens the working tool on the app.
 */
export function ToolCard({ tool }: { tool: LiveTool }) {
  return (
    <Box
      component="article"
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: 1.5,
        p: { xs: 2, sm: 2.5 },
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 2,
        bgcolor: 'background.paper',
      }}
    >
      <Box
        component="h4"
        sx={{ m: 0, fontSize: '1.0625rem', fontWeight: 700, lineHeight: 1.35 }}
      >
        <Box
          component={Link}
          href={`/tools/${tool.slug}`}
          sx={{
            color: 'primary.main',
            textDecoration: 'underline',
            textUnderlineOffset: '3px',
            display: 'inline-flex',
            alignItems: 'center',
            minHeight: 44,
            '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
          }}
        >
          {tool.name}
        </Box>
      </Box>
      <Typography sx={{ fontSize: '1rem', lineHeight: 1.55, color: 'text.primary' }}>{tool.definition}</Typography>

      <Box
        component="dl"
        sx={{
          m: 0,
          display: 'grid',
          gridTemplateColumns: 'auto 1fr',
          columnGap: 1.5,
          rowGap: 0.75,
          fontSize: '0.9375rem',
          lineHeight: 1.5,
          '& dt': { fontWeight: 600, color: 'text.primary' },
          '& dd': { m: 0, color: 'text.secondary', overflowWrap: 'anywhere' },
        }}
      >
        <dt>For</dt>
        <dd>{tool.whoFor}</dd>
        <dt>You enter</dt>
        <dd>{tool.input}</dd>
        <dt>You get</dt>
        <dd>{tool.output}</dd>
        <dt>Free</dt>
        <dd>{tool.free}</dd>
        <dt>Sign in adds</dt>
        <dd>{tool.signedIn}</dd>
      </Box>

      <Box sx={{ mt: 'auto', pt: 0.5 }}>
        <Button
          component="a"
          href={appToolUrl(tool)}
          variant="outlined"
          endIcon={<OpenInNewIcon aria-hidden />}
          aria-label={`Open the ${tool.name} on aiArchitek`}
          sx={{ minHeight: 48, fontWeight: 600, width: { xs: '100%', sm: 'auto' } }}
        >
          Open tool
        </Button>
      </Box>
    </Box>
  );
}
