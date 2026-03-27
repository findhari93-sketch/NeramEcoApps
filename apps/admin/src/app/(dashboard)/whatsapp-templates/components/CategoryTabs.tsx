'use client';

import { Tabs, Tab, Box, Chip } from '@neram/ui';

interface Props {
  categories: { id: string; name: string; slug: string }[];
  templates: { category_id: string }[];
  selectedCategory: string;
  onCategoryChange: (value: string) => void;
}

export default function CategoryTabs({ categories, templates, selectedCategory, onCategoryChange }: Props) {
  const getCount = (catId: string) =>
    catId === 'all' ? templates.length : templates.filter((t) => t.category_id === catId).length;

  return (
    <Box sx={{ mb: 3, borderBottom: 1, borderColor: 'divider' }}>
      <Tabs
        value={selectedCategory}
        onChange={(_, v) => onCategoryChange(v)}
        variant="scrollable"
        scrollButtons="auto"
        sx={{ minHeight: 48 }}
      >
        <Tab
          label={
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              All
              <Chip label={getCount('all')} size="small" color="primary" sx={{ height: 20, fontSize: 12, '& .MuiChip-label': { px: 0.75 } }} />
            </Box>
          }
          value="all"
          sx={{ minHeight: 48, textTransform: 'none' }}
        />
        {categories.map((cat) => (
          <Tab
            key={cat.id}
            label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                {cat.name}
                <Chip label={getCount(cat.id)} size="small" color="primary" sx={{ height: 20, fontSize: 12, '& .MuiChip-label': { px: 0.75 } }} />
              </Box>
            }
            value={cat.id}
            sx={{ minHeight: 48, textTransform: 'none' }}
          />
        ))}
      </Tabs>
    </Box>
  );
}
