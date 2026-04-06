'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Tabs, Tab, TextField, Grid, Skeleton, Card, CardContent,
  CardActionArea, Dialog, DialogTitle, DialogContent, IconButton,
  InputAdornment, Chip, Button,
} from '@neram/ui';
import SearchIcon from '@mui/icons-material/Search';
import CloseIcon from '@mui/icons-material/Close';
import BrushOutlinedIcon from '@mui/icons-material/BrushOutlined';
import DifficultyChip from './DifficultyChip';
import ReferenceImageToggle from './ReferenceImageToggle';
import DrawingSubmissionSheet from './DrawingSubmissionSheet';
import type { DrawingObject } from '@neram/database/types';

const FAMILIES = [
  { value: '', label: 'All' },
  { value: 'fruits', label: 'Fruits' },
  { value: 'kitchen', label: 'Kitchen' },
  { value: 'travel', label: 'Travel' },
  { value: 'lighting', label: 'Lighting' },
  { value: 'sports', label: 'Sports' },
  { value: 'stationery', label: 'Stationery' },
  { value: 'toiletries', label: 'Toiletries' },
];

interface ObjectLibraryProps {
  getToken: () => Promise<string | null>;
}

export default function ObjectLibrary({ getToken }: ObjectLibraryProps) {
  const [objects, setObjects] = useState<DrawingObject[]>([]);
  const [loading, setLoading] = useState(true);
  const [family, setFamily] = useState('');
  const [search, setSearch] = useState('');
  const [selectedObject, setSelectedObject] = useState<DrawingObject | null>(null);
  const [submitOpen, setSubmitOpen] = useState(false);

  const fetchObjects = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      const params = new URLSearchParams();
      if (family) params.set('family', family);
      if (search) params.set('search', search);
      const res = await fetch(`/api/drawing/objects?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setObjects(data.objects || []);
    } catch {
      setObjects([]);
    } finally {
      setLoading(false);
    }
  }, [getToken, family, search]);

  useEffect(() => { fetchObjects(); }, [fetchObjects]);

  return (
    <Box>
      {/* Family tabs */}
      <Tabs
        value={family}
        onChange={(_, v) => setFamily(v)}
        variant="scrollable"
        scrollButtons="auto"
        sx={{ mb: 1.5, minHeight: 36, '& .MuiTab-root': { minHeight: 36, py: 0.5, textTransform: 'none' } }}
      >
        {FAMILIES.map((f) => (
          <Tab key={f.value} value={f.value} label={f.label} />
        ))}
      </Tabs>

      {/* Search */}
      <TextField
        placeholder="Search objects..."
        size="small"
        fullWidth
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        InputProps={{
          startAdornment: <InputAdornment position="start"><SearchIcon sx={{ fontSize: 18 }} /></InputAdornment>,
        }}
        sx={{ mb: 2 }}
      />

      {/* Grid */}
      {loading ? (
        <Grid container spacing={1.5}>
          {Array.from({ length: 8 }).map((_, i) => (
            <Grid item xs={6} sm={4} md={3} key={i}>
              <Skeleton variant="rounded" height={120} />
            </Grid>
          ))}
        </Grid>
      ) : objects.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 6 }}>
          <Typography color="text.secondary">No objects found</Typography>
        </Box>
      ) : (
        <Grid container spacing={1.5}>
          {objects.map((obj) => (
            <Grid item xs={6} sm={4} md={3} key={obj.id}>
              <Card variant="outlined" sx={{ height: '100%' }}>
                <CardActionArea onClick={() => setSelectedObject(obj)} sx={{ height: '100%', p: 0 }}>
                  <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                    <Typography variant="body2" fontWeight={600} gutterBottom>
                      {obj.object_name}
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 0.5, mb: 0.5, flexWrap: 'wrap' }}>
                      <DifficultyChip difficulty={obj.difficulty} />
                      <Chip
                        label={obj.family}
                        size="small"
                        variant="outlined"
                        sx={{ height: 22, fontSize: '0.65rem' }}
                      />
                    </Box>
                    {obj.basic_form && (
                      <Typography variant="caption" color="text.secondary">
                        Form: {obj.basic_form}
                      </Typography>
                    )}
                  </CardContent>
                </CardActionArea>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {/* Object detail dialog */}
      <Dialog
        open={!!selectedObject}
        onClose={() => setSelectedObject(null)}
        maxWidth="sm"
        fullWidth
      >
        {selectedObject && (
          <>
            <DialogTitle sx={{ display: 'flex', alignItems: 'center', pb: 0.5 }}>
              <Box sx={{ flex: 1 }}>
                <Typography variant="subtitle1" fontWeight={700}>
                  {selectedObject.object_name}
                </Typography>
                <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5 }}>
                  <DifficultyChip difficulty={selectedObject.difficulty} />
                  <Chip label={selectedObject.family} size="small" variant="outlined" sx={{ height: 22 }} />
                </Box>
              </Box>
              <IconButton onClick={() => setSelectedObject(null)} size="small">
                <CloseIcon />
              </IconButton>
            </DialogTitle>
            <DialogContent>
              {selectedObject.basic_form && (
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                  Basic form: {selectedObject.basic_form}
                </Typography>
              )}

              {/* Reference images */}
              {selectedObject.reference_images.length > 0 ? (
                <Box sx={{ mb: 2 }}>
                  <Typography variant="caption" fontWeight={600} color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
                    REFERENCE IMAGES
                  </Typography>
                  <ReferenceImageToggle images={selectedObject.reference_images} />
                </Box>
              ) : (
                <Box sx={{ py: 3, textAlign: 'center', bgcolor: 'grey.50', borderRadius: 1, mb: 2 }}>
                  <Typography variant="body2" color="text.secondary">
                    Reference images coming soon
                  </Typography>
                </Box>
              )}

              {/* Tips */}
              {selectedObject.tips && (
                <Box sx={{ mb: 2, p: 1.5, bgcolor: 'info.50', borderRadius: 1 }}>
                  <Typography variant="caption" fontWeight={600} color="info.dark">DRAWING TIPS</Typography>
                  <Typography variant="body2" sx={{ mt: 0.5 }}>{selectedObject.tips}</Typography>
                </Box>
              )}

              {/* Practice button */}
              <Button
                variant="contained"
                fullWidth
                startIcon={<BrushOutlinedIcon />}
                onClick={() => setSubmitOpen(true)}
                sx={{ minHeight: 48, textTransform: 'none' }}
              >
                Practice This Object
              </Button>
            </DialogContent>
          </>
        )}
      </Dialog>

      {/* Submission sheet */}
      <DrawingSubmissionSheet
        open={submitOpen}
        onClose={() => setSubmitOpen(false)}
        sourceType="free_practice"
        getToken={getToken}
        onSubmitted={() => { setSubmitOpen(false); setSelectedObject(null); }}
      />
    </Box>
  );
}
