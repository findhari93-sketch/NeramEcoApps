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
import { Divider } from '@neram/ui';

export default function ToolLandingPage({ config }: { config: ToolConfig }) {
  return (
    <>
      <ToolHero config={config} />
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
