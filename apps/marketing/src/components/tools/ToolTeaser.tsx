import { ToolConfig } from '@/lib/tools/types';
import { Box, Container } from '@neram/ui';

export default function ToolTeaser({ config }: { config: ToolConfig }) {
  const TeaserWidget = config.teaserComponent;
  return (
    <Box sx={{ py: { xs: 4, md: 6 }, bgcolor: '#FAFAFA' }}>
      <Container maxWidth="sm">
        <TeaserWidget />
      </Container>
    </Box>
  );
}
