'use client';

import { Box, Typography, Button, Skeleton, Stack } from '@neram/ui';
import AddIcon from '@mui/icons-material/Add';
import TemplateCard from './TemplateCard';

interface WaTemplate {
  id: string;
  category_id: string;
  title: string;
  body: string;
  placeholders: string[];
  sort_order: number;
  is_archived: boolean;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

interface Props {
  templates: WaTemplate[];
  expandedCardId: string | null;
  placeholderValues: Record<string, Record<string, string>>;
  onToggleExpand: (id: string) => void;
  onPlaceholderChange: (templateId: string, key: string, value: string) => void;
  onCopy: (message: string) => void;
  onEdit: (template: WaTemplate) => void;
  onArchive: (id: string) => void;
  loading: boolean;
  onAddTemplate: () => void;
}

export default function TemplateList({
  templates,
  expandedCardId,
  placeholderValues,
  onToggleExpand,
  onPlaceholderChange,
  onCopy,
  onEdit,
  onArchive,
  loading,
  onAddTemplate,
}: Props) {
  if (loading) {
    return (
      <Stack spacing={2}>
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} variant="rounded" height={80} />
        ))}
      </Stack>
    );
  }

  if (templates.length === 0) {
    return (
      <Box sx={{ textAlign: 'center', py: 6 }}>
        <Typography color="text.secondary" sx={{ mb: 2 }}>
          No templates in this category yet
        </Typography>
        <Button variant="outlined" startIcon={<AddIcon />} onClick={onAddTemplate}>
          Add Template
        </Button>
      </Box>
    );
  }

  return (
    <Stack spacing={2}>
      {templates.map((template) => (
        <TemplateCard
          key={template.id}
          template={template}
          expanded={expandedCardId === template.id}
          placeholderValues={placeholderValues[template.id] || {}}
          onToggleExpand={() => onToggleExpand(template.id)}
          onPlaceholderChange={(key, value) => onPlaceholderChange(template.id, key, value)}
          onCopy={onCopy}
          onEdit={() => onEdit(template)}
          onArchive={() => onArchive(template.id)}
        />
      ))}
    </Stack>
  );
}
