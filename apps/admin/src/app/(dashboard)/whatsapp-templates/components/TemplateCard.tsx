'use client';

import { Card, CardContent, Box, Typography, Chip, Collapse } from '@neram/ui';
import PlaceholderInputs from './PlaceholderInputs';
import MessagePreview from './MessagePreview';
import ActionRow from './ActionRow';

interface WaTemplate {
  id: string;
  title: string;
  body: string;
  placeholders: string[];
}

interface Props {
  template: WaTemplate;
  expanded: boolean;
  placeholderValues: Record<string, string>;
  onToggleExpand: () => void;
  onPlaceholderChange: (key: string, value: string) => void;
  onCopy: (message: string) => void;
  onEdit: () => void;
  onArchive: () => void;
}

export default function TemplateCard({
  template,
  expanded,
  placeholderValues,
  onToggleExpand,
  onPlaceholderChange,
  onCopy,
  onEdit,
  onArchive,
}: Props) {
  const previewText = template.body.replace(/\{\{\w+\}\}/g, '___').slice(0, 80);

  return (
    <Card
      elevation={expanded ? 3 : 1}
      sx={{ transition: 'box-shadow 0.3s ease' }}
    >
      <CardContent
        onClick={onToggleExpand}
        sx={{
          cursor: 'pointer',
          touchAction: 'manipulation',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          py: 1.5,
          '&:last-child': { pb: 1.5 },
        }}
      >
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography variant="subtitle1" fontWeight={600} noWrap>
            {template.title}
          </Typography>
          <Typography variant="body2" color="text.secondary" noWrap>
            {previewText}{template.body.length > 80 ? '...' : ''}
          </Typography>
        </Box>
        {template.placeholders.length > 0 && (
          <Chip
            label={`${template.placeholders.length} field${template.placeholders.length > 1 ? 's' : ''}`}
            size="small"
            variant="outlined"
            sx={{ ml: 1, flexShrink: 0 }}
          />
        )}
      </CardContent>

      <Collapse in={expanded}>
        <CardContent sx={{ pt: 0, borderTop: '1px solid', borderColor: 'divider' }}>
          {template.placeholders.length > 0 && (
            <PlaceholderInputs
              placeholders={template.placeholders}
              values={placeholderValues}
              onChange={onPlaceholderChange}
            />
          )}

          <MessagePreview body={template.body} values={placeholderValues} />

          <ActionRow
            body={template.body}
            values={placeholderValues}
            onCopy={onCopy}
            onEdit={onEdit}
            onArchive={onArchive}
          />
        </CardContent>
      </Collapse>
    </Card>
  );
}
