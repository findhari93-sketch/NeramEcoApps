import type { Metadata } from 'next';
import ToolPublicPage from '@/components/tools/page/ToolPublicPage';
import { DataTable, Section } from '@/components/tools/page/parts';
import ImageCropDemo from '@/features/tools/image-crop/ImageCropDemo';
import { getToolSeo } from '@/lib/tools/tool-seo';
import { toolPageMetadata } from '@/lib/seo/tool-metadata';

export const revalidate = 86400;

export function generateMetadata(): Metadata {
  const tool = getToolSeo('nata-image-crop');
  return toolPageMetadata({ title: tool.title, description: tool.description, path: tool.path, keywords: tool.keywords });
}

export default function ImageCropPage() {
  const tool = getToolSeo('nata-image-crop');
  return (
    <ToolPublicPage
      tool={tool}
      crumbs={[
        { name: 'Tools', path: '/tools' },
        { name: tool.name, path: tool.path },
      ]}
      demo={<ImageCropDemo />}
    >
      <Section id="specs" title="NATA photo and signature specifications">
        <DataTable
          caption="As required by the NATA application form"
          head={['Item', 'Size', 'Pixels', 'File size']}
          rows={[
            ['Photograph', '3.5 x 4.5 cm (7:9)', '350 x 450 px', '4 to 100 KB, JPG'],
            ['Signature', '3.5 x 1.5 cm (7:3)', '350 x 150 px', '1 to 30 KB, JPG'],
          ]}
        />
      </Section>
    </ToolPublicPage>
  );
}
