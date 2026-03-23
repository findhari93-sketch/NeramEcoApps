'use client';

import {
  Card,
  CardContent,
  Typography,
  Stack,
  Chip,
  Box,
  alpha,
  useTheme,
} from '@neram/ui';
import BrushIcon from '@mui/icons-material/Brush';
import ViewInArIcon from '@mui/icons-material/ViewInAr';
import DrawIcon from '@mui/icons-material/Draw';
import type { NexusExamRecallDrawing, ExamRecallDrawingType } from '@neram/database';

interface DrawingRecallCardProps {
  drawing: NexusExamRecallDrawing;
}

const DRAWING_TYPE_CONFIG: Record<ExamRecallDrawingType, { label: string; icon: React.ReactNode; color: string }> = {
  composition_2d: { label: '2D Composition', icon: <DrawIcon sx={{ fontSize: '0.9rem' }} />, color: '#1976d2' },
  object_sketching: { label: 'Object Sketching', icon: <BrushIcon sx={{ fontSize: '0.9rem' }} />, color: '#7b1fa2' },
  '3d_model': { label: '3D Model', icon: <ViewInArIcon sx={{ fontSize: '0.9rem' }} />, color: '#e65100' },
};

export default function DrawingRecallCard({ drawing }: DrawingRecallCardProps) {
  const theme = useTheme();
  const typeConfig = DRAWING_TYPE_CONFIG[drawing.drawing_type];
  const constraints = drawing.constraints as Record<string, boolean> | null;

  return (
    <Card variant="outlined">
      <CardContent sx={{ p: { xs: 1.5, md: 2 } }}>
        {/* Header */}
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
          <Chip
            icon={typeConfig.icon as React.ReactElement}
            label={typeConfig.label}
            size="small"
            sx={{
              bgcolor: alpha(typeConfig.color, 0.1),
              color: typeConfig.color,
              fontWeight: 600,
              fontSize: '0.7rem',
              '& .MuiChip-icon': { color: typeConfig.color },
            }}
          />
          <Typography variant="caption" color="text.secondary">
            Q{drawing.question_number}
          </Typography>
          {drawing.marks && (
            <Chip
              label={`${drawing.marks} marks`}
              size="small"
              variant="outlined"
              sx={{ fontSize: '0.65rem', height: 20 }}
            />
          )}
        </Stack>

        {/* Prompt (English) */}
        {drawing.prompt_text_en && (
          <Box sx={{ mb: 1 }}>
            <Typography variant="caption" color="text.secondary" fontWeight={600}>
              Prompt (EN)
            </Typography>
            <Typography variant="body2" sx={{ lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
              {drawing.prompt_text_en}
            </Typography>
          </Box>
        )}

        {/* Prompt (Hindi) */}
        {drawing.prompt_text_hi && (
          <Box sx={{ mb: 1 }}>
            <Typography variant="caption" color="text.secondary" fontWeight={600}>
              Prompt (HI)
            </Typography>
            <Typography variant="body2" sx={{ lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
              {drawing.prompt_text_hi}
            </Typography>
          </Box>
        )}

        {/* Materials */}
        {drawing.objects_materials && drawing.objects_materials.length > 0 && (
          <Box sx={{ mb: 1 }}>
            <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ mb: 0.5, display: 'block' }}>
              Objects / Materials
            </Typography>
            <Stack direction="row" flexWrap="wrap" gap={0.5}>
              {drawing.objects_materials.map((m, i) => (
                <Chip
                  key={i}
                  label={m.count > 1 ? `${m.name} x${m.count}` : m.name}
                  size="small"
                  variant="outlined"
                  sx={{ fontSize: '0.7rem', height: 22 }}
                />
              ))}
            </Stack>
          </Box>
        )}

        {/* Constraints */}
        {constraints && Object.values(constraints).some(Boolean) && (
          <Box sx={{ mb: 1 }}>
            <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ mb: 0.5, display: 'block' }}>
              Constraints
            </Typography>
            <Stack direction="row" flexWrap="wrap" gap={0.5}>
              {constraints.colorRestriction && (
                <Chip label="Color restriction" size="small" sx={{ fontSize: '0.65rem', height: 20, bgcolor: 'warning.50' }} />
              )}
              {constraints.intersectionAllowed && (
                <Chip label="Intersection allowed" size="small" sx={{ fontSize: '0.65rem', height: 20, bgcolor: 'info.50' }} />
              )}
              {constraints.bwOnly && (
                <Chip label="B&W only" size="small" sx={{ fontSize: '0.65rem', height: 20, bgcolor: 'grey.100' }} />
              )}
              {constraints.themeRequired && (
                <Chip label="Theme required" size="small" sx={{ fontSize: '0.65rem', height: 20, bgcolor: 'success.50' }} />
              )}
            </Stack>
          </Box>
        )}

        {/* Images */}
        {(drawing.paper_photo_url || drawing.attempt_photo_url) && (
          <Stack direction="row" spacing={1.5} sx={{ mt: 1.5 }}>
            {drawing.paper_photo_url && (
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
                  Question Paper
                </Typography>
                <Box
                  component="img"
                  src={drawing.paper_photo_url}
                  alt="Question paper"
                  sx={{
                    width: { xs: 100, md: 160 },
                    height: { xs: 100, md: 160 },
                    objectFit: 'cover',
                    borderRadius: 1,
                    border: '1px solid',
                    borderColor: 'grey.200',
                  }}
                />
              </Box>
            )}
            {drawing.attempt_photo_url && (
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
                  Attempt
                </Typography>
                <Box
                  component="img"
                  src={drawing.attempt_photo_url}
                  alt="Drawing attempt"
                  sx={{
                    width: { xs: 100, md: 160 },
                    height: { xs: 100, md: 160 },
                    objectFit: 'cover',
                    borderRadius: 1,
                    border: '1px solid',
                    borderColor: 'grey.200',
                  }}
                />
              </Box>
            )}
          </Stack>
        )}
      </CardContent>
    </Card>
  );
}
