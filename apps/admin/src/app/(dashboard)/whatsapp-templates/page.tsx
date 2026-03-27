'use client';

import { useState, useEffect, useCallback } from 'react';
import { Box, Typography, Button, Snackbar, Alert } from '@neram/ui';
import AddIcon from '@mui/icons-material/Add';
import CategoryTabs from './components/CategoryTabs';
import TemplateList from './components/TemplateList';
import TemplateFormDialog from './components/TemplateFormDialog';
import { cacheData, getCachedData } from '@/lib/whatsapp-templates/cache';

interface WaCategory {
  id: string;
  name: string;
  slug: string;
  sort_order: number;
}

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
  category?: WaCategory;
}

export default function WhatsAppTemplatesPage() {
  const [categories, setCategories] = useState<WaCategory[]>([]);
  const [templates, setTemplates] = useState<WaTemplate[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null);
  const [placeholderValues, setPlaceholderValues] = useState<Record<string, Record<string, string>>>({});
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string }>({ open: false, message: '' });
  const [formDialog, setFormDialog] = useState<{ open: boolean; template: WaTemplate | null }>({ open: false, template: null });
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/whatsapp-templates');
      if (res.ok) {
        const data = await res.json();
        setCategories(data.categories || []);
        setTemplates(data.templates || []);
        cacheData('categories', data.categories);
        cacheData('templates', data.templates);
      }
    } catch {
      // Try cache on failure
      const cachedCats = getCachedData<WaCategory[]>('categories');
      const cachedTpls = getCachedData<WaTemplate[]>('templates');
      if (cachedCats) setCategories(cachedCats);
      if (cachedTpls) setTemplates(cachedTpls);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Load from cache first for instant display
    const cachedCats = getCachedData<WaCategory[]>('categories');
    const cachedTpls = getCachedData<WaTemplate[]>('templates');
    if (cachedCats && cachedTpls) {
      setCategories(cachedCats);
      setTemplates(cachedTpls);
      setLoading(false);
    }
    fetchData();
  }, [fetchData]);

  const handlePlaceholderChange = (templateId: string, key: string, value: string) => {
    setPlaceholderValues((prev) => ({
      ...prev,
      [templateId]: { ...prev[templateId], [key]: value },
    }));
  };

  const showSnackbar = (message: string) => {
    setSnackbar({ open: true, message });
  };

  const handleArchive = async (templateId: string) => {
    try {
      await fetch(`/api/whatsapp-templates/${templateId}`, { method: 'DELETE' });
      await fetchData();
      showSnackbar('Template archived');
    } catch {
      showSnackbar('Failed to archive template');
    }
  };

  const filteredTemplates = selectedCategory === 'all'
    ? templates
    : templates.filter((t) => t.category_id === selectedCategory);

  return (
    <Box sx={{ p: { xs: 2, sm: 3 }, maxWidth: 900, mx: 'auto' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5" fontWeight={700}>
          WhatsApp Templates
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setFormDialog({ open: true, template: null })}
          sx={{ minHeight: 44 }}
        >
          Add Template
        </Button>
      </Box>

      <CategoryTabs
        categories={categories}
        templates={templates}
        selectedCategory={selectedCategory}
        onCategoryChange={setSelectedCategory}
      />

      <TemplateList
        templates={filteredTemplates}
        expandedCardId={expandedCardId}
        placeholderValues={placeholderValues}
        onToggleExpand={(id) => setExpandedCardId(expandedCardId === id ? null : id)}
        onPlaceholderChange={handlePlaceholderChange}
        onCopy={showSnackbar}
        onEdit={(template) => setFormDialog({ open: true, template })}
        onArchive={handleArchive}
        loading={loading}
        onAddTemplate={() => setFormDialog({ open: true, template: null })}
      />

      <TemplateFormDialog
        open={formDialog.open}
        template={formDialog.template}
        categories={categories}
        onClose={() => setFormDialog({ open: false, template: null })}
        onSaved={() => {
          setFormDialog({ open: false, template: null });
          fetchData();
          showSnackbar(formDialog.template ? 'Template updated' : 'Template created');
        }}
      />

      <Snackbar
        open={snackbar.open}
        autoHideDuration={2000}
        onClose={() => setSnackbar({ open: false, message: '' })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="success" variant="filled" sx={{ width: '100%' }}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
