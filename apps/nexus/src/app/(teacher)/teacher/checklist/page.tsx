'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Paper,
  Chip,
  Skeleton,
  Fab,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
} from '@neram/ui';
import AddIcon from '@mui/icons-material/Add';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';

interface ChecklistItem {
  id: string;
  title: string;
  topic: { id: string; title: string; category: string } | null;
  resource_count: number;
  completed_count: number;
  total_students: number;
}

interface TopicOption {
  id: string;
  title: string;
  category: string;
}

interface ItemFormData {
  title: string;
  topic_id: string;
  resource_urls: string;
}

const emptyForm: ItemFormData = {
  title: '',
  topic_id: '',
  resource_urls: '',
};

export default function TeacherChecklist() {
  const { activeClassroom, getToken } = useNexusAuthContext();
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formData, setFormData] = useState<ItemFormData>(emptyForm);
  const [topics, setTopics] = useState<TopicOption[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const fetchItems = useCallback(async () => {
    if (!activeClassroom) return;
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) return;

      const res = await fetch(
        `/api/checklist?classroom=${activeClassroom.id}&mode=manage`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (res.ok) {
        const data = await res.json();
        setItems(data.items || []);
      }
    } catch (err) {
      console.error('Failed to load checklist:', err);
    } finally {
      setLoading(false);
    }
  }, [activeClassroom, getToken]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  // Fetch topics for the dialog
  useEffect(() => {
    if (!activeClassroom) return;

    async function fetchTopics() {
      try {
        const token = await getToken();
        if (!token) return;
        const res = await fetch(
          `/api/topics?classroom=${activeClassroom!.id}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (res.ok) {
          const data = await res.json();
          setTopics(data.topics || []);
        }
      } catch (err) {
        console.error('Failed to load topics:', err);
      }
    }

    fetchTopics();
  }, [activeClassroom, getToken]);

  const handleOpenAdd = () => {
    setFormData(emptyForm);
    setDialogOpen(true);
  };

  const handleClose = () => {
    setDialogOpen(false);
    setFormData(emptyForm);
  };

  const handleSubmit = async () => {
    if (!activeClassroom) return;
    setSubmitting(true);
    try {
      const token = await getToken();
      if (!token) return;

      const resourceUrls = formData.resource_urls
        .split('\n')
        .map((url) => url.trim())
        .filter((url) => url.length > 0);

      const res = await fetch('/api/checklist', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: formData.title,
          topic_id: formData.topic_id || null,
          resource_urls: resourceUrls,
          classroom_id: activeClassroom.id,
        }),
      });

      if (res.ok) {
        handleClose();
        fetchItems();
      }
    } catch (err) {
      console.error('Failed to create checklist item:', err);
    } finally {
      setSubmitting(false);
    }
  };

  // Group items by topic category
  const groupedItems = items.reduce<Record<string, ChecklistItem[]>>((acc, item) => {
    const category = item.topic?.category || 'Uncategorized';
    if (!acc[category]) acc[category] = [];
    acc[category].push(item);
    return acc;
  }, {});

  return (
    <Box sx={{ position: 'relative', minHeight: '60vh' }}>
      <Typography variant="h5" component="h1" sx={{ fontWeight: 700, mb: 2 }}>
        Checklist
      </Typography>

      {loading ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} variant="rectangular" height={64} sx={{ borderRadius: 1 }} />
          ))}
        </Box>
      ) : items.length === 0 ? (
        <Paper sx={{ p: 3, textAlign: 'center' }}>
          <Typography variant="body2" color="text.secondary">
            No checklist items yet. Tap + to add one.
          </Typography>
        </Paper>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {Object.entries(groupedItems)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([category, categoryItems]) => (
              <Box key={category}>
                <Typography
                  variant="subtitle2"
                  sx={{ fontWeight: 600, mb: 1, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 0.5 }}
                >
                  {category}
                </Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {categoryItems.map((item) => (
                    <Paper
                      key={item.id}
                      variant="outlined"
                      sx={{
                        p: 2,
                        display: 'flex',
                        alignItems: { xs: 'flex-start', sm: 'center' },
                        flexDirection: { xs: 'column', sm: 'row' },
                        gap: 1,
                      }}
                    >
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="body1" sx={{ fontWeight: 600 }}>
                          {item.title}
                        </Typography>
                        {item.topic && (
                          <Chip label={item.topic.title} size="small" sx={{ mt: 0.5 }} />
                        )}
                      </Box>
                      <Box sx={{ display: 'flex', gap: 1, flexShrink: 0, alignItems: 'center' }}>
                        {item.resource_count > 0 && (
                          <Chip
                            label={`${item.resource_count} resource${item.resource_count !== 1 ? 's' : ''}`}
                            size="small"
                            variant="outlined"
                          />
                        )}
                        <Chip
                          label={`${item.completed_count}/${item.total_students} completed`}
                          size="small"
                          color={
                            item.total_students > 0 && item.completed_count === item.total_students
                              ? 'success'
                              : item.completed_count > 0
                                ? 'info'
                                : 'default'
                          }
                          variant="outlined"
                        />
                      </Box>
                    </Paper>
                  ))}
                </Box>
              </Box>
            ))}
        </Box>
      )}

      {/* Add Item FAB */}
      <Fab
        color="primary"
        aria-label="Add checklist item"
        onClick={handleOpenAdd}
        sx={{
          position: 'fixed',
          bottom: { xs: 80, md: 24 },
          right: { xs: 16, md: 24 },
          width: 56,
          height: 56,
        }}
      >
        <AddIcon />
      </Fab>

      {/* Add Item Dialog */}
      <Dialog open={dialogOpen} onClose={handleClose} fullWidth maxWidth="sm">
        <DialogTitle>Add Checklist Item</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <TextField
              label="Title"
              fullWidth
              value={formData.title}
              onChange={(e) => setFormData((f) => ({ ...f, title: e.target.value }))}
              inputProps={{ style: { minHeight: 24 } }}
            />
            <TextField
              label="Topic"
              select
              fullWidth
              value={formData.topic_id}
              onChange={(e) => setFormData((f) => ({ ...f, topic_id: e.target.value }))}
              SelectProps={{ native: true }}
            >
              <option value="">-- Select Topic (optional) --</option>
              {topics.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </TextField>
            <TextField
              label="Resource URLs (one per line)"
              fullWidth
              multiline
              rows={3}
              value={formData.resource_urls}
              onChange={(e) => setFormData((f) => ({ ...f, resource_urls: e.target.value }))}
              placeholder="https://example.com/resource1&#10;https://example.com/resource2"
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={handleClose} sx={{ minHeight: 48 }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleSubmit}
            disabled={submitting || !formData.title}
            sx={{ minHeight: 48 }}
          >
            {submitting ? 'Creating...' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
