'use client';

/**
 * The shared, controlled field set for a class assignment. This is the single
 * source of truth for how an assignment is edited, used by:
 *   - NewAssignmentDialog (manual create + edit)
 *   - PasteAssignmentsDialog (AI import "Preview" step, one instance per draft)
 *
 * It is fully controlled: it reads everything from `value` and reports every
 * change through `onChange(patch)`. It owns no assignment id, so it works both
 * before an assignment exists (AI preview, manual create phase 1) and while
 * editing one. Document "materials" (upload / pick / link) live OUTSIDE this
 * component because they need an existing assignment id.
 */
import {
  Box, Typography, TextField, Stack, ToggleButtonGroup, ToggleButton, Collapse,
  MenuItem, Button, ImageUploadField,
} from '@neram/ui';
import BrushOutlinedIcon from '@mui/icons-material/BrushOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import type { AssignmentFormat } from '@/lib/assignment-format';

export type AssignmentType = 'drawing' | 'document';

export interface AssignmentDraft {
  type: AssignmentType;
  title: string;
  instructions: string;
  classDate: string;
  dueDate: string;
  format: AssignmentFormat;
  maxMarks: string;
  category: string;
  refImageUrl: string | null;
  recordingUrl: string;
  catchupDays: string;
}

export const DRAWING_CATEGORIES: { value: string; label: string }[] = [
  { value: '3d_composition', label: '3D composition' },
  { value: '2d_composition', label: '2D composition' },
  { value: 'kit_sculpture', label: 'Kit / sculpture' },
];

/** A fresh draft with the same defaults the manual create form starts from. */
export function blankDraft(classDate: string): AssignmentDraft {
  return {
    type: 'drawing',
    title: '',
    instructions: '',
    classDate,
    dueDate: '',
    format: 'pdf_or_image',
    maxMarks: '10',
    category: '3d_composition',
    refImageUrl: null,
    recordingUrl: '',
    catchupDays: '7',
  };
}

interface AssignmentFormFieldsProps {
  value: AssignmentDraft;
  onChange: (patch: Partial<AssignmentDraft>) => void;
  /** Injected uploader for the drawing reference image (auth/bucket stay per-caller). */
  uploadReference: (file: File) => Promise<{ url: string }>;
  /** Lock the type toggle (true only when editing an existing assignment). */
  lockType?: boolean;
  /** Show the drawing-category select (create / preview only, hidden on edit). */
  showCategory?: boolean;
  /**
   * Optional: run when the reference image changes (e.g. edit mode syncs it to the
   * server immediately). Defaults to patching `refImageUrl` on the draft.
   */
  onReferenceChange?: (url: string | null) => void;
  showAdvanced: boolean;
  onToggleAdvanced: () => void;
  /** Autofocus the title (only when a single form is on screen). */
  autoFocusTitle?: boolean;
}

export default function AssignmentFormFields({
  value,
  onChange,
  uploadReference,
  lockType = false,
  showCategory = true,
  onReferenceChange,
  showAdvanced,
  onToggleAdvanced,
  autoFocusTitle = false,
}: AssignmentFormFieldsProps) {
  const { type } = value;
  const handleReference = (url: string | null) =>
    onReferenceChange ? onReferenceChange(url) : onChange({ refImageUrl: url });

  return (
    <Stack spacing={2}>
      {/* Type selector (locked in edit) */}
      <ToggleButtonGroup
        value={type}
        exclusive
        onChange={(_, v) => v && !lockType && onChange({ type: v })}
        fullWidth
        size="small"
        disabled={lockType}
      >
        <ToggleButton value="drawing" sx={{ minHeight: 52, textTransform: 'none', gap: 0.75, flexDirection: 'column', py: 1 }}>
          <BrushOutlinedIcon sx={{ fontSize: 20 }} />
          <Box>
            <Typography variant="body2" sx={{ fontWeight: 700 }}>Drawing</Typography>
            <Typography variant="caption" color="text.secondary">Sketch, smart review</Typography>
          </Box>
        </ToggleButton>
        <ToggleButton value="document" sx={{ minHeight: 52, textTransform: 'none', gap: 0.75, flexDirection: 'column', py: 1 }}>
          <DescriptionOutlinedIcon sx={{ fontSize: 20 }} />
          <Box>
            <Typography variant="body2" sx={{ fontWeight: 700 }}>Document</Typography>
            <Typography variant="caption" color="text.secondary">Solve a paper</Typography>
          </Box>
        </ToggleButton>
      </ToggleButtonGroup>

      <TextField
        label="Title"
        value={value.title}
        onChange={(e) => onChange({ title: e.target.value })}
        fullWidth
        autoFocus={autoFocusTitle}
        error={!value.title.trim()}
        placeholder={type === 'drawing' ? 'e.g. Recreate the India Gate in pencil' : 'e.g. JEE 2024 Maths paper'}
      />
      <TextField
        label={type === 'drawing' ? 'Brief (what to draw)' : 'Instructions (optional)'}
        value={value.instructions}
        onChange={(e) => onChange({ instructions: e.target.value })}
        fullWidth
        multiline
        rows={3}
        placeholder={type === 'drawing' ? 'Recreate the basic 3D form, focus on proportion and clean lines.' : 'Solve every question and upload your solved paper.'}
      />

      {type === 'drawing' ? (
        <Stack spacing={2}>
          {showCategory && (
            <TextField select label="Drawing type" value={value.category} onChange={(e) => onChange({ category: e.target.value })} fullWidth>
              {DRAWING_CATEGORIES.map((c) => (
                <MenuItem key={c.value} value={c.value}>{c.label}</MenuItem>
              ))}
            </TextField>
          )}
          <ImageUploadField
            label="Reference / expected output (optional)"
            value={value.refImageUrl}
            onChange={handleReference}
            upload={uploadReference}
            helperText="Paste, drop, or choose the reference"
            enableGlobalPaste
            camera
          />
        </Stack>
      ) : (
        <Box>
          <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.75 }}>What can students upload?</Typography>
          <ToggleButtonGroup value={value.format} exclusive onChange={(_, v) => v && onChange({ format: v })} fullWidth size="small">
            <ToggleButton value="pdf_or_image" sx={{ minHeight: 48, textTransform: 'none' }}>PDF or photos</ToggleButton>
            <ToggleButton value="pdf" sx={{ minHeight: 48, textTransform: 'none' }}>PDF only</ToggleButton>
            <ToggleButton value="image" sx={{ minHeight: 48, textTransform: 'none' }}>Photos only</ToggleButton>
          </ToggleButtonGroup>
        </Box>
      )}

      <Stack direction="row" spacing={2}>
        <TextField label="Class date" type="date" value={value.classDate} onChange={(e) => onChange({ classDate: e.target.value })} InputLabelProps={{ shrink: true }} sx={{ flex: 1 }} />
        <TextField label="Due (optional)" type="date" value={value.dueDate} onChange={(e) => onChange({ dueDate: e.target.value })} InputLabelProps={{ shrink: true }} sx={{ flex: 1 }} />
      </Stack>

      <Button
        onClick={onToggleAdvanced}
        endIcon={<ExpandMoreIcon sx={{ transform: showAdvanced ? 'rotate(180deg)' : 'none', transition: '0.2s' }} />}
        sx={{ alignSelf: 'flex-start', minHeight: 40, textTransform: 'none', color: 'text.secondary' }}
      >
        More options
      </Button>
      <Collapse in={showAdvanced}>
        <Stack spacing={2}>
          {type === 'document' && (
            <TextField
              label="Max marks"
              value={value.maxMarks}
              onChange={(e) => onChange({ maxMarks: e.target.value.replace(/[^0-9.]/g, '') })}
              inputProps={{ inputMode: 'decimal' }}
              sx={{ width: 140 }}
            />
          )}
          <TextField
            label="Catch-up window (days for late joiners)"
            value={value.catchupDays}
            onChange={(e) => onChange({ catchupDays: e.target.value.replace(/[^0-9]/g, '') })}
            inputProps={{ inputMode: 'numeric' }}
            fullWidth
          />
          <TextField
            label="Class recording link (optional)"
            value={value.recordingUrl}
            onChange={(e) => onChange({ recordingUrl: e.target.value })}
            fullWidth
            placeholder="YouTube or SharePoint URL, for late joiners"
          />
        </Stack>
      </Collapse>
    </Stack>
  );
}
