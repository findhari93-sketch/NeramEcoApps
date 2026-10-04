import { ToolConfig } from '@/lib/tools/types';
import ToolHero from './ToolHero';
import ToolTeaser from './ToolTeaser';
import ToolHowItWorks from './ToolHowItWorks';
import ToolFeatures from './ToolFeatures';
import ToolScreenshots from './ToolScreenshots';
import ToolContext from './ToolContext';
import ToolRelatedTools from './ToolRelatedTools';
import ToolFAQ from './ToolFAQ';
import ToolCTA from './ToolCTA';
import Link from 'next/link';
import { Box, Container, Divider, Typography } from '@neram/ui';

export default function ToolLandingPage({ config }: { config: ToolConfig }) {
  return (
    <>
      <ToolHero config={config} />
      {/* Ties every tool guide back to the aiArchitek product hub. */}
      <Box sx={{ borderBottom: '1px solid', borderColor: 'divider', bgcolor: 'background.paper' }}>
        <Container maxWidth="md" sx={{ py: 1.5 }}>
          <Typography sx={{ fontSize: '0.9375rem', color: 'text.secondary', textAlign: 'center' }}>
            Part of{' '}
            <Box
              component={Link}
              href="/aiarchitek"
              sx={{
                color: 'primary.main',
                fontWeight: 600,
                textUnderlineOffset: '3px',
                display: 'inline-block',
                py: 1,
                '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
              }}
            >
              aiArchitek
            </Box>
            , free AI-powered NATA preparation tools by Neram Classes
          </Typography>
        </Container>
      </Box>
      <ToolTeaser config={config} />
      <ToolHowItWorks
        steps={config.steps}
        toolName={config.title}
        category={config.category}
      />
      <Divider />
      <ToolFeatures features={config.features} />
      <Divider />
      <ToolScreenshots screenshots={config.screenshots} appUrl={config.appUrl} />
      <Divider />
      <ToolContext
        contextHeading={config.contextHeading}
        contextContent={config.contextContent}
        appUrl={config.appUrl}
      />
      <Divider />
      <ToolRelatedTools relatedToolSlugs={config.relatedToolSlugs} />
      <Divider />
      <ToolFAQ faqs={config.faqs} />
      <ToolCTA appUrl={config.appUrl} />
    </>
  );
}
