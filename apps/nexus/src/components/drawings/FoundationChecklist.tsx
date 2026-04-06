'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Accordion, AccordionSummary, AccordionDetails,
  LinearProgress, IconButton, Chip, CircularProgress,
} from '@neram/ui';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import VerifiedIcon from '@mui/icons-material/Verified';
import type { DrawingChecklistItemWithProgress } from '@neram/database/types';

const CATEGORY_LABELS: Record<string, string> = {
  hand_practice: 'Hand Practice',
  shapes_2d: '2D Shapes',
  color_theory: 'Color Theory',
  forms_3d: '3D Basic Forms',
  shading_techniques: 'Shading Techniques',
  textures: 'Textures',
  composition: 'Composition',
  design_principles: 'Design Principles',
  special_topics: 'Special Topics',
};

interface FoundationChecklistProps {
  getToken: () => Promise<string | null>;
}

export default function FoundationChecklist({ getToken }: FoundationChecklistProps) {
  const [items, setItems] = useState<DrawingChecklistItemWithProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);

  const fetchChecklist = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      const res = await fetch('/api/drawing/checklist', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setItems(data.items || []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => { fetchChecklist(); }, [fetchChecklist]);

  const toggleStatus = async (itemId: string, currentStatus: string) => {
    const nextStatus = currentStatus === 'not_started' ? 'in_progress'
      : currentStatus === 'in_progress' ? 'completed'
      : 'not_started';

    setToggling(itemId);
    // Optimistic update
    setItems((prev) => prev.map((i) => i.id === itemId ? {
      ...i,
      progress: { ...(i.progress || { id: '', student_id: '', checklist_item_id: itemId, student_marked_at: null, tutor_verified: false, tutor_verified_at: null, updated_at: '' }),
        status: nextStatus as any,
      },
    } : i));

    try {
      const token = await getToken();
      await fetch('/api/drawing/checklist', {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_id: itemId, status: nextStatus }),
      });
    } catch {
      fetchChecklist(); // revert on error
    } finally {
      setToggling(null);
    }
  };

  // Group by category
  const grouped = items.reduce<Record<string, DrawingChecklistItemWithProgress[]>>((acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    return acc;
  }, {});

  // Overall progress
  const totalItems = items.length;
  const completedItems = items.filter((i) => i.progress?.status === 'completed').length;
  const inProgressItems = items.filter((i) => i.progress?.status === 'in_progress').length;
  const overallPercent = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;

  if (loading) {
    return (
      <Box sx={{ py: 3, textAlign: 'center' }}><CircularProgress size={28} /></Box>
    );
  }

  return (
    <Box>
      {/* Overall progress */}
      <Box sx={{ mb: 2.5, p: 2, bgcolor: 'background.paper', borderRadius: 1, border: '1px solid', borderColor: 'divider' }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
          <Typography variant="body2" fontWeight={600}>Foundation Skills Progress</Typography>
          <Typography variant="body2" fontWeight={600} color="primary">{overallPercent}%</Typography>
        </Box>
        <LinearProgress variant="determinate" value={overallPercent} sx={{ height: 8, borderRadius: 4, mb: 1 }} />
        <Box sx={{ display: 'flex', gap: 2 }}>
          <Typography variant="caption" color="text.secondary">
            {completedItems}/{totalItems} completed
          </Typography>
          <Typography variant="caption" color="warning.main">
            {inProgressItems} in progress
          </Typography>
        </Box>
      </Box>

      {/* Category accordions */}
      {Object.entries(grouped).map(([cat, catItems]) => {
        const catCompleted = catItems.filter((i) => i.progress?.status === 'completed').length;
        const catPercent = Math.round((catCompleted / catItems.length) * 100);

        return (
          <Accordion key={cat} defaultExpanded={catPercent < 100} disableGutters variant="outlined" sx={{ mb: 1, '&:before': { display: 'none' } }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ minHeight: 48 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1, mr: 1 }}>
                <Typography variant="body2" fontWeight={600}>{CATEGORY_LABELS[cat] || cat}</Typography>
                <Chip
                  label={`${catCompleted}/${catItems.length}`}
                  size="small"
                  color={catPercent === 100 ? 'success' : 'default'}
                  sx={{ height: 22, fontSize: '0.7rem' }}
                />
              </Box>
            </AccordionSummary>
            <AccordionDetails sx={{ pt: 0 }}>
              {catItems.map((item) => {
                const status = item.progress?.status || 'not_started';
                const verified = item.progress?.tutor_verified;
                return (
                  <Box
                    key={item.id}
                    sx={{
                      display: 'flex', alignItems: 'center', gap: 1, py: 1,
                      borderBottom: '1px solid', borderColor: 'divider',
                      '&:last-child': { borderBottom: 'none' },
                    }}
                  >
                    <IconButton
                      size="small"
                      onClick={() => toggleStatus(item.id, status)}
                      disabled={toggling === item.id}
                      sx={{ p: 0.5 }}
                    >
                      {status === 'completed' ? (
                        <CheckCircleIcon sx={{ color: 'success.main', fontSize: 22 }} />
                      ) : status === 'in_progress' ? (
                        <HourglassEmptyIcon sx={{ color: 'warning.main', fontSize: 22 }} />
                      ) : (
                        <RadioButtonUncheckedIcon sx={{ color: 'grey.400', fontSize: 22 }} />
                      )}
                    </IconButton>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="body2" sx={{
                        textDecoration: status === 'completed' ? 'line-through' : 'none',
                        color: status === 'completed' ? 'text.secondary' : 'text.primary',
                      }}>
                        {item.skill_name}
                      </Typography>
                      {item.description && (
                        <Typography variant="caption" color="text.secondary" noWrap>
                          {item.description}
                        </Typography>
                      )}
                    </Box>
                    {verified && (
                      <VerifiedIcon sx={{ color: 'primary.main', fontSize: 18 }} />
                    )}
                  </Box>
                );
              })}
            </AccordionDetails>
          </Accordion>
        );
      })}
    </Box>
  );
}
