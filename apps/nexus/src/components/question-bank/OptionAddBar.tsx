'use client';

import { Box, Button } from '@neram/ui';
import AddIcon from '@mui/icons-material/Add';
import type { NexusQBQuestionOption } from '@neram/database';
import {
  QB_MAX_OPTIONS,
  QB_QUICK_OPTIONS,
  hasOptionText,
  optionLetter,
  quickOptionIndex,
} from '@/lib/qb-option-ids';

interface OptionAddBarProps {
  options: NexusQBQuestionOption[];
  /** The form's option pictures by option id, so a picture-only option is not treated as blank. */
  optionImages?: Record<string, unknown>;
  /** No text adds a blank option to type into; text adds a ready-made one. */
  onAdd: (text?: string, textHi?: string) => void;
}

/**
 * Under an MCQ's options: "Add option E" for a blank one, and one tap for
 * "None of the above" or "All of the above", English and Hindi both, for a
 * paper whose printed answer is not among the four options. A quick option
 * fills the last option when that is still blank, and is disabled once it is
 * already on the list so it cannot be added twice.
 */
export default function OptionAddBar({ options, optionImages, onAdd }: OptionAddBarProps) {
  const quickIdx = quickOptionIndex(options, (id) => Boolean(optionImages?.[id]));
  const canAdd = options.length < QB_MAX_OPTIONS;
  if (!canAdd && quickIdx === null) return null;
  const quickLetter = quickIdx === null ? null : optionLetter(quickIdx);

  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1, mt: 0.5 }}>
      {canAdd && (
        <Button
          startIcon={<AddIcon />}
          onClick={() => onAdd()}
          sx={{ textTransform: 'none', minHeight: 44 }}
        >
          Add option {optionLetter(options.length)}
        </Button>
      )}
      {quickLetter &&
        QB_QUICK_OPTIONS.map((q) => (
          <Button
            key={q.text}
            variant="outlined"
            size="small"
            onClick={() => onAdd(q.text, q.text_hi)}
            disabled={hasOptionText(options, q.text)}
            aria-label={`Set option ${quickLetter} to ${q.text}`}
            sx={{ textTransform: 'none', minHeight: 44, borderRadius: 999 }}
          >
            {q.text}
          </Button>
        ))}
    </Box>
  );
}
